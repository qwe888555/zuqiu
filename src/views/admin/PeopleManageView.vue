<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus'
import {
  CircleCheck,
  CircleClose,
  Delete,
  Document,
  Download,
  Edit,
  Loading,
  Plus,
  Promotion,
  Refresh,
  Search,
  UploadFilled,
} from '@element-plus/icons-vue'
import { fileApi, materialApi, orgApi, personApi, teamApi } from '../../api'
import { useAuthStore } from '../../stores/auth'
import type { Material, Organization, Person, PersonKind } from '../../api/types'
import { COACH_CATEGORY_LABELS } from '../../config/labels'
import { fetchAllPages, mapLimit } from '../../utils/asyncPool'
import { httpMessageOf } from '../../utils/httpError'
import {
  buildPersonImportPayload,
  parsePersonImportRows,
  PERSON_IMPORT_TEMPLATE_HEADERS,
  type PersonImportRow,
  type PersonImportStatus,
} from '../../utils/personImport'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const auth = useAuthStore()
/** 人员管理仅管理员（全局）与学校账号（本校范围）可进入，路由已按角色拦截。 */
const canUsePeople = computed(() => auth.isAdmin || auth.isUniversity)
const canDeletePerson = computed(() => auth.isAdmin)
/** 后端 personReview 仅 UNIVERSITY；ADMIN 可建档/提交但不能审核。 */
const canReviewPerson = computed(() => auth.isUniversity)
const ownSchoolOrgId = computed(() => auth.user?.orgId || '')

const loading = ref(false)
/** 全部已提交档案（不含草稿）；分页在前端完成，避免后端单状态筛选拼出草稿。 */
const allRows = ref<Person[]>([])
const rows = ref<Person[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = reactive({ keyword: '', kind: '', reviewStatus: '' })
/** 人员管理只展示已提交档案；草稿仅在建档流程内存在。 */
const SUBMITTED_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const
const orgs = ref<Organization[]>([])
/** /me 不返回 orgName；优先用列表里已有的 schoolName 补全，避免下拉显示组织 ID。 */
const ownSchoolName = computed(
  () =>
    auth.user?.orgName ||
    allRows.value.find((row) => row.schoolName)?.schoolName ||
    '本校',
)

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const editingVersion = ref(0)
const saving = ref(false)
const avatarFileId = ref('')
const avatarUrl = ref('')
const avatarUploading = ref(false)
/** 新建档案时人员尚不存在，头像文件先暂存本地，保存成功后再上传并回填。 */
const pendingAvatarFile = ref<File | null>(null)
/** 已建档但提交审核失败的档案；再次保存只重试提交，避免重复建档。 */
const pendingSubmitPerson = ref<Person | null>(null)

/**
 * 人员接口按附件安全基线只输出 avatarFileId，不输出公开直链 avatarUrl。
 * 列表与编辑弹窗展示头像时必须用 fileId 换取短期签名地址（/files/{id}/signed-url），
 * 否则重新打开弹窗时头像恒为默认占位（管理端联调发现）。
 */
async function resolveAvatarUrl(fileId: string): Promise<string> {
  if (!fileId) return ''
  for (const variant of ['thumbnail', 'content'] as const) {
    try {
      const { url } = await fileApi.signedUrl(fileId, variant)
      if (url) return url
    } catch {
      // 非图片或没有缩略图时回退到原图；两者都失败则保持占位
    }
  }
  return ''
}

const materialsVisible = ref(false)
const materialsLoading = ref(false)
const materials = ref<Material[]>([])
const materialOwner = ref<Person | null>(null)
const reviewingMaterialId = ref('')
const submittingPersonId = ref('')
const reviewingPersonId = ref('')

const batchVisible = ref(false)
const batchFileInput = ref<HTMLInputElement>()
const batchFile = ref<File | null>(null)
const batchParsing = ref(false)
const batchImporting = ref(false)
const batchRows = ref<PersonImportRow[]>([])
const batchFileErrors = ref<string[]>([])
const batchSummary = ref<{ success: number; failure: number } | null>(null)
/** 本次页面会话内已成功导入的身份证号；重新选择文件时跳过，避免重复建档。 */
const batchImportedIds = ref<Set<string>>(new Set())
/** 已创建但提交失败的档案（按身份证号）；重试失败行时只补提交，不重复建档。 */
const batchDraftPersons = new Map<string, Person>()
const batchReadyCount = computed(() => batchRows.value.filter((row) => row.status === 'READY').length)
const batchErrorCount = computed(() => batchRows.value.filter((row) => row.status === 'ERROR').length)
const batchSuccessCount = computed(() => batchRows.value.filter((row) => row.status === 'SUCCESS').length)
const batchFailedCount = computed(() => batchRows.value.filter((row) => row.status === 'FAILED').length)
const batchStatusLabels: Record<PersonImportStatus, string> = {
  READY: '校验通过',
  ERROR: '文件有误',
  SUCCESS: '已导入',
  FAILED: '导入失败',
}
const form = reactive({
  realName: '',
  kinds: ['ATHLETE'] as PersonKind[],
  gender: 'MALE',
  birthDate: '',
  idNumber: '',
  phone: '',
  schoolOrgId: '',
  education: '',
  coachCategory: '',
})

function comparePeople(a: Person, b: Person): number {
  const byTime = (b.createdAt || '').localeCompare(a.createdAt || '')
  if (byTime) return byTime
  const idA = Number(a.id)
  const idB = Number(b.id)
  return (Number.isFinite(idB) ? idB : 0) - (Number.isFinite(idA) ? idA : 0)
}

/** 已提交档案在前端分页；头像只为当前页换取签名地址。 */
async function applyPage() {
  const maxPage = Math.max(1, Math.ceil(allRows.value.length / pageSize.value))
  if (page.value > maxPage) page.value = maxPage
  const start = (page.value - 1) * pageSize.value
  rows.value = allRows.value.slice(start, start + pageSize.value)
  // 并行换取签名地址，失败只影响该行头像占位，不阻断列表
  await Promise.all(
    rows.value.map(async (row) => {
      if (!row.avatarFileId || row.avatarUrl) return
      row.avatarUrl = await resolveAvatarUrl(row.avatarFileId)
    }),
  )
}

async function load() {
  if (!canUsePeople.value) {
    allRows.value = []
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    // 后端只支持单状态筛选，且没有“排除草稿”参数；按已提交状态分别拉全后合并，
    // 草稿不会进入列表，筛选计数与分页也以已提交档案为准。
    const statuses = filters.reviewStatus
      ? [filters.reviewStatus]
      : [...SUBMITTED_STATUSES]
    let truncated = false
    const batches = await Promise.all(
      statuses.map(async (reviewStatus) => {
        const result = await fetchAllPages(
          (current, size) =>
            personApi.list({
              page: current,
              pageSize: size,
              keyword: filters.keyword || undefined,
              kind: filters.kind || undefined,
              reviewStatus,
            }),
          100,
          50,
        )
        if (result.truncated) truncated = true
        return result.items
      }),
    )
    const merged = new Map<string, Person>()
    for (const row of batches.flat()) {
      if (row.reviewStatus === 'DRAFT') continue
      merged.set(row.id, row)
    }
    allRows.value = [...merged.values()].sort(comparePeople)
    total.value = allRows.value.length
    if (truncated) {
      ElMessage.warning('人员档案较多，列表仅加载了部分记录；请用姓名或证件号缩小范围')
    }
    await applyPage()
  } catch {
    allRows.value = []
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function changePage() {
  await applyPage()
}

async function changePageSize() {
  page.value = 1
  await applyPage()
}

/** 建档后立即提交；提交响应丢失时以服务端状态为准，避免误判为失败。 */
async function ensurePersonSubmitted(person: Person, silent = false): Promise<Person> {
  const options = silent ? { silentError: true } : undefined
  try {
    return await personApi.submit(person.id, person.version, options)
  } catch (error) {
    try {
      const latest = await personApi.get(person.id, options)
      if (latest.reviewStatus === 'PENDING' || latest.reviewStatus === 'APPROVED') return latest
      if (latest.reviewStatus === 'REJECTED' && latest.version !== person.version) {
        return await personApi.submit(latest.id, latest.version, options)
      }
    } catch {
      // 读回失败时保留原始提交错误
    }
    throw error
  }
}

async function loadOrgs() {
  // 组织树接口仅 ADMIN；学校端只能使用本人所属学校节点，不请求必然 403 的接口。
  if (auth.isAdmin) {
    try {
      // 批量导入要按学校编码/全称匹配，必须拿到完整组织树；500 条上限会漏学校。
      const { items } = await fetchAllPages(
        (page, pageSize) => orgApi.list({ page, pageSize }),
        200,
        50,
      )
      // 人员归属只接受 SCHOOL/UNIVERSITY 节点（后端 _resolve_school 契约）。
      orgs.value = items.filter(
        (org) => org.enabled && (org.orgType === 'SCHOOL' || org.orgType === 'UNIVERSITY'),
      )
    } catch {
      orgs.value = []
    }
    return
  }
  if (!ownSchoolOrgId.value) {
    orgs.value = []
    return
  }
  // /me 不返回组织名称，学校端也没有组织详情权限；用本校球队的 schoolName 补全，
  // 否则下拉与批量导入的学校匹配只能看到组织 ID。
  let name = ownSchoolName.value
  if (name === '本校') {
    try {
      const teams = await teamApi.list({ page: 1, pageSize: 1 })
      name = teams.items[0]?.schoolName || name
    } catch {
      // 无球队时不阻断建档，显示“本校”兜底
    }
  }
  orgs.value = [
    {
      id: ownSchoolOrgId.value,
      name,
      orgType: 'UNIVERSITY',
      code: '',
      enabled: true,
      version: 0,
    },
  ]
}

/** 学校端固定本校；管理员可选择授权范围内的学校节点。 */
const schoolOptions = computed(() =>
  auth.isAdmin
    ? orgs.value.filter(
        (org) => org.enabled && (org.orgType === 'SCHOOL' || org.orgType === 'UNIVERSITY'),
      )
    : orgs.value,
)

/** 后端限一人一身份（kinds 恰好 1 项），表单用单选直接映射 kinds[0]。 */
const personKind = computed<PersonKind>({
  get: () => form.kinds[0] || 'ATHLETE',
  set: (value) => {
    form.kinds = value ? [value] : []
  },
})

function search() {
  page.value = 1
  load()
}

function openCreate() {
  editingId.value = null
  editingVersion.value = 0
  pendingSubmitPerson.value = null
  avatarFileId.value = ''
  avatarUrl.value = ''
  pendingAvatarFile.value = null
  Object.assign(form, {
    realName: '',
    kinds: ['ATHLETE'],
    gender: 'MALE',
    birthDate: '',
    idNumber: '',
    phone: '',
    schoolOrgId: auth.isAdmin ? '' : ownSchoolOrgId.value,
    education: '',
    coachCategory: '',
  })
  dialogVisible.value = true
}

async function openEdit(row: Person) {
  editingId.value = row.id
  editingVersion.value = row.version
  pendingSubmitPerson.value = null
  avatarFileId.value = row.avatarFileId || ''
  avatarUrl.value = row.avatarUrl || ''
  pendingAvatarFile.value = null
  Object.assign(form, {
    realName: row.realName,
    kinds: [...row.kinds],
    gender: row.gender || 'MALE',
    birthDate: row.birthDate || '',
    idNumber: '',
    phone: '',
    schoolOrgId: row.schoolOrgId || '',
    education: row.education || '',
    coachCategory: row.coachCategory || '',
  })
  dialogVisible.value = true
  // 列表尚未水合或从别处进入时补一次签名地址，保证重新打开能看到已保存头像
  if (!avatarUrl.value && avatarFileId.value) {
    avatarUrl.value = await resolveAvatarUrl(avatarFileId.value)
  }
}

async function save() {
  if (!form.realName.trim()) return ElMessage.warning('请填写姓名')
  // 后端 PersonCreate/PersonUpdate 限 1 项（2026-10-30 一人一身份裁定），
  // 这里提前拦截，避免勾选两项后提交才报“请求参数不合法”。
  if (form.kinds.length !== 1) return ElMessage.warning('人员类型只能选择一项')
  if (!editingId.value && !pendingSubmitPerson.value) {
    // 后端创建链强制要求身份证号（冻结唯一约束无 NULL）；表单提前校验，
    // 避免提交后才报错。
    if (!/^\d{17}[\dXx]$/.test(form.idNumber.trim()))
      return ElMessage.warning('请填写 18 位身份证号')
    if (!form.phone.trim()) return ElMessage.warning('请填写手机号')
  }
  if (!form.schoolOrgId) return ElMessage.warning('请选择学校 / 单位')
  if (!form.education.trim()) return ElMessage.warning('请填写学历')
  saving.value = true
  try {
    if (pendingSubmitPerson.value) {
      // 已建档但提交失败：保存本次修改后重试提交，不能再调用创建接口。
      if (pendingAvatarFile.value) {
        const record = await fileApi.upload(
          pendingAvatarFile.value,
          'PERSON',
          pendingSubmitPerson.value.id,
          'AVATAR',
        )
        avatarFileId.value = record.id
        pendingAvatarFile.value = null
      }
      const updated = await personApi.update(pendingSubmitPerson.value.id, {
        realName: form.realName.trim(),
        kinds: form.kinds,
        gender: form.gender,
        birthDate: form.birthDate || undefined,
        schoolOrgId: form.schoolOrgId || undefined,
        avatarFileId: avatarFileId.value || undefined,
        education: form.education,
        coachCategory: form.coachCategory,
        version: pendingSubmitPerson.value.version,
      })
      pendingSubmitPerson.value = updated
      await ensurePersonSubmitted(updated)
      pendingSubmitPerson.value = null
      ElMessage.success('人员档案已提交审核')
    } else if (editingId.value) {
      await personApi.update(editingId.value, {
        realName: form.realName.trim(),
        kinds: form.kinds,
        gender: form.gender,
        birthDate: form.birthDate || undefined,
        schoolOrgId: form.schoolOrgId || undefined,
        avatarFileId: avatarFileId.value || undefined,
        education: form.education,
        coachCategory: form.coachCategory,
        version: editingVersion.value,
      })
      ElMessage.success('人员档案已更新')
    } else {
      // 空字符串不是“未填写”：idNumber/phone 有长度与格式约束、schoolOrgId 有
      // min_length、birthDate 是 date，原样提交空串会被 StrictSchema 拒绝并提示
      // “请求参数不合法”。可选字段未填时一律省略。
      const created = await personApi.create({
        realName: form.realName.trim(),
        kinds: form.kinds,
        gender: form.gender || undefined,
        birthDate: form.birthDate || undefined,
        idNumber: form.idNumber.trim() || undefined,
        phone: form.phone.trim() || undefined,
        schoolOrgId: form.schoolOrgId || undefined,
        education: form.education.trim() || undefined,
        coachCategory: form.coachCategory || undefined,
      })
      // 列表中不再展示草稿，建档后必须立即提交，否则档案会无处可见。
      pendingSubmitPerson.value = created
      let latest = created
      if (pendingAvatarFile.value) {
        // 人员主档已存在才能建立 PERSON 归属；上传后立即回填头像。
        const record = await fileApi.upload(pendingAvatarFile.value, 'PERSON', created.id, 'AVATAR')
        avatarFileId.value = record.id
        pendingAvatarFile.value = null
        latest = await personApi.update(created.id, {
          realName: form.realName.trim(),
          avatarFileId: record.id,
          version: created.version,
        })
        pendingSubmitPerson.value = latest
      }
      await ensurePersonSubmitted(latest)
      pendingSubmitPerson.value = null
      ElMessage.success('人员档案已创建并提交审核')
    }
    dialogVisible.value = false
    await load()
  } catch {
    if (pendingSubmitPerson.value) {
      // 提交可能已生效但响应丢失：读回状态，避免把已提交档案误判为草稿。
      try {
        const latest = await personApi.get(pendingSubmitPerson.value.id, { silentError: true })
        if (latest.reviewStatus === 'PENDING' || latest.reviewStatus === 'APPROVED') {
          pendingSubmitPerson.value = null
          dialogVisible.value = false
          await load()
          ElMessage.success('人员档案已提交审核')
          return
        }
        pendingSubmitPerson.value = latest
      } catch {
        // 保留本地状态，仍可按“重新提交审核”重试
      }
      ElMessage.warning('档案已保存，但尚未提交审核，请点击“重新提交审核”重试')
    }
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

/** 关闭新建/编辑弹窗；未提交的草稿会在列表中不可见，必须明确确认。 */
async function closePersonDialog(done: () => void) {
  if (!pendingSubmitPerson.value) {
    done()
    return
  }
  try {
    await ElMessageBox.confirm(
      `「${pendingSubmitPerson.value.realName}」已保存为草稿但尚未提交审核，关闭后将无法在人员列表中找到。确定关闭？`,
      '档案尚未提交',
      {
        confirmButtonText: '仍要关闭',
        cancelButtonText: '返回提交',
        type: 'warning',
      },
    )
    pendingSubmitPerson.value = null
    done()
  } catch {
    // 返回提交
  }
}

async function uploadAvatar(options: UploadRequestOptions) {
  avatarUploading.value = true
  try {
    if (!editingId.value) {
      // 新建态：人员档案尚不存在，PERSON 归属校验必然拒绝；先本地预览，
      // 保存档案后再上传并回填（见 save()）。
      pendingAvatarFile.value = options.file
      avatarFileId.value = ''
      avatarUrl.value = URL.createObjectURL(options.file)
      ElMessage.success('头像已选择，保存档案后自动上传')
      return
    }
    const record = await fileApi.upload(options.file, 'PERSON', editingId.value, 'AVATAR')
    avatarFileId.value = record.id
    avatarUrl.value = record.url || URL.createObjectURL(options.file)
    ElMessage.success('头像上传成功，保存档案后生效')
  } catch {
    // 拦截器提示
  } finally {
    avatarUploading.value = false
  }
}

async function openMaterials(row: Person) {
  materialOwner.value = row
  materialsVisible.value = true
  await loadMaterials(row.id)
}

async function loadMaterials(personId?: string) {
  const ownerId = personId || materialOwner.value?.id
  if (!ownerId) return
  materialsLoading.value = true
  try {
    const res = await materialApi.list({ page: 1, pageSize: 100, ownerType: 'PERSON', ownerId })
    materials.value = res.items
  } catch {
    materials.value = []
  } finally {
    materialsLoading.value = false
  }
}

async function downloadMaterial(material: Material) {
  const fileId = material.fileIds?.[0]
  if (!fileId) return ElMessage.warning('该材料暂无可下载文件，请本人重新上传')
  try {
    const downloaded = await fileApi.download(fileId, material.fileName || '履历材料')
    ElMessage.success(downloaded ? '文件已开始下载' : '演示环境已模拟下载，接入后端后将下载真实文件')
  } catch {
    // 拦截器提示
  }
}

async function reviewMaterial(material: Material, decision: 'APPROVE' | 'REJECT') {
  let reason = ''
  if (decision === 'REJECT') {
    try {
      const result = await ElMessageBox.prompt('请填写驳回原因，将通知本人重新提交。', '驳回材料', {
        confirmButtonText: '确认驳回',
        cancelButtonText: '取消',
        inputValidator: (value) => (value && value.trim().length >= 4 ? true : '请至少填写 4 个字符'),
      })
      reason = result.value
    } catch {
      return
    }
  }
  reviewingMaterialId.value = material.id
  try {
    await materialApi.review(material.id, { decision, reason: reason || undefined, version: material.version })
    ElMessage.success(decision === 'APPROVE' ? '材料已通过审核' : '材料已驳回')
    await loadMaterials()
  } catch {
    // 拦截器提示
  } finally {
    reviewingMaterialId.value = ''
  }
}

/** DRAFT / REJECTED → PENDING。ADMIN 与 UNIVERSITY 均可提交。 */
async function submitPerson(row: Person) {
  submittingPersonId.value = row.id
  try {
    await personApi.submit(row.id, row.version)
    ElMessage.success('档案已提交审核，等待学校审核')
    await load()
  } catch {
    // 拦截器提示
  } finally {
    submittingPersonId.value = ''
  }
}

/** PENDING → APPROVED / REJECTED；仅 UNIVERSITY 可操作，后端另有防自审。 */
async function reviewPerson(row: Person, decision: 'APPROVE' | 'REJECT') {
  let reason = ''
  if (decision === 'REJECT') {
    try {
      const result = await ElMessageBox.prompt('请填写驳回原因，本人修改后可重新提交。', '驳回档案', {
        confirmButtonText: '确认驳回',
        cancelButtonText: '取消',
        inputValidator: (value) => (value && value.trim().length >= 4 ? true : '请至少填写 4 个字符'),
      })
      reason = result.value
    } catch {
      return
    }
  }
  reviewingPersonId.value = row.id
  try {
    await personApi.review(row.id, {
      decision,
      reason: reason || undefined,
      version: row.version,
    })
    ElMessage.success(decision === 'APPROVE' ? '档案已通过审核' : '档案已驳回')
    await load()
  } catch {
    // 拦截器提示
  } finally {
    reviewingPersonId.value = ''
  }
}

async function removePerson(row: Person) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.realName}」的人员档案？请先确认无报名与球队关联。`, '删除人员', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await personApi.remove(row.id, row.version)
    ElMessage.success('人员档案已删除')
    await load()
  } catch {
    // 取消
  }
}

/* ---------------------------------------------------------------- 批量建档 */

async function closeBatch(done: () => void) {
  if (batchParsing.value || batchImporting.value) {
    ElMessage.warning('正在处理文件，请等待完成后再关闭')
    return
  }
  if (batchDraftPersons.size) {
    try {
      await ElMessageBox.confirm(
        `本次会话有 ${batchDraftPersons.size} 条档案已创建但尚未提交审核；关闭前建议先点击“重试失败行”。确定关闭？`,
        '存在未提交档案',
        {
          confirmButtonText: '仍要关闭',
          cancelButtonText: '返回重试',
          type: 'warning',
        },
      )
    } catch {
      return
    }
  }
  done()
}

function resetBatch() {
  batchFile.value = null
  batchRows.value = []
  batchFileErrors.value = []
  batchSummary.value = null
  batchParsing.value = false
  batchImporting.value = false
  if (batchFileInput.value) batchFileInput.value.value = ''
}

async function openBatch() {
  resetBatch()
  batchVisible.value = true
  if (!orgs.value.length) await loadOrgs()
  if (!orgs.value.some((org) => org.enabled && (org.orgType === 'SCHOOL' || org.orgType === 'UNIVERSITY'))) {
    ElMessage.warning('未加载到可用学校组织，名单中的学校将无法匹配，请先检查组织管理')
  }
}

function pickBatchFile() {
  batchFileInput.value?.click()
}

async function onBatchFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return ElMessage.warning('仅支持 .xlsx 文件，请使用下载的模板填写')
  }
  if (file.size > 5 * 1024 * 1024) {
    return ElMessage.warning('文件不能超过 5MB')
  }
  batchFile.value = file
  batchRows.value = []
  batchFileErrors.value = []
  batchSummary.value = null
  await parseBatchFile(file)
}

function clearBatchFile() {
  resetBatch()
}

async function parseBatchFile(file: File) {
  batchParsing.value = true
  try {
    // xlsx 体积较大，只在真正导入时加载，避免影响人员管理首屏。
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) throw new Error('工作簿为空，请使用模板填写人员名单')
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) throw new Error('未找到可读取的工作表')
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      blankrows: true,
      raw: true,
    }) as unknown[][]
    const parsed = parsePersonImportRows(matrix, orgs.value)
    // 重新选择修正后的文件时，已经导入成功的人不再进入可导入集合。
    for (const row of parsed.rows) {
      if (row.status === 'READY' && row.idNumber && batchImportedIds.value.has(row.idNumber)) {
        row.status = 'SUCCESS'
        row.serverMessage = '本次页面会话已导入，跳过重复行'
      }
    }
    batchFileErrors.value = parsed.headerErrors
    batchRows.value = parsed.rows
    if (parsed.headerErrors.length) {
      ElMessage.warning(parsed.headerErrors[0])
    } else if (!parsed.rows.length) {
      ElMessage.warning('文件中没有可导入的人员行')
    } else if (parsed.rows.every((row) => row.status === 'ERROR')) {
      ElMessage.warning('所有行均未通过校验，请按问题列修正后重新选择文件')
    } else if (!parsed.rows.some((row) => row.status === 'READY')) {
      ElMessage.warning('文件中没有新的可导入行；本次已导入的人员会自动跳过')
    } else {
      const ready = parsed.rows.filter((row) => row.status === 'READY').length
      ElMessage.success(`已解析 ${parsed.rows.length} 行，可导入 ${ready} 行`)
    }
  } catch (error) {
    batchFileErrors.value = [
      error instanceof Error ? error.message : '文件解析失败，请确认是有效的 .xlsx 文件',
    ]
  } finally {
    batchParsing.value = false
  }
}

async function downloadPersonTemplate() {
  try {
    const XLSX = await import('xlsx')
    const listSheet = XLSX.utils.aoa_to_sheet([
      PERSON_IMPORT_TEMPLATE_HEADERS,
      ['张三', '510101201001011234', '13800000000', '运动员', '成都七中', '小学', '男', '2010-01-01'],
    ])
    listSheet['!cols'] = [
      { wch: 12 },
      { wch: 22 },
      { wch: 15 },
      { wch: 12 },
      { wch: 28 },
      { wch: 10 },
      { wch: 8 },
      { wch: 14 },
    ]
    const guideSheet = XLSX.utils.aoa_to_sheet([
      ['填写说明'],
      ['1. 单批最多 500 行，文件不超过 5MB；示例行请替换为真实数据或删除。'],
      ['2. 姓名、身份证号、手机号、人员类型、学校为必填；学历、性别、出生日期可留空。'],
      ['3. 身份证号必须把单元格设为「文本」再填写，否则 Excel 会丢失 18 位精度。'],
      ['4. 人员类型填写「运动员」或「教练员」；一个人只能选一种类型。'],
      ['5. 学校填写组织编码或学校全称；遇到同名学校时必须填写组织编码。'],
      ['6. 同一文件内身份证号不能重复；导入成功后档案自动提交审核。'],
      ['7. 性别、出生日期留空时，系统会尝试从身份证号推导。'],
      ['8. 系统只读取第一个工作表；表头可以放在标题行下方（前 20 行内自动识别）。'],
    ])
    guideSheet['!cols'] = [{ wch: 92 }]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, listSheet, '人员名单')
    XLSX.utils.book_append_sheet(workbook, guideSheet, '填写说明')
    XLSX.writeFile(workbook, '人员档案批量导入模板.xlsx')
  } catch {
    ElMessage.error('模板生成失败，请刷新页面后重试')
  }
}

function batchStatusLabel(status: PersonImportStatus): string {
  return batchStatusLabels[status]
}

function batchStatusType(status: PersonImportStatus): 'success' | 'danger' | 'warning' | 'info' {
  if (status === 'SUCCESS') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'ERROR') return 'warning'
  return 'info'
}

function batchRowMessage(row: PersonImportRow): string {
  if (row.status === 'ERROR') return row.errors.join('；') || '校验未通过'
  if (row.status === 'FAILED') return row.serverMessage || '创建或提交审核失败'
  if (row.status === 'SUCCESS') return row.serverMessage || '已创建并提交审核'
  return '校验通过，等待导入'
}

async function importBatch(retryOnly = false) {
  const targets = batchRows.value.filter((row) =>
    retryOnly ? row.status === 'FAILED' : row.status === 'READY',
  )
  if (!targets.length) {
    return ElMessage.warning(retryOnly ? '没有可重试的失败行' : '没有通过校验的行可导入')
  }
  if (retryOnly) {
    try {
      await ElMessageBox.confirm(
        `将重新提交 ${targets.length} 条失败行；已成功的行不会重复创建。`,
        '重试失败行',
        { confirmButtonText: '开始重试', cancelButtonText: '取消', type: 'warning' },
      )
    } catch {
      return
    }
  } else if (batchErrorCount.value) {
    try {
      await ElMessageBox.confirm(
        `文件共 ${batchRows.value.length} 行，校验通过 ${targets.length} 行、有误 ${batchErrorCount.value} 行。确认后只导入通过校验的行，失败行跳过。`,
        '部分行未通过校验',
        {
          confirmButtonText: `导入 ${targets.length} 行`,
          cancelButtonText: '暂不导入',
          type: 'warning',
        },
      )
    } catch {
      return
    }
  }

  batchImporting.value = true
  const summary = { success: 0, failure: 0 }
  try {
    // 控制并发，避免一次导入把后端写接口打满；每一行独立成功或失败。
    await mapLimit(targets, 3, async (row) => {
      row.serverMessage = undefined
      const draftKey = row.idNumber || String(row.rowNumber)
      try {
        // 上次导入已建档但提交失败的行，本次只补提交，不能重复调用创建接口。
        let created = batchDraftPersons.get(draftKey)
        const reused = !!created
        if (!created) {
          created = await personApi.create(buildPersonImportPayload(row), { silentError: true })
          batchDraftPersons.set(draftKey, created)
        }
        try {
          await ensurePersonSubmitted(created, true)
        } catch (error) {
          row.serverMessage = reused
            ? `档案已创建，提交审核仍未成功：${httpMessageOf(error)}；可再次重试`
            : `档案已创建，但提交审核失败：${httpMessageOf(error)}；可点击“重试失败行”补提交`
          throw error
        }
        batchDraftPersons.delete(draftKey)
        row.status = 'SUCCESS'
        row.serverMessage = '已创建并提交审核'
        if (row.idNumber) batchImportedIds.value.add(row.idNumber)
        summary.success += 1
      } catch (error) {
        row.status = 'FAILED'
        if (!row.serverMessage) row.serverMessage = httpMessageOf(error)
        summary.failure += 1
      }
    })
    batchSummary.value = { ...summary }
    if (summary.success) await load()
    if (summary.failure) {
      ElMessage.warning(
        `已导入并提交审核 ${summary.success} 人，${summary.failure} 人失败；失败原因见问题列，可修正后重试`,
      )
    } else {
      ElMessage.success(`已导入并提交审核 ${summary.success} 人`)
    }
  } finally {
    batchImporting.value = false
  }
}

onMounted(() => {
  load()
  loadOrgs()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="人员管理"
      description="统一管理运动员与教练员档案。学校账号仅可维护本校人员；列表仅显示已提交档案，新建或导入后自动提交审核。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button :icon="UploadFilled" @click="openBatch">批量导入</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建人员</el-button>
      </template>
    </PageHeader>

    <section class="page-card">
      <FilterBar :summary="'共 ' + total + ' 人'">
        <el-input
          v-model="filters.keyword"
          placeholder="姓名 / 证件号"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="filters.kind" placeholder="全部类型" clearable @change="search">
          <el-option label="运动员" value="ATHLETE" />
          <el-option label="教练员" value="COACH" />
        </el-select>
        <el-select v-model="filters.reviewStatus" placeholder="全部状态" clearable @change="search">
          <el-option label="待审核" value="PENDING" />
          <el-option label="已通过" value="APPROVED" />
          <el-option label="已驳回" value="REJECTED" />
        </el-select>
        <el-button type="primary" plain @click="search">查询</el-button>
      </FilterBar>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="姓名" min-width="170">
          <template #default="{ row }">
            <div class="person-cell">
              <span class="person-cell__avatar">
                <img v-if="row.avatarUrl" :src="row.avatarUrl" alt="" />
                <template v-else>{{ row.realName.slice(0, 1) }}</template>
              </span>
              <div>
                <strong>{{ row.realName }}</strong>
                <small>{{ row.maskedIdNumber || '证件号未登记' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="130">
          <template #default="{ row }">
            <el-tag v-for="kind in row.kinds" :key="kind" size="small" effect="plain" class="kind-tag">
              {{ kind === 'ATHLETE' ? '运动员' : '教练员' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="性别" width="70" align="center">
          <template #default="{ row }">
            {{ row.gender === 'FEMALE' ? '女' : row.gender === 'MALE' ? '男' : '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="schoolName" label="学校 / 单位" min-width="190">
          <template #default="{ row }">{{ row.schoolName || '—' }}</template>
        </el-table-column>
        <el-table-column label="档案状态" width="110">
          <template #default="{ row }"><StatusTag :status="row.reviewStatus" kind="review" /></template>
        </el-table-column>
        <el-table-column label="创建时间" width="130">
          <template #default="{ row }">
            <span class="muted">{{ dayjs(row.createdAt).format('YYYY-MM-DD') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="330" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Document" @click="openMaterials(row)">材料</el-button>
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button
              v-if="row.reviewStatus === 'REJECTED'"
              link
              type="primary"
              :icon="Promotion"
              :loading="submittingPersonId === row.id"
              @click="submitPerson(row)"
            >提交审核</el-button>
            <template v-if="canReviewPerson && row.reviewStatus === 'PENDING'">
              <el-button
                link
                type="success"
                :icon="CircleCheck"
                :loading="reviewingPersonId === row.id"
                @click="reviewPerson(row, 'APPROVE')"
              >通过</el-button>
              <el-button
                link
                type="danger"
                :icon="CircleClose"
                :loading="reviewingPersonId === row.id"
                @click="reviewPerson(row, 'REJECT')"
              >驳回</el-button>
            </template>
            <el-button v-if="canDeletePerson" link type="danger" :icon="Delete" @click="removePerson(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
        @current-change="changePage"
        @size-change="changePageSize"
      />
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑人员档案' : '新建人员档案'"
      width="660px"
      :before-close="closePersonDialog"
    >
      <div class="avatar-row">
        <span class="avatar-preview">
          <img v-if="avatarUrl" :src="avatarUrl" alt="头像" />
          <template v-else>{{ form.realName.slice(0, 1) || '人' }}</template>
        </span>
        <div>
          <strong>人员头像</strong>
          <small>用于报名表、参赛证与身份核验，建议使用近期免冠照片。</small>
        </div>
        <el-upload
          :show-file-list="false"
          :http-request="uploadAvatar"
          accept=".jpg,.jpeg,.png"
        >
          <el-button size="small" plain :icon="UploadFilled" :loading="avatarUploading">上传头像</el-button>
        </el-upload>
      </div>
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="真实姓名" required>
            <el-input v-model="form.realName" placeholder="与证件一致" />
          </el-form-item>
          <el-form-item label="性别">
            <el-select v-model="form.gender" style="width: 100%">
              <el-option label="男" value="MALE" />
              <el-option label="女" value="FEMALE" />
              <el-option label="未说明" value="UNSPECIFIED" />
            </el-select>
          </el-form-item>
          <el-form-item label="出生日期">
            <el-date-picker v-model="form.birthDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="人员类型" required>
            <el-radio-group v-model="personKind">
              <el-radio value="ATHLETE">运动员</el-radio>
              <el-radio value="COACH">教练员</el-radio>
            </el-radio-group>
          </el-form-item>
          <template v-if="!editingId">
            <el-form-item label="身份证号" required>
              <el-input v-model="form.idNumber" maxlength="18" placeholder="18 位，仅用于脱敏存储" />
            </el-form-item>
            <el-form-item label="手机号" required>
              <el-input v-model="form.phone" maxlength="11" placeholder="仅用于脱敏存储" />
            </el-form-item>
          </template>
          <el-form-item label="学校 / 单位" required>
            <el-select
              v-model="form.schoolOrgId"
              filterable
              clearable
              :disabled="!auth.isAdmin"
              style="width: 100%"
            >
              <el-option v-for="org in schoolOptions" :key="org.id" :label="org.name" :value="org.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="学历" required>
            <el-input v-model="form.education" placeholder="如：本科" />
          </el-form-item>
          <el-form-item v-if="form.kinds.includes('COACH')" label="教练员类别">
            <el-select v-model="form.coachCategory" style="width: 100%" clearable placeholder="选择类别">
              <el-option
                v-for="(label, value) in COACH_CATEGORY_LABELS"
                :key="value"
                :label="label"
                :value="value"
              />
            </el-select>
          </el-form-item>
        </div>
        <el-alert
          v-if="pendingSubmitPerson"
          type="warning"
          :closable="false"
          show-icon
          title="档案已保存，尚未提交审核"
          description="修改后可点击“重新提交审核”；关闭弹窗后该草稿不会出现在人员列表。"
        />
        <el-alert
          v-else-if="!editingId"
          type="info"
          :closable="false"
          show-icon
          title="保存后直接提交审核"
          description="证件号与手机号仅脱敏保存。保存后档案直接进入待审核，审核通过后才能进入球队候选池。"
        />
      </el-form>
      <template #footer>
        <el-button @click="closePersonDialog(() => (dialogVisible = false))">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          {{ pendingSubmitPerson ? '重新提交审核' : editingId ? '保存档案' : '保存并提交审核' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="batchVisible"
      title="批量导入人员档案"
      width="900px"
      :close-on-click-modal="false"
      :before-close="closeBatch"
      @closed="resetBatch"
    >
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="先用 Excel 批量建档，再在「参赛账号」发放邀请"
        description="系统逐行校验身份证号、手机号、人员类型与学校；有问题的行不会写入。导入成功后档案自动提交审核。"
      />

      <div class="batch-toolbar">
        <input
          ref="batchFileInput"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          class="batch-file-input"
          @change="onBatchFileChange"
        />
        <el-button :icon="UploadFilled" :disabled="batchParsing || batchImporting" @click="pickBatchFile">
          选择 .xlsx
        </el-button>
        <span v-if="batchFile" class="batch-file-name">{{ batchFile.name }}</span>
        <span v-else class="muted">未选择文件，单批最多 500 行、5MB</span>
        <el-button v-if="batchFile" link type="danger" @click="clearBatchFile">移除</el-button>
        <span class="batch-toolbar__spacer" />
        <el-button link type="primary" :icon="Download" @click="downloadPersonTemplate">
          下载模板
        </el-button>
      </div>

      <div v-if="batchParsing" class="batch-parsing">
        <el-icon class="is-loading"><Loading /></el-icon>
        正在解析并校验文件…
      </div>

      <div v-if="batchFileErrors.length" class="batch-errors">
        <el-alert
          v-for="(message, index) in batchFileErrors"
          :key="index"
          type="error"
          :closable="false"
          show-icon
          :title="message"
        />
      </div>

      <div v-if="!batchFile && !batchParsing" class="batch-guide">
        <strong>模板列</strong>
        <p>{{ PERSON_IMPORT_TEMPLATE_HEADERS.join('、') }}</p>
        <small>学校列填写组织编码或学校全称；遇到同名学校时必须填写组织编码。</small>
      </div>

      <el-alert
        v-if="batchSummary"
        class="batch-summary-alert"
        :type="batchSummary.failure ? 'warning' : 'success'"
        :closable="false"
        show-icon
        :title="`本次导入：成功 ${batchSummary.success} 人，失败 ${batchSummary.failure} 人`"
        :description="
          batchSummary.failure
            ? '失败行已保留在下方；可修正文件后重新选择，或直接重试失败行。已成功的行不会重复创建。'
            : '人员列表已刷新，档案已提交审核。'
        "
      />

      <div v-if="batchRows.length" class="batch-stats">
        <span class="batch-stat batch-stat--ready">校验通过 <b>{{ batchReadyCount }}</b></span>
        <span v-if="batchErrorCount" class="batch-stat batch-stat--error">文件有误 <b>{{ batchErrorCount }}</b></span>
        <span v-if="batchSuccessCount" class="batch-stat batch-stat--success">已导入 <b>{{ batchSuccessCount }}</b></span>
        <span v-if="batchFailedCount" class="batch-stat batch-stat--failed">导入失败 <b>{{ batchFailedCount }}</b></span>
        <span class="muted">共 {{ batchRows.length }} 行</span>
      </div>

      <el-table
        v-if="batchRows.length"
        :data="batchRows"
        size="small"
        max-height="360"
        style="width: 100%"
      >
        <el-table-column prop="rowNumber" label="行号" width="60" />
        <el-table-column label="姓名" width="90">
          <template #default="{ row }">{{ row.realName || '—' }}</template>
        </el-table-column>
        <el-table-column label="身份证号" width="150">
          <template #default="{ row }">
            <span class="batch-id">{{ row.maskedIdNumber || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="schoolName" label="学校" min-width="150" show-overflow-tooltip />
        <el-table-column label="类型" width="72">
          <template #default="{ row }">
            {{ row.kind === 'ATHLETE' ? '运动员' : row.kind === 'COACH' ? '教练员' : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96">
          <template #default="{ row }">
            <el-tag :type="batchStatusType(row.status)" size="small" effect="plain">
              {{ batchStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="问题" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">
            <span
              :class="{
                'batch-problem': row.status === 'ERROR' || row.status === 'FAILED',
                'batch-ok': row.status === 'SUCCESS',
              }"
            >
              {{ batchRowMessage(row) }}
            </span>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button
          :disabled="batchParsing || batchImporting"
          @click="closeBatch(() => (batchVisible = false))"
        >关闭</el-button>
        <el-button
          v-if="batchFailedCount"
          :loading="batchImporting"
          :disabled="batchParsing || batchImporting"
          @click="importBatch(true)"
        >
          重试失败 {{ batchFailedCount }} 行
        </el-button>
        <el-button
          type="primary"
          :loading="batchImporting"
          :disabled="!batchReadyCount || batchParsing || batchImporting"
          @click="importBatch(false)"
        >
          导入有效行（{{ batchReadyCount }}）
        </el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="materialsVisible" size="620px" :with-header="false">
      <div class="material-head">
        <span class="material-head__eyebrow">个人材料</span>
        <h2>{{ materialOwner?.realName || '人员' }} · 履历材料</h2>
        <p>{{ materialOwner?.schoolName || '学校未登记' }} · 待审核材料需逐份给出结论。</p>
      </div>
      <div v-loading="materialsLoading" class="material-list">
        <div v-for="item in materials" :key="item.id" class="material-item">
          <span class="material-item__icon"><el-icon><Document /></el-icon></span>
          <div class="material-item__body">
            <div class="material-item__title">
              <strong>{{ item.title }}</strong>
              <StatusTag :status="item.reviewStatus" kind="review" />
            </div>
            <small>{{ item.materialLabel }} · {{ item.fileName || '文件未登记' }}</small>
            <p v-if="item.reviewReason">{{ item.reviewReason }}</p>
            <div class="material-item__actions">
              <el-button v-if="item.fileName" size="small" link type="primary" @click="downloadMaterial(item)">
                下载
              </el-button>
              <template v-if="item.reviewStatus === 'PENDING'">
              <el-button
                size="small"
                type="danger"
                plain
                :loading="reviewingMaterialId === item.id"
                @click="reviewMaterial(item, 'REJECT')"
              >
                驳回
              </el-button>
              <el-button
                size="small"
                type="success"
                :loading="reviewingMaterialId === item.id"
                @click="reviewMaterial(item, 'APPROVE')"
              >
                通过
              </el-button>
              </template>
            </div>
          </div>
        </div>
        <el-empty v-if="!materialsLoading && !materials.length" description="该人员暂无履历材料" :image-size="80" />
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.scope-alert {
  margin-bottom: 16px;
}

.person-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.person-cell__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.person-cell__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.person-cell strong {
  display: block;
  font-size: 12.5px;
}

.person-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.kind-tag {
  margin-right: 4px;
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 18px;
  padding: 13px 15px;
  border-radius: 12px;
  background: var(--paper);
}

.avatar-preview {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--brand-100);
  color: var(--brand-700);
  font-size: 16px;
  font-weight: 700;
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-row div {
  flex: 1;
}

.avatar-row strong {
  display: block;
  font-size: 12.5px;
}

.avatar-row small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.batch-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 16px 0;
}

.batch-file-input {
  display: none;
}

.batch-file-name {
  min-width: 0;
  font-size: 12px;
  color: var(--brand-700);
  word-break: break-all;
}

.batch-toolbar__spacer {
  flex: 1;
}

.batch-parsing {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 130px;
  font-size: 12px;
  color: var(--ink-500);
}

.batch-errors {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.batch-guide {
  margin: 18px 0 4px;
  padding: 16px 18px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  background: var(--paper);
}

.batch-guide strong {
  font-size: 12px;
  color: var(--ink-700);
}

.batch-guide p {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-700);
}

.batch-guide small {
  display: block;
  margin-top: 6px;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--ink-300);
}

.batch-summary-alert {
  margin-bottom: 14px;
}

.batch-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0 10px;
  font-size: 11.5px;
}

.batch-stat {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--paper);
  color: var(--ink-500);
}

.batch-stat b {
  margin-left: 2px;
}

.batch-stat--ready b {
  color: var(--brand-700);
}

.batch-stat--error b {
  color: var(--warning-600, #b7791f);
}

.batch-stat--success b {
  color: var(--brand-700);
}

.batch-stat--failed b {
  color: var(--danger-600, #b33a3a);
}

.batch-id {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 10.5px;
  letter-spacing: 0.02em;
}

.batch-problem {
  color: var(--danger-600, #b33a3a);
  line-height: 1.5;
}

.batch-ok {
  color: var(--brand-700);
}

.material-head {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.material-head__eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-600);
}

.material-head h2 {
  margin-top: 5px;
  font-size: 20px;
}

.material-head p {
  margin-top: 5px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.material-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.material-item {
  display: flex;
  gap: 11px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 11px;
}

.material-item__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.material-item__body {
  flex: 1;
  min-width: 0;
}

.material-item__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.material-item__title strong {
  font-size: 12.5px;
}

.material-item small {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: var(--ink-300);
}

.material-item p {
  margin-top: 5px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.material-item__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
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
