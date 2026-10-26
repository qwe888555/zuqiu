<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus'
import { Camera, Check, Close, Plus, Refresh, UploadFilled, VideoCamera } from '@element-plus/icons-vue'
import { accountApi, enrollmentApi, eventApi, fileApi, identityApi, matchApi } from '../../api'
import type { EnrollmentDetail } from '../../api'
import type { Account, Enrollment, IdentityCheck, Match, RosterItem } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import StatCard from '../../components/common/StatCard.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const loading = ref(false)
const rows = ref<IdentityCheck[]>([])
/** 后端已支持状态筛选，统计基于当前筛选结果的首屏数据。 */
const statsRows = ref<IdentityCheck[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = reactive({ manualStatus: '', machineStatus: '' })

/** 列表投影只有 ID，展示用信息按 ID 缓存补齐，避免同一条比赛/报名重复请求。 */
const matchCache = new Map<string, Promise<Match | null>>()
const enrollmentCache = new Map<string, Promise<EnrollmentDetail | null>>()
const accountCache = new Map<string, Promise<Account | null>>()
const photoUrlCache = new Map<string, string>()
const groupNames = ref<Record<string, string>>({})

function fetchMatch(id: string) {
  let pending = matchCache.get(id)
  if (!pending) {
    pending = matchApi.get(id).catch(() => null)
    matchCache.set(id, pending)
  }
  return pending
}

function fetchEnrollment(id: string) {
  let pending = enrollmentCache.get(id)
  if (!pending) {
    pending = enrollmentApi.get(id).catch(() => null)
    enrollmentCache.set(id, pending)
  }
  return pending
}

function fetchAccount(id: string) {
  let pending = accountCache.get(id)
  if (!pending) {
    pending = accountApi.get(id).catch(() => null)
    accountCache.set(id, pending)
  }
  return pending
}

function shortId(id?: string) {
  return id ? id.slice(-6) : '—'
}

async function enrichCheck(check: IdentityCheck): Promise<IdentityCheck> {
  const [match, enrollment, reviewer] = await Promise.all([
    check.matchId ? fetchMatch(check.matchId) : Promise.resolve(null),
    check.enrollmentId ? fetchEnrollment(check.enrollmentId) : Promise.resolve(null),
    check.reviewerAccountId ? fetchAccount(check.reviewerAccountId) : Promise.resolve(null),
  ])
  const athlete = enrollment?.players?.find((item) => item.athleteId === check.athleteId)
  const groupName =
    match?.groupName ||
    (enrollment && enrollment.groupName !== enrollment.groupId ? enrollment.groupName : undefined)
  return {
    ...check,
    athleteName: athlete?.athleteName,
    teamName: enrollment?.teamName,
    groupName,
    matchLabel: match ? `${match.homeTeamName} vs ${match.awayTeamName}` : undefined,
    reviewerName:
      reviewer?.displayName || reviewer?.username || check.reviewerName,
  }
}

/** 现场照片是私有文件，按 fileId 换取 object URL 后再放进 img。 */
async function attachPhoto(check: IdentityCheck): Promise<IdentityCheck> {
  if (!check.capturedPhotoFileId || check.capturedPhotoUrl) return check
  let url = photoUrlCache.get(check.capturedPhotoFileId)
  if (!url) {
    try {
      url = await fileApi.contentObjectUrl(check.capturedPhotoFileId)
      if (url) photoUrlCache.set(check.capturedPhotoFileId, url)
    } catch {
      return check
    }
  }
  return { ...check, capturedPhotoUrl: url }
}

const drawerVisible = ref(false)
const reviewing = ref(false)
const detail = ref<IdentityCheck | null>(null)

const createVisible = ref(false)
const creating = ref(false)
const matches = ref<Match[]>([])
const enrollmentOptions = ref<Enrollment[]>([])
const rosterOptions = ref<RosterItem[]>([])
const loadingEnrollments = ref(false)
const loadingRoster = ref(false)
const photoUploading = ref(false)
const photoFileName = ref('')
const createForm = reactive({
  matchId: '',
  enrollmentId: '',
  athleteId: '',
  mode: 'FACE_COMPARE' as 'FACE_COMPARE' | 'MANUAL',
  capturedPhotoFileId: '',
})

const machineLabel: Record<string, string> = {
  NOT_RUN: '未比对',
  MATCH: '比对一致',
  MISMATCH: '比对不一致',
  UNAVAILABLE: '服务不可用',
}

const modeLabel: Record<string, string> = {
  FACE_COMPARE: '人脸比对',
  MANUAL: '人工核验',
}

const confirmedCount = computed(() => statsRows.value.filter((row) => row.manualStatus === 'CONFIRMED').length)
const pendingCount = computed(() => statsRows.value.filter((row) => row.manualStatus === 'PENDING' || row.manualStatus === 'NOT_REVIEWED').length)
const mismatchCount = computed(() => statsRows.value.filter((row) => row.machineStatus === 'MISMATCH').length)
const filterSummary = computed(() => `共 ${total.value} 条记录`)

async function load() {
  loading.value = true
  try {
    const res = await identityApi.list({
      page: page.value,
      pageSize: pageSize.value,
      manualStatus: filters.manualStatus || undefined,
      machineStatus: filters.machineStatus || undefined,
    })
    total.value = res.total
    statsRows.value = res.items
    rows.value = await Promise.all(res.items.map(enrichCheck))
  } catch {
    rows.value = []
    statsRows.value = []
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

async function openDetail(row: IdentityCheck) {
  drawerVisible.value = true
  detail.value = null
  try {
    detail.value = await attachPhoto(await enrichCheck(await identityApi.get(row.id)))
  } catch {
    drawerVisible.value = false
  }
}

async function review(decision: 'CONFIRM_IDENTITY' | 'REJECT_IDENTITY') {
  if (!detail.value) return
  if (decision === 'CONFIRM_IDENTITY') {
    try {
      await ElMessageBox.confirm(
        `确认「${detail.value.athleteName || `运动员 ${shortId(detail.value.athleteId)}`}」与报名档案为同一人？确认后允许参赛。`,
        '确认身份',
        { confirmButtonText: '确认身份', cancelButtonText: '取消', type: 'success' },
      )
    } catch {
      return
    }
    reviewing.value = true
    try {
      await identityApi.review(detail.value.id, {
        version: detail.value.version,
        decision,
        reason: '现场核验确认人证一致',
      })
      ElMessage.success('已确认身份')
      drawerVisible.value = false
      await load()
    } catch {
      // 拦截器提示
    } finally {
      reviewing.value = false
    }
    return
  }

  try {
    const { value } = await ElMessageBox.prompt('请填写驳回原因，记录将保留以备追溯。', '驳回身份核验', {
      confirmButtonText: '确认驳回',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：现场证件与报名信息不一致',
      inputValidator: (val) => (val && val.trim().length >= 4 ? true : '请至少填写 4 个字符'),
    })
    reviewing.value = true
    await identityApi.review(detail.value.id, {
      version: detail.value.version,
      decision,
      reason: value,
    })
    ElMessage.success('已驳回并记录原因')
    drawerVisible.value = false
    await load()
  } catch {
    // 取消或异常
  } finally {
    reviewing.value = false
  }
}

async function openCreate() {
  createForm.matchId = ''
  createForm.enrollmentId = ''
  createForm.athleteId = ''
  createForm.mode = 'FACE_COMPARE'
  createForm.capturedPhotoFileId = ''
  photoFileName.value = ''
  enrollmentOptions.value = []
  rosterOptions.value = []
  createVisible.value = true
  try {
    const res = await matchApi.list({ page: 1, pageSize: 50 })
    matches.value = res.items
  } catch {
    matches.value = []
  }
}

async function onMatchChange() {
  createForm.enrollmentId = ''
  createForm.athleteId = ''
  enrollmentOptions.value = []
  rosterOptions.value = []
  groupNames.value = {}
  const match = matches.value.find((item) => item.id === createForm.matchId)
  if (!match) return
  loadingEnrollments.value = true
  // 报名列表只返回 groupId，组别名称需从赛事组别接口补全。
  const [enrollments, groups] = await Promise.allSettled([
    enrollmentApi.list({ page: 1, pageSize: 100, eventId: match.eventId }),
    eventApi.groups(match.eventId),
  ])
  enrollmentOptions.value =
    enrollments.status === 'fulfilled'
      ? enrollments.value.items.filter((item) => item.status === 'APPROVED')
      : []
  if (groups.status === 'fulfilled') {
    groupNames.value = Object.fromEntries(groups.value.items.map((group) => [group.id, group.name]))
  }
  loadingEnrollments.value = false
}

async function onEnrollmentChange() {
  createForm.athleteId = ''
  rosterOptions.value = []
  if (!createForm.enrollmentId) return
  loadingRoster.value = true
  try {
    const res = await enrollmentApi.players(createForm.enrollmentId, { page: 1, pageSize: 100 })
    rosterOptions.value = res.items
  } catch {
    rosterOptions.value = []
  } finally {
    loadingRoster.value = false
  }
}

async function uploadCapturePhoto(options: UploadRequestOptions) {
  if (!createForm.matchId) return ElMessage.warning('请先选择比赛')
  photoUploading.value = true
  try {
    const record = await fileApi.upload(options.file, 'MATCH', createForm.matchId, 'CAPTURE_PHOTO')
    createForm.capturedPhotoFileId = record.id
    photoFileName.value = record.originalName
    ElMessage.success('现场照片已上传')
  } catch {
    // 拦截器提示
  } finally {
    photoUploading.value = false
  }
}

async function createCheck() {
  if (!createForm.matchId) return ElMessage.warning('请选择比赛')
  if (!createForm.enrollmentId) return ElMessage.warning('请选择报名单')
  if (!createForm.athleteId) return ElMessage.warning('请选择球员')
  if (!createForm.capturedPhotoFileId) return ElMessage.warning('请上传现场采集照片')
  creating.value = true
  try {
    const created = await identityApi.create({ ...createForm })
    ElMessage.success('身份核验记录已创建')
    createVisible.value = false
    await load()
    await openDetail(created)
  } catch {
    // 拦截器提示
  } finally {
    creating.value = false
  }
}

onMounted(load)

onBeforeUnmount(() => {
  photoUrlCache.forEach((url) => URL.revokeObjectURL(url))
  photoUrlCache.clear()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="身份核验"
      description="查看赛前人脸比对与人工核验记录。比对不一致或服务不可用时，需由记录员现场核验证件后人工确认。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">发起核验</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="核验记录" :value="total" hint="当前筛选范围" :icon="VideoCamera" tone="green" />
      <StatCard label="已确认" :value="confirmedCount" hint="当前页" :icon="Check" tone="lime" />
      <StatCard label="待人工复核" :value="pendingCount" hint="当前页" :icon="Camera" tone="amber" />
      <StatCard label="比对不一致" :value="mismatchCount" hint="当前页" :icon="Close" tone="blue" />
    </div>

    <section class="page-card">
      <FilterBar :summary="filterSummary">
        <el-select v-model="filters.manualStatus" placeholder="人工核验状态" clearable @change="search">
          <el-option label="未复核" value="NOT_REVIEWED" />
          <el-option label="待核验" value="PENDING" />
          <el-option label="已确认" value="CONFIRMED" />
          <el-option label="已驳回" value="REJECTED" />
        </el-select>
        <el-select v-model="filters.machineStatus" placeholder="人脸比对结果" clearable @change="search">
          <el-option label="比对一致" value="MATCH" />
          <el-option label="比对不一致" value="MISMATCH" />
          <el-option label="未比对" value="NOT_RUN" />
          <el-option label="服务不可用" value="UNAVAILABLE" />
        </el-select>
      </FilterBar>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="运动员" min-width="180">
          <template #default="{ row }">
            <div class="person-cell">
              <span class="person-cell__avatar">{{ (row.athleteName || '员').slice(0, 1) }}</span>
              <div>
                <strong>{{ row.athleteName || `运动员 ${shortId(row.athleteId)}` }}</strong>
                <small>{{ row.teamName || '球队未登记' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="matchLabel" label="比赛" min-width="200">
          <template #default="{ row }">{{ row.matchLabel || '—' }}</template>
        </el-table-column>
        <el-table-column label="核验方式" width="110">
          <template #default="{ row }">{{ modeLabel[row.mode] }}</template>
        </el-table-column>
        <el-table-column label="人脸比对" width="120">
          <template #default="{ row }">
            <el-tag
              :type="row.machineStatus === 'MATCH' ? 'success' : row.machineStatus === 'MISMATCH' ? 'danger' : 'info'"
              size="small"
              effect="plain"
            >
              {{ machineLabel[row.machineStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="人工核验" width="120">
          <template #default="{ row }"><StatusTag :status="row.manualStatus" kind="identity" /></template>
        </el-table-column>
        <el-table-column label="核验时间" width="160">
          <template #default="{ row }">
            <span class="muted">{{ dayjs(row.createdAt).format('MM-DD HH:mm') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">
              {{ row.manualStatus === 'PENDING' || row.manualStatus === 'NOT_REVIEWED' ? '处理' : '查看' }}
            </el-button>
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

    <el-drawer v-model="drawerVisible" size="540px" :with-header="false">
      <div v-if="detail" class="identity-detail">
        <header class="detail-head">
          <span class="detail-head__eyebrow">身份核验</span>
          <h2>{{ detail.athleteName || `运动员 ${shortId(detail.athleteId)}` }}</h2>
          <p>{{ detail.matchLabel || '比赛未登记' }} · {{ detail.teamName || '球队未登记' }}</p>
          <StatusTag :status="detail.manualStatus" kind="identity" size="default" />
        </header>

        <div class="capture">
          <img v-if="detail.capturedPhotoUrl" :src="detail.capturedPhotoUrl" alt="现场照片" />
          <div v-else class="capture__placeholder">
            <el-icon :size="30"><Camera /></el-icon>
            <span>现场照片暂不可查看</span>
            <small>核验记录未返回照片地址，请以证件原件为准</small>
          </div>
          <span class="capture__label">现场采集</span>
        </div>

        <div class="info-grid">
          <div><span>核验方式</span><strong>{{ modeLabel[detail.mode] }}</strong></div>
          <div><span>人脸比对</span><strong>{{ machineLabel[detail.machineStatus] }}</strong></div>
          <div><span>采集时间</span><strong>{{ dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') }}</strong></div>
          <div>
            <span>复核人</span>
            <strong>{{ detail.reviewerName || (detail.reviewerAccountId ? `账号 ${shortId(detail.reviewerAccountId)}` : '—') }}</strong>
          </div>
        </div>

        <div v-if="detail.manualReason" class="reason-box">
          <span>复核意见</span>
          <p>{{ detail.manualReason }}</p>
        </div>

        <el-alert
          v-if="detail.machineStatus === 'MISMATCH'"
          type="warning"
          :closable="false"
          show-icon
          title="人脸比对不一致"
          description="请核对参赛证、身份证原件与报名照片，确认无误后方可人工通过；存在冒名顶替嫌疑时应驳回并上报。"
        />

        <footer v-if="detail.manualStatus === 'PENDING' || detail.manualStatus === 'NOT_REVIEWED'" class="detail-foot">
          <el-button type="danger" plain :icon="Close" :loading="reviewing" @click="review('REJECT_IDENTITY')">
            驳回
          </el-button>
          <el-button type="success" :icon="Check" :loading="reviewing" @click="review('CONFIRM_IDENTITY')">
            确认身份
          </el-button>
        </footer>
      </div>
    </el-drawer>

    <el-dialog v-model="createVisible" title="发起现场身份核验" width="580px">
      <el-form :model="createForm" label-position="top">
        <el-form-item label="比赛" required>
          <el-select
            v-model="createForm.matchId"
            placeholder="选择当前现场比赛"
            filterable
            style="width: 100%"
            @change="onMatchChange"
          >
            <el-option
              v-for="match in matches"
              :key="match.id"
              :label="`${match.homeTeamName} vs ${match.awayTeamName} · ${dayjs(match.kickoffAt).format('MM-DD HH:mm')}`"
              :value="match.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="报名单" required>
          <el-select
            v-model="createForm.enrollmentId"
            placeholder="选择已通过的报名单"
            filterable
            :loading="loadingEnrollments"
            :disabled="!createForm.matchId"
            style="width: 100%"
            @change="onEnrollmentChange"
          >
            <el-option
              v-for="item in enrollmentOptions"
              :key="item.id"
              :label="`${item.teamName} · ${groupNames[item.groupId] || item.groupName || item.groupId}`"
              :value="item.id"
            />
          </el-select>
          <span v-if="createForm.matchId && !loadingEnrollments && !enrollmentOptions.length" class="form-hint">
            该赛事暂无已通过审核的报名单
          </span>
        </el-form-item>
        <el-form-item label="球员" required>
          <el-select
            v-model="createForm.athleteId"
            placeholder="从报名名单中选择球员"
            filterable
            :loading="loadingRoster"
            :disabled="!createForm.enrollmentId"
            style="width: 100%"
          >
            <el-option
              v-for="item in rosterOptions"
              :key="item.athleteId"
              :label="`${item.athleteName} · ${item.jerseyNumber ?? '—'} 号 · ${item.position || '位置未填'}`"
              :value="item.athleteId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="核验方式">
          <el-radio-group v-model="createForm.mode">
            <el-radio-button value="FACE_COMPARE">人脸比对</el-radio-button>
            <el-radio-button value="MANUAL">人工核验</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="现场采集照片" required>
          <el-upload
            class="capture-uploader"
            drag
            :show-file-list="false"
            :disabled="!createForm.matchId"
            :http-request="uploadCapturePhoto"
            accept=".jpg,.jpeg,.png"
          >
            <el-icon class="capture-uploader__icon"><UploadFilled /></el-icon>
            <div v-if="photoFileName" class="capture-uploader__file">
              已上传：<strong>{{ photoFileName }}</strong>
            </div>
            <template v-else>
              <div class="capture-uploader__text">拍摄或上传现场照片</div>
              <div class="capture-uploader__hint">照片将与人脸库比对，请确保面部清晰无遮挡</div>
            </template>
          </el-upload>
          <span v-if="photoUploading" class="muted">照片上传中…</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createCheck">发起核验</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.person-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}

.person-cell__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 11px;
  font-weight: 700;
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

.detail-head {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.detail-head__eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-600);
}

.detail-head h2 {
  margin-top: 5px;
  font-size: 21px;
}

.detail-head p {
  margin: 5px 0 8px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.capture {
  position: relative;
  margin-top: 16px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--paper);
}

.capture img {
  width: 100%;
  height: 240px;
  object-fit: cover;
}

.capture__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--ink-300);
}

.capture__placeholder span {
  margin-top: 8px;
  font-size: 12px;
}

.capture__placeholder small {
  margin-top: 3px;
  font-size: 9.5px;
}

.capture__label {
  position: absolute;
  left: 10px;
  bottom: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(4, 40, 27, 0.65);
  color: #fff;
  font-size: 9px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: 16px;
}

.info-grid > div {
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--paper);
}

.info-grid span {
  display: block;
  font-size: 9.5px;
  color: var(--ink-300);
}

.info-grid strong {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 500;
}

.reason-box {
  margin-top: 14px;
  padding: 11px 13px;
  border-radius: 9px;
  background: #fbf4ef;
}

.reason-box span {
  font-size: 9.5px;
  color: var(--ink-300);
}

.reason-box p {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-700);
}

.detail-foot {
  position: sticky;
  bottom: -30px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin: 20px -4px -30px;
  padding: 14px 16px;
  background: #fff;
  border-top: 1px solid var(--line);
}

.identity-detail {
  padding-bottom: 30px;
}

.identity-detail :deep(.el-alert) {
  margin-top: 14px;
}

.form-hint {
  margin-top: 4px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.capture-uploader {
  width: 100%;
}

.capture-uploader :deep(.el-upload-dragger) {
  padding: 22px 16px;
  border-color: var(--line);
  border-radius: 12px;
  background: var(--paper);
}

.capture-uploader__icon {
  font-size: 26px;
  color: var(--brand-500);
}

.capture-uploader__text {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-500);
}

.capture-uploader__hint {
  margin-top: 5px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.capture-uploader__file {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-500);
}

.capture-uploader__file strong {
  color: var(--brand-700);
}
</style>
