<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus'
import { Camera, Check, Close, Picture, Plus, Refresh, UploadFilled, VideoCamera } from '@element-plus/icons-vue'
import { enrollmentApi, eventApi, fileApi, identityApi, matchApi } from '../../api'
import type { EnrollmentDetail } from '../../api'
import type { Enrollment, IdentityCheck, Match, RosterItem } from '../../api/types'
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
const filters = reactive({ manualStatus: '' })

/** 列表投影只有 ID，展示用信息按 ID 缓存补齐，避免同一条比赛/报名重复请求。 */
const matchCache = new Map<string, Promise<Match | null>>()
const enrollmentCache = new Map<string, Promise<EnrollmentDetail | null>>()
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

function shortId(id?: string) {
  return id ? id.slice(-6) : '—'
}

/** 复核人姓名由核验接口直接返回（reviewerName）；账号详情接口对赛事记录员等角色不开放，不能再按 ID 额外拉取。 */
async function enrichCheck(check: IdentityCheck): Promise<IdentityCheck> {
  const [match, enrollment] = await Promise.all([
    check.matchId ? fetchMatch(check.matchId) : Promise.resolve(null),
    check.enrollmentId ? fetchEnrollment(check.enrollmentId) : Promise.resolve(null),
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
    matchLabel: match ? `${match.homeTeamName || '主队'} vs ${match.awayTeamName || '客队'}` : undefined,
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
  // 默认走本地 DeepFace 机器 1:1 比对；也可切回现场人工核验。
  mode: 'FACE_COMPARE',
  capturedPhotoFileId: '',
})

const confirmedCount = computed(() => statsRows.value.filter((row) => row.manualStatus === 'CONFIRMED').length)
const pendingCount = computed(() => statsRows.value.filter((row) => row.manualStatus === 'PENDING' || row.manualStatus === 'NOT_REVIEWED').length)
const filterSummary = computed(() => `共 ${total.value} 条记录`)

async function load() {
  loading.value = true
  try {
    const res = await identityApi.list({
      page: page.value,
      pageSize: pageSize.value,
      manualStatus: filters.manualStatus || undefined,
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
  clearReference()
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
  clearReference()
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
  clearReference()
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

/** 现场拍摄：用摄像头实时取景，避免再走"先拍照存手机再选文件"的绕路。 */
const cameraVisible = ref(false)
const cameraOpening = ref(false)
const cameraVideo = ref<HTMLVideoElement | null>(null)
const cameraShotUrl = ref('')
const cameraShotBlob = ref<Blob | null>(null)
let cameraStream: MediaStream | null = null

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop())
  cameraStream = null
  if (cameraVideo.value) cameraVideo.value.srcObject = null
}

function releaseShot() {
  if (cameraShotUrl.value) URL.revokeObjectURL(cameraShotUrl.value)
  cameraShotUrl.value = ''
  cameraShotBlob.value = null
}

async function openCamera() {
  if (!createForm.matchId) return ElMessage.warning('请先选择比赛')
  if (!navigator.mediaDevices?.getUserMedia) {
    ElMessage.warning('当前浏览器不支持调用摄像头，请改用「选择照片上传」，或在手机上用系统相机拍摄')
    return
  }
  releaseShot()
  cameraVisible.value = true
  cameraOpening.value = true
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      // 优先后置镜头，现场多为手机/外接摄像头
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    })
    await nextTick()
    if (cameraVideo.value) {
      cameraVideo.value.srcObject = cameraStream
      await cameraVideo.value.play()
    }
  } catch (error) {
    stopCamera()
    cameraVisible.value = false
    const name = (error as DOMException)?.name
    if (name === 'NotAllowedError') {
      ElMessage.warning('摄像头权限被拒绝。请在浏览器地址栏允许摄像头后重试，或改用「选择照片上传」')
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      ElMessage.warning('未检测到可用摄像头，请改用「选择照片上传」')
    } else {
      ElMessage.warning('无法打开摄像头。若通过局域网 IP 访问，浏览器要求 HTTPS 才允许调用摄像头，请改用「选择照片上传」')
    }
  } finally {
    cameraOpening.value = false
  }
}

/** 从视频流抓一帧转 JPEG，避免把原始大图直接塞进上传。 */
async function takeShot() {
  const video = cameraVideo.value
  if (!video || !video.videoWidth || !video.videoHeight) {
    return ElMessage.warning('摄像头尚未就绪，请稍候再拍')
  }
  releaseShot()
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return ElMessage.warning('照片生成失败，请改用「选择照片上传」')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  )
  if (!blob) return ElMessage.warning('照片生成失败，请改用「选择照片上传」')
  cameraShotBlob.value = blob
  cameraShotUrl.value = URL.createObjectURL(blob)
}

/** 重拍：丢弃已拍照片，把实时画面接回来（视频节点在预览态被卸载，需重新绑定流）。 */
async function retake() {
  releaseShot()
  await nextTick()
  if (cameraVideo.value && cameraStream) {
    cameraVideo.value.srcObject = cameraStream
    await cameraVideo.value.play()
  }
}

async function useShot() {
  if (!cameraShotBlob.value) return ElMessage.warning('请先拍照')
  if (!createForm.matchId) return ElMessage.warning('请先选择比赛')
  const stamp = dayjs().format('YYYYMMDD-HHmmss')
  const file = new File([cameraShotBlob.value], `capture-${stamp}.jpg`, { type: 'image/jpeg' })
  photoUploading.value = true
  try {
    const record = await fileApi.upload(file, 'MATCH', createForm.matchId, 'CAPTURE_PHOTO')
    createForm.capturedPhotoFileId = record.id
    photoFileName.value = record.originalName || file.name
    cameraVisible.value = false
    ElMessage.success('现场照片已拍摄并上传')
  } catch {
    // 拦截器提示
  } finally {
    photoUploading.value = false
  }
}

/** 参考照检测：与后端 resolve_reference_photo_file_id 同优先级（名单照片 → 人员档案头像）。 */
const referenceFileId = ref('')
const referenceUrl = ref('')
const referenceSource = ref<'ROSTER' | 'PERSON' | 'NONE'>('NONE')
const referenceLoading = ref(false)

function clearReference() {
  if (referenceUrl.value) URL.revokeObjectURL(referenceUrl.value)
  referenceFileId.value = ''
  referenceUrl.value = ''
  referenceSource.value = 'NONE'
}

async function resolveReferencePhoto() {
  clearReference()
  const athleteId = createForm.athleteId
  if (!athleteId) return
  referenceLoading.value = true
  try {
    // 两级回落（名单照片 → 人员档案头像）由后端判定：记录员无权读取人员档案，前端自判会误报缺失
    const res = await identityApi
      .referencePhoto({ enrollmentId: createForm.enrollmentId, athleteId }, { silentError: true })
      .catch(() => null)
    if (res?.available && res.fileId) {
      referenceFileId.value = res.fileId
      referenceSource.value = res.source === 'ROSTER' ? 'ROSTER' : 'PERSON'
      referenceUrl.value = (await fileApi.contentObjectUrl(res.fileId).catch(() => '')) || ''
    }
  } finally {
    referenceLoading.value = false
  }
}

async function createCheck() {
  if (!createForm.matchId) return ElMessage.warning('请选择比赛')
  if (!createForm.enrollmentId) return ElMessage.warning('请选择报名单')
  if (!createForm.athleteId) return ElMessage.warning('请选择球员')
  if (!createForm.capturedPhotoFileId) return ElMessage.warning('请上传现场采集照片')
  if (createForm.mode === 'FACE_COMPARE' && !referenceFileId.value) {
    try {
      await ElMessageBox.confirm(
        '该球员没有可用的参考照片，机器 1:1 比对会直接返回「不可用」，需人工复核。参考照可在报名单处于草稿/驳回/撤回时到「报名单详情 → 球员名单 → 编辑」上传，已提交的报名单请在「人员管理」为该球员设置档案头像。仍要创建这条核验记录吗？',
        '缺少参考照片',
        { confirmButtonText: '仍要创建', cancelButtonText: '去补照片', type: 'warning' },
      )
    } catch {
      return
    }
  }
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
  stopCamera()
  releaseShot()
  clearReference()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="身份核验"
      description="记录员现场核对参赛证、身份证原件与报名信息后录入的人工核验记录，确认无误即可通过。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">发起核验</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="核验记录" :value="total" hint="当前筛选范围" :icon="VideoCamera" tone="green" />
      <StatCard label="已确认" :value="confirmedCount" hint="当前页" :icon="Check" tone="lime" />
      <StatCard label="待人工核验" :value="pendingCount" hint="当前页" :icon="Camera" tone="amber" />
    </div>

    <section class="page-card">
      <FilterBar :summary="filterSummary">
        <el-select v-model="filters.manualStatus" placeholder="人工核验状态" clearable @change="search">
          <el-option label="未复核" value="NOT_REVIEWED" />
          <el-option label="待核验" value="PENDING" />
          <el-option label="已确认" value="CONFIRMED" />
          <el-option label="已驳回" value="REJECTED" />
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
          <div><span>采集时间</span><strong>{{ dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') }}</strong></div>
          <div>
            <span>复核人</span>
            <strong>{{ detail.reviewerName || (detail.reviewerAccountId ? `账号 ${shortId(detail.reviewerAccountId)}` : '—') }}</strong>
          </div>
        </div>

        <div class="machine-box">
          <div class="machine-box__head">
            <span>机器比对</span>
            <StatusTag :status="detail.machineStatus" kind="machine" size="default" />
          </div>
          <div class="machine-box__grid">
            <div>
              <span>核验方式</span>
              <strong>{{ detail.mode === 'FACE_COMPARE' ? '机器 1:1 人脸比对' : '现场人工核验' }}</strong>
            </div>
            <div>
              <span>相似度距离</span>
              <strong>{{ detail.machineDistance === null || detail.machineDistance === undefined ? '—' : detail.machineDistance }}</strong>
            </div>
          </div>
          <p v-if="detail.machineReason" class="machine-box__reason">{{ detail.machineReason }}</p>
        </div>

        <div v-if="detail.manualReason" class="reason-box">
          <span>复核意见</span>
          <p>{{ detail.manualReason }}</p>
        </div>

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
              :label="`${match.homeTeamName || '主队'} vs ${match.awayTeamName || '客队'} · ${dayjs(match.kickoffAt).format('MM-DD HH:mm')}`"
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
            @change="resolveReferencePhoto"
          >
            <el-option
              v-for="item in rosterOptions"
              :key="item.athleteId"
              :label="`${item.athleteName} · ${item.jerseyNumber ?? '—'} 号 · ${item.position || '位置未填'}`"
              :value="item.athleteId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="核验方式" required>
          <el-radio-group v-model="createForm.mode">
            <el-radio value="FACE_COMPARE">机器 1:1 人脸比对（本地 DeepFace）</el-radio>
            <el-radio value="MANUAL">现场人工核验</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="参考照片">
          <div v-loading="referenceLoading" class="ref-photo">
            <img
              v-if="referenceSource !== 'NONE' && referenceUrl"
              :src="referenceUrl"
              class="ref-photo__img"
              alt="参考照片"
            />
            <div v-else class="ref-photo__img ref-photo__img--empty">
              <el-icon :size="22"><Picture /></el-icon>
            </div>
            <div class="ref-photo__meta">
              <strong v-if="referenceSource === 'ROSTER'">报名名单照片 · 可用</strong>
              <strong v-else-if="referenceSource === 'PERSON'">人员档案头像 · 可用</strong>
              <strong v-else-if="!createForm.athleteId" class="muted">选择球员后自动检测</strong>
              <strong v-else class="ref-photo__meta--warn">该球员暂无参考照片</strong>
              <span v-if="referenceSource !== 'NONE'">机器比对以这张图为基准</span>
              <span v-else-if="createForm.athleteId">
                报名单处于草稿/驳回/撤回时，可在「报名单详情 → 球员名单 → 编辑」上传照片；已提交或已通过的报名单不能改，改到「人员管理」为该球员设置档案头像
              </span>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="现场采集照片" required>
          <div class="capture-actions">
            <el-button
              type="primary"
              :icon="Camera"
              :loading="photoUploading"
              :disabled="!createForm.matchId"
              @click="openCamera"
            >
              摄像头拍摄
            </el-button>
            <el-upload
              :show-file-list="false"
              :disabled="!createForm.matchId"
              :http-request="uploadCapturePhoto"
              accept=".jpg,.jpeg,.png,image/*"
            >
              <el-button :icon="UploadFilled" :disabled="!createForm.matchId">选择照片上传</el-button>
            </el-upload>
          </div>
          <div v-if="photoFileName" class="capture-file">
            已上传：<strong>{{ photoFileName }}</strong>
          </div>
          <span v-else class="form-hint">
            可现场调用摄像头拍摄，也可从相册选择照片；请确保面部清晰无遮挡
          </span>
          <span v-if="photoUploading" class="muted">照片上传中…</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createCheck">发起核验</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="cameraVisible" title="现场拍摄" width="620px" @closed="stopCamera">
      <div class="camera-stage">
        <img v-if="cameraShotUrl" :src="cameraShotUrl" class="camera-media" alt="拍摄预览" />
        <video
          v-else
          ref="cameraVideo"
          class="camera-media"
          autoplay
          playsinline
          muted
        />
      </div>
      <p class="camera-tip">
        <span v-if="cameraOpening">正在打开摄像头…</span>
        <span v-else-if="cameraShotUrl">确认照片清晰后点击「使用这张照片」</span>
        <span v-else>请让运动员正对镜头，面部清晰无遮挡后点击「拍照」</span>
      </p>
      <template #footer>
        <el-button @click="cameraVisible = false">取消</el-button>
        <el-button v-if="cameraShotUrl" @click="retake">重拍</el-button>
        <el-button v-else type="primary" :loading="cameraOpening" @click="takeShot">拍照</el-button>
        <el-button
          v-if="cameraShotUrl"
          type="primary"
          :loading="photoUploading"
          @click="useShot"
        >
          使用这张照片
        </el-button>
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

.machine-box {
  margin-top: 16px;
  padding: 12px 13px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--paper);
}

.machine-box__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.machine-box__head > span {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-700);
}

.machine-box__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: 10px;
}

.machine-box__grid span {
  display: block;
  font-size: 9.5px;
  color: var(--ink-300);
}

.machine-box__grid strong {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  font-weight: 500;
}

.machine-box__reason {
  margin-top: 9px;
  font-size: 10px;
  line-height: 1.6;
  color: var(--ink-500);
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

.form-hint {
  margin-top: 4px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.capture-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.capture-actions :deep(.el-upload) {
  display: inline-block;
}

.capture-file {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-500);
}

.capture-file strong {
  color: var(--brand-700);
}

.ref-photo {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
}

.ref-photo__img {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
  background: #f2f4f5;
  border: 1px solid #e3e7e8;
  flex: none;
}

.ref-photo__img--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b6bcbf;
}

.ref-photo__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-500);
}

.ref-photo__meta strong {
  font-size: 13px;
  color: var(--brand-700);
}

.ref-photo__meta--warn {
  color: #d4380d;
}

.camera-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  border-radius: 12px;
  background: #101314;
  overflow: hidden;
}

.camera-media {
  width: 100%;
  max-height: 56vh;
  object-fit: contain;
  display: block;
}

.camera-tip {
  margin-top: 10px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-300);
}
</style>
