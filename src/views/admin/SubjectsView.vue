<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Search, Switch } from '@element-plus/icons-vue'
import { orgApi, teamApi } from '../../api'
import type { Organization, Team } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'

const loading = ref(false)
const rows = ref<Organization[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const allOrgs = ref<Organization[]>([])
const teams = ref<Team[]>([])
const activeType = ref<'SCHOOL' | 'TEAM'>('SCHOOL')
const keyword = ref('')

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const editingVersion = ref(0)
const saving = ref(false)
const form = reactive({
  name: '',
  orgType: 'SCHOOL',
  code: '',
  parentId: '',
  enabled: true,
})

const typeTabs: { value: 'SCHOOL' | 'TEAM'; label: string }[] = [
  { value: 'SCHOOL', label: '中小学校' },
  { value: 'TEAM', label: '独立球队' },
]

const typeLabel: Record<string, string> = {
  SCHOOL: '中小学校',
  TEAM: '独立球队',
  CITY: '市州',
  PROVINCE: '省级',
}

const cities = computed(() => allOrgs.value.filter((org) => org.orgType === 'CITY'))

const teamCountByOrg = computed(() => {
  const map = new Map<string, number>()
  // 后端 team_out 不输出 orgId（受控契约），但会输出 teamNo；组织树里 TEAM
  // 节点的 code 即 teamNo（A′-min），因此按 code 反查节点与父学校节点计数。
  const teamOrgs = new Map(
    allOrgs.value.filter((org) => org.orgType === 'TEAM').map((org) => [org.code, org]),
  )
  teams.value.forEach((team) => {
    const node = team.teamNo ? teamOrgs.get(team.teamNo) : undefined
    if (!node) return
    map.set(node.id, (map.get(node.id) || 0) + 1)
    if (node.parentId) map.set(node.parentId, (map.get(node.parentId) || 0) + 1)
  })
  return map
})

const filteredRows = computed(() =>
  keyword.value
    ? rows.value.filter((row) => row.name.includes(keyword.value) || row.code.includes(keyword.value))
    : rows.value,
)

function parentName(parentId?: string) {
  return allOrgs.value.find((org) => org.id === parentId)?.name || '—'
}

async function load() {
  loading.value = true
  try {
    const res = await orgApi.list({ page: page.value, pageSize: pageSize.value, orgType: activeType.value })
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
    allOrgs.value = orgRes.items
    teams.value = teamRes.items
  } catch {
    allOrgs.value = []
    teams.value = []
  }
}

async function switchType() {
  page.value = 1
  keyword.value = ''
  await load()
}

function openCreate() {
  editingId.value = null
  editingVersion.value = 0
  Object.assign(form, {
    name: '',
    orgType: activeType.value,
    code: '',
    parentId: '',
    enabled: true,
  })
  dialogVisible.value = true
}

function openEdit(row: Organization) {
  editingId.value = row.id
  editingVersion.value = row.version
  Object.assign(form, {
    name: row.name,
    orgType: row.orgType,
    code: row.code,
    parentId: row.parentId || '',
    enabled: row.enabled,
  })
  dialogVisible.value = true
}

async function save() {
  if (!form.name.trim()) return ElMessage.warning('请填写主体名称')
  if (!form.code.trim()) return ElMessage.warning('请填写主体编码')
  saving.value = true
  try {
    if (editingId.value) {
      await orgApi.update(editingId.value, {
        ...(form.parentId ? { parentId: form.parentId } : {}),
        name: form.name,
        orgType: form.orgType,
        code: form.code,
        enabled: form.enabled,
        version: editingVersion.value,
      })
      ElMessage.success('参赛主体已更新')
    } else {
      await orgApi.create({ ...form, parentId: form.parentId || undefined })
      ElMessage.success('参赛主体已创建')
    }
    dialogVisible.value = false
    await Promise.all([load(), loadBase()])
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(row: Organization) {
  try {
    // OrganizationUpdate 为整份替换：name/orgType/code/version 必填，只传
    // enabled 会被 StrictSchema 拒绝（管理端联调发现的开关失效问题）。
    await orgApi.update(row.id, {
      ...(row.parentId ? { parentId: row.parentId } : {}),
      name: row.name,
      orgType: row.orgType,
      code: row.code,
      enabled: !row.enabled,
      version: row.version,
    })
    ElMessage.success(row.enabled ? '已停用' : '已启用')
    await load()
  } catch {
    // 拦截器提示
  }
}

async function removeOrg(row: Organization) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.name}」？请先确认该主体下无球队与账号。`, '删除参赛主体', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await orgApi.remove(row.id, row.version)
    ElMessage.success('参赛主体已删除')
    await load()
  } catch {
    // 取消
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
      title="参赛主体"
      description="维护中小学校与独立球队等参赛主体。主体信息用于球队归属、市州审核范围与门户展示。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增主体</el-button>
      </template>
    </PageHeader>

    <section class="page-card">
      <div class="subject-tabs">
        <button
          v-for="tab in typeTabs"
          :key="tab.value"
          type="button"
          class="subject-tab"
          :class="{ 'is-active': activeType === tab.value }"
          @click="activeType = tab.value; switchType()"
        >
          {{ tab.label }}
        </button>
        <span class="subject-tabs__spacer" />
        <el-input
          v-model="keyword"
          placeholder="搜索名称或编码"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
        />
      </div>

      <el-table v-loading="loading" :data="filteredRows" style="width: 100%">
        <el-table-column label="主体名称" min-width="240">
          <template #default="{ row }">
            <div class="org-cell">
              <span class="org-cell__mark">{{ row.name.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.name }}</strong>
                <small>{{ typeLabel[row.orgType] }} · {{ row.code }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="所属市州" min-width="150">
          <template #default="{ row }">{{ parentName(row.parentId) }}</template>
        </el-table-column>
        <el-table-column label="关联球队" width="110" align="center">
          <template #default="{ row }">
            <span class="num">{{ teamCountByOrg.get(row.id) || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="plain">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" align="right" class-name="table-actions-cell">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button size="small" type="primary" plain :icon="Edit" @click="openEdit(row)">
                编辑
              </el-button>
              <span class="table-actions__divider" aria-hidden="true" />
              <el-button
                link
                :type="row.enabled ? 'warning' : 'success'"
                :icon="Switch"
                @click="toggleEnabled(row)"
              >
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
              <el-button link type="danger" :icon="Delete" @click="removeOrg(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="keyword ? filteredRows.length : total"
        @current-change="load"
        @size-change="load"
      />
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑参赛主体' : '新增参赛主体'" width="560px">
      <el-form :model="form" label-position="top">
        <el-form-item label="主体类型">
          <el-radio-group v-model="form.orgType">
            <el-radio-button v-for="tab in typeTabs" :key="tab.value" :value="tab.value">
              {{ tab.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="主体名称" required>
          <el-input v-model="form.name" placeholder="学校 / 单位全称" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="主体编码" required>
            <el-input v-model="form.code" placeholder="如：SC-CD-0012" />
          </el-form-item>
          <el-form-item label="所属市州">
            <el-select v-model="form.parentId" clearable filterable style="width: 100%">
              <el-option v-for="city in cities" :key="city.id" :label="city.name" :value="city.id" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存主体</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.subject-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.subject-tab {
  padding: 7px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 12px;
  color: var(--ink-500);
  cursor: pointer;
}

.subject-tab.is-active {
  background: var(--brand-50);
  color: var(--brand-800);
  font-weight: 700;
}

.subject-tabs__spacer {
  flex: 1;
}

.org-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.org-cell__mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.org-cell strong {
  display: block;
  font-size: 12.5px;
}

.org-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
