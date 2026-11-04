<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import {
  ElMessage,
  ElMessageBox,
  type UploadFile,
  type UploadRequestOptions,
} from 'element-plus'
import {
  Check,
  CircleCheck,
  Close,
  Delete,
  Document,
  Download,
  Edit,
  Plus,
  Refresh,
  RefreshLeft,
  UploadFilled,
  Warning,
} from '@element-plus/icons-vue'
import { enrollmentApi, fileApi, personApi, teamApi } from '../../api'
import type { EnrollmentDetail } from '../../api'
import type {
  EnrollmentAttachment,
  ImportReport,
  Person,
  PrecheckIssue,
  ReviewRecord,
  RosterItem,
  TeamMember,
} from '../../api/types'
import { fetchAllPages, mapLimit } from '../../utils/asyncPool'
import { usePermission } from '../../composables/usePermission'
import { useAuthStore } from '../../stores/auth'
import PageHeader from '../../components/common/PageHeader.vue'
import SafeImage from '../../components/common/SafeImage.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import { positionLabel, reviewActionLabel } from '../../config/labels'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { can } = usePermission()
const loading = ref(false)
const detail = ref<EnrollmentDetail | null>(null)
const reviews = ref<ReviewRecord[]>([])
const precheckIssues = ref<PrecheckIssue[]>([])
const precheckVisible = ref(false)
const addPlayerVisible = ref(false)
const editPlayerVisible = ref(false)
const editingRoster = ref<RosterItem | null>(null)
const savingPlayer = ref(false)
const attachmentVisible = ref(false)
const attachmentType = ref<'STAMPED_FORM' | 'STUDENT_STATUS'>('STAMPED_FORM')
const attachmentUploading = ref(false)
const importVisible = ref(false)
const importReport = ref<ImportReport | null>(null)
const importFile = ref<File | null>(null)
const photoFile = ref<File | null>(null)
const importing = ref(false)
/** 添加球员来源：球队常备名单（默认）或人员库检索。 */
const playerSource = ref<'TEAM' | 'SEARCH'>('TEAM')
const teamMemberLoading = ref(false)
const teamMemberError = ref('')
const teamMembers = ref<TeamMember[]>([])
const teamMemberKeyword = ref('')
const selectedTeamMembers = ref<TeamMember[]>([])
const actionLoading = ref(false)
const exporting = ref<'registration' | 'players' | ''>('')
const personKeyword = ref('')
const personResults = ref<Person[]>([])
const searchLoading = ref(false)
const savingInfo = ref(false)

const infoForm = reactive({
  contactName: '',
  contactPhone: '',
  remarks: '',
})

const playerForm = reactive({
  athleteId: '',
  jerseyNumber: undefined as number | undefined,
  position: '',
})

const selectedPersons = ref<Person[]>([])

const rosterEditForm = reactive({
  jerseyNumber: undefined as number | undefined,
  position: '',
})
/** 编辑名单时单独补传照片：不依赖身份证号命名，供未办证学生使用。 */
const rosterPhotoFile = ref<File | null>(null)
const rosterPhotoPreview = ref('')
const rosterPhotoRemoved = ref(false)
const rosterPhotoLoading = ref(false)
let rosterPhotoRequestId = 0
/** 名单接口不返回照片地址，按 photoFileId 批量换取签名地址用于列表头像。 */
const rosterPhotoUrls = ref<Record<string, string>>({})

const enrollmentId = computed(() => String(route.params.id))
const isReviewer = computed(() => can(['enrollment.review.city', 'enrollment.review.province']))
const isSchoolOwner = computed(
  () =>
    auth.roles.includes('UNIVERSITY') &&
    Boolean(detail.value) &&
    detail.value?.schoolOrgId === auth.user?.orgId &&
    // 后端 scope.ensure_enrollment_creator：created_by 为空不设限，非空且非
    // 本人则 403，此处同口径（同校他人看到按钮点击必 403）。
    (!detail.value?.createdBy || detail.value?.createdBy === auth.user?.accountId),
)
/** 球队端的归属按 /me 返回的 teamIds 判断；后端对球队端只校验报名所属球队在数据范围内。 */
const isTeamOwner = computed(
  () =>
    auth.roles.includes('TEAM') &&
    Boolean(detail.value) &&
    Boolean(auth.user?.teamIds?.includes(detail.value?.teamId || '')),
)
const isEnrollmentOwner = computed(() => isSchoolOwner.value || isTeamOwner.value)
// 报送、修改、提交、撤回、删除只属于报送方（学校端/球队端），管理员不代替报送。
const canSubmit = computed(() => isEnrollmentOwner.value)
const canEdit = computed(() => isEnrollmentOwner.value && !!detail.value?.editable)
const canDelete = computed(
  () =>
    isEnrollmentOwner.value &&
    Boolean(detail.value) &&
    ['DRAFT', 'REJECTED', 'WITHDRAWN'].includes(detail.value?.status || ''),
)
const canReview = computed(() => {
  const status = detail.value?.status
  if (auth.roles.includes('ADMIN')) {
    return status === 'PENDING_CITY_REVIEW' || status === 'PENDING_PROVINCE_REVIEW'
  }
  if (!isReviewer.value) return false
  // 市州只审初审阶段，省级只审终审阶段，避免越级处理。
  if (auth.roles.includes('CITY')) return status === 'PENDING_CITY_REVIEW'
  return status === 'PENDING_PROVINCE_REVIEW'
})

/** 名单资格确认（E-2）：后端 rosterQualify 放行 TEAM+UNIVERSITY，本页仅学校端展示。 */
const canQualify = computed(
  () =>
    auth.roles.includes('UNIVERSITY') &&
    Boolean(detail.value) &&
    detail.value?.schoolOrgId === auth.user?.orgId &&
    // D-2：报名终审通过后资格操作全部 409，按钮同步隐藏
    detail.value?.status !== 'APPROVED',
)

/** 名单资格展示态：QUALIFIED 无凭证仍需人工确认（终审硬门槛看凭证不看状态值）。 */
function qualificationMeta(row: RosterItem) {
  const status = row.qualificationStatus || 'QUALIFIED'
  if (status === 'EXCLUDED') return { label: '已剔除', type: 'info' as const }
  if (status === 'DISQUALIFIED') return { label: '资格不符', type: 'danger' as const }
  if (status === 'PENDING_VERIFICATION') return { label: '待核实', type: 'warning' as const }
  return row.confirmedAt
    ? { label: '已确认', type: 'success' as const }
    : { label: '待确认', type: 'warning' as const }
}

function auditMeta(row: RosterItem) {
  const status = detail.value?.currentAuditStatuses?.[row.athleteId]
  if (!status) return { label: '—', type: 'info' as const }
  if (status === 'APPROVED') return { label: '已通过', type: 'success' as const }
  if (status === 'REJECTED') return { label: '已驳回', type: 'danger' as const }
  return { label: '待审核', type: 'warning' as const }
}

function personStatusOf(row: RosterItem): string {
  return detail.value?.currentAuditStatuses?.[row.athleteId] || ''
}

/** 人员档案审核操作仅学校端（后端 personSubmit/personReview 只放行 UNIVERSITY）。 */
const canReviewPerson = computed(() => auth.roles.includes('UNIVERSITY'))

const rosterAthleteIds = computed(
  () => new Set((detail.value?.players || []).map((player) => player.athleteId)),
)
const rosterJerseyNumbers = computed(
  () =>
    new Set(
      (detail.value?.players || [])
        .map((player) => player.jerseyNumber)
        .filter((value): value is number => typeof value === 'number'),
    ),
)
/** 球队名单中的现役成员；已在本次报名名单或球衣号冲突的成员仍展示，但不可选。 */
const filteredTeamMembers = computed(() => {
  const keyword = teamMemberKeyword.value.trim()
  return teamMembers.value
    .filter((member) => member.status === 'CURRENT')
    .filter(
      (member) =>
        !keyword ||
        member.athleteName.includes(keyword) ||
        member.maskedIdNumber?.includes(keyword),
    )
    .sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999))
})

const selectableTeamMemberCount = computed(
  () => filteredTeamMembers.value.filter((member) => !memberBlockReason(member)).length,
)
/** 人员库检索时，统一球衣号码只对单个选中球员有意义；多选时不写入号码，避免同号冲突。 */
const canSetPlayerMeta = computed(() => selectedPersons.value.length <= 1)
const selectedPlayerCount = computed(() =>
  playerSource.value === 'TEAM' ? selectedTeamMembers.value.length : selectedPersons.value.length,
)
const importReportTitle = computed(() => {
  if (importReport.value?.mode === 'PHOTO_IMPORT') return '照片匹配结果'
  if (importReport.value?.mode === 'APPLY_VALID_ROWS') return '导入结果（已写入有效行）'
  return '校验结果（未修改名单）'
})

// 后端 latestReviewReason 取的是最近一条带原因的审核记录，审核通过意见也会返回，
// 不能直接当作驳回原因展示；以审核记录中的最近一次动作为准。
const latestReview = computed<ReviewRecord | null>(() => {
  if (!reviews.value.length) return null
  const sorted = [...reviews.value].sort((a, b) =>
    (a.createdAt || '').localeCompare(b.createdAt || ''),
  )
  return sorted[sorted.length - 1] || null
})
const latestRejectReason = computed(() => {
  const record = latestReview.value
  if (record) {
    return record.action === 'REJECT' || record.action === 'RETURN_FOR_CORRECTION'
      ? record.reason || ''
      : ''
  }
  // 审核记录不可用时，仅在当前状态确为驳回时回退到详情字段。
  return detail.value?.status === 'REJECTED' ? detail.value.latestReviewReason || '' : ''
})
const latestRejectTitle = computed(() =>
  latestReview.value?.action === 'RETURN_FOR_CORRECTION'
    ? `最近一次退回补正原因：${latestRejectReason.value}`
    : `最近一次驳回原因：${latestRejectReason.value}`,
)

const timeline = computed<ReviewRecord[]>(() => {
  if (reviews.value.length) return reviews.value
  if (!detail.value) return []
  return [
    {
      id: 'created',
      enrollmentId: detail.value.id,
      stage: 'SUBMISSION',
      action: 'SUBMIT',
      toStatus: 'DRAFT',
      operatorName: '系统',
      createdAt: detail.value.createdAt,
    },
  ]
})

async function hydrateRosterPhotos(players: RosterItem[]) {
  const pending = players.filter(
    (player) => player.photoFileId && !rosterPhotoUrls.value[player.photoFileId],
  )
  if (!pending.length) return
  const resolved = await mapLimit(pending, 4, async (player) => {
    const fileId = player.photoFileId as string
    try {
      const { url } = await fileApi.signedUrl(fileId, 'thumbnail')
      return [fileId, url] as const
    } catch {
      try {
        const { url } = await fileApi.signedUrl(fileId, 'content')
        return [fileId, url] as const
      } catch {
        return null
      }
    }
  })
  const next = { ...rosterPhotoUrls.value }
  for (const pair of resolved) {
    if (pair) next[pair[0]] = pair[1]
  }
  rosterPhotoUrls.value = next
}

async function load() {
  loading.value = true
  try {
    detail.value = await enrollmentApi.get(enrollmentId.value)
    resetInfoForm()
    void hydrateRosterPhotos(detail.value.players || [])
    const reviewPage = await enrollmentApi.reviews(enrollmentId.value)
    reviews.value = reviewPage.items
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

async function runPrecheck() {
  if (!detail.value) return
  actionLoading.value = true
  try {
    const result = await enrollmentApi.precheck(enrollmentId.value, detail.value.version)
    precheckIssues.value = result.issues
    if (result.passed) {
      ElMessage.success('预检通过，可以提交审核')
    } else {
      precheckVisible.value = true
    }
  } catch {
    // 拦截器已提示
  } finally {
    actionLoading.value = false
  }
}

async function submitEnrollment() {
  if (!detail.value) return
  actionLoading.value = true
  try {
    const result = await enrollmentApi.precheck(enrollmentId.value, detail.value.version)
    if (!result.passed) {
      precheckIssues.value = result.issues
      precheckVisible.value = true
      return
    }
    await ElMessageBox.confirm(
      '提交后将生成报名快照并进入审核流程，信息不可直接修改，是否确认？',
      '提交报名',
      { confirmButtonText: '确认提交', cancelButtonText: '取消', type: 'warning' },
    )
    await enrollmentApi.submit(enrollmentId.value, detail.value.version)
    ElMessage.success('已提交，等待审核')
    await load()
  } catch {
    // 取消或异常
  } finally {
    actionLoading.value = false
  }
}

async function withdraw() {
  try {
    const { value } = await ElMessageBox.prompt('请填写撤回原因，撤回后可继续修改。', '撤回报名', {
      confirmButtonText: '确认撤回',
      cancelButtonText: '取消',
      inputValidator: (val) => (val && val.trim().length >= 4 ? true : '请至少填写 4 个字符'),
    })
    if (!detail.value) return
    await enrollmentApi.withdraw(enrollmentId.value, detail.value.version, value)
    ElMessage.success('已撤回报名')
    await load()
  } catch {
    // 取消
  }
}

async function exportDocument(kind: 'registration' | 'players') {
  if (!detail.value) return
  exporting.value = kind
  try {
    const label = `${detail.value.teamName || detail.value.id}`
    const downloaded =
      kind === 'registration'
        ? await enrollmentApi.downloadRegistration(enrollmentId.value, label)
        : await enrollmentApi.downloadPlayers(enrollmentId.value, label)
    ElMessage.success(
      downloaded ? '文件已开始下载' : '演示环境已模拟导出，接入后端后将下载真实文件',
    )
  } catch {
    // 拦截器提示
  } finally {
    exporting.value = ''
  }
}

async function approve() {
  try {
    await ElMessageBox.confirm('确认该报名信息真实完整，并同意通过当前审核？', '审核通过', {
      confirmButtonText: '通过',
      cancelButtonText: '取消',
      type: 'success',
    })
    if (!detail.value) return
    await enrollmentApi.review(enrollmentId.value, detail.value.version, { decision: 'APPROVE' })
    ElMessage.success('审核已通过')
    await load()
  } catch {
    // 取消
  }
}

async function reject() {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回原因，将通知参赛单位并允许重新提交。', '驳回报名', {
      confirmButtonText: '确认驳回',
      cancelButtonText: '取消',
      inputValidator: (val) => (val && val.trim().length >= 6 ? true : '请至少填写 6 个字符'),
    })
    if (!detail.value) return
    await enrollmentApi.review(enrollmentId.value, detail.value.version, { decision: 'REJECT', reason: value })
    ElMessage.success('已驳回并通知参赛单位')
    await load()
  } catch {
    // 取消
  }
}

async function returnForCorrection() {
  if (!detail.value) return
  try {
    const { value } = await ElMessageBox.prompt(
      '请填写需要补正的内容。退回后报送方（学校或球队）可修改联系人、名单与材料，并重新提交审核。',
      '退回补正',
      {
        confirmButtonText: '确认退回',
        cancelButtonText: '取消',
        inputValidator: (val) => (val && val.trim().length >= 6 ? true : '请至少填写 6 个字符'),
      },
    )
    await enrollmentApi.review(enrollmentId.value, detail.value.version, {
      decision: 'RETURN_FOR_CORRECTION',
      reason: value,
    })
    ElMessage.success('已退回补正，参赛单位可修改后重新提交')
    await load()
  } catch {
    // 取消
  }
}

function resetInfoForm() {
  if (!detail.value) return
  infoForm.contactName = detail.value.contactName || ''
  // 详情只返回掩码手机号，必须让报送方重新输入完整号码。
  infoForm.contactPhone = ''
  infoForm.remarks = detail.value.remarks || ''
}

async function saveInfo() {
  if (!detail.value) return
  if (!infoForm.contactName.trim()) return ElMessage.warning('请填写领队/联系人')
  if (!/^1\d{10}$/.test(infoForm.contactPhone)) return ElMessage.warning('请重新输入完整的 11 位手机号')
  savingInfo.value = true
  try {
    await enrollmentApi.update(detail.value.id, {
      eventId: detail.value.eventId,
      groupId: detail.value.groupId,
      teamId: detail.value.teamId,
      subjectType: detail.value.subjectType,
      contactName: infoForm.contactName.trim(),
      contactPhone: infoForm.contactPhone,
      remarks: infoForm.remarks,
      version: detail.value.version,
    })
    ElMessage.success('报名信息已更新')
    await load()
  } catch {
    // 拦截器提示
  } finally {
    savingInfo.value = false
  }
}

function memberBlockReason(member: TeamMember) {
  if (member.status !== 'CURRENT') return '已离队'
  if (rosterAthleteIds.value.has(member.athleteId)) return '已在报名名单'
  if (
    typeof member.jerseyNumber === 'number' &&
    rosterJerseyNumbers.value.has(member.jerseyNumber)
  ) {
    return `球衣号 ${member.jerseyNumber} 已被占用`
  }
  return ''
}

function memberSelectable(member: TeamMember) {
  return !memberBlockReason(member)
}

function handleTeamSelection(rows: TeamMember[]) {
  selectedTeamMembers.value = rows
}

function switchPlayerSource(source: string | number | boolean) {
  playerSource.value = source === 'SEARCH' ? 'SEARCH' : 'TEAM'
  selectedPersons.value = []
  selectedTeamMembers.value = []
}

async function loadTeamMembers() {
  if (!detail.value?.teamId) return
  teamMemberLoading.value = true
  teamMemberError.value = ''
  try {
    const teamId = detail.value.teamId
    const { items } = await fetchAllPages((page, pageSize) =>
      teamApi.members(teamId, { page, pageSize }, { silentError: true }),
    )
    teamMembers.value = items
  } catch {
    teamMembers.value = []
    teamMemberError.value = '球队名单读取失败，可改用人员库检索或稍后重试。'
  } finally {
    teamMemberLoading.value = false
  }
}

function openAddPlayer() {
  addPlayerVisible.value = true
  playerSource.value = 'TEAM'
  playerForm.athleteId = ''
  playerForm.jerseyNumber = undefined
  playerForm.position = ''
  selectedPersons.value = []
  selectedTeamMembers.value = []
  personKeyword.value = ''
  personResults.value = []
  teamMemberKeyword.value = ''
  teamMembers.value = []
  void loadTeamMembers()
}

async function searchPersons() {
  const keyword = personKeyword.value.trim()
  // 后端要求 keyword 至少 1 个字符，空关键字不再发请求。
  if (!keyword) {
    personResults.value = []
    return
  }
  searchLoading.value = true
  try {
    personResults.value = await personApi.search({ keyword })
  } catch {
    personResults.value = []
  } finally {
    searchLoading.value = false
  }
}

function handleSelectionChange(rows: Person[]) {
  selectedPersons.value = rows
}

async function addPlayer() {
  if (!selectedPlayerCount.value) return ElMessage.warning('请先选择球员')
  savingPlayer.value = true
  let added = 0
  let failed = 0
  try {
    if (playerSource.value === 'TEAM') {
      // 球队名单自带球衣号与位置，逐条沿用，避免批量添加时号码互相冲突。
      for (const member of selectedTeamMembers.value) {
        try {
          await enrollmentApi.addPlayer(enrollmentId.value, {
            athleteId: member.athleteId,
            jerseyNumber: member.jerseyNumber,
            position: member.position || '',
          })
          added += 1
        } catch {
          failed += 1
        }
      }
    } else {
      // 人员库不提供报名号码：多选时不写球衣号，避免多条记录同号；
      // 单选时使用弹窗中填写的号码与位置。
      const single = selectedPersons.value.length === 1
      for (const person of selectedPersons.value) {
        try {
          await enrollmentApi.addPlayer(enrollmentId.value, {
            athleteId: person.id,
            jerseyNumber: single ? playerForm.jerseyNumber : undefined,
            position: playerForm.position,
          })
          added += 1
        } catch {
          failed += 1
        }
      }
    }
    if (added) {
      ElMessage.success(`已添加 ${added} 名球员`)
      addPlayerVisible.value = false
      await load()
    }
    if (failed) ElMessage.warning(`${failed} 名球员未能加入，请检查是否重复或球衣号冲突`)
  } finally {
    savingPlayer.value = false
  }
}

function revokeRosterPhotoPreview() {
  if (rosterPhotoPreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(rosterPhotoPreview.value)
  }
}

function resetRosterPhotoState() {
  rosterPhotoRequestId += 1
  rosterPhotoLoading.value = false
  revokeRosterPhotoPreview()
  rosterPhotoFile.value = null
  rosterPhotoPreview.value = ''
  rosterPhotoRemoved.value = false
}

function openEditPlayer(row: RosterItem) {
  resetRosterPhotoState()
  editingRoster.value = row
  rosterEditForm.jerseyNumber = row.jerseyNumber
  rosterEditForm.position = row.position || ''
  editPlayerVisible.value = true
  if (row.photoUrl) {
    rosterPhotoPreview.value = row.photoUrl
    return
  }
  if (!row.photoFileId) return
  // 名单接口只返回 photoFileId，不返回可访问地址；编辑时按文件权限临时取流预览。
  const requestId = rosterPhotoRequestId
  rosterPhotoLoading.value = true
  fileApi
    .contentObjectUrl(row.photoFileId)
    .then((url) => {
      if (requestId !== rosterPhotoRequestId) {
        if (url) URL.revokeObjectURL(url)
        return
      }
      rosterPhotoPreview.value = url
    })
    .catch(() => {
      // 预览失败不影响替换或保存，保留“已上传”状态。
    })
    .finally(() => {
      if (requestId === rosterPhotoRequestId) rosterPhotoLoading.value = false
    })
}

function onRosterPhotoChange(uploadFile: UploadFile) {
  const file = (uploadFile.raw as File) || null
  if (!file) return
  if (!/\.(jpe?g|png)$/i.test(file.name)) {
    ElMessage.warning('球员照片仅支持 JPG / PNG')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.warning('球员照片不得超过 10 MB')
    return
  }
  revokeRosterPhotoPreview()
  rosterPhotoFile.value = file
  rosterPhotoPreview.value = URL.createObjectURL(file)
  rosterPhotoRemoved.value = false
}

function clearRosterPhoto() {
  revokeRosterPhotoPreview()
  rosterPhotoFile.value = null
  rosterPhotoPreview.value = ''
  rosterPhotoRemoved.value = true
}

async function savePlayerEdit() {
  if (!editingRoster.value) return
  savingPlayer.value = true
  try {
    let photoFileId = editingRoster.value.photoFileId || ''
    if (rosterPhotoFile.value) {
      const record = await fileApi.upload(
        rosterPhotoFile.value,
        'ENROLLMENT',
        enrollmentId.value,
        'ROSTER_PHOTO',
      )
      photoFileId = record.id
    } else if (rosterPhotoRemoved.value) {
      photoFileId = ''
    }
    await enrollmentApi.updatePlayer(enrollmentId.value, editingRoster.value.id, {
      athleteId: editingRoster.value.athleteId,
      jerseyNumber: rosterEditForm.jerseyNumber,
      position: rosterEditForm.position || undefined,
      photoFileId,
      version: editingRoster.value.version,
    })
    ElMessage.success('名单条目已更新')
    editPlayerVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    savingPlayer.value = false
  }
}

async function removePlayer(rid: string, name: string, version: number) {
  try {
    await ElMessageBox.confirm(`确认将「${name}」移出本次报名名单？`, '移除球员', {
      confirmButtonText: '移除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await enrollmentApi.removePlayer(enrollmentId.value, rid, version)
    ElMessage.success('已移除')
    await load()
  } catch {
    // 取消
  }
}

type QualifyAction = 'CONFIRM' | 'REJECT' | 'EXCLUDE' | 'REVOKE'

/**
 * E-2 名单资格确认（学校端）：CONFIRM 写入确认凭证（终审双轨硬门槛看凭证）；
 * REJECT/EXCLUDE/REVOKE 必填原因，EXCLUDE 不可逆。
 */
async function qualifyPlayer(row: RosterItem, action: QualifyAction) {
  const titles: Record<QualifyAction, string> = {
    CONFIRM: '确认资格',
    REJECT: '驳回资格',
    EXCLUDE: '剔除名单',
    REVOKE: '撤销凭证',
  }
  try {
    let reason = ''
    if (action === 'CONFIRM') {
      await ElMessageBox.confirm(
        `确认「${row.athleteName}」的参赛资格属实？确认后写入凭证，作为终审依据。`,
        titles[action],
        { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' },
      )
    } else {
      const tips: Record<Exclude<QualifyAction, 'CONFIRM'>, string> = {
        REJECT: '请填写驳回原因（该球员保留名单但标记资格不符）',
        EXCLUDE: '请填写剔除原因（剔除后不可恢复，仅影响本次报名）',
        REVOKE: '请填写撤销原因（撤销后需重新确认方可终审通过）',
      }
      const { value } = await ElMessageBox.prompt(
        tips[action],
        titles[action],
        {
          confirmButtonText: '提交',
          cancelButtonText: '取消',
          inputValidator: (input: string) => (input.trim() ? true : '必须填写原因'),
        },
      )
      reason = value.trim()
    }
    await enrollmentApi.qualify(enrollmentId.value, row.id, { action, version: row.version, reason })
    ElMessage.success(`${titles[action]}已完成`)
    await load()
  } catch {
    // 取消或拦截器已提示
  }
}

/** 提交人员档案复核：DRAFT/REJECTED → PENDING。 */
async function submitPersonArchive(row: RosterItem) {
  try {
    const person = await personApi.get(row.athleteId)
    await personApi.submit(person.id, person.version)
    ElMessage.success('已提交复核')
    await load()
  } catch {
    // 拦截器提示
  }
}

/** 学校端档案终审：PENDING → APPROVED / REJECTED（驳回必填原因）。 */
async function reviewPersonArchive(row: RosterItem, decision: 'APPROVE' | 'REJECT') {
  try {
    const person = await personApi.get(row.athleteId)
    let reason = ''
    if (decision === 'REJECT') {
      const { value } = await ElMessageBox.prompt(
        '请填写驳回原因（运动员档案将退回学校修正）',
        '驳回档案',
        {
          confirmButtonText: '提交',
          cancelButtonText: '取消',
          inputValidator: (input: string) => (input.trim() ? true : '必须填写原因'),
        },
      )
      reason = value.trim()
    } else {
      await ElMessageBox.confirm(
        `确认通过「${person.realName || row.athleteName}」的人员档案？通过后方可用于报名终审。`,
        '审核通过',
        { confirmButtonText: '通过', cancelButtonText: '取消', type: 'warning' },
      )
    }
    await personApi.review(person.id, { decision, reason, version: person.version })
    ElMessage.success(decision === 'APPROVE' ? '档案已通过' : '档案已驳回')
    await load()
  } catch {
    // 取消或拦截器已提示
  }
}

async function removeEnrollment() {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(
      `确认删除报名「${detail.value.teamName} · ${detail.value.groupName}」？仅草稿、被驳回或已撤回的报名单可删除。`,
      '删除报名',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    await enrollmentApi.remove(enrollmentId.value, detail.value.version)
    ElMessage.success('报名已删除')
    router.push('/console/enrollments')
  } catch {
    // 取消
  }
}

function onImportFileChange(uploadFile: UploadFile) {
  const file = (uploadFile.raw as File) || null
  if (file && !file.name.toLowerCase().endsWith('.xlsx')) {
    ElMessage.warning('球员名单仅支持 .xlsx 文件，请使用标准模板')
    return
  }
  importFile.value = file
  // 换文件后旧报告不再对应当前文件，避免误读上一批结果。
  importReport.value = null
}

function onPhotoFileChange(uploadFile: UploadFile) {
  const file = (uploadFile.raw as File) || null
  if (file && !file.name.toLowerCase().endsWith('.zip')) {
    ElMessage.warning('球员照片仅支持 .zip 压缩包')
    return
  }
  photoFile.value = file
  importReport.value = null
}

function clearImportFile() {
  importFile.value = null
  importReport.value = null
}

function clearPhotoFile() {
  photoFile.value = null
  importReport.value = null
}

function resetImportDialog() {
  importFile.value = null
  photoFile.value = null
  importReport.value = null
  importing.value = false
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 单一入口：先只校验，全部有效时直接写入；存在失败行时先展示校验结果并二次确认，
 * 用户取消则不写名单，避免“先写一半、再修文件导致重复行”的情况。
 */
async function runImport() {
  if (!detail.value) return
  if (!importFile.value) return ElMessage.warning('请先选择球员名单 Excel 文件')
  importing.value = true
  try {
    const file = importFile.value
    const checked = await enrollmentApi.importPlayers(
      enrollmentId.value,
      detail.value.version,
      'VALIDATE_ONLY',
      file,
    )
    importReport.value = checked
    if (!checked.successCount) {
      ElMessage.warning(
        checked.failureCount
          ? '文件未通过校验，名单未修改；请按错误清单修正后重新选择文件'
          : '文件中没有可导入的行，名单未修改',
      )
      return
    }
    if (checked.failureCount) {
      try {
        await ElMessageBox.confirm(
          `校验通过 ${checked.successCount} 行、失败 ${checked.failureCount} 行。确认后只写入通过校验的 ${checked.successCount} 行，失败行跳过。`,
          '部分行未通过校验',
          {
            confirmButtonText: `导入 ${checked.successCount} 行`,
            cancelButtonText: '暂不导入',
            type: 'warning',
          },
        )
      } catch {
        ElMessage.info('已保留校验结果，名单未修改')
        return
      }
    }
    const applied = await enrollmentApi.importPlayers(
      enrollmentId.value,
      detail.value.version,
      'APPLY_VALID_ROWS',
      file,
    )
    importReport.value = applied
    await load()
    ElMessage.success(
      `已导入 ${applied.successCount} 名球员${applied.failureCount ? `，跳过 ${applied.failureCount} 行` : ''}`,
    )
  } catch {
    // 拦截器提示
  } finally {
    importing.value = false
  }
}

async function runPhotoImport() {
  if (!detail.value) return
  if (!photoFile.value) return ElMessage.warning('请先选择照片压缩包')
  importing.value = true
  try {
    importReport.value = await enrollmentApi.importPhotos(
      enrollmentId.value,
      detail.value.version,
      photoFile.value,
    )
    await load()
  } catch {
    // 拦截器提示
  } finally {
    importing.value = false
  }
}

async function downloadTemplate() {
  try {
    const downloaded = await enrollmentApi.downloadRosterTemplate()
    ElMessage.success(downloaded ? '模板已开始下载' : '演示环境已模拟下载，接入后端后将下载真实模板')
  } catch {
    // 拦截器提示
  }
}

async function downloadImportErrors() {
  if (!importReport.value?.batchId) return
  try {
    const downloaded = await enrollmentApi.downloadImportErrors(importReport.value.batchId)
    ElMessage.success(downloaded ? '错误清单已开始下载' : '演示环境已模拟下载，接入后端后将下载真实文件')
  } catch {
    // 拦截器提示
  }
}

function openAttachmentUpload() {
  attachmentType.value = 'STAMPED_FORM'
  attachmentVisible.value = true
}

async function uploadAttachment(options: UploadRequestOptions) {
  attachmentUploading.value = true
  try {
    const file = options.file
    // 文件类别必须与 materialType 一致，后端会校验归属与类别。
    const record = await fileApi.upload(
      file,
      'ENROLLMENT',
      enrollmentId.value,
      attachmentType.value,
    )
    await enrollmentApi.addAttachment(enrollmentId.value, {
      materialType: attachmentType.value,
      fileId: record.id,
    })
    ElMessage.success('材料上传成功')
    attachmentVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    attachmentUploading.value = false
  }
}

/** 后端附件只返回 fileId，无文件名时用材料类型作为展示名。 */
function attachmentLabel(attachment: EnrollmentAttachment) {
  return (
    attachment.fileName ||
    (attachment.materialType === 'STAMPED_FORM' ? '盖章报名表' : '学籍证明')
  )
}

async function downloadAttachment(attachment: EnrollmentAttachment) {
  try {
    const downloaded = await fileApi.download(attachment.fileId, attachmentLabel(attachment))
    ElMessage.success(downloaded ? '文件已开始下载' : '演示环境已模拟下载，接入后端后将下载真实文件')
  } catch {
    // 拦截器提示
  }
}

async function removeAttachment(attachment: EnrollmentAttachment) {
  try {
    await ElMessageBox.confirm(`确认移除材料「${attachmentLabel(attachment)}」？`, '移除材料', {
      confirmButtonText: '移除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await enrollmentApi.removeAttachment(enrollmentId.value, attachment.id, attachment.version)
    ElMessage.success('材料已移除')
    await load()
  } catch {
    // 取消
  }
}

function formatDate(value?: string) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—'
}

onMounted(load)
</script>

<template>
  <div class="page" v-loading="loading">
    <PageHeader
      title="报名详情"
      :description="detail ? `${detail.eventName} · ${detail.groupName}` : '加载报名信息中…'"
      show-back
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button
          v-if="can('enrollment.export')"
          :icon="Download"
          :loading="exporting === 'registration'"
          @click="exportDocument('registration')"
        >
          下载报名表 PDF
        </el-button>
        <el-button
          v-if="can('enrollment.export')"
          :icon="Download"
          :loading="exporting === 'players'"
          @click="exportDocument('players')"
        >
          下载球员信息表
        </el-button>
        <el-button v-if="canEdit" :icon="Warning" :loading="actionLoading" @click="runPrecheck">预检</el-button>
        <el-button v-if="canSubmit && canEdit" type="primary" :loading="actionLoading" @click="submitEnrollment">提交审核</el-button>
        <el-button
          v-if="canSubmit && (detail?.status === 'PENDING_CITY_REVIEW' || detail?.status === 'PENDING_PROVINCE_REVIEW')"
          type="warning"
          plain
          @click="withdraw"
        >
          撤回
        </el-button>
        <el-button
          v-if="canDelete"
          type="danger"
          plain
          :icon="Delete"
          @click="removeEnrollment"
        >
          删除报名
        </el-button>
        <template v-if="canReview">
          <el-button plain :icon="RefreshLeft" @click="returnForCorrection">退回补正</el-button>
          <el-button type="danger" plain @click="reject">驳回</el-button>
          <el-button type="success" @click="approve">审核通过</el-button>
        </template>
      </template>
    </PageHeader>

    <template v-if="detail">
      <section class="enrollment-hero">
        <div class="enrollment-hero__team">
          <span class="team-badge">{{ detail.teamName.slice(0, 1) }}</span>
          <div>
            <div class="enrollment-hero__title">
              <h2>{{ detail.teamName }}</h2>
              <StatusTag :status="detail.status" kind="enrollment" size="default" />
            </div>
            <p>{{ detail.eventName }} · {{ detail.groupName }} · {{ detail.schoolName || '—' }} · {{ detail.campusName || '—' }}</p>
          </div>
        </div>
        <div class="enrollment-hero__meta">
          <div>
            <span>报名编号</span>
            <strong class="num">{{ detail.id.slice(-8).toUpperCase() }}</strong>
          </div>
          <div>
            <span>球员人数</span>
            <strong class="num">{{ detail.playerCount ?? detail.players?.length ?? '—' }}</strong>
          </div>
          <div>
            <span>提交次数</span>
            <strong class="num">{{ detail.submissionNo }}</strong>
          </div>
          <div>
            <span>最后更新</span>
            <strong>{{ dayjs(detail.updatedAt).format('MM-DD HH:mm') }}</strong>
          </div>
        </div>
      </section>

      <div class="grid-sidebar">
        <div class="detail-column">
          <section class="page-card">
            <div class="section-title">报名信息 <small>由参赛单位填写</small></div>
            <div class="info-grid">
              <div class="info-item"><span class="info-item__label">报送主体</span><strong>参赛球队报送</strong></div>
              <div class="info-item"><span class="info-item__label">参赛学校</span><strong>{{ detail.schoolName || '—' }}</strong></div>
              <div class="info-item"><span class="info-item__label">校区</span><strong>{{ detail.campusName || '—' }}</strong></div>
              <div class="info-item"><span class="info-item__label">所属市州</span><strong>{{ detail.cityName || '—' }}</strong></div>
              <div class="info-item">
                <span class="info-item__label">领队 / 联系人</span>
                <el-input
                  v-if="canEdit"
                  v-model="infoForm.contactName"
                  maxlength="32"
                  placeholder="请输入联系人姓名"
                />
                <strong v-else>{{ detail.contactName }}</strong>
              </div>
              <div class="info-item">
                <span class="info-item__label">联系电话</span>
                <el-input
                  v-if="canEdit"
                  v-model="infoForm.contactPhone"
                  maxlength="11"
                  placeholder="请重新输入完整 11 位手机号"
                />
                <strong v-else>{{ detail.maskedContactPhone || '—' }}</strong>
              </div>
              <div class="info-item"><span class="info-item__label">创建时间</span><strong>{{ formatDate(detail.createdAt) }}</strong></div>
              <div v-if="canEdit || detail.remarks" class="info-item info-item--wide">
                <span class="info-item__label">备注</span>
                <el-input
                  v-if="canEdit"
                  v-model="infoForm.remarks"
                  type="textarea"
                  :rows="2"
                  maxlength="200"
                  show-word-limit
                  placeholder="选填"
                />
                <strong v-else>{{ detail.remarks || '—' }}</strong>
              </div>
              <div class="info-item info-item--status">
                <span class="info-item__label">当前状态</span>
                <StatusTag :status="detail.status" kind="enrollment" />
              </div>
            </div>
            <div v-if="canEdit" class="info-edit-actions">
              <span class="info-edit-hint">手机号仅以掩码显示，保存前请重新输入完整号码。</span>
              <div class="info-edit-buttons">
                <el-button @click="resetInfoForm">取消</el-button>
                <el-button type="primary" :loading="savingInfo" @click="saveInfo">保存修改</el-button>
              </div>
            </div>
            <el-alert
              v-if="latestRejectReason"
              class="reject-reason"
              :type="latestReview?.action === 'RETURN_FOR_CORRECTION' ? 'warning' : 'error'"
              :closable="false"
              show-icon
              :title="latestRejectTitle"
            />
          </section>

          <section class="page-card">
            <div class="page-toolbar">
              <div class="section-title">
                球员名单
                <small>{{ detail.playerCount ?? detail.players?.length ?? '—' }} 人 · {{ detail.groupName }}</small>
              </div>
              <div class="toolbar-actions">
                <el-button v-if="canEdit" size="small" @click="importVisible = true">批量导入</el-button>
                <el-button v-if="canEdit" size="small" type="primary" :icon="Plus" @click="openAddPlayer">
                  添加球员
                </el-button>
              </div>
            </div>
            <p v-if="canEdit" class="roster-photo-hint">
              照片可打包 ZIP 按身份证号批量匹配；未办理身份证的学生无需放入 ZIP，请在球员「编辑」中逐人上传。
            </p>

            <el-table :data="detail.players || []" style="width: 100%">
              <el-table-column label="球员" min-width="180">
                <template #default="{ row }">
                  <div class="player-cell">
                    <span class="player-cell__photo">
                      <SafeImage
                        v-if="row.photoUrl || (row.photoFileId && rosterPhotoUrls[row.photoFileId])"
                        :src="row.photoUrl || rosterPhotoUrls[row.photoFileId]"
                        alt=""
                      />
                      <template v-else>{{ row.athleteName.slice(0, 1) }}</template>
                    </span>
                    <div>
                      <strong>{{ row.athleteName }}</strong>
                      <small>{{ row.maskedIdNumber }}</small>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="jerseyNumber" label="号码" width="70" align="center">
                <template #default="{ row }">
                  <span class="num">{{ row.jerseyNumber ?? '—' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="位置" width="90">
                <template #default="{ row }">{{ positionLabel(row.position) }}</template>
              </el-table-column>
              <el-table-column prop="schoolName" label="所在学校" min-width="160" />
              <el-table-column label="名单资格" width="100" align="center">
                <template #default="{ row }">
                  <el-tooltip
                    :content="row.qualificationReason || '尚无人工确认凭证'"
                    :disabled="!row.qualificationReason && !!row.confirmedAt"
                    placement="top"
                  >
                    <el-tag :type="qualificationMeta(row).type" size="small">
                      {{ qualificationMeta(row).label }}
                    </el-tag>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column label="档案审核" width="200" align="center">
                <template #default="{ row }">
                  <el-tag :type="auditMeta(row).type" size="small" effect="plain">
                    {{ auditMeta(row).label }}
                  </el-tag>
                  <template v-if="canReviewPerson">
                    <el-button
                      v-if="['DRAFT', 'REJECTED'].includes(personStatusOf(row))"
                      link
                      type="primary"
                      size="small"
                      @click="submitPersonArchive(row)"
                    >
                      提交复核
                    </el-button>
                    <template v-if="personStatusOf(row) === 'PENDING'">
                      <el-button link type="success" size="small" @click="reviewPersonArchive(row, 'APPROVE')">
                        通过
                      </el-button>
                      <el-button link type="danger" size="small" @click="reviewPersonArchive(row, 'REJECT')">
                        驳回
                      </el-button>
                    </template>
                  </template>
                </template>
              </el-table-column>
              <el-table-column v-if="canQualify" label="资格操作" width="190" align="right">
                <template #default="{ row }">
                  <template v-if="row.qualificationStatus !== 'EXCLUDED'">
                    <el-button
                      v-if="!row.confirmedAt || row.qualificationStatus !== 'QUALIFIED'"
                      link
                      type="primary"
                      @click="qualifyPlayer(row, 'CONFIRM')"
                    >
                      确认
                    </el-button>
                    <el-button
                      v-if="row.qualificationStatus === 'QUALIFIED' && row.confirmedAt"
                      link
                      type="warning"
                      @click="qualifyPlayer(row, 'REVOKE')"
                    >
                      撤销
                    </el-button>
                    <el-button
                      v-if="row.qualificationStatus !== 'DISQUALIFIED'"
                      link
                      type="danger"
                      @click="qualifyPlayer(row, 'REJECT')"
                    >
                      驳回
                    </el-button>
                    <el-button link type="danger" @click="qualifyPlayer(row, 'EXCLUDE')">
                      剔除
                    </el-button>
                  </template>
                  <span v-else class="muted">不可逆</span>
                </template>
              </el-table-column>
              <el-table-column v-if="canEdit" label="操作" width="140" align="right">
                <template #default="{ row }">
                  <el-button link type="primary" :icon="Edit" @click="openEditPlayer(row)">编辑</el-button>
                  <el-button link type="danger" @click="removePlayer(row.id, row.athleteName, row.version)">移除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty
              v-if="!(detail.players || []).length"
              description="本次报名名单尚未选择球员。球队常备名单不会自动带入，请从球队名单添加或批量导入。"
              :image-size="80"
            >
              <el-button v-if="canEdit" type="primary" plain size="small" @click="openAddPlayer">
                从球队名单添加
              </el-button>
            </el-empty>
          </section>

          <section class="page-card">
            <div class="page-toolbar">
              <div class="section-title">报名材料 <small>盖章文件与学籍证明</small></div>
              <el-button
                v-if="canEdit"
                size="small"
                type="primary"
                plain
                :icon="UploadFilled"
                @click="openAttachmentUpload"
              >
                上传材料
              </el-button>
            </div>
            <p class="materials-hint">
              报名表 PDF 由系统按当前名单生成，打印并加盖公章后，作为「盖章报名表」上传；
              名单如有变更，请重新下载并盖章。
            </p>

            <div class="attachment-list">
              <div v-for="att in detail.attachments || []" :key="att.id" class="attachment">
                <span class="attachment__icon"><el-icon><Download /></el-icon></span>
                <div class="attachment__body">
                  <strong>{{ attachmentLabel(att) }}</strong>
                  <small>{{ att.materialType === 'STAMPED_FORM' ? '加盖公章的报名表' : '学籍证明' }}</small>
                </div>
                <div class="attachment__actions">
                  <el-button link type="primary" @click="downloadAttachment(att)">下载</el-button>
                  <el-button v-if="canEdit" link type="danger" :icon="Delete" @click="removeAttachment(att)">移除</el-button>
                </div>
              </div>
              <el-empty
                v-if="!(detail.attachments || []).length"
                description="尚未上传报名材料"
                :image-size="70"
              >
                <el-button v-if="canEdit" type="primary" plain size="small" @click="openAttachmentUpload">
                  上传第一份材料
                </el-button>
              </el-empty>
            </div>
          </section>

          <section class="page-card">
            <div class="section-title">审核记录 <small>提交、审核与撤回全过程</small></div>
            <div class="audit-timeline">
              <div v-for="record in timeline" :key="record.id" class="audit-item">
                <span class="audit-item__dot" :class="`action-${(record.action || 'submit').toLowerCase()}`">
                  <el-icon>
                    <Check v-if="record.action === 'APPROVE'" />
                    <Close v-else-if="record.action === 'REJECT'" />
                    <CircleCheck v-else />
                  </el-icon>
                </span>
                <div class="audit-item__body">
                  <div class="audit-item__line">
                    <strong>
                      {{ reviewActionLabel(record.action) }}
                    </strong>
                    <span>{{ record.operatorName || record.operatorAccountId || '—' }}</span>
                  </div>
                  <p v-if="record.reason">{{ record.reason }}</p>
                  <small>{{ formatDate(record.createdAt) }}<template v-if="record.stage"> · {{ record.stage === 'CITY' ? '市州初审' : record.stage === 'PROVINCE' ? '省级终审' : '提交环节' }}</template></small>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside class="side-column">
          <section class="page-card">
            <div class="section-title">报名进度</div>
            <div class="status-steps">
              <div class="status-step is-done">
                <span>1</span>
                <div><strong>创建报名</strong><small>{{ formatDate(detail.createdAt) }}</small></div>
              </div>
              <div class="status-step" :class="{ 'is-done': detail.submissionNo > 0, 'is-current': detail.status === 'DRAFT' }">
                <span>2</span>
                <div><strong>提交并生成快照</strong><small>{{ detail.submissionNo ? `已提交 ${detail.submissionNo} 次` : '待提交' }}</small></div>
              </div>
              <div
                class="status-step"
                :class="{
                  'is-done': detail.status === 'APPROVED',
                  'is-current': detail.status === 'PENDING_CITY_REVIEW' || detail.status === 'PENDING_PROVINCE_REVIEW',
                }"
              >
                <span>3</span>
                <div>
                  <strong>市州初审 / 省级终审</strong>
                  <small>{{ detail.status === 'PENDING_CITY_REVIEW' ? '等待市州审核' : detail.status === 'PENDING_PROVINCE_REVIEW' ? '等待省级终审' : detail.status === 'APPROVED' ? '已通过' : '未开始' }}</small>
                </div>
              </div>
            </div>
          </section>

          <section class="page-card tip-card">
            <span class="tip-card__eyebrow">提示</span>
            <h3>提交前检查</h3>
            <ul>
              <li>球员人数满足组别要求</li>
              <li>身份证信息与学籍一致</li>
              <li>盖章报名表清晰可读</li>
              <li>教练员资格材料齐全</li>
            </ul>
            <el-button v-if="canEdit" class="tip-card__btn" type="primary" plain @click="runPrecheck">
              立即预检
            </el-button>
          </section>
        </aside>
      </div>
    </template>

    <el-dialog v-model="precheckVisible" title="预检未通过" width="540px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="请处理以下问题后再提交"
        description="提交后将生成不可修改的快照。"
      />
      <div class="issue-list">
        <div v-for="(issue, index) in precheckIssues" :key="index" class="issue">
          <el-tag :type="issue.severity === 'ERROR' ? 'danger' : 'warning'" size="small">
            {{ issue.severity === 'ERROR' ? '必须处理' : '建议处理' }}
          </el-tag>
          <span>{{ issue.message }}</span>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="precheckVisible = false">返回修改</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addPlayerVisible" title="添加球员" width="720px">
      <div class="player-source">
        <el-radio-group v-model="playerSource" @change="switchPlayerSource">
          <el-radio-button value="TEAM">从球队名单选择</el-radio-button>
          <el-radio-button value="SEARCH">人员库检索</el-radio-button>
        </el-radio-group>
        <span class="player-source__hint">
          {{ playerSource === 'TEAM'
            ? '球队常备名单不会自动带入报名，请勾选本次参赛球员。'
            : '用于补充不在球队常备名单中的球员。' }}
        </span>
      </div>

      <template v-if="playerSource === 'TEAM'">
        <div class="player-search">
          <el-input
            v-model="teamMemberKeyword"
            placeholder="按姓名或证件号搜索球队名单"
            clearable
          />
          <span class="player-search__count">
            现役 {{ filteredTeamMembers.length }} 人 · 可选 {{ selectableTeamMemberCount }} 人
          </span>
        </div>
        <el-alert
          v-if="teamMemberError"
          type="warning"
          :closable="false"
          show-icon
          :title="teamMemberError"
          class="player-source__alert"
        />
        <el-table
          v-if="teamMemberLoading || filteredTeamMembers.length"
          v-loading="teamMemberLoading"
          :data="filteredTeamMembers"
          height="280"
          @selection-change="handleTeamSelection"
        >
          <el-table-column type="selection" width="45" :selectable="memberSelectable" />
          <el-table-column label="球员" min-width="180">
            <template #default="{ row }">
              <div class="member-cell">
                <strong>{{ row.athleteName }}</strong>
                <small>{{ row.maskedIdNumber || '证件号未登记' }}</small>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="号码" width="70" align="center">
            <template #default="{ row }">{{ row.jerseyNumber ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="位置" width="90">
            <template #default="{ row }">{{ positionLabel(row.position) }}</template>
          </el-table-column>
          <el-table-column label="状态" min-width="130">
            <template #default="{ row }">
              <el-tag v-if="memberBlockReason(row)" type="info" size="small">
                {{ memberBlockReason(row) }}
              </el-tag>
              <el-tag v-else type="success" size="small">可加入</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <el-empty
          v-if="!teamMemberLoading && !filteredTeamMembers.length"
          :description="teamMemberError
            ? '球队名单读取失败，请改用人员库检索'
            : teamMemberKeyword
              ? '没有匹配的现役球员'
              : '球队名单暂无现役球员，请改用人员库检索'"
          :image-size="60"
        />
      </template>

      <template v-else>
        <div class="player-search">
          <el-input
            v-model="personKeyword"
            placeholder="输入姓名或身份证后四位检索人员库"
            clearable
            @keyup.enter="searchPersons"
          />
          <el-button type="primary" plain :loading="searchLoading" @click="searchPersons">
            检索
          </el-button>
        </div>
        <el-table
          v-if="searchLoading || personResults.length"
          v-loading="searchLoading"
          :data="personResults"
          height="240"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="45" />
          <el-table-column prop="realName" label="姓名" width="110" />
          <el-table-column prop="maskedIdNumber" label="身份证号" min-width="170" />
          <el-table-column prop="schoolName" label="学校" min-width="150" />
          <el-table-column prop="gender" label="性别" width="70">
            <template #default="{ row }">{{ row.gender === 'FEMALE' ? '女' : '男' }}</template>
          </el-table-column>
        </el-table>
        <el-empty
          v-if="!personResults.length && !searchLoading"
          :description="personKeyword.trim()
            ? '未检索到人员，请联系管理员先建档'
            : '输入姓名或身份证后四位后点击检索'"
          :image-size="60"
        />
        <div class="player-form">
          <el-input
            v-model.number="playerForm.jerseyNumber"
            placeholder="球衣号码"
            style="width: 130px"
            :disabled="!canSetPlayerMeta"
          />
          <el-input
            v-model="playerForm.position"
            placeholder="场上位置，如：前锋"
            style="width: 200px"
            :disabled="!canSetPlayerMeta"
          />
          <span class="player-form__hint">
            {{ canSetPlayerMeta ? '可多选；批量添加时不写球衣号码' : '多选时不写球衣号码，加入后请逐条编辑' }}
          </span>
        </div>
      </template>

      <div v-if="selectedPlayerCount" class="selected-count selected-count--footer">
        已选 {{ selectedPlayerCount }} 人
      </div>
      <template #footer>
        <el-button @click="addPlayerVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="savingPlayer"
          :disabled="!selectedPlayerCount"
          @click="addPlayer"
        >
          加入名单
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="editPlayerVisible"
      title="编辑名单条目"
      width="520px"
      @closed="resetRosterPhotoState"
    >
      <div class="roster-person">
        <strong>{{ editingRoster?.athleteName || '球员' }}</strong>
        <small>{{ editingRoster?.maskedIdNumber || '证件号未登记' }}</small>
      </div>
      <el-form :model="rosterEditForm" label-position="top">
        <div class="form-grid">
          <el-form-item label="球衣号码">
            <el-input-number v-model="rosterEditForm.jerseyNumber" :min="0" :max="999" style="width: 100%" />
          </el-form-item>
          <el-form-item label="场上位置">
            <el-input v-model="rosterEditForm.position" placeholder="如：前锋" />
          </el-form-item>
        </div>
        <el-form-item label="球员照片（可选）">
          <div class="roster-photo-editor">
            <span v-loading="rosterPhotoLoading" class="roster-photo-editor__preview">
              <img v-if="rosterPhotoPreview" :src="rosterPhotoPreview" alt="" />
              <template v-else>
                {{ !rosterPhotoRemoved && editingRoster?.photoFileId ? '已上传' : '未上传' }}
              </template>
            </span>
            <div class="roster-photo-editor__body">
              <el-upload
                :auto-upload="false"
                :show-file-list="false"
                accept=".jpg,.jpeg,.png"
                :on-change="onRosterPhotoChange"
              >
                <el-button size="small">
                  {{ rosterPhotoPreview || (!rosterPhotoRemoved && editingRoster?.photoFileId) ? '更换照片' : '选择照片' }}
                </el-button>
              </el-upload>
              <el-button
                v-if="rosterPhotoPreview || (!rosterPhotoRemoved && editingRoster?.photoFileId)"
                link
                type="danger"
                size="small"
                @click="clearRosterPhoto"
              >
                移除
              </el-button>
            </div>
            <p class="player-form__hint">
              JPG / PNG，不超过 10 MB。逐人上传不依赖身份证号，未办理身份证的学生可直接使用。
            </p>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editPlayerVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPlayer" @click="savePlayerEdit">保存修改</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="attachmentVisible" title="上传报名材料" width="540px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="盖章报名表需先下载后盖章"
        description="请在报名详情页下载「报名表 PDF」，打印并加盖公章后，以「盖章报名表」类型上传。系统生成的 PDF 无需手工填写。"
        class="attachment-tip"
      />
      <el-form label-position="top">
        <el-form-item label="材料类型">
          <el-radio-group v-model="attachmentType">
            <el-radio-button value="STAMPED_FORM">盖章报名表</el-radio-button>
            <el-radio-button value="STUDENT_STATUS">学籍证明</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="材料文件">
          <el-upload
            class="attachment-uploader"
            drag
            :show-file-list="false"
            :http-request="uploadAttachment"
            accept=".pdf,.jpg,.jpeg,.png"
          >
            <el-icon class="attachment-uploader__icon"><UploadFilled /></el-icon>
            <div class="attachment-uploader__text">将文件拖到此处，或<em>点击上传</em></div>
            <div class="attachment-uploader__hint">支持 PDF、JPG、PNG，单个文件不超过 20MB</div>
          </el-upload>
          <span v-if="attachmentUploading" class="muted">文件上传中…</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="attachmentVisible = false">取消</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="importVisible"
      title="批量导入球员名单"
      width="720px"
      @closed="resetImportDialog"
    >
      <el-alert
        class="import-intro"
        type="info"
        :closable="false"
        show-icon
        title="先校验，再写入"
        description="点击「校验并导入」会先检查文件：全部通过时直接写入；存在失败行时先展示结果并二次确认，确认后只写入有效行，取消则名单不变。"
      />

      <section class="import-step">
        <div class="import-step__head">
          <span class="import-step__index">1</span>
          <div class="import-step__title">
            <h4>球员名单 Excel</h4>
            <p>使用组委会标准模板，仅支持 .xlsx；每行一名球员。</p>
          </div>
          <el-button link type="primary" :icon="Download" @click="downloadTemplate">
            下载模板
          </el-button>
        </div>

        <div v-if="importFile" class="import-file-card">
          <el-icon class="import-file-card__icon"><Document /></el-icon>
          <div class="import-file-card__meta">
            <strong :title="importFile.name">{{ importFile.name }}</strong>
            <span>{{ formatFileSize(importFile.size) }} · 已选择</span>
          </div>
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept=".xlsx"
            :on-change="onImportFileChange"
          >
            <el-button link type="primary">更换</el-button>
          </el-upload>
          <el-button link type="danger" @click="clearImportFile">移除</el-button>
        </div>
        <el-upload
          v-else
          class="import-drop"
          drag
          :auto-upload="false"
          :show-file-list="false"
          accept=".xlsx"
          :on-change="onImportFileChange"
        >
          <el-icon class="import-drop__icon"><UploadFilled /></el-icon>
          <div class="import-drop__text">拖拽 Excel 到此处，或 <em>点击选择</em></div>
          <div class="import-drop__hint">.xlsx，单次最多 1000 行</div>
        </el-upload>

        <div class="import-actions">
          <el-button
            type="primary"
            :loading="importing"
            :disabled="!importFile || importing"
            @click="runImport"
          >
            校验并导入
          </el-button>
          <span class="import-actions__hint">存在失败行时会先提示，确认后才写入有效行</span>
        </div>
      </section>

      <section class="import-step">
        <div class="import-step__head">
          <span class="import-step__index">2</span>
          <div class="import-step__title">
            <h4>球员照片 ZIP <small>可选</small></h4>
            <p>照片文件名使用球员完整身份证号（结果中会脱敏显示）；选择 ZIP 后点击「开始匹配照片」。</p>
            <p class="import-step__note">
              学生尚未办理身份证时，不要放入 ZIP：保存名单后，在名单中逐人打开「编辑」单独上传照片即可，无需身份证号命名。
            </p>
          </div>
        </div>

        <div v-if="photoFile" class="import-file-card">
          <el-icon class="import-file-card__icon"><Document /></el-icon>
          <div class="import-file-card__meta">
            <strong :title="photoFile.name">{{ photoFile.name }}</strong>
            <span>{{ formatFileSize(photoFile.size) }} · 已选择</span>
          </div>
          <el-upload
            :auto-upload="false"
            :show-file-list="false"
            accept=".zip"
            :on-change="onPhotoFileChange"
          >
            <el-button link type="primary">更换</el-button>
          </el-upload>
          <el-button link type="danger" @click="clearPhotoFile">移除</el-button>
        </div>
        <el-upload
          v-else
          class="import-drop import-drop--compact"
          drag
          :auto-upload="false"
          :show-file-list="false"
          accept=".zip"
          :on-change="onPhotoFileChange"
        >
          <el-icon class="import-drop__icon"><UploadFilled /></el-icon>
          <div class="import-drop__text">拖拽 ZIP 到此处，或 <em>点击选择</em></div>
          <div class="import-drop__hint">.zip，不超过 20 MiB</div>
        </el-upload>

        <div class="import-actions">
          <el-button
            type="primary"
            plain
            :loading="importing"
            :disabled="!photoFile || importing"
            @click="runPhotoImport"
          >
            开始匹配照片
          </el-button>
          <span class="import-actions__hint">匹配成功后照片会关联到报名名单球员</span>
        </div>
      </section>

      <section v-if="importReport" class="import-report">
        <div class="import-report__head">
          <div>
            <strong>{{ importReportTitle }}</strong>
            <small>批次 {{ importReport.batchId }}</small>
          </div>
          <el-button
            v-if="importReport.errors.length"
            link
            type="primary"
            :icon="Download"
            @click="downloadImportErrors"
          >
            下载错误清单 CSV
          </el-button>
        </div>
        <div class="import-report__stats">
          <div>
            <strong class="num">{{ importReport.total }}</strong>
            <span>{{ importReport.mode === 'PHOTO_IMPORT' ? '文件数' : '总行数' }}</span>
          </div>
          <div>
            <strong class="num ok">{{ importReport.successCount }}</strong>
            <span>{{ importReport.mode === 'PHOTO_IMPORT' ? '匹配成功' : '成功' }}</span>
          </div>
          <div>
            <strong class="num fail">{{ importReport.failureCount }}</strong>
            <span>{{ importReport.mode === 'PHOTO_IMPORT' ? '未匹配或失败' : '失败' }}</span>
          </div>
        </div>
        <el-table
          v-if="importReport.errors.length"
          :data="importReport.errors"
          size="small"
          max-height="200"
        >
          <el-table-column label="行号 / 文件" width="150">
            <template #default="{ row }">{{ row.rowNumber ?? row.fileName ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="字段" width="110">
            <template #default="{ row }">{{ row.field || row.code }}</template>
          </el-table-column>
          <el-table-column prop="message" label="错误说明" min-width="240" />
        </el-table>
        <el-alert
          v-else
          type="success"
          :closable="false"
          show-icon
          title="全部处理成功，没有失败行"
        />
      </section>

      <template #footer>
        <el-button type="primary" @click="importVisible = false">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.enrollment-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  padding: 20px 22px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: #fff;
  color: var(--ink-900);
}

.enrollment-hero__team {
  display: flex;
  align-items: center;
  gap: 15px;
}

.team-badge {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  background: var(--brand-700);
  color: #fff;
  font-size: 19px;
  font-weight: 700;
}

.enrollment-hero__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.enrollment-hero__title h2 {
  font-size: 20px;
}

.enrollment-hero__team p {
  margin-top: 4px;
  font-size: 11px;
  color: var(--ink-500);
}

.enrollment-hero__meta {
  display: flex;
  gap: 34px;
  flex-wrap: wrap;
}

.enrollment-hero__meta div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.enrollment-hero__meta span {
  font-size: 10px;
  color: var(--ink-300);
}

.enrollment-hero__meta strong {
  font-size: 14px;
  color: var(--ink-900);
}

.detail-column,
.side-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 15px;
}

.info-item {
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--paper);
}

.info-item__label {
  display: block;
  font-size: 10px;
  color: var(--ink-300);
}

.info-item--status :deep(.status-tag) {
  margin-top: 4px;
}

.info-item strong {
  display: block;
  margin-top: 4px;
  font-size: 12.5px;
  font-weight: 500;
}

.info-item :deep(.el-input),
.info-item :deep(.el-textarea) {
  margin-top: 6px;
}

.info-item--wide {
  grid-column: 1 / -1;
}

.info-edit-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
}

.info-edit-hint {
  font-size: 11px;
  color: var(--ink-300);
}

.info-edit-buttons {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.reject-reason {
  margin-top: 14px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.player-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.player-cell__photo {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  overflow: hidden;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 11px;
  font-weight: 700;
}

.player-cell__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-cell strong {
  display: block;
  font-size: 12.5px;
}

.player-cell small {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--ink-300);
}

.attachment-tip {
  margin-bottom: 16px;
}

.materials-hint {
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  background: var(--paper);
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}

.attachment {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.attachment__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.attachment__body {
  flex: 1;
}

.attachment__body strong {
  display: block;
  font-size: 12px;
}

.attachment__body small {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--ink-300);
}

.attachment__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.attachment-uploader {
  width: 100%;
}

.attachment-uploader :deep(.el-upload-dragger) {
  padding: 22px 16px;
  border-color: var(--line);
  border-radius: 12px;
  background: var(--paper);
}

.attachment-uploader__icon {
  font-size: 26px;
  color: var(--brand-500);
}

.attachment-uploader__text {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-500);
}

.attachment-uploader__text em {
  font-style: normal;
  color: var(--brand-700);
}

.attachment-uploader__hint {
  margin-top: 5px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.roster-person {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

.roster-person strong {
  font-size: 14px;
}

.roster-person small {
  font-size: 10px;
  color: var(--ink-300);
}

.roster-photo-editor {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  width: 100%;
}

.roster-photo-editor__preview {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px dashed var(--line);
  border-radius: 10px;
  background: var(--paper);
  font-size: 10px;
  color: var(--ink-300);
}

.roster-photo-editor__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.roster-photo-editor__body {
  display: flex;
  align-items: center;
  gap: 8px;
}

.roster-photo-editor .player-form__hint {
  flex-basis: 100%;
  margin: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
}

.audit-timeline {
  display: flex;
  flex-direction: column;
  margin-top: 16px;
}

.audit-item {
  position: relative;
  display: flex;
  gap: 13px;
  padding-bottom: 20px;
}

.audit-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 14px;
  top: 30px;
  bottom: 0;
  width: 1px;
  background: var(--line);
}

.audit-item__dot {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-100);
  color: var(--brand-700);
  font-size: 12px;
}

.audit-item__dot.action-reject {
  background: #fdeaea;
  color: #c45656;
}

.audit-item__dot.action-approve {
  background: #e9f8ee;
  color: #2f9d58;
}

.audit-item__body {
  padding-top: 3px;
}

.audit-item__line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.audit-item__line strong {
  font-size: 12.5px;
}

.audit-item__line span {
  font-size: 10.5px;
  color: var(--ink-300);
}

.audit-item__body p {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-500);
}

.audit-item__body small {
  display: block;
  margin-top: 3px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.status-steps {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-top: 16px;
}

.status-step {
  display: flex;
  gap: 11px;
}

.status-step > span {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid var(--line);
  font-size: 10px;
  color: var(--ink-300);
  background: #fff;
}

.status-step.is-done > span {
  border-color: var(--brand-700);
  background: var(--brand-700);
  color: #fff;
}

.status-step.is-current > span {
  border-color: var(--brand-500);
  color: var(--brand-700);
  background: var(--brand-50);
}

.status-step strong {
  display: block;
  font-size: 11.5px;
  color: var(--ink-700);
}

.status-step small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.tip-card {
  background: var(--paper);
}

.tip-card__eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-700);
}

.tip-card h3 {
  margin-top: 6px;
  font-size: 15px;
}

.tip-card ul {
  margin: 11px 0 0;
  padding-left: 16px;
}

.tip-card li {
  font-size: 10.5px;
  line-height: 1.9;
  color: var(--ink-500);
}

.tip-card__btn {
  width: 100%;
  margin-top: 13px;
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 15px;
}

.issue {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--paper);
  font-size: 11.5px;
  line-height: 1.6;
}

.player-source {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.player-source__hint {
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--ink-300);
  text-align: right;
}

.player-source__alert {
  margin-bottom: 10px;
}

.player-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.player-search .el-input {
  flex: 1;
}

.player-search__count {
  flex-shrink: 0;
  font-size: 10.5px;
  color: var(--ink-300);
}

.member-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.member-cell strong {
  font-size: 12.5px;
  font-weight: 500;
}

.member-cell small {
  font-size: 10px;
  color: var(--ink-300);
}

.player-form {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.player-form__hint {
  flex: 1;
  font-size: 10px;
  line-height: 1.5;
  color: var(--ink-300);
}

.roster-photo-hint {
  margin: -4px 0 12px;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--ink-500);
}

.selected-count {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--brand-700);
  font-weight: 600;
}

.selected-count--footer {
  margin-top: 12px;
  text-align: right;
}

.import-intro {
  margin-bottom: 6px;
}

.import-step {
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}

.import-step:last-of-type {
  border-bottom: none;
  padding-bottom: 4px;
}

.import-step__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.import-step__index {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-50, #eef7ee);
  color: var(--brand-700);
  font-size: 11px;
  font-weight: 700;
}

.import-step__title {
  flex: 1;
  min-width: 0;
}

.import-step__title h4 {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-700);
}

.import-step__title h4 small {
  margin-left: 4px;
  font-size: 10.5px;
  font-weight: 400;
  color: var(--ink-300);
}

.import-step__title p {
  margin-top: 3px;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--ink-500);
}

.import-step__note {
  padding: 6px 9px;
  border-radius: 7px;
  background: var(--paper);
  color: var(--ink-500) !important;
}

.import-file-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding: 11px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--paper);
}

.import-file-card__icon {
  flex-shrink: 0;
  color: var(--brand-700);
}

.import-file-card__meta {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.import-file-card__meta strong {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ink-700);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.import-file-card__meta span {
  font-size: 10px;
  color: var(--ink-300);
}

.import-drop {
  display: block;
  margin-top: 10px;
}

.import-drop :deep(.el-upload),
.import-drop :deep(.el-upload-dragger) {
  width: 100%;
}

.import-drop :deep(.el-upload-dragger) {
  padding: 18px 12px;
}

.import-drop--compact :deep(.el-upload-dragger) {
  padding: 12px;
}

.import-drop__icon {
  font-size: 24px;
  color: var(--ink-300);
}

.import-drop__text {
  margin-top: 4px;
  font-size: 12px;
  color: var(--ink-500);
}

.import-drop__text em {
  color: var(--brand-700);
  font-style: normal;
}

.import-drop__hint {
  margin-top: 2px;
  font-size: 10px;
  color: var(--ink-300);
}

.import-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.import-actions__hint {
  font-size: 10.5px;
  color: var(--ink-300);
}

.import-report {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.import-report__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.import-report__head strong {
  font-size: 13.5px;
  color: var(--ink-700);
}

.import-report__head small {
  margin-left: 8px;
  font-size: 10px;
  color: var(--ink-300);
}

.import-report__stats {
  display: flex;
  gap: 28px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--paper);
  margin: 10px 0;
}

.import-report__stats div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.import-report__stats strong {
  font-size: 20px;
}

.import-report__stats .ok {
  color: #2f9d58;
}

.import-report__stats .fail {
  color: #c45656;
}

.import-report__stats span {
  font-size: 9.5px;
  color: var(--ink-300);
}

.readonly-alert {
  margin-bottom: 14px;
}

@media (max-width: 900px) {
  .info-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .enrollment-hero__meta {
    gap: 22px;
  }
}

@media (max-width: 560px) {
  .info-grid {
    grid-template-columns: 1fr;
  }

  .info-edit-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .info-edit-buttons {
    justify-content: flex-end;
  }
}
</style>
