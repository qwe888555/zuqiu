<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Key, Link, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { accountApi, orgApi, teamApi } from '../../api'
import type { Account, Organization, RoleCode, Team } from '../../api/types'
import { useAuthStore } from '../../stores/auth'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'

const auth = useAuthStore()

const ROLE_LABELS: Record<RoleCode, string> = {
  TEAM: '中小学球队端',
  UNIVERSITY: '高校端',
  CITY: '市州审核端',
  PROVINCE_REVIEWER: '省级审核端',
  ATHLETE: '运动员',
  COACH: '教练员',
  ADMIN: '管理员',
  MATCH_RECORDER: '赛事录入员',
}

const roleOptions = Object.entries(ROLE_LABELS)
  .filter(([value]) => auth.isAdmin || value !== 'ADMIN')
  .map(([value, label]) => ({ value, label }))

function canManageRow(row: Account) {
  return auth.isAdmin || !row.roles.includes('ADMIN')
}

const loading = ref(false)
const rows = ref<Account[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = reactive({ keyword: '', role: '' })
const orgs = ref<Organization[]>([])
const teams = ref<Team[]>([])

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const inviteVisible = ref(false)
const inviteLoading = ref(false)
const inviteInfo = ref<{ registrationToken: string; expiresAt: string } | null>(null)
const form = reactive({
  username: '',
  displayName: '',
  roles: ['TEAM'] as RoleCode[],
  orgId: '',
  teamIds: [] as string[],
  enabled: true,
})

const enabledCount = computed(() => rows.value.filter((row) => row.enabled).length)
const disabledCount = computed(() => rows.value.filter((row) => !row.enabled).length)
const roleKinds = computed(() => new Set(rows.value.flatMap((row) => row.roles)).size)

async function load() {
  loading.value = true
  try {
    const res = await accountApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      role: filters.role || undefined,
    })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadBase() {
  try {
    const [orgRes, teamRes] = await Promise.all([
      orgApi.list({ page: 1, pageSize: 500 }),
      teamApi.list({ page: 1, pageSize: 300 }),
    ])
    orgs.value = orgRes.items
    teams.value = teamRes.items
  } catch {
    orgs.value = []
    teams.value = []
  }
}

function search() {
  page.value = 1
  load()
}

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    username: '',
    displayName: '',
    roles: ['TEAM'],
    orgId: '',
    teamIds: [],
    enabled: true,
  })
  dialogVisible.value = true
}

function openEdit(row: Account) {
  if (!canManageRow(row)) return ElMessage.warning('仅管理员可修改管理员账号')
  editingId.value = row.id
  Object.assign(form, {
    username: row.username,
    displayName: row.displayName,
    roles: [...row.roles],
    orgId: row.orgId || '',
    teamIds: [...(row.teamIds || [])],
    enabled: row.enabled,
  })
  dialogVisible.value = true
}

async function save() {
  if (!form.username.trim()) return ElMessage.warning('请填写登录账号')
  if (!form.displayName.trim()) return ElMessage.warning('请填写账号名称')
  if (!form.roles.length) return ElMessage.warning('请至少选择一个角色')
  saving.value = true
  try {
    if (editingId.value) {
      await accountApi.update(editingId.value, {
        displayName: form.displayName,
        roles: form.roles,
        orgId: form.orgId,
        teamIds: form.teamIds,
        enabled: form.enabled,
      })
      ElMessage.success('账号已更新')
    } else {
      await accountApi.create({ ...form })
      ElMessage.success('账号已创建')
    }
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(row: Account) {
  if (!canManageRow(row)) return ElMessage.warning('仅管理员可操作管理员账号')
  try {
    await accountApi.update(row.id, { enabled: !row.enabled })
    ElMessage.success(row.enabled ? '账号已停用' : '账号已启用')
    await load()
  } catch {
    // 拦截器提示
  }
}

async function resetPassword(row: Account) {
  if (!canManageRow(row)) return ElMessage.warning('仅管理员可重置管理员密码')
  try {
    await ElMessageBox.confirm(
      `确认重置「${row.displayName}」的登录密码？重置后需通过绑定手机号重新设置。`,
      '重置密码',
      { confirmButtonText: '确认重置', cancelButtonText: '取消', type: 'warning' },
    )
    await accountApi.resetPassword(row.id)
    ElMessage.success('密码已重置')
  } catch {
    // 取消
  }
}

async function removeAccount(row: Account) {
  if (!canManageRow(row)) return ElMessage.warning('仅管理员可删除管理员账号')
  try {
    await ElMessageBox.confirm(`确认删除账号「${row.username}」？删除后无法登录系统。`, '删除账号', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await accountApi.remove(row.id)
    ElMessage.success('账号已删除')
    await load()
  } catch {
    // 取消
  }
}

async function invite() {
  inviteVisible.value = true
  inviteInfo.value = null
  inviteLoading.value = true
  try {
    inviteInfo.value = await accountApi.invite()
  } catch {
    inviteVisible.value = false
  } finally {
    inviteLoading.value = false
  }
}

async function copyToken() {
  if (!inviteInfo.value) return
  try {
    await navigator.clipboard.writeText(inviteInfo.value.registrationToken)
    ElMessage.success('注册令牌已复制')
  } catch {
    ElMessage.warning('复制失败，请手动选择令牌文本')
  }
}

onMounted(() => {
  load()
  loadBase()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="参赛账号"
      eyebrow="ACCOUNT & ACCESS"
      description="统一管理各端登录账号与角色授权。角色决定侧边栏可见范围，球队账号可额外绑定具体球队。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button :icon="Link" @click="invite">生成注册邀请</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建账号</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="账号总数" :value="total" hint="当前筛选范围" :icon="Key" tone="green" />
      <StatCard label="启用中" :value="enabledCount" hint="当前页统计" :icon="Key" tone="lime" />
      <StatCard label="已停用" :value="disabledCount" hint="不可登录" :icon="Key" tone="amber" />
      <StatCard label="角色类型" :value="roleKinds" hint="当前页覆盖" :icon="Key" tone="blue" />
    </div>

    <section class="page-card">
      <div class="filter-bar">
        <el-input
          v-model="filters.keyword"
          placeholder="账号 / 名称"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="filters.role" placeholder="全部角色" clearable @change="search">
          <el-option v-for="role in roleOptions" :key="role.value" :label="role.label" :value="role.value" />
        </el-select>
        <el-button type="primary" plain @click="search">查询</el-button>
        <span class="filter-bar__spacer" />
        <span class="muted">共 {{ total }} 个账号</span>
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="账号" min-width="210">
          <template #default="{ row }">
            <div class="account-cell">
              <span class="account-cell__avatar">{{ (row.displayName || row.username).slice(0, 1) }}</span>
              <div>
                <strong>{{ row.displayName }}</strong>
                <small>{{ row.username }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="190">
          <template #default="{ row }">
            <el-tag v-for="role in row.roles" :key="role" size="small" effect="plain" class="role-tag">
              {{ ROLE_LABELS[role as RoleCode] || role }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="orgName" label="所属机构" min-width="170">
          <template #default="{ row }">{{ row.orgName || '—' }}</template>
        </el-table-column>
        <el-table-column label="绑定球队" width="100" align="center">
          <template #default="{ row }">{{ row.teamIds?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="最近登录" width="150">
          <template #default="{ row }">
            <span class="muted">
              {{ row.lastLoginAt ? dayjs(row.lastLoginAt).format('MM-DD HH:mm') : '从未登录' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="plain">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right" align="right">
          <template #default="{ row }">
            <template v-if="canManageRow(row)">
              <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button link type="warning" :icon="Key" @click="resetPassword(row)">重置</el-button>
              <el-button link :type="row.enabled ? 'info' : 'success'" @click="toggleEnabled(row)">
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
              <el-button link type="danger" :icon="Delete" @click="removeAccount(row)">删除</el-button>
            </template>
            <span v-else class="muted">仅管理员可操作</span>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="load"
        @size-change="search"
      />
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑账号' : '新建账号'" width="620px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="登录账号" required>
            <el-input v-model="form.username" :disabled="Boolean(editingId)" placeholder="字母 / 数字 / 下划线" />
          </el-form-item>
          <el-form-item label="账号名称" required>
            <el-input v-model="form.displayName" placeholder="如：成都七中领队" />
          </el-form-item>
        </div>
        <el-form-item label="角色权限" required>
          <el-checkbox-group v-model="form.roles">
            <el-checkbox v-for="role in roleOptions" :key="role.value" :value="role.value">
              {{ role.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="所属机构">
          <el-select v-model="form.orgId" filterable clearable style="width: 100%">
            <el-option v-for="org in orgs" :key="org.id" :label="org.name" :value="org.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定球队">
          <el-select v-model="form.teamIds" multiple filterable clearable style="width: 100%" placeholder="可选，球队账号建议绑定">
            <el-option v-for="team in teams" :key="team.id" :label="team.name" :value="team.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="账号状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          title="管理员账号权限较大"
          description="请遵循最小授权原则，仅为确需系统配置的人员分配管理员角色。"
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存账号</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="inviteVisible" title="注册邀请" width="520px">
      <div v-loading="inviteLoading" class="invite-body">
        <template v-if="inviteInfo">
          <p class="muted">请将注册令牌发送给受邀单位，令牌 24 小时内有效且仅可使用一次。</p>
          <div class="token-box">{{ inviteInfo.registrationToken }}</div>
          <div class="invite-meta">
            <span>有效期至</span>
            <strong>{{ dayjs(inviteInfo.expiresAt).format('YYYY-MM-DD HH:mm') }}</strong>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="inviteVisible = false">关闭</el-button>
        <el-button type="primary" :disabled="!inviteInfo" @click="copyToken">复制令牌</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.account-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.account-cell__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.account-cell strong {
  display: block;
  font-size: 12.5px;
}

.account-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.role-tag {
  margin: 2px 4px 2px 0;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.invite-body {
  min-height: 130px;
}

.token-box {
  margin-top: 10px;
  padding: 14px 16px;
  border: 1px dashed var(--brand-300);
  border-radius: 10px;
  background: var(--brand-50);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--brand-800);
  word-break: break-all;
}

.invite-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  font-size: 11px;
  color: var(--ink-500);
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
