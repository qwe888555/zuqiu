<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { Back, Calendar, Football, Location, Switch, VideoCamera, View, Warning } from '@element-plus/icons-vue'
import { matchApi, publicApi } from '../../api'
import type { LiveLink, LivePost, MatchEvent, PublicLivePost, PublicMatch } from '../../api/types'
import StatusTag from '../../components/common/StatusTag.vue'
import { matchDisplayStatus } from '../../utils/portal'

interface MatchDetail extends PublicMatch {
  events: MatchEvent[]
  referees?: { name: string; role: string; level?: string }[]
}

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const match = ref<MatchDetail | null>(null)
const liveFeed = ref<PublicLivePost[]>([])
const liveLinks = ref<LiveLink[]>([])
const activeTab = ref('events')
let timer: number | undefined

/** 管理端「门户预览」携带 preview=1，可查看尚未发布的比赛。 */
const previewMode = computed(() => route.query.preview === '1')
const published = ref(true)
/** 主动退出预览时跳过离开确认，避免「返回」按钮再次弹窗。 */
let bypassLeaveGuard = false

/**
 * 预览模式只能回到进入预览前的页面，不能在门户栏目之间跳转。
 * 返回控制台、登录页等门户之外的页面视为退出预览；浏览器后退也能正常使用。
 */
onBeforeRouteLeave((to) => {
  if (!previewMode.value || bypassLeaveGuard) return true
  if (to.matched[0]?.path !== '/') return true
  ElMessage.warning('预览模式仅支持返回上一页，请点击「退出预览」返回')
  return false
})

/** 预览结束返回来源页；直接打开预览链接时退回比赛管理。 */
function leavePreview() {
  bypassLeaveGuard = true
  if (router.options.history.state.back) {
    router.back()
  } else {
    router.push({ name: 'matches' })
  }
}

const displayStatus = computed(() => (match.value ? matchDisplayStatus(match.value) : ''))
const isLive = computed(() => displayStatus.value === 'LIVE')

const sortedEvents = computed(() =>
  [...(match.value?.events || [])].sort((a, b) => {
    const am = (a.minute || 0) * 100 + (a.stoppageMinute || 0)
    const bm = (b.minute || 0) * 100 + (b.stoppageMinute || 0)
    return bm - am
  }),
)

const briefText = computed(() => {
  const current = match.value
  if (!current) return ''
  const status = displayStatus.value
  if (status === 'SCHEDULED') {
    return `本场将于 ${dayjs(current.kickoffAt).format('MM月DD日 HH:mm')} 在 ${current.venue || '待定场地'} 进行。`
  }
  if (status === 'CANCELLED') {
    return '本场比赛已取消，后续安排以组委会通知为准。'
  }

  const score = `${current.homeTeamName} ${current.homeScore} : ${current.awayScore} ${current.awayTeamName}`
  const goals = sortedEvents.value
    .filter((event) => event.eventType === 'GOAL')
    .slice()
    .reverse()
    .slice(0, 5)
    .map((event) => `${event.minute} 分钟 ${event.scorerName || '球员'}${event.teamName ? `（${event.teamName}）` : ''}`)
    .join('；')

  if (status === 'LIVE') {
    return `比赛进行中，当前比分 ${score}。${goals ? `已记录进球：${goals}。` : ''}`
  }
  return `全场结束，${score}。${goals ? `进球记录：${goals}。` : ''}`
})

const eventIcon = (type: string) => {
  if (type === 'GOAL') return Football
  if (type === 'PENALTY') return Warning
  return Switch
}

const eventLabel = (event: MatchEvent) => {
  if (event.eventType === 'GOAL') return event.ownGoal ? '乌龙球' : '进球'
  if (event.eventType === 'PENALTY') {
    if (event.penaltyType === 'YELLOW_CARD') return '黄牌'
    if (event.penaltyType === 'RED_CARD') return '红牌'
    if (event.penaltyType === 'PENALTY_KICK') return '点球'
    return '判罚'
  }
  return '换人'
}

const eventPlayer = (event: MatchEvent) => {
  if (event.eventType === 'GOAL') return event.scorerName
  if (event.eventType === 'PENALTY') return event.athleteName
  return `${event.outAthleteName || '-'} → ${event.inAthleteName || '-'}`
}

function toPublicPosts(posts: LivePost[]): PublicLivePost[] {
  return posts.map((post) => ({
    id: post.id,
    text: post.text,
    imageUrls: post.imageUrls,
    minute: post.minute,
    updatedAt: post.createdAt,
  }))
}

/** 未发布比赛无法通过门户接口读取，预览时改走管理端接口。 */
async function loadPreviewDetail(id: string): Promise<boolean> {
  try {
    const [detail, events, posts, links] = await Promise.all([
      matchApi.get(id),
      matchApi.events(id, { page: 1, pageSize: 200 }),
      matchApi.livePosts(id, { page: 1, pageSize: 200 }),
      matchApi.liveLinks(id),
    ])
    published.value = detail.published
    match.value = {
      ...detail,
      homeScore: detail.homeScore ?? 0,
      awayScore: detail.awayScore ?? 0,
      events: events.items,
    }
    liveFeed.value = toPublicPosts(posts.items)
    liveLinks.value = links
    return true
  } catch {
    return false
  }
}

async function load() {
  const id = String(route.params.id)
  loading.value = true
  try {
    if (previewMode.value) {
      if (!(await loadPreviewDetail(id))) match.value = null
      return
    }
    match.value = await publicApi.match(id)
    published.value = true
    const [feed, links] = await Promise.all([
      publicApi.liveFeed(id),
      publicApi.liveLinks(id),
    ])
    liveFeed.value = feed.items
    liveLinks.value = links
  } catch {
    match.value = null
  } finally {
    loading.value = false
  }
}

async function refreshLive() {
  if (!match.value || !isLive.value) return
  try {
    if (previewMode.value) {
      const feed = await matchApi.livePosts(match.value.id, { page: 1, pageSize: 200 })
      liveFeed.value = toPublicPosts(feed.items)
      return
    }
    const feed = await publicApi.liveFeed(match.value.id)
    liveFeed.value = feed.items
  } catch {
    // 静默刷新失败不打断阅读
  }
}

onMounted(async () => {
  await load()
  timer = window.setInterval(refreshLive, 20000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

watch(() => route.params.id, load)
</script>

<template>
  <div class="match-detail" v-loading="loading">
    <div v-if="previewMode" class="preview-banner">
      <span class="preview-banner__text">
        <el-icon><View /></el-icon>
        {{ published ? '内部预览模式，页面效果与门户展示一致。' : '内部预览模式：该场比赛尚未发布到门户，访客暂时看不到。' }}
      </span>
      <el-button size="small" type="primary" plain :icon="Back" @click="leavePreview">退出预览</el-button>
    </div>
    <template v-if="match">
      <section class="scoreboard">
        <div class="container">
          <nav class="crumbs" aria-label="面包屑">
            <router-link to="/">首页</router-link>
            <span>/</span>
            <router-link to="/matches">赛程与比分</router-link>
            <span>/</span>
            <span class="crumbs__current">{{ match.homeTeamName }} vs {{ match.awayTeamName }}</span>
          </nav>

          <div class="scoreboard__meta">
            <span class="group-pill">{{ match.groupName }}</span>
            <StatusTag :status="displayStatus" kind="match" size="default" />
            <span class="scoreboard__event">{{ match.eventName }}</span>
          </div>

          <div class="scoreboard__main">
            <div class="side side--home">
              <span class="side__badge">{{ match.homeTeamName.slice(0, 1) }}</span>
              <strong>{{ match.homeTeamName }}</strong>
              <small>主队</small>
            </div>

            <div class="score">
              <div class="score__nums">
                <span class="num">{{ displayStatus === 'SCHEDULED' || displayStatus === 'CANCELLED' ? '-' : match.homeScore }}</span>
                <i>:</i>
                <span class="num">{{ displayStatus === 'SCHEDULED' || displayStatus === 'CANCELLED' ? '-' : match.awayScore }}</span>
              </div>
              <span class="score__state">
                {{
                  displayStatus === 'SCHEDULED'
                    ? dayjs(match.kickoffAt).format('MM月DD日 HH:mm')
                    : displayStatus === 'LIVE'
                      ? '比赛进行中'
                      : displayStatus === 'CANCELLED'
                        ? '比赛已取消'
                        : '全场结束'
                }}
              </span>
              <span v-if="match.scoreRevision" class="score__revision">数据版本 {{ match.scoreRevision }}</span>
            </div>

            <div class="side side--away">
              <span class="side__badge side__badge--away">{{ match.awayTeamName.slice(0, 1) }}</span>
              <strong>{{ match.awayTeamName }}</strong>
              <small>客队</small>
            </div>
          </div>

          <div class="scoreboard__info">
            <span><el-icon><Calendar /></el-icon>{{ dayjs(match.kickoffAt).format('YYYY年MM月DD日 HH:mm') }}</span>
            <span><el-icon><Location /></el-icon>{{ match.venue }}</span>
            <span v-if="isLive" class="live-refresh">每 20 秒自动刷新</span>
          </div>
        </div>
      </section>

      <div class="container detail-body">
        <div class="detail-main">
          <div class="tab-bar">
            <button type="button" :class="{ 'is-active': activeTab === 'events' }" @click="activeTab = 'events'">
              赛况事件
            </button>
            <button type="button" :class="{ 'is-active': activeTab === 'live' }" @click="activeTab = 'live'">
              图文直播
              <span v-if="isLive" class="tab-live-dot" />
            </button>
            <button type="button" :class="{ 'is-active': activeTab === 'info' }" @click="activeTab = 'info'">
              比赛信息
            </button>
          </div>

          <div v-show="activeTab === 'events'" class="panel">
            <div v-if="briefText" class="match-brief">
              <div class="match-brief__head">
                <span>赛况速览</span>
                <small>根据已记录的比赛事件自动整理</small>
              </div>
              <p>{{ briefText }}</p>
            </div>

            <div v-if="sortedEvents.length" class="timeline">
              <div v-for="event in sortedEvents" :key="event.id" class="event-row">
                <span class="event-row__minute">
                  <strong class="num">
                    {{ event.minute }}<template v-if="event.stoppageMinute">+{{ event.stoppageMinute }}</template>
                  </strong>
                  <small>分钟</small>
                </span>
                <span class="event-row__icon" :class="`type-${event.eventType.toLowerCase()}`">
                  <el-icon :size="14"><component :is="eventIcon(event.eventType)" /></el-icon>
                </span>
                <div class="event-row__body">
                  <div class="event-row__line">
                    <strong>{{ eventPlayer(event) }}</strong>
                    <span class="event-row__type">{{ eventLabel(event) }}</span>
                  </div>
                  <span class="event-row__team">{{ event.teamName }}</span>
                  <p v-if="event.reason" class="event-row__note">{{ event.reason }}</p>
                </div>
                <span
                  class="event-row__side"
                  :class="{ 'is-away': event.teamName === match.awayTeamName }"
                >
                  {{ event.teamName === match.homeTeamName ? '主队' : '客队' }}
                </span>
              </div>
            </div>
            <el-empty v-else description="暂无比赛事件" :image-size="90" />
          </div>

          <div v-show="activeTab === 'live'" class="panel">
            <div v-if="liveFeed.length" class="live-feed">
              <article v-for="post in liveFeed" :key="post.id" class="live-post">
                <span class="live-post__minute num">{{ post.minute }}'</span>
                <div class="live-post__body">
                  <p>{{ post.text }}</p>
                  <div v-if="post.imageUrls?.length" class="live-post__images">
                    <img v-for="img in post.imageUrls" :key="img" :src="img" alt="赛场图片" />
                  </div>
                  <span class="live-post__time">{{ dayjs(post.updatedAt).format('HH:mm') }}</span>
                </div>
              </article>
            </div>
            <el-empty v-else description="暂无图文直播" :image-size="90" />
          </div>

          <div v-show="activeTab === 'info'" class="panel">
            <div class="info-grid">
              <div class="info-item">
                <span>赛事</span>
                <strong>{{ match.eventName }}</strong>
              </div>
              <div class="info-item">
                <span>组别</span>
                <strong>{{ match.groupName }}</strong>
              </div>
              <div class="info-item">
                <span>开球时间</span>
                <strong>{{ dayjs(match.kickoffAt).format('YYYY-MM-DD HH:mm') }}</strong>
              </div>
              <div class="info-item">
                <span>比赛场地</span>
                <strong>{{ match.venue }}</strong>
              </div>
            </div>

            <div v-if="match.referees?.length" class="referee-block">
              <h3>裁判组</h3>
              <div class="referee-grid">
                <div v-for="ref in match.referees" :key="ref.name" class="referee">
                  <span class="referee__avatar">{{ ref.name.slice(0, 1) }}</span>
                  <div>
                    <strong>{{ ref.name }}</strong>
                    <small>{{ ref.role }}<template v-if="ref.level"> · {{ ref.level }}</template></small>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="liveLinks.length" class="link-block">
              <h3>直播入口</h3>
              <a
                v-for="link in liveLinks"
                :key="link.id"
                :href="link.url"
                target="_blank"
                rel="noreferrer"
                class="live-link"
              >
                <el-icon><VideoCamera /></el-icon>
                {{ link.title }}
              </a>
            </div>
          </div>
        </div>

        <aside class="detail-side">
          <div class="side-card">
            <h3>比赛提示</h3>
            <p>比分与事件数据由现场记录员实时提交，并以赛后正式公告为准。</p>
            <p>观众可通过图文直播关注比赛进程，文明观赛，为少年球员加油。</p>
          </div>
        </aside>
      </div>
    </template>

    <el-result
      v-else-if="!loading"
      class="not-found"
      icon="warning"
      :title="previewMode ? '无法加载比赛预览' : '比赛不存在或未发布'"
      :sub-title="previewMode ? '请检查比赛是否已被删除，或返回比赛管理继续操作。' : '请返回赛程与比分查看其他比赛。'"
    >
      <template #extra>
        <el-button v-if="previewMode" type="primary" @click="leavePreview">返回比赛管理</el-button>
        <router-link v-else to="/matches">
          <el-button type="primary">返回赛程与比分</el-button>
        </router-link>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.match-detail {
  min-height: 70vh;
  padding-bottom: 64px;
  background: var(--paper);
}

.preview-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 20px;
  background: var(--brand-50);
  border-bottom: 1px solid var(--line);
  color: var(--brand-700);
  font-size: 12px;
}

.preview-banner__text {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}

.scoreboard {
  padding: 30px 0 26px;
  background: var(--scoreboard);
  border-bottom: 1px solid var(--scoreboard-line);
  color: #fff;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  margin-bottom: 18px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.42);
}

.crumbs a:hover {
  color: #fff;
}

.crumbs__current {
  min-width: 0;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.scoreboard__meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.group-pill {
  padding: 3px 8px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.86);
  font-size: 12px;
  font-weight: 500;
}

.scoreboard__event {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.62);
}

.scoreboard__main {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 30px;
  max-width: 820px;
  margin: 28px auto 24px;
}

.side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  text-align: center;
}

.side__badge {
  display: grid;
  place-items: center;
  width: 62px;
  height: 62px;
  border-radius: 8px;
  background: var(--lime);
  color: var(--brand-900);
  font-size: 24px;
  font-weight: 700;
}

.side__badge--away {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.side strong {
  font-size: 18px;
  line-height: 1.4;
}

.side small {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}

.score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
}

.score__nums {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: clamp(40px, 6vw, 62px);
  font-weight: 700;
  line-height: 1;
}

.score__nums i {
  font-style: normal;
  color: rgba(255, 255, 255, 0.26);
}

.score__state {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);
}

.score__revision {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.5);
}

.scoreboard__info {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 26px;
  flex-wrap: wrap;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.68);
}

.scoreboard__info span {
  display: flex;
  align-items: center;
  gap: 5px;
}

.live-refresh {
  color: var(--lime);
}

.detail-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 22px;
  margin-top: 24px;
  align-items: start;
}

.detail-main {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.tab-bar {
  display: flex;
  gap: 2px;
  padding: 0 18px;
  border-bottom: 1px solid var(--line);
}

.tab-bar button {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 15px 14px;
  border: none;
  background: transparent;
  font-size: 12.5px;
  color: var(--ink-500);
  cursor: pointer;
}

.tab-bar button.is-active {
  color: var(--brand-800);
  font-weight: 700;
}

.tab-bar button.is-active::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -1px;
  height: 2px;
  background: var(--brand-700);
}

.tab-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--live);
}

.panel {
  padding: 20px 22px 26px;
}

.match-brief {
  margin-bottom: 20px;
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--brand-50);
}

.match-brief__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.match-brief__head span {
  font-size: 14px;
  font-weight: 700;
  color: var(--brand-800);
}

.match-brief__head small {
  font-size: 12.5px;
  color: var(--ink-500);
}

.match-brief p {
  margin-top: 6px;
  font-size: 15px;
  line-height: 1.8;
  color: var(--ink-700);
}

.timeline {
  display: flex;
  flex-direction: column;
}

.event-row {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding: 14px 0;
  border-bottom: 1px solid var(--line);
}

.event-row:last-child {
  border-bottom: none;
}

.event-row__minute {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 46px;
  flex-shrink: 0;
  padding-top: 4px;
  color: var(--brand-800);
}

.event-row__minute strong {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

.event-row__minute small {
  font-size: 9px;
  color: var(--ink-300);
}

.event-row__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.event-row__icon.type-penalty {
  background: var(--whistle-soft);
  color: #9a6a12;
}

.event-row__icon.type-substitution {
  background: var(--paper);
  color: var(--ink-500);
}

.event-row__body {
  flex: 1;
  min-width: 0;
}

.event-row__line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-row__line strong {
  font-size: 16px;
}

.event-row__type {
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
}

.event-row__team {
  display: block;
  margin-top: 3px;
  font-size: 13px;
  color: var(--ink-500);
}

.event-row__note {
  margin-top: 4px;
  font-size: 13px;
  color: var(--ink-500);
}

.event-row__side {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ink-500);
  padding-top: 8px;
}

.event-row__side.is-away {
  color: #8b95a1;
}

.live-feed {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.live-post {
  display: flex;
  gap: 14px;
}

.live-post__minute {
  flex-shrink: 0;
  width: 38px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--brand-700);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.live-post__body {
  flex: 1;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--line);
}

.live-post__body p {
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-700);
}

.live-post__images {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.live-post__images img {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  border-radius: 9px;
}

.live-post__time {
  display: block;
  margin-top: 8px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.info-item {
  padding: 14px 15px;
  border-radius: 11px;
  background: var(--paper);
}

.info-item span {
  display: block;
  font-size: 10px;
  color: var(--ink-300);
}

.info-item strong {
  display: block;
  margin-top: 4px;
  font-size: 12.5px;
}

.referee-block,
.link-block {
  margin-top: 22px;
}

.referee-block h3,
.link-block h3 {
  font-size: 14px;
  margin-bottom: 11px;
}

.referee-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.referee {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.referee__avatar {
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

.referee strong {
  display: block;
  font-size: 11.5px;
}

.referee small {
  font-size: 9.5px;
  color: var(--ink-300);
}

.live-link {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  margin-bottom: 7px;
}

.detail-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.side-card {
  padding: 20px;
  border-radius: var(--radius-lg);
  background: #fff;
  border: 1px solid var(--line);
}

.side-card h3 {
  font-size: 13.5px;
  margin-bottom: 9px;
}

.side-card p {
  font-size: 11px;
  line-height: 1.8;
  color: var(--ink-500);
  margin-bottom: 8px;
}

.not-found {
  padding: 80px 0;
}

@media (max-width: 860px) {
  .detail-body {
    grid-template-columns: 1fr;
  }

  .detail-side {
    display: none;
  }

  .scoreboard__main {
    gap: 12px;
  }

  .side__badge {
    width: 54px;
    height: 54px;
    border-radius: var(--radius-lg);
    font-size: 21px;
  }

  .side strong {
    font-size: 12.5px;
  }

  .score__nums {
    font-size: 34px;
    gap: 7px;
  }

  .scoreboard__info {
    gap: 14px;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
