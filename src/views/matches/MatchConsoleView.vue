<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus'
import {
  CircleCheck,
  Close,
  Delete,
  Document,
  Edit,
  FullScreen,
  Link,
  Plus,
  Refresh,
  Timer,
  Trophy,
  UploadFilled,
  VideoCamera,
} from '@element-plus/icons-vue'
import { fileApi, matchApi } from '../../api'
import type { LiveLink, LivePost, Match, MatchDocument, MatchEvent, MatchResult } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const route = useRoute()
const router = useRouter()
const matchId = String(route.params.id)

const loading = ref(false)
const match = ref<Match | null>(null)
const events = ref<MatchEvent[]>([])
const livePosts = ref<LivePost[]>([])
const links = ref<LiveLink[]>([])
const documents = ref<MatchDocument[]>([])
const result = ref<MatchResult | null>(null)
const activeTab = ref('events')

const eventVisible = ref(false)
const savingEvent = ref(false)
const editingEventId = ref('')
const editingEventVersion = ref(0)
const eventForm = reactive({
  eventType: 'GOAL',
  teamId: '',
  minute: 1,
  // 成员5 的事件接口只接受球员 ID；成员4 人员接口尚未提供，暂无姓名选择器。
  scorerAthleteId: '',
  ownGoal: false,
  athleteId: '',
  penaltyType: 'YELLOW_CARD',
  reason: '',
  outAthleteId: '',
  inAthleteId: '',
  note: '',
})

const postForm = reactive({ text: '', minute: 1 })
const postImages = ref<string[]>([])
const uploadingImage = ref(false)
const posting = ref(false)
const linkVisible = ref(false)
const linkForm = reactive({ title: '', url: '' })
const docVisible = ref(false)
const uploadingDoc = ref(false)
const docForm = reactive({ documentType: 'SIGN_IN', fileId: '', fileName: '' })
const resultForm = reactive({ resultType: 'NORMAL', manualHomeScore: 0, manualAwayScore: 0, reason: '' })
const savingResult = ref(false)

const eventTypeLabel: Record<string, string> = { GOAL: '进球', PENALTY: '判罚', SUBSTITUTION: '换人' }
const penaltyLabel: Record<string, string> = {
  YELLOW_CARD: '黄牌',
  RED_CARD: '红牌',
  PENALTY_KICK: '点球',
  OTHER: '其他',
}
const documentLabel: Record<string, string> = {
  SIGN_IN: '签到表',
  SIGNED_RECORD: '签字记录',
  REFEREE_REPORT: '裁判报告',
}

const sortedEvents = computed(() =>
  [...events.value].sort((a, b) => (a.minute || 0) - (b.minute || 0) || (a.createdAt || '').localeCompare(b.createdAt || '')),
)

// 后端要求比赛先进入 FINISHED，才允许发布赛果；结束比赛由记录台显式触发。
const canFinish = computed(() => ['SCHEDULED', 'LIVE'].includes(match.value?.status || ''))
const canPublishResult = computed(
  () => match.value?.status === 'FINISHED' && !result.value?.published,
)

/* 赛场大屏：把记录台切换为现场比分牌，便于边线/看台同步查看 */
const bigScreen = ref(false)

const liveMinute = computed(() => Math.max(0, ...events.value.map((event) => event.minute || 0)))

const latestEvents = computed(() => [...sortedEvents.value].slice(-5).reverse())

function teamTally(teamId?: string) {
  const own = events.value.filter((event) => event.teamId === teamId)
  return {
    goals: own.filter((event) => event.eventType === 'GOAL').length,
    yellow: own.filter((event) => event.eventType === 'PENALTY' && event.penaltyType === 'YELLOW_CARD').length,
    red: own.filter((event) => event.eventType === 'PENALTY' && event.penaltyType === 'RED_CARD').length,
    subs: own.filter((event) => event.eventType === 'SUBSTITUTION').length,
  }
}

const homeTally = computed(() => teamTally(match.value?.homeTeamId))
const awayTally = computed(() => teamTally(match.value?.awayTeamId))

function eventSummary(event: MatchEvent) {
  if (event.eventType === 'GOAL') {
    return `${event.scorerName || event.scorerAthleteId || '未知球员'} 进球${event.ownGoal ? '（乌龙）' : ''}`
  }
  if (event.eventType === 'PENALTY') {
    return `${event.athleteName || event.athleteId || '—'} ${penaltyLabel[event.penaltyType || 'OTHER']}`
  }
  return `${event.outAthleteName || event.outAthleteId || '—'} → ${event.inAthleteName || event.inAthleteId || '—'}`
}

function closeBigScreen() {
  bigScreen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !bigScreen.value) return
  // 事件/链接/文件弹窗打开时，Esc 交给弹窗处理，避免连大屏一起关掉。
  if (eventVisible.value || linkVisible.value || docVisible.value) return
  closeBigScreen()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

async function loadAll() {
  loading.value = true
  try {
    const [m, ev, posts, ls, docs, res] = await Promise.all([
      matchApi.get(matchId),
      matchApi.events(matchId, { page: 1, pageSize: 200 }),
      matchApi.livePosts(matchId, { page: 1, pageSize: 50 }),
      matchApi.liveLinks(matchId),
      matchApi.documents(matchId),
      matchApi.result(matchId),
    ])
    match.value = m
    events.value = ev.items
    livePosts.value = posts.items
    links.value = ls
    documents.value = docs.items
    result.value = res
    resultForm.resultType = res.resultType
    resultForm.manualHomeScore = res.homeScore
    resultForm.manualAwayScore = res.awayScore
    resultForm.reason = res.reason || ''
    if (!eventForm.teamId) eventForm.teamId = m.homeTeamId
  } catch {
    // 拦截器提示
  } finally {
    loading.value = false
  }
}

async function refreshMatch() {
  try {
    match.value = await matchApi.get(matchId)
    const ev = await matchApi.events(matchId, { page: 1, pageSize: 200 })
    events.value = ev.items
  } catch {
    // ignore
  }
}

function openEvent(type = 'GOAL', teamId?: string) {
  editingEventId.value = ''
  editingEventVersion.value = 0
  eventForm.eventType = type
  eventForm.teamId = teamId || match.value?.homeTeamId || ''
  eventForm.minute = 1
  eventForm.scorerAthleteId = ''
  eventForm.ownGoal = false
  eventForm.athleteId = ''
  eventForm.penaltyType = 'YELLOW_CARD'
  eventForm.reason = ''
  eventForm.outAthleteId = ''
  eventForm.inAthleteId = ''
  eventForm.note = ''
  eventVisible.value = true
}

function editEvent(event: MatchEvent) {
  editingEventId.value = event.id
  editingEventVersion.value = event.version
  eventForm.eventType = event.eventType
  eventForm.teamId = event.teamId || match.value?.homeTeamId || ''
  eventForm.minute = event.minute ?? 1
  eventForm.scorerAthleteId = event.scorerAthleteId || ''
  eventForm.ownGoal = Boolean(event.ownGoal)
  eventForm.athleteId = event.athleteId || ''
  eventForm.penaltyType = event.penaltyType || 'YELLOW_CARD'
  eventForm.reason = event.reason || ''
  eventForm.outAthleteId = event.outAthleteId || ''
  eventForm.inAthleteId = event.inAthleteId || ''
  eventForm.note = event.note || ''
  eventVisible.value = true
}

async function saveEvent() {
  if (!eventForm.teamId) return ElMessage.warning('请选择所属球队')
  if (eventForm.eventType === 'GOAL' && !eventForm.scorerAthleteId.trim()) {
    return ElMessage.warning('请填写进球球员 ID')
  }
  if (eventForm.eventType === 'PENALTY' && !eventForm.athleteId.trim()) {
    return ElMessage.warning('请填写判罚球员 ID')
  }
  if (eventForm.eventType === 'SUBSTITUTION' && (!eventForm.outAthleteId.trim() || !eventForm.inAthleteId.trim())) {
    return ElMessage.warning('请填写换下与换上球员 ID')
  }
  savingEvent.value = true
  try {
    if (editingEventId.value) {
      await matchApi.updateEvent(matchId, editingEventId.value, {
        ...eventForm,
        matchVersion: match.value?.version,
        version: editingEventVersion.value,
      })
      ElMessage.success('比赛事件已更新')
    } else {
      await matchApi.addEvent(matchId, { ...eventForm, matchVersion: match.value?.version })
      ElMessage.success('比赛事件已记录')
    }
    eventVisible.value = false
    await refreshMatch()
  } catch {
    // 拦截器提示
  } finally {
    savingEvent.value = false
  }
}

async function removeEvent(event: MatchEvent) {
  try {
    await ElMessageBox.confirm('删除该事件后将同步回退比分，确认删除？', '删除事件', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await matchApi.removeEvent(matchId, event.id, event.version, match.value?.version || 0)
    ElMessage.success('事件已删除')
    await refreshMatch()
  } catch {
    // 取消
  }
}

async function uploadLiveImage(options: UploadRequestOptions) {
  uploadingImage.value = true
  try {
    // 直播图片走成员2 文件接口，类别 CAPTURE_PHOTO，归属当前比赛。
    const record = await fileApi.upload(options.file, 'MATCH', matchId, 'CAPTURE_PHOTO')
    postImages.value.push(record.id)
    ElMessage.success('图片已上传，发布后生效')
  } catch {
    // 拦截器提示
  } finally {
    uploadingImage.value = false
  }
}

async function submitPost() {
  if (!postForm.text.trim()) return ElMessage.warning('请输入直播文字')
  posting.value = true
  try {
    await matchApi.addLivePost(matchId, {
      text: postForm.text,
      minute: postForm.minute,
      imageFileIds: [...postImages.value],
    })
    postForm.text = ''
    postImages.value = []
    const res = await matchApi.livePosts(matchId, { page: 1, pageSize: 50 })
    livePosts.value = res.items
    ElMessage.success('直播动态已发布')
  } catch {
    // 拦截器提示
  } finally {
    posting.value = false
  }
}

async function removePost(post: LivePost) {
  try {
    await ElMessageBox.confirm('确认删除该条图文直播？', '删除直播', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await matchApi.removeLivePost(matchId, post.id, post.version)
    livePosts.value = livePosts.value.filter((item) => item.id !== post.id)
    ElMessage.success('已删除')
  } catch {
    // 取消
  }
}

async function addLink() {
  if (!linkForm.title.trim() || !linkForm.url.trim()) return ElMessage.warning('请填写链接标题与地址')
  try {
    await matchApi.addLiveLink(matchId, { ...linkForm, enabled: true })
    linkForm.title = ''
    linkForm.url = ''
    linkVisible.value = false
    links.value = await matchApi.liveLinks(matchId)
    ElMessage.success('直播链接已添加')
  } catch {
    // 拦截器提示
  }
}

async function removeLink(link: LiveLink) {
  try {
    await matchApi.removeLiveLink(matchId, link.id, link.version)
    links.value = links.value.filter((item) => item.id !== link.id)
    ElMessage.success('链接已删除')
  } catch {
    // 拦截器提示
  }
}

function openDocument() {
  docForm.documentType = 'SIGN_IN'
  docForm.fileId = ''
  docForm.fileName = ''
  docVisible.value = true
}

async function uploadDoc(options: UploadRequestOptions) {
  uploadingDoc.value = true
  try {
    const record = await fileApi.upload(options.file, 'MATCH', matchId, 'MATCH_DOCUMENT')
    docForm.fileId = record.id
    docForm.fileName = record.originalName
    ElMessage.success('文件上传成功，请确认登记')
  } catch {
    // 拦截器提示
  } finally {
    uploadingDoc.value = false
  }
}

async function addDocument() {
  if (!docForm.fileId.trim()) return ElMessage.warning('请先上传比赛文件')
  try {
    await matchApi.addDocument(matchId, { documentType: docForm.documentType, fileId: docForm.fileId })
    docForm.fileId = ''
    docForm.fileName = ''
    docVisible.value = false
    documents.value = (await matchApi.documents(matchId)).items
    ElMessage.success('比赛文件已登记')
  } catch {
    // 拦截器提示
  }
}

async function downloadDocument(doc: MatchDocument) {
  if (!doc.fileId) return ElMessage.warning('文件编号缺失，无法下载')
  try {
    const downloaded = await fileApi.download(doc.fileId, doc.fileName)
    ElMessage.success(downloaded ? '文件已开始下载' : '演示环境已模拟下载，接入后端后将下载真实文件')
  } catch {
    // 拦截器提示
  }
}

async function finishMatch() {
  if (!match.value) return
  try {
    await ElMessageBox.confirm('确认比赛已经结束？结束后才能发布赛果。', '结束比赛', {
      confirmButtonText: '确认结束',
      cancelButtonText: '取消',
      type: 'warning',
    })
    match.value = await matchApi.update(matchId, {
      eventId: match.value.eventId,
      groupId: match.value.groupId,
      homeTeamId: match.value.homeTeamId,
      awayTeamId: match.value.awayTeamId,
      kickoffAt: match.value.kickoffAt,
      venue: match.value.venue || '',
      stage: match.value.stage || '',
      status: 'FINISHED',
      referees: match.value.referees || [],
      version: match.value.version,
    })
    ElMessage.success('比赛已结束，可以发布赛果')
    await loadAll()
  } catch {
    // 取消或接口错误由拦截器提示
  }
}

async function saveResult() {
  savingResult.value = true
  try {
    const normal = resultForm.resultType === 'NORMAL'
    result.value = await matchApi.saveResult(matchId, {
      version: match.value?.version,
      resultType: resultForm.resultType,
      // 常规赛果由进球事件派生，人工比分只在弃权/更正时提交。
      manualHomeScore: normal ? undefined : resultForm.manualHomeScore,
      manualAwayScore: normal ? undefined : resultForm.manualAwayScore,
      reason: resultForm.reason,
    })
    ElMessage.success(normal ? '赛果已按进球事件重新计算' : '赛果已保存')
    await refreshMatch()
  } catch {
    // 拦截器提示
  } finally {
    savingResult.value = false
  }
}

async function publishResult() {
  if (match.value?.status !== 'FINISHED') {
    ElMessage.warning('请先结束比赛，再发布赛果')
    return
  }
  try {
    await ElMessageBox.confirm('发布赛果后将同步至门户与射手榜。', '发布赛果', {
      confirmButtonText: '确认发布',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await matchApi.publishResult(matchId, match.value?.version || 0)
    ElMessage.success('赛果已发布')
    await loadAll()
  } catch {
    // 取消
  }
}

onMounted(loadAll)
</script>

<template>
  <div v-loading="loading" class="page console-page">
    <PageHeader
      title="比赛记录台"
      description="记录员操作界面。事件提交后实时更新比分，发布的图文直播将同步展示在门户赛事详情页。"
      show-back
    >
      <template #actions>
        <el-button :icon="FullScreen" @click="bigScreen = true">赛场大屏</el-button>
        <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
        <el-button
          type="primary"
          plain
          :icon="VideoCamera"
          @click="router.push({ name: 'portal-match-detail', params: { id: matchId }, query: { preview: '1' } })"
        >
          门户预览
        </el-button>
      </template>
    </PageHeader>

    <Transition name="bigscreen">
      <div v-if="bigScreen && match" class="bigscreen">
        <div class="bigscreen__pitch" aria-hidden="true">
          <span class="pitch-line pitch-line--halfway" />
          <span class="pitch-line pitch-line--circle" />
          <span class="pitch-line pitch-line--box-left" />
          <span class="pitch-line pitch-line--box-right" />
        </div>

        <header class="bigscreen__top">
          <div class="bigscreen__competition">
            <span>{{ match.eventName }}</span>
            <small>{{ match.groupName }} · {{ match.stage || '小组赛' }} · {{ match.venue }}</small>
          </div>
          <div class="bigscreen__status" :class="{ 'is-live': match.status === 'LIVE' }">
            <span v-if="match.status === 'LIVE'" class="live-dot" />
            <template v-if="match.status === 'LIVE'">进行中 · <b class="num">{{ liveMinute }}′</b></template>
            <template v-else-if="match.status === 'FINISHED'">全场结束</template>
            <template v-else>尚未开赛</template>
          </div>
          <button type="button" class="bigscreen__close" @click="closeBigScreen">
            <el-icon><Close /></el-icon>
            退出大屏 <kbd>ESC</kbd>
          </button>
        </header>

        <main class="bigscreen__stage">
          <section class="bigscreen__team">
            <span class="bigscreen__badge">{{ match.homeTeamName.slice(0, 1) }}</span>
            <h2>{{ match.homeTeamName }}</h2>
            <div class="bigscreen__tally">
              <span><i class="tally tally--goal" />进球 <b class="num">{{ homeTally.goals }}</b></span>
              <span><i class="tally tally--yellow" />黄牌 <b class="num">{{ homeTally.yellow }}</b></span>
              <span><i class="tally tally--red" />红牌 <b class="num">{{ homeTally.red }}</b></span>
            </div>
          </section>

          <section class="bigscreen__score">
            <div class="bigscreen__nums num">
              <span>{{ match.homeScore ?? 0 }}</span>
              <i>:</i>
              <span>{{ match.awayScore ?? 0 }}</span>
            </div>
            <small>{{ dayjs(match.kickoffAt).format('MM-DD HH:mm') }} 开球</small>
            <span class="bigscreen__board-line" />
          </section>

          <section class="bigscreen__team bigscreen__team--away">
            <span class="bigscreen__badge">{{ match.awayTeamName.slice(0, 1) }}</span>
            <h2>{{ match.awayTeamName }}</h2>
            <div class="bigscreen__tally">
              <span><i class="tally tally--goal" />进球 <b class="num">{{ awayTally.goals }}</b></span>
              <span><i class="tally tally--yellow" />黄牌 <b class="num">{{ awayTally.yellow }}</b></span>
              <span><i class="tally tally--red" />红牌 <b class="num">{{ awayTally.red }}</b></span>
            </div>
          </section>
        </main>

        <section class="bigscreen__bottom">
          <div class="bigscreen__events">
            <span class="bigscreen__eyebrow">最新事件</span>
            <div
              v-for="event in latestEvents"
              :key="event.id"
              class="bigscreen__event"
            >
              <b class="num">{{ event.minute }}′</b>
              <i class="bigscreen__event-dot" :class="`is-${event.eventType.toLowerCase()}`" />
              <span>{{ eventSummary(event) }}</span>
              <small>{{ event.teamName }}</small>
            </div>
            <p v-if="!latestEvents.length" class="bigscreen__empty">等待记录首个比赛事件…</p>
          </div>

          <div class="bigscreen__actions">
            <span class="bigscreen__eyebrow">快捷记录</span>
            <div>
              <el-button type="primary" :icon="Plus" @click="openEvent('GOAL', match.homeTeamId)">
                {{ match.homeTeamName }} 进球
              </el-button>
              <el-button :icon="Plus" @click="openEvent('GOAL', match.awayTeamId)">
                {{ match.awayTeamName }} 进球
              </el-button>
              <el-button @click="openEvent('PENALTY')">判罚</el-button>
              <el-button @click="openEvent('SUBSTITUTION')">换人</el-button>
            </div>
          </div>
        </section>
      </div>
    </Transition>

    <section v-if="match" class="scoreboard">
      <div class="scoreboard__meta">
        <span>{{ match.eventName }} · {{ match.groupName }} · {{ match.stage || '小组赛' }}</span>
        <span>{{ dayjs(match.kickoffAt).format('YYYY-MM-DD HH:mm') }} · {{ match.venue }}</span>
      </div>
      <div class="scoreboard__main">
        <div class="team team--home">
          <span class="team__badge">{{ match.homeTeamName.slice(0, 1) }}</span>
          <strong>{{ match.homeTeamName }}</strong>
        </div>
        <div class="score">
          <div class="score__nums num">
            <span>{{ match.homeScore ?? 0 }}</span>
            <i>:</i>
            <span>{{ match.awayScore ?? 0 }}</span>
          </div>
          <StatusTag :status="match.status" kind="match" />
        </div>
        <div class="team team--away">
          <span class="team__badge">{{ match.awayTeamName.slice(0, 1) }}</span>
          <strong>{{ match.awayTeamName }}</strong>
        </div>
      </div>
      <div class="scoreboard__quick">
        <el-button type="primary" :icon="Plus" @click="openEvent('GOAL', match.homeTeamId)">
          {{ match.homeTeamName }} 进球
        </el-button>
        <el-button :icon="Plus" @click="openEvent('GOAL', match.awayTeamId)">
          {{ match.awayTeamName }} 进球
        </el-button>
        <el-button plain @click="openEvent('PENALTY')">记录判罚</el-button>
        <el-button plain @click="openEvent('SUBSTITUTION')">记录换人</el-button>
      </div>
    </section>

    <section v-if="match" class="page-card console-card">
      <el-tabs v-model="activeTab">
        <el-tab-pane name="events">
          <template #label>
            <span class="tab-label"><el-icon><Trophy /></el-icon>比赛事件 <b>{{ events.length }}</b></span>
          </template>
          <div class="timeline">
            <div v-for="(event, index) in sortedEvents" :key="event.id" class="timeline-row">
              <div class="timeline-row__minute num">{{ event.minute }}′</div>
              <div class="timeline-row__line">
                <span class="timeline-row__dot" :class="`is-${event.eventType.toLowerCase()}`" />
              </div>
              <div class="timeline-row__body">
                <div class="timeline-row__head">
                  <strong>{{ eventTypeLabel[event.eventType] }}</strong>
                  <el-tag v-if="event.eventType === 'PENALTY'" size="small" effect="plain">
                    {{ penaltyLabel[event.penaltyType || 'OTHER'] }}
                  </el-tag>
                  <span class="muted">{{ event.teamName }}</span>
                  <span class="timeline-row__no">#{{ index + 1 }}</span>
                </div>
                <p v-if="event.eventType === 'GOAL'">
                  {{ event.scorerName || event.scorerAthleteId || '未填写球员' }}
                  <span v-if="event.ownGoal" class="own-goal">（乌龙球）</span>
                </p>
                <p v-else-if="event.eventType === 'PENALTY'">
                  {{ event.athleteName || event.athleteId || '—' }}<template v-if="event.reason"> · {{ event.reason }}</template>
                </p>
                <p v-else>
                  {{ event.outAthleteName || event.outAthleteId || '—' }} <span class="muted">换下</span>
                  {{ event.inAthleteName || event.inAthleteId || '—' }} <span class="muted">换上</span>
                </p>
                <small v-if="event.note">{{ event.note }}</small>
              </div>
              <div class="timeline-row__actions">
                <el-button link type="primary" :icon="Edit" @click="editEvent(event)">编辑</el-button>
                <el-button link type="danger" :icon="Delete" @click="removeEvent(event)">删除</el-button>
              </div>
            </div>
            <el-empty v-if="!sortedEvents.length" description="尚未记录比赛事件" :image-size="80" />
          </div>
        </el-tab-pane>

        <el-tab-pane name="live">
          <template #label>
            <span class="tab-label"><el-icon><VideoCamera /></el-icon>图文直播 <b>{{ livePosts.length }}</b></span>
          </template>
          <div class="post-composer">
            <div class="post-composer__row">
              <el-input-number v-model="postForm.minute" :min="0" :max="130" controls-position="right" />
              <span class="muted">分钟</span>
              <el-upload
                :show-file-list="false"
                :http-request="uploadLiveImage"
                accept="image/jpeg,image/png"
              >
                <el-button size="small" plain :icon="UploadFilled" :loading="uploadingImage">
                  现场图片
                </el-button>
              </el-upload>
              <span v-if="postImages.length" class="muted">已上传 {{ postImages.length }} 张</span>
              <span class="post-composer__spacer" />
              <el-button type="primary" :loading="posting" @click="submitPost">发布直播</el-button>
            </div>
            <el-input
              v-model="postForm.text"
              type="textarea"
              :rows="3"
              maxlength="300"
              show-word-limit
              placeholder="例如：主队 10 号球员禁区外远射破门，比分改写为 1:0。"
            />
          </div>
          <div class="live-list">
            <div v-for="post in livePosts" :key="post.id" class="live-item">
              <span class="live-item__minute num">{{ post.minute ? `${post.minute}′` : '—' }}</span>
              <div class="live-item__body">
                <p>{{ post.text }}</p>
                <div v-if="post.imageUrls?.length" class="live-item__images">
                  <img v-for="url in post.imageUrls" :key="url" :src="url" alt="直播图片" />
                </div>
                <small v-else-if="post.imageFileIds?.length" class="muted">
                  附图 {{ post.imageFileIds.length }} 张（门户展示）
                </small>
                <small>{{ dayjs(post.createdAt).format('HH:mm:ss') }}</small>
              </div>
              <el-button link type="danger" :icon="Delete" @click="removePost(post)" />
            </div>
            <el-empty v-if="!livePosts.length" description="暂无图文直播" :image-size="80" />
          </div>
        </el-tab-pane>

        <el-tab-pane name="links">
          <template #label>
            <span class="tab-label"><el-icon><Link /></el-icon>直播链接 <b>{{ links.length }}</b></span>
          </template>
          <div class="panel-toolbar">
            <p class="muted">配置视频直播、数据直播等外链，启用后展示在门户比赛详情页。</p>
            <el-button type="primary" plain :icon="Plus" @click="linkVisible = true">添加链接</el-button>
          </div>
          <el-table :data="links" style="width: 100%">
            <el-table-column prop="title" label="链接标题" min-width="180" />
            <el-table-column prop="url" label="链接地址" min-width="300" show-overflow-tooltip />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="plain">
                  {{ row.enabled ? '已启用' : '已停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="right">
              <template #default="{ row }">
                <el-button link type="danger" :icon="Delete" @click="removeLink(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!links.length" description="暂无直播链接" :image-size="80" />
        </el-tab-pane>

        <el-tab-pane name="documents">
          <template #label>
            <span class="tab-label"><el-icon><Document /></el-icon>比赛文件 <b>{{ documents.length }}</b></span>
          </template>
          <div class="panel-toolbar">
            <p class="muted">上传签到表、签字记录与裁判报告，文件将归档至比赛记录。</p>
            <el-button type="primary" plain :icon="Plus" @click="openDocument">上传文件</el-button>
          </div>
          <el-table :data="documents" style="width: 100%">
            <el-table-column label="文件类型" width="140">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ documentLabel[row.documentType] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="fileName" label="文件名" min-width="240" />
            <el-table-column label="登记时间" width="180">
              <template #default="{ row }">{{ dayjs(row.createdAt).format('YYYY-MM-DD HH:mm') }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="downloadDocument(row)">下载</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!documents.length" description="暂无比赛文件" :image-size="80" />
        </el-tab-pane>

        <el-tab-pane name="result">
          <template #label>
            <span class="tab-label"><el-icon><CircleCheck /></el-icon>赛果确认</span>
          </template>
          <div class="result-grid">
            <div class="result-form">
              <el-form label-position="top">
                <el-form-item label="赛果类型">
                  <el-radio-group v-model="resultForm.resultType">
                    <el-radio-button value="NORMAL">常规赛果</el-radio-button>
                    <el-radio-button value="FORFEIT">弃权</el-radio-button>
                    <el-radio-button value="ADMIN_CORRECTION">人工更正</el-radio-button>
                  </el-radio-group>
                </el-form-item>
                <div class="result-score">
                  <el-form-item :label="match.homeTeamName">
                    <el-input-number
                      v-model="resultForm.manualHomeScore"
                      :min="0"
                      :max="99"
                      :disabled="resultForm.resultType === 'NORMAL'"
                    />
                  </el-form-item>
                  <span class="result-score__sep">:</span>
                  <el-form-item :label="match.awayTeamName">
                    <el-input-number
                      v-model="resultForm.manualAwayScore"
                      :min="0"
                      :max="99"
                      :disabled="resultForm.resultType === 'NORMAL'"
                    />
                  </el-form-item>
                </div>
                <p v-if="resultForm.resultType === 'NORMAL'" class="result-hint">
                  常规赛果由进球事件自动计算；如需人工改判，请选择弃权或人工更正。
                </p>
                <el-form-item label="更正原因 / 说明">
                  <el-input
                    v-model="resultForm.reason"
                    type="textarea"
                    :rows="3"
                    placeholder="常规赛果可留空；弃权或人工更正请说明原因"
                  />
                </el-form-item>
                <div class="result-actions">
                  <el-button :loading="savingResult" @click="saveResult">保存赛果</el-button>
                  <el-button v-if="canFinish" type="primary" plain @click="finishMatch">结束比赛</el-button>
                  <el-button v-if="canPublishResult" type="primary" @click="publishResult">
                    发布赛果
                  </el-button>
                  <el-tag v-if="result?.published" type="success" effect="plain" size="large">
                    赛果已发布 · 第 {{ result.sourceScoreRevision }} 版
                  </el-tag>
                </div>
                <p v-if="!result?.published && match.status !== 'FINISHED'" class="result-hint">
                  比赛尚未结束，结束比赛后才能发布赛果。
                </p>
              </el-form>
            </div>
            <aside class="result-side">
              <div class="result-side__icon"><el-icon :size="22"><Timer /></el-icon></div>
              <h3>发布前请确认</h3>
              <ul>
                <li>比赛事件与比分一致，无遗漏的进球或乌龙球。</li>
                <li>弃权、罢赛等特殊情况需附裁判报告。</li>
                <li>发布后赛果进入门户与射手榜统计。</li>
                <li>如需更正，请使用人工更正并保留原因。</li>
              </ul>
            </aside>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog v-model="eventVisible" :title="editingEventId ? '编辑比赛事件' : '记录比赛事件'" width="560px">
      <el-form :model="eventForm" label-position="top">
        <el-form-item label="事件类型">
          <el-radio-group v-model="eventForm.eventType">
            <el-radio-button value="GOAL">进球</el-radio-button>
            <el-radio-button value="PENALTY">判罚</el-radio-button>
            <el-radio-button value="SUBSTITUTION">换人</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="所属球队">
          <el-select v-model="eventForm.teamId" style="width: 100%">
            <el-option :label="match?.homeTeamName || '主队'" :value="match?.homeTeamId || ''" />
            <el-option :label="match?.awayTeamName || '客队'" :value="match?.awayTeamId || ''" />
          </el-select>
        </el-form-item>
        <el-form-item label="比赛分钟">
          <el-input-number v-model="eventForm.minute" :min="0" :max="130" controls-position="right" />
        </el-form-item>

        <template v-if="eventForm.eventType === 'GOAL'">
          <el-form-item label="进球球员 ID">
            <el-input v-model="eventForm.scorerAthleteId" placeholder="输入成员4 运动员档案 ID" />
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="eventForm.ownGoal">该进球为乌龙球</el-checkbox>
          </el-form-item>
        </template>

        <template v-else-if="eventForm.eventType === 'PENALTY'">
          <el-form-item label="判罚类型">
            <el-select v-model="eventForm.penaltyType" style="width: 100%">
              <el-option label="黄牌" value="YELLOW_CARD" />
              <el-option label="红牌" value="RED_CARD" />
              <el-option label="点球" value="PENALTY_KICK" />
              <el-option label="其他" value="OTHER" />
            </el-select>
          </el-form-item>
          <el-form-item label="球员 ID">
            <el-input v-model="eventForm.athleteId" placeholder="输入成员4 运动员档案 ID" />
          </el-form-item>
          <el-form-item label="判罚原因">
            <el-input v-model="eventForm.reason" placeholder="如：战术犯规" />
          </el-form-item>
        </template>

        <template v-else>
          <div class="form-grid">
            <el-form-item label="换下球员 ID">
              <el-input v-model="eventForm.outAthleteId" placeholder="成员4 档案 ID" />
            </el-form-item>
            <el-form-item label="换上球员 ID">
              <el-input v-model="eventForm.inAthleteId" placeholder="成员4 档案 ID" />
            </el-form-item>
          </div>
        </template>

        <el-form-item label="备注">
          <el-input v-model="eventForm.note" placeholder="选填，如助攻球员、伤停补时等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="eventVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingEvent" @click="saveEvent">
          {{ editingEventId ? '保存修改' : '提交事件' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="linkVisible" title="添加直播链接" width="480px">
      <el-form :model="linkForm" label-position="top">
        <el-form-item label="链接标题">
          <el-input v-model="linkForm.title" placeholder="如：视频直播（咪咕体育）" />
        </el-form-item>
        <el-form-item label="链接地址">
          <el-input v-model="linkForm.url" placeholder="https://" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="linkVisible = false">取消</el-button>
        <el-button type="primary" @click="addLink">添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="docVisible" title="上传比赛文件" width="520px">
      <el-form :model="docForm" label-position="top">
        <el-form-item label="文件类型">
          <el-select v-model="docForm.documentType" style="width: 100%">
            <el-option label="签到表" value="SIGN_IN" />
            <el-option label="签字记录" value="SIGNED_RECORD" />
            <el-option label="裁判报告" value="REFEREE_REPORT" />
          </el-select>
        </el-form-item>
        <el-form-item label="文件">
          <el-upload
            class="doc-uploader"
            drag
            :show-file-list="false"
            :http-request="uploadDoc"
            accept=".pdf,.jpg,.jpeg,.png"
          >
            <el-icon class="doc-uploader__icon"><UploadFilled /></el-icon>
            <div v-if="docForm.fileName" class="doc-uploader__file">
              已上传：<strong>{{ docForm.fileName }}</strong>（点击可重新上传）
            </div>
            <template v-else>
              <div class="doc-uploader__text">将文件拖到此处，或<em>点击上传</em></div>
              <div class="doc-uploader__hint">支持 PDF、JPG、PNG 扫描件</div>
            </template>
          </el-upload>
          <span v-if="uploadingDoc" class="muted">文件上传中…</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="docVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploadingDoc" @click="addDocument">保存登记</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.console-page {
  max-width: 1180px;
}

.scoreboard {
  padding: 20px 24px 18px;
  border: 1px solid #13291f;
  border-radius: 10px;
  background: var(--scoreboard);
  color: #fff;
}

.scoreboard__meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.48);
}

.scoreboard__main {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 24px;
  padding: 18px 0 20px;
}

.team {
  display: flex;
  align-items: center;
  gap: 12px;
}

.team--away {
  flex-direction: row-reverse;
  text-align: right;
}

.team__badge {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.team strong {
  font-size: 16px;
}

.score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.score__nums {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 40px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.score__nums i {
  font-style: normal;
  font-size: 26px;
  color: rgba(255, 255, 255, 0.4);
}

.scoreboard__quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
}

.scoreboard__quick :deep(.el-button) {
  --el-button-bg-color: rgba(255, 255, 255, 0.08);
  --el-button-border-color: rgba(255, 255, 255, 0.16);
  --el-button-text-color: #fff;
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.14);
  --el-button-hover-border-color: rgba(255, 255, 255, 0.3);
  --el-button-hover-text-color: #fff;
}

.scoreboard__quick :deep(.el-button--primary) {
  --el-button-bg-color: var(--lime);
  --el-button-border-color: var(--lime);
  --el-button-text-color: #1c2a10;
  --el-button-hover-bg-color: #d9f78d;
  --el-button-hover-border-color: #d9f78d;
  --el-button-hover-text-color: #1c2a10;
}

/* ===== 赛场大屏 ===== */
.bigscreen {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  flex-direction: column;
  padding: 26px 40px 30px;
  overflow: auto;
  color: #fff;
  background:
    radial-gradient(ellipse at 50% -10%, rgba(200, 241, 105, 0.16), transparent 55%),
    linear-gradient(160deg, #04150e 0%, #06281c 48%, #04150e 100%);
}

.bigscreen__pitch {
  position: absolute;
  inset: 24px;
  border: 1px solid rgba(200, 241, 105, 0.14);
  border-radius: 4px;
  pointer-events: none;
}

.pitch-line {
  position: absolute;
  border: 1px solid rgba(200, 241, 105, 0.12);
}

.pitch-line--halfway {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 0;
  border-width: 0 0 0 1px;
}

.pitch-line--circle {
  top: 50%;
  left: 50%;
  width: 190px;
  height: 190px;
  margin: -95px 0 0 -95px;
  border-radius: 50%;
}

.pitch-line--box-left,
.pitch-line--box-right {
  top: 50%;
  width: 86px;
  height: 240px;
  margin-top: -120px;
}

.pitch-line--box-left {
  left: -1px;
  border-left: none;
}

.pitch-line--box-right {
  right: -1px;
  border-right: none;
}

.bigscreen__top {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.bigscreen__competition {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.bigscreen__competition span {
  font-size: 13px;
  font-weight: 600;
}

.bigscreen__competition small {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.42);
}

.bigscreen__status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.66);
}

.bigscreen__status.is-live {
  border-color: rgba(239, 91, 87, 0.5);
  background: rgba(239, 91, 87, 0.12);
  color: #ffb3b0;
}

.bigscreen__status b {
  font-size: 13px;
  color: inherit;
}

.bigscreen__close {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  cursor: pointer;
}

.bigscreen__close:hover {
  border-color: rgba(200, 241, 105, 0.5);
  color: var(--lime);
}

.bigscreen__close kbd {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  font-family: inherit;
  font-size: 8.5px;
}

.bigscreen__stage {
  position: relative;
  flex: 1;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 30px;
  padding: 36px 4%;
  min-height: 300px;
}

.bigscreen__team {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  text-align: right;
}

.bigscreen__team--away {
  align-items: flex-start;
  text-align: left;
}

.bigscreen__badge {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border: 1px solid rgba(200, 241, 105, 0.28);
  border-radius: var(--radius-md);
  background: rgba(200, 241, 105, 0.08);
  color: var(--lime);
  font-size: 24px;
  font-weight: 700;
}

.bigscreen__team h2 {
  font-size: clamp(20px, 3.2vw, 40px);
  line-height: 1.2;
  letter-spacing: 0.02em;
}

.bigscreen__tally {
  display: flex;
  gap: 16px;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.46);
}

.bigscreen__tally span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.bigscreen__tally b {
  color: #fff;
  font-size: 13px;
}

.tally {
  width: 7px;
  height: 9px;
  border-radius: 1.5px;
}

.tally--goal {
  background: var(--lime);
}

.tally--yellow {
  background: #f2c94c;
}

.tally--red {
  background: #ef5b57;
}

.bigscreen__score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 280px;
}

.bigscreen__nums {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: clamp(64px, 12vw, 132px);
  font-weight: 800;
  line-height: 0.95;
  letter-spacing: 0.02em;
  color: #fff;
  text-shadow: 0 0 46px rgba(200, 241, 105, 0.18);
}

.bigscreen__nums i {
  font-style: normal;
  font-size: 0.45em;
  color: rgba(255, 255, 255, 0.26);
}

.bigscreen__score small {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.42);
}

.bigscreen__board-line {
  width: 90px;
  height: 2px;
  background: rgba(200, 241, 105, 0.55);
}

.bigscreen__bottom {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 32px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.bigscreen__eyebrow {
  display: block;
  margin-bottom: 9px;
  font-size: 10.5px;
  font-weight: 600;
  color: rgba(200, 241, 105, 0.72);
}

.bigscreen__events {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-width: 640px;
}

.bigscreen__event {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.76);
}

.bigscreen__event b {
  width: 32px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--lime);
}

.bigscreen__event small {
  margin-left: auto;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.32);
}

.bigscreen__event-dot {
  width: 6px;
  height: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--lime);
}

.bigscreen__event-dot.is-penalty {
  background: #f2c94c;
}

.bigscreen__event-dot.is-substitution {
  background: #8db4f0;
}

.bigscreen__empty {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.3);
}

.bigscreen__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.bigscreen__actions > div {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.bigscreen__actions :deep(.el-button) {
  --el-button-bg-color: rgba(255, 255, 255, 0.06);
  --el-button-border-color: rgba(255, 255, 255, 0.16);
  --el-button-text-color: #fff;
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.14);
  --el-button-hover-border-color: rgba(255, 255, 255, 0.3);
  --el-button-hover-text-color: #fff;
}

.bigscreen__actions :deep(.el-button--primary) {
  --el-button-bg-color: var(--lime);
  --el-button-border-color: var(--lime);
  --el-button-text-color: #1c2a10;
  --el-button-hover-bg-color: #d9f78d;
  --el-button-hover-border-color: #d9f78d;
  --el-button-hover-text-color: #1c2a10;
}

.bigscreen-enter-active,
.bigscreen-leave-active {
  transition: opacity 0.22s ease;
}

.bigscreen-enter-from,
.bigscreen-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .bigscreen {
    padding: 18px 16px;
  }

  .bigscreen__top {
    grid-template-columns: 1fr auto;
  }

  .bigscreen__competition {
    order: 1;
  }

  .bigscreen__close {
    order: 2;
  }

  .bigscreen__status {
    order: 3;
    grid-column: 1 / -1;
    justify-self: start;
  }

  .bigscreen__stage {
    grid-template-columns: 1fr;
    gap: 18px;
    padding: 26px 0;
    text-align: center;
  }

  .bigscreen__team,
  .bigscreen__team--away {
    align-items: center;
    text-align: center;
  }

  .bigscreen__team h2 {
    font-size: 20px;
  }

  .bigscreen__tally {
    justify-content: center;
  }

  .bigscreen__nums {
    font-size: 72px;
  }

  .bigscreen__bottom {
    grid-template-columns: 1fr;
  }

  .bigscreen__actions {
    align-items: stretch;
  }

  .bigscreen__actions > div {
    justify-content: flex-start;
  }
}

.console-card {
  padding-top: 12px;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-label b {
  padding: 0 5px;
  border-radius: 3px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9.5px;
  font-weight: 700;
}

.timeline {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}

.timeline-row {
  display: grid;
  grid-template-columns: 54px 24px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: flex-start;
  padding: 9px 0;
}

.timeline-row__minute {
  padding-top: 1px;
  font-size: 14px;
  font-weight: 700;
  text-align: right;
  color: var(--brand-700);
}

.timeline-row__line {
  position: relative;
  display: flex;
  justify-content: center;
  align-self: stretch;
}

.timeline-row__line::after {
  content: '';
  position: absolute;
  top: 14px;
  bottom: -18px;
  width: 1px;
  background: var(--line);
}

.timeline-row:last-child .timeline-row__line::after {
  display: none;
}

.timeline-row__dot {
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--brand-500);
  box-shadow: 0 0 0 3px var(--brand-50);
  z-index: 1;
}

.timeline-row__dot.is-penalty {
  background: #e2a23f;
  box-shadow: 0 0 0 3px #fdf3e2;
}

.timeline-row__dot.is-substitution {
  background: #6b8cd1;
  box-shadow: 0 0 0 3px #eaf0fb;
}

.timeline-row__body p {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
}

.timeline-row__body small {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: var(--ink-300);
}

.timeline-row__head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.timeline-row__no {
  margin-left: auto;
  font-size: 9px;
  color: var(--ink-300);
}

.timeline-row__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}

.own-goal {
  color: #c07b3a;
}

.post-composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  background: var(--paper);
  margin-bottom: 16px;
}

.post-composer__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.post-composer__spacer {
  flex: 1;
}

.live-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.live-item {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 11px;
}

.live-item__minute {
  width: 42px;
  flex-shrink: 0;
  padding-top: 1px;
  font-size: 13px;
  font-weight: 700;
  color: var(--brand-700);
}

.live-item__body {
  flex: 1;
}

.live-item__body p {
  font-size: 12.5px;
  line-height: 1.75;
}

.live-item__body small {
  display: block;
  margin-top: 5px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.live-item__images {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.live-item__images img {
  width: 120px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0 14px;
}

.panel-toolbar p {
  font-size: 11px;
}

.result-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 26px;
  padding: 8px 0;
}

.result-score {
  display: flex;
  align-items: flex-end;
  gap: 14px;
}

.result-score__sep {
  padding-bottom: 12px;
  font-size: 22px;
  color: var(--ink-300);
}

.result-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.result-hint {
  margin: -2px 0 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-500);
}

.result-side {
  align-self: start;
  padding: 20px;
  border-radius: var(--radius-md);
  background: var(--paper);
  border: 1px solid var(--line);
}

.result-side__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.result-side h3 {
  margin-top: 12px;
  font-size: 14px;
}

.result-side ul {
  margin: 10px 0 0;
  padding-left: 16px;
}

.result-side li {
  font-size: 10.5px;
  line-height: 1.85;
  color: var(--ink-500);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
}

.doc-uploader {
  width: 100%;
}

.doc-uploader :deep(.el-upload-dragger) {
  padding: 22px 16px;
  border-color: var(--line);
  border-radius: 12px;
  background: var(--paper);
}

.doc-uploader__icon {
  font-size: 26px;
  color: var(--brand-500);
}

.doc-uploader__text {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-500);
}

.doc-uploader__text em {
  font-style: normal;
  color: var(--brand-700);
}

.doc-uploader__hint {
  margin-top: 5px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.doc-uploader__file {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-500);
}

.doc-uploader__file strong {
  color: var(--brand-700);
}

@media (max-width: 900px) {
  .result-grid {
    grid-template-columns: 1fr;
  }

  .scoreboard__meta {
    flex-direction: column;
    gap: 4px;
  }

  .scoreboard__main {
    gap: 10px;
  }

  .team {
    flex-direction: column;
    gap: 7px;
    text-align: center;
  }

  .team--away {
    flex-direction: column;
  }

  .team strong {
    font-size: 12.5px;
  }

  .score__nums {
    font-size: 30px;
  }
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .post-composer__row {
    flex-wrap: wrap;
  }
}
</style>
