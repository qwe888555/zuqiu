<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  Download,
  Edit,
  Key,
  Link,
  Plus,
  Refresh,
  Search,
  UploadFilled,
} from '@element-plus/icons-vue'
import { accountApi, orgApi, personApi, teamApi } from '../../api'
import { http } from '../../api/http'
import type {
  Account,
  InviteBatchRow,
  Organization,
  Person,
  RoleCode,
  Team,
} from '../../api/types'
import { ROLE_LABELS } from '../../config/labels'
import { useAuthStore } from '../../stores/auth'
import { parseCsv } from '../../utils/csv'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const auth = useAuthStore()
const ACCOUNT_MANAGER_ROLES: RoleCode[] = ['ADMIN', 'PROVINCE_REVIEWER', 'CITY', 'UNIVERSITY']

const canInvite = computed(() =>
  ACCOUNT_MANAGER_ROLES.some((role) => auth.roles.includes(role)),
)
const canCreate = canInvite
const canReset = computed(
  () => auth.isAdmin || auth.roles.includes('PROVINCE_REVIEWER'),
)
const canDelete = canReset

const roleOptions = Object.entries(ROLE_LABELS)
  .filter(([value]) => auth.isAdmin || value !== 'ADMIN')
  .map(([value, label]) => ({ value, label }))

/** 与后端 ROLE_ORG_TYPES 对齐：带机构类型的角色只能挂在同类型机构下。 */
const ORG_SCOPED_ROLES: RoleCode[] = ['PROVINCE_REVIEWER', 'CITY', 'UNIVERSITY', 'TEAM']
const GENERIC_CREATE_ROLES: RoleCode[] = ['ATHLETE', 'COACH', 'MATCH_RECORDER']

const createRoleOptions = computed(() => {
  if (auth.isAdmin) return roleOptions
  const actorOrgRole = ORG_SCOPED_ROLES.find((role) => auth.roles.includes(role))
  const allowed = roleOptions.filter(
    (option) =>
      GENERIC_CREATE_ROLES.includes(option.value as RoleCode) || option.value === actorOrgRole,
  )
  // 编辑市州/学校范围内更高层级的账号时（如球队账号），保留其现有角色可见，
  // 避免角色勾选项消失导致保存时被误解为清空。
  for (const role of editingRow.value?.roles || []) {
    if (!allowed.some((option) => option.value === role)) {
      const option = roleOptions.find((item) => item.value === role)
      if (option) allowed.push(option)
    }
  }
  return allowed
})

const defaultRole = (): RoleCode => (auth.isAdmin ? 'TEAM' : 'ATHLETE')

function orgLabel(row: Account) {
  if (row.orgName) return row.orgName
  return orgs.value.find((org) => org.id === row.orgId)?.name || row.orgId || '—'
}

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
const editingRow = ref<Account | null>(null)
const saving = ref(false)
const inviteVisible = ref(false)
const inviteLoading = ref(false)
const inviteInfo = ref<{ registrationToken: string; expiresAt: string } | null>(null)
const inviteLink = computed(() =>
  inviteInfo.value
    ? `${window.location.origin}/register?token=${encodeURIComponent(inviteInfo.value.registrationToken)}`
    : '',
)
const inviteForm = reactive({
  kind: 'ATHLETE' as 'ATHLETE' | 'COACH',
  orgId: '',
  personId: '',
})
const personOptions = ref<Person[]>([])
const personLoading = ref(false)
const form = reactive({
  username: '',
  displayName: '',
  roles: ['TEAM'] as RoleCode[],
  orgId: '',
  teamIds: [] as string[],
  personId: '',
  enabled: true,
})

const batchVisible = ref(false)
const batchFileInput = ref<HTMLInputElement>()
const batchFile = ref<File | null>(null)
const batchLoading = ref(false)
const batchOrgId = ref('')
const batchExpiresMinutes = ref(1440)
const batchSummary = ref<{ total: number; success: number; failure: number } | null>(null)
const batchRows = ref<InviteBatchRow[]>([])
const batchCsvBlob = ref<Blob | null>(null)
const batchCsvName = ref('')
const templateUrl = `${import.meta.env.BASE_URL}templates/invitation-batch-template.xlsx`

const ownOrgId = computed(() => auth.user?.orgId || '')
const ownOrgName = computed(() => auth.user?.orgName || ownOrgId.value || '未绑定机构')
const formOrgLabel = computed(() => {
  if (auth.isAdmin) return ''
  if (editingRow.value) return editingRow.value.orgName || editingRow.value.orgId || ownOrgName.value
  return ownOrgName.value
})

const enabledCount = computed(() => rows.value.filter((row) => row.enabled).length)
const disabledCount = computed(() => rows.value.filter((row) => !row.enabled).length)
const roleKinds = computed(() => new Set(rows.value.flatMap((row) => row.roles)).size)
const batchFailureRows = computed(() => batchRows.value.filter((row) => row.status !== 'OK'))

async function load() {
  loading.value = true
  try {
    const res = await accountApi.list({
      page: page.value,
      pageSize: pageSize.value,
      username: filters.keyword || undefined,
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
  // 组织管理仍仅 ADMIN；球队列表已对市州/学校开放，用于建号时绑定球队。
  // 非管理员不请求组织结构，避免必然 403；建号默认使用本人所属机构。
  const requests: Promise<unknown>[] = [
    auth.isAdmin
      ? orgApi.list({ page: 1, pageSize: 500 })
      : Promise.resolve(null),
    teamApi.list({ page: 1, pageSize: 300 }),
  ]
  const [orgRes, teamRes] = await Promise.allSettled(requests)
  orgs.value =
    orgRes.status === 'fulfilled' && orgRes.value
      ? (orgRes.value as { items: Organization[] }).items
      : []
  teams.value =
    teamRes.status === 'fulfilled'
      ? (teamRes.value as { items: Team[] }).items
      : []
}

function search() {
  page.value = 1
  load()
}

function personLabel(person: Person) {
  return [person.realName, person.maskedIdNumber].filter(Boolean).join(' · ')
}

function roleLabel(kind: string) {
  return ROLE_LABELS[kind as RoleCode] || kind
}

async function searchPersons(keyword: string) {
  // 人员检索按当前账号的组织子树过滤；市州/学校只能检索本校及下级人员。
  personLoading.value = true
  try {
    const res = await personApi.list({
      page: 1,
      pageSize: 20,
      keyword: keyword.trim() || undefined,
    })
    personOptions.value = res.items
  } catch {
    personOptions.value = []
  } finally {
    personLoading.value = false
  }
}

/** 编辑旧账号时把已绑定人员补进选项，避免下拉只显示一个裸 ID。 */
async function ensurePersonOption(personId?: string) {
  if (!personId || personOptions.value.some((person) => person.id === personId)) return
  try {
    const person = await personApi.get(personId)
    personOptions.value = [person, ...personOptions.value]
  } catch {
    // 人员已删除或无权限时保留原 personId，不阻断编辑
  }
}

function openCreate() {
  editingId.value = null
  editingRow.value = null
  Object.assign(form, {
    username: '',
    displayName: '',
    roles: [defaultRole()],
    // 非管理员只能在本机构建号，机构由后端数据范围兜底。
    orgId: auth.isAdmin ? '' : ownOrgId.value,
    teamIds: [],
    personId: '',
    enabled: true,
  })
  dialogVisible.value = true
}

function openEdit(row: Account) {
  if (!canManageRow(row)) return ElMessage.warning('仅管理员可修改管理员账号')
  editingId.value = row.id
  editingRow.value = row
  Object.assign(form, {
    username: row.username,
    displayName: row.displayName,
    roles: [...row.roles],
    orgId: row.orgId || '',
    teamIds: [...(row.teamIds || [])],
    personId: row.personId || '',
    enabled: row.enabled,
  })
  void ensurePersonOption(row.personId)
  dialogVisible.value = true
}

/** PUT 为整份替换：未提交的可选字段会被清空，因此编辑/启停都必须带全字段与 version。 */
function accountPayload(row: Account) {
  return {
    username: row.username,
    displayName: row.displayName,
    roles: [...row.roles],
    orgId: row.orgId,
    teamIds: [...(row.teamIds || [])],
    ...(row.personId ? { personId: row.personId } : {}),
    enabled: row.enabled,
    version: row.version,
  }
}

async function save() {
  if (!form.username.trim()) return ElMessage.warning('请填写登录账号')
  if (!form.displayName.trim()) return ElMessage.warning('请填写账号名称')
  if (!form.roles.length) return ElMessage.warning('请至少选择一个角色')
  if (!auth.isAdmin && !form.orgId) form.orgId = ownOrgId.value
  if (!form.orgId) {
    return ElMessage.warning(auth.isAdmin ? '请选择所属机构' : '当前账号未绑定机构，无法建号')
  }
  saving.value = true
  try {
    if (editingId.value && editingRow.value) {
      await accountApi.update(editingId.value, {
        ...accountPayload(editingRow.value),
        displayName: form.displayName,
        roles: [...form.roles],
        orgId: form.orgId,
        teamIds: [...form.teamIds],
        personId: form.personId || undefined,
        enabled: form.enabled,
      })
      ElMessage.success('账号已更新')
    } else {
      await accountApi.create({
        username: form.username,
        displayName: form.displayName,
        roles: [...form.roles],
        orgId: form.orgId,
        teamIds: [...form.teamIds],
        personId: form.personId || undefined,
        enabled: form.enabled,
      })
      ElMessage.success('账号已创建，初始密码为登录账号，首次登录需修改')
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
  if (!row.orgId) return ElMessage.warning('该账号未绑定机构，无法修改状态')
  try {
    await accountApi.update(row.id, { ...accountPayload(row), enabled: !row.enabled })
    ElMessage.success(row.enabled ? '账号已停用' : '账号已启用')
    await load()
  } catch {
    // 拦截器提示
  }
}

async function resetPassword(row: Account) {
  if (!canManageRow(row)) return ElMessage.warning('仅管理员可重置管理员密码')
  try {
    const { value } = await ElMessageBox.prompt(
      `为「${row.displayName}」设置新的登录密码，重置后该账号现有登录状态将失效。`,
      '重置密码',
      {
        confirmButtonText: '确认重置',
        cancelButtonText: '取消',
        inputType: 'password',
        inputPlaceholder: '至少 8 位',
        inputValidator: (val) => (val && val.length >= 8 ? true : '密码至少 8 位'),
      },
    )
    await accountApi.resetPassword(row.id, {
      version: row.version,
      newPassword: value,
      forceChangeOnNextLogin: true,
    })
    ElMessage.success('密码已重置，该账号下次登录需修改密码')
    await load()
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
    await accountApi.remove(row.id, row.version)
    ElMessage.success('账号已删除')
    await load()
  } catch {
    // 取消
  }
}

function invite() {
  inviteVisible.value = true
  inviteInfo.value = null
  inviteLoading.value = false
  inviteForm.kind = 'ATHLETE'
  inviteForm.orgId = auth.isAdmin ? '' : ownOrgId.value
  inviteForm.personId = ''
}

async function generateInvite() {
  if (!inviteForm.orgId) return ElMessage.warning('请选择受邀人员所属机构')
  inviteLoading.value = true
  try {
    inviteInfo.value = await accountApi.invite({
      kind: inviteForm.kind,
      orgId: inviteForm.orgId,
      personId: inviteForm.personId || undefined,
      expiresInMinutes: 1440,
    })
  } catch {
    // 拦截器提示
  } finally {
    inviteLoading.value = false
  }
}

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(success)
  } catch {
    ElMessage.warning('复制失败，请手动选择文本')
  }
}

function copyToken() {
  if (!inviteInfo.value) return
  copyText(inviteInfo.value.registrationToken, '注册令牌已复制')
}

function copyLink() {
  if (!inviteLink.value) return
  copyText(inviteLink.value, '注册链接已复制')
}

/* ---------------------------------------------------------------- 批量邀请 */

function openBatch() {
  batchVisible.value = true
  batchFile.value = null
  batchLoading.value = false
  batchOrgId.value = auth.isAdmin ? '' : ownOrgId.value
  batchExpiresMinutes.value = 1440
  batchSummary.value = null
  batchRows.value = []
  batchCsvBlob.value = null
  batchCsvName.value = ''
  if (batchFileInput.value) batchFileInput.value.value = ''
}

function pickBatchFile() {
  batchFileInput.value?.click()
}

function onBatchFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return ElMessage.warning('仅支持 .xlsx 文件，请使用模板填写')
  }
  if (file.size > 5 * 1024 * 1024) {
    return ElMessage.warning('文件不能超过 5MB')
  }
  batchFile.value = file
}

function clearBatchFile() {
  batchFile.value = null
  if (batchFileInput.value) batchFileInput.value.value = ''
}

function parseBatchCsv(text: string): InviteBatchRow[] {
  const [header, ...dataRows] = parseCsv(text)
  if (!header || header[0] !== '序号') return []
  return dataRows.map((cells) => {
    const [rowNo, realName, maskedIdNumber, kind, orgCode, status, , expiresAt, error] = cells
    return {
      rowNo: Number(rowNo) || 0,
      realName: realName || '',
      maskedIdNumber: maskedIdNumber || '',
      kind: kind || '',
      orgCode: orgCode || '',
      status: status === 'OK' ? 'OK' : 'FAILED',
      expiresAt: expiresAt || '',
      error: error || '',
    }
  })
}

async function submitBatch() {
  if (!batchFile.value) return ElMessage.warning('请先选择名单文件')
  const confirmed = await ElMessageBox.confirm(
    '将立即为名单内已建档人员签发一次性注册邀请，未建档或信息不符的行会失败。签发后请立即分发导出的 CSV，凭证不会再次显示。',
    '批量签发邀请',
    {
      confirmButtonText: '上传并签发',
      cancelButtonText: '取消',
      type: 'warning',
    },
  )
    .then(() => true)
    .catch(() => false)
  if (!confirmed) return

  batchLoading.value = true
  batchSummary.value = null
  batchRows.value = []
  batchCsvBlob.value = null
  batchCsvName.value = ''
  try {
    const blob = await accountApi.inviteBatchCsv(batchFile.value, {
      orgId: batchOrgId.value || undefined,
      expiresInMinutes: batchExpiresMinutes.value,
    })
    const text = await blob.text()
    const parsed = parseBatchCsv(text)
    const success = parsed.filter((row) => row.status === 'OK').length
    const failure = parsed.length - success
    batchRows.value = parsed
    batchSummary.value = { total: parsed.length, success, failure }
    batchCsvBlob.value = blob
    batchCsvName.value = `批量邀请-${dayjs().format('YYYYMMDD-HHmmss')}.csv`
    http.saveBlob(blob, batchCsvName.value)
    if (failure > 0) {
      ElMessage.warning(`已签发 ${success} 条，${failure} 条失败，失败原因见导出 CSV`)
    } else {
      ElMessage.success(`已签发 ${success} 条邀请，凭证已随 CSV 下载`)
    }
    await load()
  } catch {
    // 拦截器已提示；文件/名单错误由后端返回具体原因
  } finally {
    batchLoading.value = false
  }
}

function downloadBatchCsv() {
  if (!batchCsvBlob.value) return
  http.saveBlob(batchCsvBlob.value, batchCsvName.value)
}

onMounted(() => {
  load()
  loadBase()
  void searchPersons('')
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="参赛账号"
      description="统一管理各端登录账号与角色授权，支持 Excel 批量签发注册邀请。角色决定侧边栏可见范围，球队账号可额外绑定具体球队。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="canInvite" :icon="Link" @click="invite">单个邀请</el-button>
        <el-button v-if="canInvite" :icon="UploadFilled" @click="openBatch">批量邀请</el-button>
        <el-button v-if="canCreate" type="primary" :icon="Plus" @click="openCreate">新建账号</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="!auth.isAdmin"
      class="scope-alert"
      type="info"
      :closable="false"
      show-icon
      title="当前仅显示本机构及下级账号"
      description="新建账号默认归属当前机构；人员检索与邀请发放同样受组织数据范围限制。"
    />

    <div class="stat-grid">
      <StatCard label="账号总数" :value="total" hint="当前筛选范围" :icon="Key" tone="green" />
      <StatCard label="启用中" :value="enabledCount" hint="当前页统计" :icon="Key" tone="lime" />
      <StatCard label="已停用" :value="disabledCount" hint="不可登录" :icon="Key" tone="amber" />
      <StatCard label="角色类型" :value="roleKinds" hint="当前页覆盖" :icon="Key" tone="blue" />
    </div>

    <section class="page-card">
      <FilterBar :summary="'共 ' + total + ' 个账号'">
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
      </FilterBar>

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
          <template #default="{ row }">{{ orgLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="人员档案" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.personId ? 'success' : 'info'" size="small" effect="plain">
              {{ row.personId ? '已绑定' : '未绑定' }}
            </el-tag>
          </template>
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
              <el-button v-if="canReset" link type="warning" :icon="Key" @click="resetPassword(row)">
                重置
              </el-button>
              <el-button link :type="row.enabled ? 'info' : 'success'" @click="toggleEnabled(row)">
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
              <el-button v-if="canDelete" link type="danger" :icon="Delete" @click="removeAccount(row)">
                删除
              </el-button>
            </template>
            <span v-else class="muted">无权操作</span>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
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
            <el-checkbox v-for="role in createRoleOptions" :key="role.value" :value="role.value">
              {{ role.label }}
            </el-checkbox>
          </el-checkbox-group>
          <p v-if="!auth.isAdmin" class="field-hint">
            仅显示当前机构可授予的角色；市州/学校账号默认归属本机构。
          </p>
        </el-form-item>
        <el-form-item label="所属机构" required>
          <el-select
            v-if="auth.isAdmin"
            v-model="form.orgId"
            filterable
            clearable
            style="width: 100%"
            placeholder="请选择账号归属机构"
          >
            <el-option v-for="org in orgs" :key="org.id" :label="org.name" :value="org.id" />
          </el-select>
          <el-input v-else :model-value="formOrgLabel" disabled />
        </el-form-item>
        <el-form-item label="绑定球队">
          <el-select v-model="form.teamIds" multiple filterable clearable style="width: 100%" placeholder="可选，球队账号建议绑定">
            <el-option v-for="team in teams" :key="team.id" :label="team.name" :value="team.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联人员档案">
          <el-select
            v-model="form.personId"
            filterable
            remote
            clearable
            :remote-method="searchPersons"
            :loading="personLoading"
            style="width: 100%"
            placeholder="运动员 / 教练账号建议绑定，否则个人中心无法读取档案"
          >
            <el-option
              v-for="person in personOptions"
              :key="person.id"
              :label="personLabel(person)"
              :value="person.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="账号状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-alert
          v-if="auth.isAdmin"
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
        <el-form v-if="!inviteInfo" label-position="top">
          <el-form-item label="受邀身份" required>
            <el-radio-group v-model="inviteForm.kind">
              <el-radio-button value="ATHLETE">运动员</el-radio-button>
              <el-radio-button value="COACH">教练员</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="所属机构" required>
            <el-select
              v-if="auth.isAdmin"
              v-model="inviteForm.orgId"
              filterable
              style="width: 100%"
              placeholder="请选择受邀人员所属机构"
            >
              <el-option v-for="org in orgs" :key="org.id" :label="org.name" :value="org.id" />
            </el-select>
            <el-input v-else :model-value="ownOrgName" disabled />
          </el-form-item>
          <el-form-item label="关联人员档案">
            <el-select
              v-model="inviteForm.personId"
              filterable
              remote
              clearable
              :remote-method="searchPersons"
              :loading="personLoading"
              style="width: 100%"
              placeholder="可选，绑定后注册账号即可读取本人档案与球队"
            >
              <el-option
                v-for="person in personOptions"
                :key="person.id"
                :label="personLabel(person)"
                :value="person.id"
              />
            </el-select>
          </el-form-item>
          <p class="muted invite-tip">令牌 24 小时内有效且仅可使用一次，请通过安全渠道发送给受邀人。</p>
        </el-form>
        <template v-else>
          <p class="muted">请把注册链接发送给受邀人，链接 24 小时内有效且仅可使用一次。</p>
          <div class="token-box">{{ inviteLink }}</div>
          <div class="invite-meta">
            <span>有效期至</span>
            <strong>{{ dayjs(inviteInfo.expiresAt).format('YYYY-MM-DD HH:mm') }}</strong>
          </div>
          <p class="muted invite-tip">仅需令牌时：</p>
          <div class="token-box">{{ inviteInfo.registrationToken }}</div>
        </template>
      </div>
      <template #footer>
        <el-button @click="inviteVisible = false">关闭</el-button>
        <el-button v-if="!inviteInfo" type="primary" :loading="inviteLoading" @click="generateInvite">
          生成令牌
        </el-button>
        <template v-else>
          <el-button @click="copyToken">复制令牌</el-button>
          <el-button type="primary" @click="copyLink">复制注册链接</el-button>
        </template>
      </template>
    </el-dialog>

    <el-dialog
      v-model="batchVisible"
      title="批量邀请"
      width="760px"
      :close-on-click-modal="false"
    >
      <div class="batch-head">
        <div>
          <strong>用 Excel 名单批量签发注册邀请</strong>
          <p class="muted">
            仅给人员主档中已建档的人员发放；未建档、姓名不符、已绑定账号或已有未使用邀请的行会失败。
          </p>
        </div>
        <a class="template-link" :href="templateUrl" download="批量邀请模板.xlsx">
          <el-icon><Download /></el-icon>
          下载 Excel 模板
        </a>
      </div>

      <el-form label-position="top">
        <div class="form-grid">
          <el-form-item label="默认所属机构（可选）">
            <el-select
              v-if="auth.isAdmin"
              v-model="batchOrgId"
              filterable
              clearable
              style="width: 100%"
              placeholder="表格组织编码为空时使用"
            >
              <el-option v-for="org in orgs" :key="org.id" :label="org.name" :value="org.id" />
            </el-select>
            <el-input v-else :model-value="ownOrgName" disabled />
          </el-form-item>
          <el-form-item label="邀请有效期">
            <el-select v-model="batchExpiresMinutes" style="width: 100%">
              <el-option :value="1440" label="24 小时（默认）" />
              <el-option :value="4320" label="3 天" />
              <el-option :value="10080" label="7 天" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="名单文件" required>
          <div class="file-picker">
            <input
              ref="batchFileInput"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              class="file-input"
              @change="onBatchFileChange"
            />
            <el-button :icon="UploadFilled" @click="pickBatchFile">选择 .xlsx 文件</el-button>
            <span v-if="batchFile" class="file-name">{{ batchFile.name }}</span>
            <span v-else class="muted">未选择文件，单批最多 500 行、5MB</span>
            <el-button v-if="batchFile" link type="danger" @click="clearBatchFile">移除</el-button>
          </div>
        </el-form-item>
      </el-form>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="邀请凭证只出现一次"
        description="签发成功后会自动下载 CSV，内含每人的注册链接/令牌与失败原因；请立即分发并妥善保管，关闭后无法再次查看同一批凭证。"
      />

      <div v-if="batchSummary" class="batch-result">
        <div class="batch-summary">
          <span class="batch-summary__ok">成功 {{ batchSummary.success }} 条</span>
          <span class="batch-summary__fail">失败 {{ batchSummary.failure }} 条</span>
          <span class="muted">共 {{ batchSummary.total }} 条</span>
        </div>
        <el-table
          v-if="batchFailureRows.length"
          :data="batchFailureRows"
          size="small"
          max-height="240"
          style="width: 100%"
        >
          <el-table-column prop="rowNo" label="行号" width="64" />
          <el-table-column prop="realName" label="姓名" width="110" />
          <el-table-column prop="maskedIdNumber" label="证件号" width="150" />
          <el-table-column label="角色" width="90">
            <template #default="{ row }">{{ roleLabel(row.kind) }}</template>
          </el-table-column>
          <el-table-column prop="orgCode" label="组织编码" width="120" />
          <el-table-column prop="error" label="失败原因" min-width="220" show-overflow-tooltip />
        </el-table>
        <p class="muted batch-footnote">
          成功行的邀请凭证只在本次下载的 CSV 中；如文件丢失，需等待原邀请过期后重新签发。
        </p>
      </div>

      <template #footer>
        <el-button @click="batchVisible = false">关闭</el-button>
        <el-button v-if="batchCsvBlob" :icon="Download" @click="downloadBatchCsv">
          再次下载 CSV
        </el-button>
        <el-button
          v-else
          type="primary"
          :loading="batchLoading"
          :disabled="!batchFile"
          @click="submitBatch"
        >
          上传并签发
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.scope-alert {
  margin-bottom: 16px;
}

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

.invite-tip {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.7;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ink-300);
}

.batch-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.batch-head strong {
  font-size: 13px;
}

.batch-head p {
  margin: 6px 0 0;
  max-width: 480px;
  font-size: 11.5px;
  line-height: 1.7;
}

.template-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 7px 12px;
  border: 1px solid var(--brand-300);
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  text-decoration: none;
}

.template-link:hover {
  background: var(--brand-100);
}

.file-picker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.file-input {
  display: none;
}

.file-name {
  font-size: 12px;
  color: var(--brand-700);
  word-break: break-all;
}

.batch-result {
  margin-top: 16px;
}

.batch-summary {
  display: flex;
  align-items: baseline;
  gap: 14px;
  margin-bottom: 10px;
  font-size: 12px;
}

.batch-summary__ok {
  color: var(--brand-700);
  font-weight: 700;
}

.batch-summary__fail {
  color: var(--danger-600, #b33a3a);
  font-weight: 700;
}

.batch-footnote {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.7;
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
