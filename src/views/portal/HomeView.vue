<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ArrowRight, Calendar, Location, Ticket, VideoPlay } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import { publicityApi } from '../../api/selection'
import type {
  GoalRankingRow,
  LiveLink,
  PublicContent,
  PublicEvent,
  PublicMatch,
  PublicResource,
  PublicityRecord,
} from '../../api/types'
import StatusTag from '../../components/common/StatusTag.vue'
import SafeImage from '../../components/common/SafeImage.vue'
import { useConsoleEntry } from '../../composables/useConsoleEntry'
import { matchDisplayStatus, policyKind, sortPublicEvents } from '../../utils/portal'
import { publicityNoticeKey } from '../../utils/publications'

const MATCH_TABS = [
  { key: 'LIVE', label: '比赛动态' },
  { key: 'SCHEDULED', label: '即将开始' },
  { key: 'FINISHED', label: '最新赛果' },
] as const
type MatchTab = (typeof MATCH_TABS)[number]['key']

const { loggedIn, enrollable, startEnrollment } = useConsoleEntry()

const loading = ref(true)
const loadError = ref(false)
const banners = ref<PublicResource[]>([])
const news = ref<PublicContent[]>([])
const policies = ref<PublicContent[]>([])
const matches = ref<PublicMatch[]>([])
const goals = ref<GoalRankingRow[]>([])
const stars = ref<PublicityRecord[]>([])
const matchTab = ref<MatchTab>('LIVE')
const updatedAt = ref('')

const orderedNews = computed(() =>
  news.value.slice().sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')),
)
const featured = computed(() => orderedNews.value[0])
const newsRest = computed(() => orderedNews.value.slice(1, 4))
// 管理端「新闻配图」按关联内容覆盖资讯封面，与赛事资讯页保持一致。
const newsCoverMap = computed(() => {
  const map = new Map<string, string>()
  banners.value.forEach((item) => {
    if (item.resourceType === 'NEWS_LINK_IMAGE' && item.targetContentId && item.imageUrl) {
      map.set(item.targetContentId, item.imageUrl)
    }
  })
  return map
})
/** 封面非必填；没有配图时返回空串，首页焦点卡改用纯文字版式，不用站内图冒充。 */
function newsCover(item: PublicContent | undefined) {
  if (!item) return ''
  return newsCoverMap.value.get(item.id) || item.publicCoverUrl || ''
}

// 超过合理时长仍未确认赛果的场次不再占用“比赛动态”，统一归入“最新赛果”并标注待确认。
const liveMatches = computed(() =>
  matches.value
    .filter((m) => matchDisplayStatus(m) === 'LIVE')
    .slice()
    .sort((a, b) => dayjs(a.kickoffAt).valueOf() - dayjs(b.kickoffAt).valueOf()),
)
const scheduledMatches = computed(() =>
  matches.value
    .filter((m) => matchDisplayStatus(m) === 'SCHEDULED')
    .slice()
    .sort((a, b) => dayjs(a.kickoffAt).valueOf() - dayjs(b.kickoffAt).valueOf()),
)
const finishedMatches = computed(() =>
  matches.value
    .filter((m) => ['FINISHED', 'CANCELLED'].includes(m.status))
    .slice()
    .sort((a, b) => {
      // 已确认赛果在前，已取消在后；同一状态内按最近开球时间排序。
      const rank = (match: PublicMatch) => (match.status === 'FINISHED' ? 0 : 1)
      return (
        rank(a) - rank(b) || dayjs(b.kickoffAt).valueOf() - dayjs(a.kickoffAt).valueOf()
      )
    }),
)
const upcomingMatches = computed(() => scheduledMatches.value.slice(0, 4))
const stripMatches = computed(() => {
  const focusId = featuredMatch.value?.id
  const active = [...liveMatches.value, ...upcomingMatches.value].filter((match) => match.id !== focusId)
  const fallback = finishedMatches.value.filter((match) => match.id !== focusId)
  return (active.length ? active : fallback).slice(0, 4)
})
const tabMatches = computed(() => {
  if (matchTab.value === 'LIVE') return liveMatches.value
  if (matchTab.value === 'SCHEDULED') return scheduledMatches.value
  return finishedMatches.value
})
const tabMatch = computed(() => tabMatches.value[0])
const fallbackMatch = computed(
  () => liveMatches.value[0] || scheduledMatches.value[0] || finishedMatches.value[0],
)
const featuredMatch = computed(() => tabMatch.value || fallbackMatch.value)
const featuredStatus = computed(() =>
  featuredMatch.value ? matchDisplayStatus(featuredMatch.value) : '',
)
const showFallbackNote = computed(() => !tabMatch.value && Boolean(featuredMatch.value))
const activeTabLabel = computed(
  () => MATCH_TABS.find((tab) => tab.key === matchTab.value)?.label || '',
)
const tabRemaining = computed(() => Math.max(0, tabMatches.value.length - 1))
const maxGoals = computed(() => goals.value[0]?.goals || 1)
const stripHasUpcoming = computed(() => {
  const focusId = featuredMatch.value?.id
  return [...liveMatches.value, ...upcomingMatches.value].some((match) => match.id !== focusId)
})

// 首屏只使用后勤配置的轮播图；没有配置时不加载外部图片，退回品牌色渐变底。
const heroImage = computed(() => banners.value[0]?.imageUrl || '')

/** 首屏直播：有直播链接时用视频/播放器顶替轮播图，没有则原样展示轮播图。 */
type HeroLiveMode = 'video' | 'iframe' | 'link'
interface HeroLive {
  title: string
  url: string
  mode: HeroLiveMode
}

const heroLive = ref<HeroLive | null>(null)
// 只有直链媒体文件才用 <video>，其余页面用 <iframe>，再不行只留跳转入口。
const DIRECT_VIDEO_RE = /\.(mp4|webm|ogv|ogg|mov|m4v)(?:[?#]|$)/i
const EMBED_URL_RE =
  /(youtube\.com\/embed|player\.bilibili\.com|v\.qq\.com\/txp\/iframe|player\.youku\.com|open\.douyin\.com\/embed)/i

function liveMode(url: string): HeroLiveMode {
  if (DIRECT_VIDEO_RE.test(url)) return 'video'
  if (EMBED_URL_RE.test(url)) return 'iframe'
  return 'link'
}

// 轮播资源自带的视频：没有真实直播时用它顶替轮播图。
const bannerVideoBroken = ref(false)
const bannerVideoUrl = computed(() =>
  bannerVideoBroken.value ? '' : banners.value[0]?.videoUrl || '',
)
const heroVideoUrl = computed(() => {
  if (heroLive.value?.mode === 'video') return heroLive.value.url
  return bannerVideoUrl.value
})
const showHeroVideo = computed(() => Boolean(heroVideoUrl.value))
const showHeroFrame = computed(() => !showHeroVideo.value && heroLive.value?.mode === 'iframe')

// 轮播视频每播完一轮停 30 秒再重播；停留期间显示轮播图。
const HERO_LOOP_GAP_MS = 30_000
const heroResting = ref(false)
let heroRestTimer: ReturnType<typeof setTimeout> | undefined

const heroMediaVisible = computed(
  () => (showHeroVideo.value && !heroResting.value) || showHeroFrame.value,
)

function stopHeroRestTimer() {
  if (heroRestTimer) {
    clearTimeout(heroRestTimer)
    heroRestTimer = undefined
  }
}

function handleHeroVideoEnded() {
  heroResting.value = true
  stopHeroRestTimer()
  heroRestTimer = setTimeout(() => {
    heroResting.value = false
  }, HERO_LOOP_GAP_MS)
}

function handleHeroMediaError() {
  // 直播视频失败时退回“视频入口 + 轮播图”，保留正在直播的提示。
  if (heroLive.value?.mode === 'video') {
    heroLive.value = { ...heroLive.value, mode: 'link' }
    return
  }
  bannerVideoBroken.value = true
  heroResting.value = false
}

async function loadHeroLive(match: PublicMatch | undefined) {
  heroLive.value = null
  if (!match) return
  try {
    const links = await publicApi.liveLinks(match.id)
    // 视频直链优先，其次播放器页面，最后任意可用链接。
    const usable = links.filter(
      (link: LiveLink) => link.enabled !== false && /^https?:\/\//i.test(link.url),
    )
    const picked =
      usable.find((link) => liveMode(link.url) === 'video') ||
      usable.find((link) => liveMode(link.url) === 'iframe') ||
      usable[0]
    if (!picked) return
    heroLive.value = {
      title: picked.title || `${match.homeTeamName || '主队'} vs ${match.awayTeamName || '客队'}`,
      url: picked.url,
      mode: liveMode(picked.url),
    }
  } catch {
    heroLive.value = null
  }
}

function tabCount(key: MatchTab) {
  if (key === 'LIVE') return liveMatches.value.length
  if (key === 'SCHEDULED') return scheduledMatches.value.length
  return finishedMatches.value.length
}

async function loadHome() {
  loading.value = true
  loadError.value = false
  bannerVideoBroken.value = false
  heroResting.value = false
  stopHeroRestTimer()
  try {
    // /public/events 免登录；/public/matches 与 /public/statistics/goals 仍需 eventId。
    const [resourceRes, newsRes, policyRes, eventRes] = await Promise.all([
      publicApi.resources(),
      publicApi.contents({ page: 1, pageSize: 6, contentType: 'NEWS' }),
      publicApi.contents({ page: 1, pageSize: 4, contentType: 'POLICY' }),
      publicApi
        .events({ page: 1, pageSize: 50 })
        .catch(() => ({ items: [] as PublicEvent[] })),
    ])
    banners.value = resourceRes.items
    news.value = newsRes.items
    policies.value = policyRes.items
    updatedAt.value = dayjs().format('HH:mm')

    // 按状态优先探测，跳过尚无已发布对阵/进球数据的赛事。
    let publicEventId = ''
    let matchItems: PublicMatch[] = []
    let goalRows: GoalRankingRow[] = []
    for (const event of sortPublicEvents(eventRes.items)) {
      // 首页固定展示小学组，必须与榜单标题一起按 category 过滤；
      // 不传 category 时后端会返回跨组别排名，中学组球员会混入。
      const [matchRes, goalRes] = await Promise.all([
        publicApi.matches({ eventId: event.id, page: 1, pageSize: 50 }),
        publicApi.goals({ eventId: event.id, category: 'PRIMARY' }),
      ])
      if (!matchRes.items.length && !goalRes.rows.length) continue
      publicEventId = event.id
      matchItems = matchRes.items
      goalRows = goalRes.rows
      break
    }

    matches.value = matchItems
    goals.value = goalRows.slice(0, 5)
    // 首屏直播与公示互不依赖，一起等待以免串行拖慢首屏。
    await Promise.all([loadHeroLive(liveMatches.value[0]), loadStars(publicEventId)])
    if (!liveMatches.value.length) {
      matchTab.value = scheduledMatches.value.length ? 'SCHEDULED' : 'FINISHED'
    }
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

async function loadStars(publicEventId: string) {
  if (!publicEventId) {
    stars.value = []
    return
  }
  // 成员6 是独立服务，未部署时不能影响门户主体内容。
  try {
    const pubRes = await publicityApi.list({ eventId: publicEventId, page: 1, size: 100 })
    stars.value = pubRes.items.slice(0, 3)
  } catch {
    stars.value = []
  }
}

onMounted(loadHome)
onBeforeUnmount(stopHeroRestTimer)

function formatDate(value?: string) {
  return value ? dayjs(value).format('MM.DD') : '--'
}

function formatFullDate(value?: string) {
  return value ? dayjs(value).format('YYYY.MM.DD') : '--'
}

function formatKickoff(value?: string) {
  if (!value) return '待定'
  const d = dayjs(value)
  return `${d.format('MM月DD日')} ${d.format('HH:mm')}`
}

function matchCta(status?: string) {
  if (status === 'LIVE') return '查看实时赛况'
  if (status === 'SCHEDULED') return '查看赛程详情'
  if (status === 'CANCELLED') return '查看比赛详情'
  return '查看比赛结果'
}

function homeScoreText(match: PublicMatch) {
  if (match.status === 'SCHEDULED') return '–'
  if (match.status === 'CANCELLED') return '—'
  return String(match.homeScore)
}

function awayScoreText(match: PublicMatch) {
  if (match.status === 'SCHEDULED') return '–'
  if (match.status === 'CANCELLED') return '—'
  return String(match.awayScore)
}

function goalBarWidth(value: number) {
  return `${Math.max(8, Math.round((value / maxGoals.value) * 100))}%`
}

function publicationLink(star: PublicityRecord) {
  return `/publications/${encodeURIComponent(publicityNoticeKey(star))}`
}

</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="hero__bg">
        <SafeImage v-if="heroImage" :src="heroImage" alt="青少年足球联赛" />
        <video
          v-if="showHeroVideo && !heroResting"
          class="hero__video"
          :src="heroVideoUrl"
          :poster="heroImage || undefined"
          autoplay
          muted
          playsinline
          preload="metadata"
          aria-hidden="true"
          @ended="handleHeroVideoEnded"
          @error="handleHeroMediaError"
        />
        <iframe
          v-if="showHeroFrame"
          class="hero__frame"
          :src="heroLive?.url"
          :title="heroLive?.title"
          allow="autoplay; fullscreen; picture-in-picture"
          allowfullscreen
          @error="handleHeroMediaError"
        />
        <div class="hero__shade" :class="{ 'hero__shade--media': heroMediaVisible }" />
      </div>

      <!-- 直播画面播放时首屏只留视频；轮播间隙再回到文案 + 轮播图。 -->
      <div v-show="!heroMediaVisible" class="container hero__inner">
        <div class="hero__copy">
          <a
            v-if="heroLive"
            class="hero__live"
            :href="heroLive.url"
            target="_blank"
            rel="noopener noreferrer"
            :title="`在新窗口打开直播：${heroLive.title}`"
          >
            <span class="hero__live-dot" aria-hidden="true" />
            <span class="hero__live-label">正在直播</span>
            <span class="hero__live-title">{{ heroLive.title }}</span>
            <el-icon><VideoPlay /></el-icon>
          </a>
          <span class="hero__eyebrow">四川省青少年校园足球联赛 · 2026 赛季</span>
          <h1>全省校园足球<br /><em>在这里开球</em></h1>
          <p>
            从报名审核到赛程比分，从政策原文到人才公示。一个入口，看见全省校园足球的每一个比赛日。
          </p>

          <div class="hero__actions">
            <router-link to="/matches" class="hero-btn hero-btn--lime">
              查看赛程与比分
              <el-icon><ArrowRight /></el-icon>
            </router-link>
            <button
              v-if="!loggedIn || enrollable"
              type="button"
              class="hero-btn hero-btn--ghost"
              @click="startEnrollment"
            >
              <el-icon><Ticket /></el-icon>
              {{ loggedIn ? '继续报名' : '学校报名' }}
            </button>
          </div>
        </div>

        <aside v-if="loading" class="scoreboard scoreboard--loading" aria-busy="true" aria-label="比赛信息加载中">
          <header class="scoreboard__head">
            <span class="scoreboard__kicker">比赛中心</span>
          </header>
          <div class="scoreboard__skeleton-tabs">
            <span /><span /><span />
          </div>
          <div class="scoreboard__skeleton-board">
            <span /><span /><span />
          </div>
          <div class="scoreboard__skeleton-lines">
            <span /><span />
          </div>
        </aside>

        <aside v-else-if="featuredMatch" class="scoreboard">
          <header class="scoreboard__head">
            <span class="scoreboard__kicker">比赛中心</span>
            <span v-if="updatedAt" class="scoreboard__updated">{{ updatedAt }} 刷新</span>
          </header>

          <div class="scoreboard__tabs" role="tablist" aria-label="比赛状态筛选">
            <button
              v-for="tab in MATCH_TABS"
              :key="tab.key"
              type="button"
              role="tab"
              class="scoreboard__tab"
              :class="{ 'is-active': matchTab === tab.key }"
              :aria-selected="matchTab === tab.key"
              @click="matchTab = tab.key"
            >
              {{ tab.label }}
              <span v-if="tabCount(tab.key)" class="scoreboard__count">
                {{ tabCount(tab.key) }}
              </span>
            </button>
          </div>

          <div class="scoreboard__meta">
            <StatusTag :status="featuredStatus" kind="match" />
            <span>{{ featuredMatch.groupName || featuredMatch.eventName }}</span>
          </div>
          <p v-if="showFallbackNote" class="scoreboard__fallback">该时段暂无比赛，以下为最近一场</p>

          <div class="scoreboard__board">
            <div class="scoreboard__team">
              <span class="scoreboard__crest">{{ (featuredMatch.homeTeamName || '球').slice(0, 1) }}</span>
              <strong>{{ featuredMatch.homeTeamName || '未关联球队' }}</strong>
              <span class="scoreboard__score num" :class="{ 'is-live': featuredStatus === 'LIVE' }">
                {{ homeScoreText(featuredMatch) }}
              </span>
            </div>
            <div class="scoreboard__divider">
              <span v-if="featuredStatus === 'SCHEDULED'" class="num">
                {{ dayjs(featuredMatch.kickoffAt).format('HH:mm') }}
              </span>
              <span v-else-if="featuredMatch.status === 'CANCELLED'" class="scoreboard__cancelled">比赛取消</span>
              <span v-else class="scoreboard__colon">:</span>
            </div>
            <div class="scoreboard__team">
              <span class="scoreboard__crest scoreboard__crest--away">{{ (featuredMatch.awayTeamName || '球').slice(0, 1) }}</span>
              <strong>{{ featuredMatch.awayTeamName || '未关联球队' }}</strong>
              <span class="scoreboard__score num" :class="{ 'is-live': featuredStatus === 'LIVE' }">
                {{ awayScoreText(featuredMatch) }}
              </span>
            </div>
          </div>

          <div class="scoreboard__info">
            <span><el-icon><Calendar /></el-icon>{{ formatKickoff(featuredMatch.kickoffAt) }}</span>
            <span><el-icon><Location /></el-icon>{{ featuredMatch.venue || '场地待定' }}</span>
          </div>

          <router-link :to="`/matches/${featuredMatch.id}`" class="scoreboard__cta">
            {{ matchCta(featuredStatus) }}
            <el-icon><ArrowRight /></el-icon>
          </router-link>
          <router-link v-if="tabRemaining" to="/matches" class="scoreboard__more">
            {{ activeTabLabel }}还有 {{ tabRemaining }} 场
            <el-icon><ArrowRight /></el-icon>
          </router-link>
        </aside>

        <aside v-else class="scoreboard scoreboard--empty">
          <span class="scoreboard__kicker">比赛中心</span>
          <p>{{ loadError ? '比赛信息暂时无法加载，请稍后重试。' : '当前暂无进行中或即将开始的比赛。' }}</p>
          <router-link to="/matches" class="scoreboard__cta">
            查看全部赛程
            <el-icon><ArrowRight /></el-icon>
          </router-link>
        </aside>
      </div>
    </section>

    <div v-if="loadError && !loading" class="container">
      <div class="load-error" role="alert">
        <span>首页部分内容加载失败，赛程、资讯与政策可能未完整展示。</span>
        <button type="button" @click="loadHome">重新加载</button>
      </div>
    </div>

    <section class="container home-section news-section">
      <div class="section-head">
        <div>
          <span class="section-kicker">赛事资讯</span>
          <h2>赛场内外</h2>
        </div>
        <router-link to="/news" class="section-link">
          全部资讯
          <el-icon><ArrowRight /></el-icon>
        </router-link>
      </div>

      <div
        v-loading="loading"
        class="news-board"
        :class="{
          'news-board--empty': !loading && !news.length,
          'news-board--single': !loading && news.length === 1,
        }"
      >
        <router-link
          v-if="featured"
          :to="`/news/${featured.id}`"
          class="lead-card"
          :class="{ 'lead-card--text': !newsCover(featured) }"
        >
          <SafeImage v-if="newsCover(featured)" :src="newsCover(featured)" :alt="featured.title" />
          <span v-if="newsCover(featured)" class="lead-card__shade" />
          <div class="lead-card__body">
            <span class="lead-card__tag">焦点</span>
            <h3>{{ featured.title }}</h3>
            <p>{{ featured.summary }}</p>
            <span class="lead-card__meta">
              {{ formatFullDate(featured.publishedAt) }}
              <i />
              阅读全文
              <el-icon><ArrowRight /></el-icon>
            </span>
          </div>
        </router-link>

        <div v-if="loading || newsRest.length" class="news-side">
          <header class="news-side__head">
            <span>最新发布</span>
            <span>{{ newsRest.length }} 条</span>
          </header>
          <router-link
            v-for="(item, index) in newsRest"
            :key="item.id"
            :to="`/news/${item.id}`"
            class="news-line"
          >
            <span class="news-line__index num">{{ String(index + 2).padStart(2, '0') }}</span>
            <span class="news-line__body">
              <strong>{{ item.title }}</strong>
              <small>{{ item.summary }}</small>
            </span>
            <span class="news-line__date num">{{ formatDate(item.publishedAt) }}</span>
          </router-link>
        </div>
        <el-empty
          v-if="!loading && !news.length"
          class="news-board__empty"
          description="暂无资讯"
          :image-size="60"
        />
      </div>
    </section>

    <section class="policy-band">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="section-kicker">政策服务</span>
            <h2>政策与公告</h2>
          </div>
          <router-link to="/policies" class="section-link">
            查看全部政策文件
            <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>

        <div class="policy-list" :class="{ 'policy-list--single': !loading && policies.length === 1 }">
          <router-link
            v-for="policy in policies"
            :key="policy.id"
            :to="`/policies/${policy.id}`"
            class="policy-line"
          >
            <span class="policy-line__tag">{{ policyKind(policy.title) }}</span>
            <span class="policy-line__body">
              <strong>{{ policy.title }}</strong>
              <small>{{ formatFullDate(policy.publishedAt) }} · 第 {{ policy.revision }} 版</small>
            </span>
            <span class="policy-line__action" aria-hidden="true">
              <el-icon><ArrowRight /></el-icon>
            </span>
          </router-link>
          <el-empty v-if="!loading && !policies.length" description="暂无政策文件" :image-size="60" />
        </div>
      </div>
    </section>

    <section class="match-section">
      <div class="container home-section">
        <div class="section-head section-head--light">
          <div>
            <span class="section-kicker">赛程与比分</span>
            <h2>{{ stripHasUpcoming ? '下一个比赛日' : '近期赛果' }}</h2>
          </div>
          <router-link to="/matches" class="section-link section-link--light">
            全部赛程
            <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>

        <div v-loading="loading" class="match-strip" :class="{ 'is-loading': loading }">
          <router-link
            v-for="match in stripMatches"
            :key="match.id"
            :to="`/matches/${match.id}`"
            class="match-card"
          >
            <div class="match-card__top">
              <span>{{ match.groupName }}</span>
              <StatusTag :status="matchDisplayStatus(match)" kind="match" />
            </div>
            <div class="match-card__team-row">
              <span class="match-card__crest">{{ (match.homeTeamName || '球').slice(0, 1) }}</span>
              <span class="match-card__name">{{ match.homeTeamName || '未关联球队' }}</span>
              <strong class="match-card__score num" :class="{ 'is-live': matchDisplayStatus(match) === 'LIVE' }">
                {{ homeScoreText(match) }}
              </strong>
            </div>
            <div class="match-card__team-row">
              <span class="match-card__crest match-card__crest--away">{{ (match.awayTeamName || '球').slice(0, 1) }}</span>
              <span class="match-card__name">{{ match.awayTeamName || '未关联球队' }}</span>
              <strong class="match-card__score num" :class="{ 'is-live': matchDisplayStatus(match) === 'LIVE' }">
                {{ awayScoreText(match) }}
              </strong>
            </div>
            <div class="match-card__meta">
              <span>{{ formatKickoff(match.kickoffAt) }}</span>
              <span>{{ match.venue || '场地待定' }}</span>
            </div>
          </router-link>
          <div v-if="!loading && !stripMatches.length" class="match-empty">
            {{ loadError ? '比赛信息加载失败，请稍后重试。' : '当前没有可展示的比赛，赛程发布后将在此更新。' }}
          </div>
        </div>
      </div>
    </section>

    <section class="container home-section bottom-section">
      <div class="bottom-grid">
        <div class="rank-card">
          <div class="section-head section-head--compact">
            <div>
              <h2>小学组射手榜</h2>
            </div>
            <router-link to="/rankings" class="section-link">
              完整榜单
              <el-icon><ArrowRight /></el-icon>
            </router-link>
          </div>

          <div class="rank-list">
            <div v-for="row in goals" :key="row.athleteId" class="rank-row" :class="{ 'is-leader': row.rank === 1 }">
              <span class="rank-row__rank num">{{ String(row.rank).padStart(2, '0') }}</span>
              <span class="rank-row__avatar">{{ row.athleteName.slice(0, 1) }}</span>
              <span class="rank-row__body">
                <strong>{{ row.athleteName }}</strong>
                <small>{{ row.teamName }}</small>
              </span>
              <span class="rank-row__goals">
                <strong class="num">{{ row.goals }}</strong>
                <small>球</small>
              </span>
              <span class="rank-row__bar">
                <i :style="{ width: goalBarWidth(row.goals) }" />
              </span>
            </div>
            <el-empty v-if="!loading && !goals.length" description="暂无进球数据" :image-size="60" />
          </div>
        </div>

        <div class="publication-card">
          <div class="section-head section-head--compact">
            <div>
              <h2>最新公示</h2>
            </div>
            <router-link to="/publications" class="section-link">
              公示查询
              <el-icon><ArrowRight /></el-icon>
            </router-link>
          </div>
          <p class="publication-card__hint">点击公示事项，进入对应组别的完整名单。</p>

          <div class="publication-list">
            <router-link
              v-for="star in stars"
              :key="star.id"
              :to="publicationLink(star)"
              class="publication-row"
            >
              <span class="publication-row__avatar">{{ star.name.slice(0, 1) }}</span>
              <span class="publication-row__body">
                <strong>{{ star.name }}</strong>
                <small>{{ star.teamName || star.city || '公示对象' }}</small>
              </span>
              <span class="publication-row__group">{{ star.groupTypeLabel }}</span>
              <el-icon><ArrowRight /></el-icon>
            </router-link>
            <el-empty v-if="!loading && !stars.length" description="暂无公示" :image-size="60" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  background: var(--paper);
}

/* ---------- 首屏 ---------- */
.hero {
  position: relative;
  min-height: 520px;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: linear-gradient(135deg, var(--brand-900) 0%, #0a4a37 55%, #0d5a43 100%);
  isolation: isolate;
}

.hero__bg {
  position: absolute;
  inset: 0;
}

.hero__bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 60% 46%;
  transform: scale(1.015);
}

/* 直播视频 / 播放器铺满首屏；播放期间不叠文案，间隙才恢复图文。 */
.hero__video,
.hero__frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--brand-900);
  object-fit: cover;
}

.hero__shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(5, 40, 30, 0.94) 0%, rgba(5, 40, 30, 0.84) 42%, rgba(5, 40, 30, 0.34) 74%, rgba(5, 40, 30, 0.46) 100%),
    linear-gradient(0deg, rgba(5, 40, 30, 0.86) 0%, transparent 52%);
}

/* 直播态不再压文案，只保留底部一点点过渡，画面尽量原色呈现。 */
.hero__shade--media {
  background: linear-gradient(0deg, rgba(5, 40, 30, 0.42) 0%, transparent 26%);
}

.hero__live {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  margin-bottom: 16px;
  padding: 6px 12px 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  background: rgba(6, 32, 24, 0.55);
  backdrop-filter: blur(8px);
  font-size: 12.5px;
  color: #fff;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.hero__live:hover {
  border-color: var(--lime);
  background: rgba(6, 32, 24, 0.75);
}

.hero__live-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--live-on-dark);
  box-shadow: 0 0 0 3px rgba(255, 122, 69, 0.22);
  animation: hero-live-pulse 1.6s ease-in-out infinite;
}

.hero__live-label {
  flex-shrink: 0;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--live-on-dark);
}

.hero__live-title {
  min-width: 0;
  overflow: hidden;
  color: var(--on-dark-1);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero__live .el-icon {
  flex-shrink: 0;
  color: var(--on-dark-2);
}

@keyframes hero-live-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.hero__inner {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(380px, 0.85fr);
  align-items: center;
  gap: 64px;
  padding: 56px 0 52px;
}

.hero__copy {
  min-width: 0;
}

.hero__eyebrow {
  display: inline-block;
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--on-dark-2);
}

.hero__copy h1 {
  margin-top: 20px;
  font-size: clamp(42px, 4.6vw, 66px);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.01em;
  color: #fff;
}

.hero__copy h1 em {
  font-style: normal;
  color: var(--lime);
}

.hero__copy p {
  max-width: 560px;
  margin-top: 22px;
  font-size: 15.5px;
  line-height: 1.9;
  color: #d7e4db;
}

.hero__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
}

.hero-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 46px;
  padding: 0 20px;
  border-radius: 7px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
}

.hero-btn:hover {
  transform: translateY(-1px);
}

.hero-btn--lime {
  border: 1px solid var(--lime);
  background: var(--lime);
  color: var(--brand-900);
}

.hero-btn--lime:hover {
  background: #d6f88a;
}

.hero-btn--ghost {
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.hero-btn--ghost:hover {
  border-color: rgba(255, 255, 255, 0.54);
  background: rgba(255, 255, 255, 0.12);
}

/* ---------- 首屏比赛卡 ---------- */
.scoreboard {
  position: relative;
  min-width: 0;
  padding: 20px;
  border-radius: 14px;
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.035) 46%, rgba(200, 243, 106, 0.06) 100%),
    rgba(6, 48, 35, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(14px);
  color: #fff;
}

.scoreboard__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.scoreboard__kicker {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--lime);
}

.scoreboard__updated {
  font-size: 11.5px;
  color: var(--on-dark-3);
}

.scoreboard__tabs {
  display: flex;
  gap: 4px;
  margin-top: 16px;
  padding: 3px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.06);
}

.scoreboard__tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  min-height: 34px;
  padding: 5px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-size: 12.5px;
  color: var(--on-dark-3);
  cursor: pointer;
  transition: 0.16s;
}

.scoreboard__tab:hover {
  color: #fff;
}

.scoreboard__tab.is-active {
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
  font-weight: 600;
}

.scoreboard__count {
  min-width: 15px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--lime);
  color: var(--brand-900);
  font-size: 11px;
  font-weight: 700;
}

.scoreboard__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  font-size: 12.5px;
  color: var(--on-dark-2);
}

.scoreboard__meta > span:last-child {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.scoreboard__fallback {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--live-on-dark);
}

.scoreboard__board {
  margin-top: 14px;
  padding: 6px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.scoreboard__team {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 58px;
}

.scoreboard__team strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.scoreboard__crest {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: var(--on-dark-1);
  font-size: 15px;
  font-weight: 800;
}

/* 主客队徽保持一致的中性样式，避免用颜色暗示强弱。 */
.scoreboard__crest--away {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: var(--on-dark-1);
}

.scoreboard__score {
  width: 34px;
  flex-shrink: 0;
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  text-align: right;
}

.scoreboard__score.is-live {
  color: var(--live-on-dark);
}

.scoreboard__divider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 50px;
  font-size: 12px;
  color: var(--on-dark-3);
}

.scoreboard__cancelled {
  white-space: nowrap;
}

.scoreboard__divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.07);
}

.scoreboard__colon {
  font-family: var(--font-display);
  letter-spacing: 0.2em;
}

.scoreboard__info {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 13px 0;
  font-size: 12.5px;
  color: var(--on-dark-2);
}

.scoreboard__info span {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.scoreboard__info .el-icon {
  flex-shrink: 0;
}

.scoreboard__cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 40px;
  padding: 0 13px;
  border-radius: 6px;
  background: var(--lime);
  color: var(--brand-900);
  font-size: 12.5px;
  font-weight: 700;
  transition: background-color 0.16s;
}

.scoreboard__cta:hover {
  background: #d6f88a;
}

.scoreboard--empty {
  display: flex;
  flex-direction: column;
  gap: 14px;
  justify-content: center;
  min-height: 240px;
}

.scoreboard--empty p {
  font-size: 13.5px;
  color: var(--on-dark-2);
}

.scoreboard__more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 10px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--on-dark-2);
}

.scoreboard__more:hover {
  color: var(--on-dark-1);
}

/* ---------- 首屏比赛卡加载骨架 ---------- */
.scoreboard--loading {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 330px;
}

.scoreboard__skeleton-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 3px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.06);
}

.scoreboard__skeleton-tabs span {
  height: 34px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
  animation: home-pulse 1.4s ease-in-out infinite;
}

.scoreboard__skeleton-board {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.scoreboard__skeleton-board span {
  height: 34px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.08);
  animation: home-pulse 1.4s ease-in-out infinite;
}

.scoreboard__skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scoreboard__skeleton-lines span {
  height: 12px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.07);
  animation: home-pulse 1.4s ease-in-out infinite;
}

.scoreboard__skeleton-lines span:last-child {
  width: 62%;
}

@keyframes home-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

/* ---------- 通用区块头 ---------- */
.home-section {
  padding: 58px 0;
}

.load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 20px;
  padding: 12px 16px;
  border: 1px solid #f0c9a8;
  border-radius: 8px;
  background: var(--live-soft);
  font-size: 13px;
  color: #7a3b08;
}

.load-error button {
  flex-shrink: 0;
  padding: 6px 12px;
  border: 1px solid #d99a63;
  border-radius: 5px;
  background: #fff;
  color: #7a3b08;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.load-error button:hover {
  background: #fff7ef;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
}

.section-kicker {
  display: block;
  margin-bottom: 6px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--brand-600);
}

.section-head h2 {
  font-size: 27px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink-900);
}

.section-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding-bottom: 3px;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-700);
}

.section-link:hover {
  color: var(--brand-800);
}

.section-head--light .section-kicker {
  color: var(--lime);
}

.section-head--light h2 {
  color: #fff;
}

.section-link--light {
  color: var(--on-dark-2);
}

.section-link--light:hover {
  color: #fff;
}

.section-head--compact {
  margin-bottom: 16px;
}

.section-head--compact h2 {
  font-size: 20px;
}

/* ---------- 资讯 ---------- */
.news-board {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(380px, 1fr);
  gap: 20px;
  min-height: 330px;
}

/* 无资讯时不要留下半幅空白：空状态独占整行，并收紧区块高度。 */
.news-board--empty {
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
}

/* 只有一条资讯时不需要“最新发布”侧栏，焦点卡独占整行。 */
.news-board--single {
  grid-template-columns: minmax(0, 1fr);
}

.news-board__empty {
  padding: 26px 0 8px;
}

.lead-card {
  position: relative;
  display: block;
  min-height: 360px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--brand-900);
}

.lead-card--text {
  border-top: 3px solid var(--lime);
  background:
    radial-gradient(circle at 78% 22%, rgba(200, 243, 106, 0.13), transparent 36%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 112px),
    linear-gradient(145deg, var(--brand-800), var(--brand-900) 58%);
}

.lead-card--text::before {
  content: '';
  position: absolute;
  right: -70px;
  top: 44%;
  width: 250px;
  height: 250px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

.lead-card img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.lead-card:hover img {
  transform: scale(1.035);
}

.lead-card__shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(0deg, rgba(4, 33, 24, 0.94) 0%, rgba(4, 33, 24, 0.52) 42%, rgba(4, 33, 24, 0.04) 74%),
    linear-gradient(90deg, rgba(4, 33, 24, 0.42), transparent 56%);
}

.lead-card__body {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 26px 28px;
  color: #fff;
}

.lead-card__tag {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--lime);
  color: var(--brand-900);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.lead-card__body h3 {
  max-width: 720px;
  margin-top: 12px;
  font-size: clamp(21px, 2vw, 28px);
  font-weight: 700;
  line-height: 1.4;
}

.lead-card__body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 680px;
  margin-top: 8px;
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--on-dark-2);
}

.lead-card__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 13px;
  font-size: 12px;
  color: var(--on-dark-3);
}

.lead-card__meta i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
}

.lead-card__meta .el-icon {
  margin-left: 2px;
}

.news-side {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 6px 0;
}

.news-side__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
  font-size: 11.5px;
  letter-spacing: 0.08em;
  color: var(--ink-500);
}

.news-side__head span:first-child {
  font-weight: 700;
  color: var(--ink-900);
}

.news-line {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}

.news-line__index {
  width: 22px;
  flex-shrink: 0;
  padding-top: 1px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--ink-500);
}

.news-line__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.news-line__body strong {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--ink-900);
  transition: color 0.15s;
}

.news-line:hover .news-line__body strong {
  color: var(--brand-700);
}

.news-line__body small {
  overflow: hidden;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-500);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.news-line__date {
  flex-shrink: 0;
  padding-top: 2px;
  font-size: 11.5px;
  color: var(--ink-500);
}

/* ---------- 政策 ---------- */
.policy-band {
  position: relative;
  overflow: hidden;
  padding: 50px 0;
  background: linear-gradient(120deg, #fbfdf8 0%, #edf6ef 55%, #e4f2e9 100%);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.policy-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

/* 只有一条政策时不要占半行；空状态独占整行。 */
.policy-list--single {
  grid-template-columns: minmax(0, 1fr);
}

.policy-list > .el-empty {
  grid-column: 1 / -1;
  padding: 22px 0 4px;
}

.policy-line {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  padding: 15px 15px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid var(--line);
  transition: border-color 0.16s, background-color 0.16s, transform 0.16s;
}

.policy-line:hover {
  border-color: var(--brand-500);
  background: #fff;
  transform: translateY(-1px);
}

.policy-line__tag {
  flex-shrink: 0;
  padding: 3px 6px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.policy-line__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.policy-line__body strong {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--ink-900);
}

.policy-line__body small {
  font-size: 11.5px;
  color: var(--ink-500);
}

.policy-line__action {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-700);
}

/* ---------- 赛程 ---------- */
.match-section {
  position: relative;
  overflow: hidden;
  background: var(--brand-900);
  color: #fff;
}

.match-section .home-section {
  position: relative;
  z-index: 1;
  padding: 54px 0 58px;
}

.match-strip {
  display: grid;
  /* 固定 4 列：只有 1 场时卡片保持 1/4 宽，多场时列宽一致，不会拉满整行。 */
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

/* 加载态还没有卡片，用占位高度承载 v-loading，避免 spinner 贴在 0 高度。 */
.match-strip.is-loading {
  min-height: 200px;
}

.match-card {
  display: flex;
  flex-direction: column;
  padding: 15px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.13);
  transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
}

.match-card:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.26);
  transform: translateY(-2px);
}

.match-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 13px;
  font-size: 11.5px;
  color: var(--on-dark-2);
}

.match-card__top > span:first-child {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.match-card__team-row {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 36px;
}

.match-card__crest {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--on-dark-1);
  font-size: 11px;
  font-weight: 700;
}

.match-card__crest--away {
  background: rgba(255, 255, 255, 0.1);
  color: var(--on-dark-1);
}

.match-card__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13.5px;
  line-height: 1.4;
  color: var(--on-dark-1);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.match-card__score {
  flex-shrink: 0;
  min-width: 20px;
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  text-align: right;
}

.match-card__score.is-live {
  color: var(--live-on-dark);
}

.match-card__meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  color: var(--on-dark-3);
}

.match-card__meta span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.match-empty {
  grid-column: 1 / -1;
  padding: 28px;
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 13px;
  color: var(--on-dark-2);
  text-align: center;
}

/* ---------- 底部 ---------- */
.bottom-section {
  padding-bottom: 72px;
}

.bottom-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(340px, 0.75fr);
  align-items: start;
  gap: 20px;
}

.rank-card,
.publication-card {
  padding: 22px 24px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
}

.rank-list {
  display: flex;
  flex-direction: column;
}

.rank-row {
  display: grid;
  grid-template-columns: 30px 38px minmax(0, 1fr) 54px;
  align-items: center;
  gap: 11px;
  padding: 10px 0 12px;
  border-bottom: 1px solid var(--line);
}

.rank-row:last-child {
  border-bottom: none;
}

.rank-row__rank {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-500);
}

.rank-row.is-leader .rank-row__rank {
  color: var(--brand-700);
}

.rank-row__avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-800);
  font-size: 12px;
  font-weight: 700;
}

.rank-row.is-leader .rank-row__avatar {
  background: var(--brand-900);
  color: var(--lime);
}

.rank-row__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rank-row__body strong {
  overflow: hidden;
  font-size: 14.5px;
  color: var(--ink-900);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.rank-row__body small {
  overflow: hidden;
  font-size: 11.5px;
  color: var(--ink-500);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.rank-row__goals {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 2px;
}

.rank-row__goals strong {
  font-size: 21px;
  font-weight: 800;
  color: var(--brand-700);
}

.rank-row.is-leader .rank-row__goals strong {
  color: var(--brand-900);
}

.rank-row__goals small {
  font-size: 11px;
  color: var(--ink-500);
}

.rank-row__bar {
  grid-column: 3 / 5;
  height: 3px;
  margin-top: -3px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--paper);
}

.rank-row__bar i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--brand-500), var(--lime));
}

.publication-card {
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #fff 0%, #f7fbf8 100%);
}

.publication-card__hint {
  margin: -4px 0 12px;
  font-size: 12px;
  color: var(--ink-500);
}

.publication-list {
  display: flex;
  flex-direction: column;
}

.publication-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid var(--line);
}

.publication-row:last-child {
  border-bottom: none;
}

.publication-row__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.publication-row__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.publication-row__body strong {
  overflow: hidden;
  font-size: 13.5px;
  color: var(--ink-900);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.publication-row__body small {
  overflow: hidden;
  font-size: 11.5px;
  color: var(--ink-500);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.publication-row__group {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--paper);
  font-size: 11px;
  color: var(--ink-500);
}

.publication-row > .el-icon {
  flex-shrink: 0;
  color: var(--ink-300);
}

.publication-row:hover .publication-row__body strong {
  color: var(--brand-700);
}

/* ---------- 响应式 ---------- */
@media (max-width: 1180px) {
  .hero__inner {
    grid-template-columns: minmax(0, 1fr) minmax(340px, 0.8fr);
    gap: 36px;
  }

  .news-board {
    grid-template-columns: minmax(0, 1.35fr) minmax(330px, 1fr);
  }

  .match-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1020px) {
  .hero__inner {
    grid-template-columns: minmax(0, 1fr);
    gap: 34px;
    padding: 48px 0;
  }

  .scoreboard {
    max-width: 520px;
  }

  .news-board,
  .bottom-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .lead-card {
    min-height: 340px;
  }

  .match-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .hero {
    min-height: 0;
  }

  .hero__bg img {
    object-position: 52% 42%;
  }

  .hero__inner {
    gap: 26px;
    padding: 38px 0 34px;
  }

  .hero__copy h1 {
    font-size: 36px;
  }

  .hero__copy p {
    margin-top: 15px;
    font-size: 14px;
    line-height: 1.8;
  }

  .hero__actions {
    gap: 8px;
    margin-top: 22px;
  }

  .hero-btn {
    min-height: 42px;
    padding: 0 15px;
    font-size: 13px;
  }

  .scoreboard {
    padding: 16px;
  }

  .scoreboard__team strong {
    font-size: 13.5px;
  }

  .section-head h2 {
    font-size: 23px;
  }

  .home-section {
    padding: 40px 0;
  }

  .lead-card {
    min-height: 300px;
  }

  .lead-card__body {
    padding: 20px;
  }

  .lead-card__body h3 {
    font-size: 21px;
  }

  .news-side {
    padding-top: 0;
  }

  .policy-band {
    padding: 38px 0;
  }

  .policy-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .match-section .home-section {
    padding: 40px 0;
  }

  .match-strip {
    grid-template-columns: minmax(0, 1fr);
  }

  .bottom-section {
    padding-bottom: 50px;
  }

  .rank-card,
  .publication-card {
    padding: 18px;
  }

  .rank-row {
    grid-template-columns: 26px 34px minmax(0, 1fr) 46px;
    gap: 8px;
  }
}
</style>
