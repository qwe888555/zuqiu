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
  Download,
  Edit,
  Plus,
  Refresh,
  UploadFilled,
  Warning,
} from '@element-plus/icons-vue'
import { enrollmentApi, fileApi, personApi } from '../../api'
import type { EnrollmentDetail } from '../../api'
import type {
  EnrollmentAttachment,
  ImportReport,
  Person,
  PrecheckIssue,
  ReviewRecord,
  RosterItem,
} from '../../api/types'
import { usePermission } from '../../composables/usePermission'
import { useAuthStore } from '../../stores/auth'
import { canEnroll } from '../../utils/roles'
import PageHeader from '../../components/common/PageHeader.vue'
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
const actionLoading = ref(false)
const exporting = ref<'registration' | 'players' | ''>('')
const personKeyword = ref('')
const personResults = ref<Person[]>([])
const searchLoading = ref(false)

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

const enrollmentId = computed(() => String(route.params.id))
const isReviewer = computed(() => can(['enrollment.review.city', 'enrollment.review.province']))
const isSchoolOwner = computed(
  () =>
    canEnroll(auth.roles) &&
    Boolean(detail.value) &&
    detail.value?.schoolOrgId === auth.user?.orgId,
)
// 报送、修改、提交、撤回、删除只属于报送学校，管理员不代替学校操作。
const canSubmit = computed(() => isSchoolOwner.value)
const canEdit = computed(() => isSchoolOwner.value && !!detail.value?.editable)
const canDelete = computed(
  () =>
    isSchoolOwner.value &&
    Boolean(detail.value) &&
    ['DRAFT', 'REJECTED', 'WITHDRAWN'].includes(detail.value?.status || ''),
)
const isTeamViewer = computed(() => auth.roles.includes('TEAM') && !canEnroll(auth.roles))
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

async function load() {
  loading.value = true
  try {
    detail.value = await enrollmentApi.get(enrollmentId.value)
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

function openAddPlayer() {
  addPlayerVisible.value = true
  playerForm.athleteId = ''
  playerForm.jerseyNumber = undefined
  playerForm.position = ''
  selectedPersons.value = []
  personKeyword.value = ''
  personResults.value = []
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
  if (!selectedPersons.value.length) return ElMessage.warning('请先选择球员')
  savingPlayer.value = true
  try {
    // 批量添加选中的球员
    for (const person of selectedPersons.value) {
      await enrollmentApi.addPlayer(enrollmentId.value, {
        athleteId: person.id,
        jerseyNumber: playerForm.jerseyNumber,
        position: playerForm.position,
      })
    }
    ElMessage.success(`已添加 ${selectedPersons.value.length} 名球员`)
    addPlayerVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    savingPlayer.value = false
  }
}

function openEditPlayer(row: RosterItem) {
  editingRoster.value = row
  rosterEditForm.jerseyNumber = row.jerseyNumber
  rosterEditForm.position = row.position || ''
  editPlayerVisible.value = true
}

async function savePlayerEdit() {
  if (!editingRoster.value) return
  savingPlayer.value = true
  try {
    await enrollmentApi.updatePlayer(enrollmentId.value, editingRoster.value.id, {
      athleteId: editingRoster.value.athleteId,
      jerseyNumber: rosterEditForm.jerseyNumber,
      position: rosterEditForm.position || undefined,
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
  importFile.value = (uploadFile.raw as File) || null
}

function onPhotoFileChange(uploadFile: UploadFile) {
  photoFile.value = (uploadFile.raw as File) || null
}

async function runImport(mode: 'VALIDATE_ONLY' | 'APPLY_VALID_ROWS') {
  if (!detail.value) return
  if (!importFile.value) return ElMessage.warning('请先选择球员名单 Excel 文件')
  importing.value = true
  try {
    importReport.value = await enrollmentApi.importPlayers(
      enrollmentId.value,
      detail.value.version,
      mode,
      importFile.value,
    )
    if (mode === 'APPLY_VALID_ROWS') await load()
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
          报名表 PDF
        </el-button>
        <el-button
          v-if="can('enrollment.export')"
          :icon="Download"
          :loading="exporting === 'players'"
          @click="exportDocument('players')"
        >
          球员信息表
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
          <el-button type="danger" plain @click="reject">驳回</el-button>
          <el-button type="success" @click="approve">审核通过</el-button>
        </template>
      </template>
    </PageHeader>

    <template v-if="detail">
      <el-alert
        v-if="isTeamViewer"
        class="readonly-alert"
        type="info"
        :closable="false"
        show-icon
        title="报名由学校端统一提交"
        description="球队端仅查看本队报名进度。球员名单、球队资料与材料请在球队管理中维护，如需调整报名请联系学校管理员。"
      />
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
              <div class="info-item"><span class="info-item__label">报送主体</span><strong>学校报送</strong></div>
              <div class="info-item"><span class="info-item__label">参赛学校</span><strong>{{ detail.schoolName || '—' }}</strong></div>
              <div class="info-item"><span class="info-item__label">校区</span><strong>{{ detail.campusName || '—' }}</strong></div>
              <div class="info-item"><span class="info-item__label">所属市州</span><strong>{{ detail.cityName || '—' }}</strong></div>
              <div class="info-item"><span class="info-item__label">领队 / 联系人</span><strong>{{ detail.contactName }}</strong></div>
              <div class="info-item"><span class="info-item__label">联系电话</span><strong>{{ detail.maskedContactPhone || '—' }}</strong></div>
              <div class="info-item"><span class="info-item__label">创建时间</span><strong>{{ formatDate(detail.createdAt) }}</strong></div>
              <div class="info-item info-item--status">
                <span class="info-item__label">当前状态</span>
                <StatusTag :status="detail.status" kind="enrollment" />
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

            <el-table :data="detail.players || []" style="width: 100%">
              <el-table-column label="球员" min-width="180">
                <template #default="{ row }">
                  <div class="player-cell">
                    <span class="player-cell__photo">
                      <img v-if="row.photoUrl" :src="row.photoUrl" alt="" />
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
              <el-table-column v-if="canEdit" label="操作" width="140" align="right">
                <template #default="{ row }">
                  <el-button link type="primary" :icon="Edit" @click="openEditPlayer(row)">编辑</el-button>
                  <el-button link type="danger" @click="removePlayer(row.id, row.athleteName, row.version)">移除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty
              v-if="!(detail.players || []).length"
              description="尚未添加球员，可通过名单导入或手动添加"
              :image-size="80"
            />
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

    <el-dialog v-model="addPlayerVisible" title="添加球员" width="640px">
      <div class="player-search">
        <el-input
          v-model="personKeyword"
          placeholder="输入姓名或身份证后四位检索人员库"
          clearable
          @keyup.enter="searchPersons"
        />
        <el-button type="primary" plain :loading="searchLoading" @click="searchPersons">检索</el-button>
      </div>
      <el-table
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
      <el-empty v-if="!personResults.length && !searchLoading" description="未检索到人员，请联系管理员先建档" :image-size="60" />
      <div class="player-form">
        <el-input v-model.number="playerForm.jerseyNumber" placeholder="球衣号码" style="width: 130px" />
        <el-input v-model="playerForm.position" placeholder="场上位置，如：前锋" style="width: 200px" />
        <span v-if="selectedPersons.length" class="selected-count">
          已选 {{ selectedPersons.length }} 人
        </span>
      </div>
      <template #footer>
        <el-button @click="addPlayerVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPlayer" @click="addPlayer">加入名单</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editPlayerVisible" title="编辑名单条目" width="520px">
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
      </el-form>
      <template #footer>
        <el-button @click="editPlayerVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPlayer" @click="savePlayerEdit">保存修改</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="attachmentVisible" title="上传报名材料" width="540px">
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

    <el-dialog v-model="importVisible" title="批量导入球员名单" width="680px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="请使用组委会提供的标准模板"
        description="导入分为「校验」与「应用有效行」两步，校验阶段不会修改名单。"
      />
      <div class="template-row">
        <span>尚未下载模板？</span>
        <el-button link type="primary" :icon="Download" @click="downloadTemplate">下载球员导入模板</el-button>
      </div>
      <div class="import-file-row">
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          :limit="1"
          accept=".xlsx,.xls"
          :on-change="onImportFileChange"
        >
          <el-button plain>选择名单 Excel</el-button>
        </el-upload>
        <span class="muted">{{ importFile?.name || '未选择文件时按演示数据模拟导入' }}</span>
      </div>
      <div class="import-actions">
        <el-button :loading="importing" @click="runImport('VALIDATE_ONLY')">仅校验</el-button>
        <el-button type="primary" :loading="importing" @click="runImport('APPLY_VALID_ROWS')">校验并应用有效行</el-button>
      </div>
      <div class="import-file-row">
        <el-upload
          :auto-upload="false"
          :show-file-list="false"
          :limit="1"
          accept=".zip"
          :on-change="onPhotoFileChange"
        >
          <el-button plain>选择球员照片 ZIP</el-button>
        </el-upload>
        <span class="muted">{{ photoFile?.name || '照片以脱敏身份证号命名' }}</span>
        <el-button :loading="importing" @click="runPhotoImport">导入照片</el-button>
      </div>
      <div v-if="importReport" class="import-report">
        <div class="import-report__stats">
          <div><strong class="num">{{ importReport.total }}</strong><span>总行数</span></div>
          <div><strong class="num ok">{{ importReport.successCount }}</strong><span>成功</span></div>
          <div><strong class="num fail">{{ importReport.failureCount }}</strong><span>失败</span></div>
          <div class="import-report__export">
            <el-button link type="primary" :icon="Download" @click="downloadImportErrors">
              下载错误清单 CSV
            </el-button>
          </div>
        </div>
        <el-table :data="importReport.errors" size="small" max-height="220">
          <el-table-column label="行号 / 文件" width="130">
            <template #default="{ row }">{{ row.rowNumber ?? row.fileName ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="字段" width="110">
            <template #default="{ row }">{{ row.field || row.code }}</template>
          </el-table-column>
          <el-table-column prop="message" label="错误说明" min-width="240" />
        </el-table>
      </div>
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

.player-search {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.player-form {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.selected-count {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--brand-700);
  font-weight: 600;
}

.import-actions {
  display: flex;
  gap: 10px;
  margin: 12px 0;
}

.template-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.import-file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
}

.import-file-row .muted {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
}

.import-report__export {
  margin-left: auto;
  align-self: center;
}

.import-report__stats {
  display: flex;
  gap: 28px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--paper);
  margin-bottom: 12px;
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
}
</style>
