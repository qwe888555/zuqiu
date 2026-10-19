<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { Calendar, Location, VideoCamera } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { LiveLink, MatchEvent, PublicLivePost, PublicMatch } from '../../api/types'
import StatusTag from '../../components/common/StatusTag.vue'

interface MatchDetail extends PublicMatch {
  events: MatchEvent[]
  referees?: { name: string; role: string; level?: string }[]
}

const route = useRoute()
const loading = ref(false)
const match = ref<MatchDetail | null>(null)
const liveFeed = ref<PublicLivePost[]>([])
const liveLinks = ref<LiveLink[]>([])
const activeTab = ref('events')
let timer: number | undefined

const isLive = computed(() => match.value?.status === 'LIVE')

const sortedEvents = computed(() =>
  [...(match.value?.events || [])].sort((a, b) => {
    const am = (a.minute || 0) * 100 + (a.stoppageMinute || 0)
    const bm = (b.minute || 0) * 100 + (b.stoppageMinute || 0)
    return bm - am
  }),
)

const eventIcon = (type: string) => {
  if (type === 'GOAL') return '⚽'
  if (type === 'PENALTY') return '🟨'
  return '🔄'
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

async function load() {
  const id = String(route.params.id)
  loading.value = true
  try {
    match.value = await publicApi.match(id)
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
    <template v-if="match">
      <section class="scoreboard">
        <div class="container">
          <div class="scoreboard__meta">
            <span class="group-pill">{{ match.groupName }}</span>
            <StatusTag :status="match.status" kind="match" size="default" />
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
                <span class="num">{{ match.status === 'SCHEDULED' ? '-' : match.homeScore }}</span>
                <i>:</i>
                <span class="num">{{ match.status === 'SCHEDULED' ? '-' : match.awayScore }}</span>
              </div>
              <span class="score__state">
                {{ match.status === 'SCHEDULED' ? dayjs(match.kickoffAt).format('MM月DD日 HH:mm') : match.status === 'LIVE' ? '比赛进行中' : '全场结束' }}
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
            <div v-if="sortedEvents.length" class="timeline">
              <div v-for="event in sortedEvents" :key="event.id" class="event-row">
                <span class="event-row__minute num">
                  {{ event.minute }}'
                  <small v-if="event.stoppageMinute">+{{ event.stoppageMinute }}</small>
                </span>
                <span class="event-row__icon" :class="`type-${event.eventType.toLowerCase()}`">
                  {{ eventIcon(event.eventType) }}
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
          <router-link to="/matches" class="back-link">← 返回赛事中心</router-link>
        </aside>
      </div>
    </template>

    <el-result
      v-else-if="!loading"
      class="not-found"
      icon="warning"
      title="比赛不存在或未发布"
      sub-title="请返回赛事中心查看其他比赛。"
    >
      <template #extra>
        <router-link to="/matches">
          <el-button type="primary">返回赛事中心</el-button>
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

.scoreboard {
  padding: 34px 0 30px;
  background:
    radial-gradient(circle at 78% 8%, rgba(200, 241, 105, 0.16), transparent 36%),
    linear-gradient(150deg, #075c40, #043c2b);
  color: #fff;
}

.scoreboard__meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.group-pill {
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(200, 241, 105, 0.14);
  color: var(--lime);
  font-size: 10px;
  font-weight: 600;
}

.scoreboard__event {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.42);
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
  width: 70px;
  height: 70px;
  border-radius: 20px;
  background: var(--lime);
  color: var(--brand-900);
  font-size: 27px;
  font-weight: 800;
}

.side__badge--away {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.side strong {
  font-size: 16px;
  line-height: 1.4;
}

.side small {
  font-size: 9px;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.34);
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
  font-size: 10.5px;
  color: var(--lime);
  letter-spacing: 0.06em;
}

.score__revision {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.3);
}

.scoreboard__info {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 26px;
  flex-wrap: wrap;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
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
  border-radius: 16px;
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
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ff5f5f;
}

.panel {
  padding: 20px 22px 26px;
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
  width: 42px;
  flex-shrink: 0;
  padding-top: 7px;
  font-size: 14px;
  font-weight: 700;
  color: var(--brand-800);
}

.event-row__minute small {
  font-size: 9px;
  color: var(--ink-300);
}

.event-row__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-50);
  font-size: 15px;
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
  font-size: 13px;
}

.event-row__type {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9px;
}

.event-row__team {
  display: block;
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.event-row__note {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.event-row__side {
  flex-shrink: 0;
  font-size: 9.5px;
  color: var(--ink-300);
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
  border-radius: 15px;
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

.back-link {
  font-size: 11.5px;
  color: var(--ink-500);
  padding-left: 3px;
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
    border-radius: 15px;
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
