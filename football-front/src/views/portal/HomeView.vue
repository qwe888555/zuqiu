<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ArrowRight, Calendar, Document, Football, Location, Medal, Ticket } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type {
  GoalRankingRow,
  PublicContent,
  PublicMatch,
  PublicResource,
} from '../../api/types'
import { IMG } from '../../mock/data'
import StatusTag from '../../components/common/StatusTag.vue'
import {
  matchDisplayStatus,
  policyKind,
  readFollowedTeam,
  saveFollowedTeam,
} from '../../utils/portal'

interface PublicCard {
  publicationId: string
  targetType: string
  displayName: string
  teamName?: string
  cityName?: string
  groupName?: string
  publicPhotoUrl?: string
}

const MATCH_TABS = [
  { key: 'LIVE', label: '比赛动态' },
  { key: 'SCHEDULED', label: '即将开始' },
  { key: 'FINISHED', label: '最新赛果' },
] as const
type MatchTab = (typeof MATCH_TABS)[number]['key']

const loading = ref(true)
const banners = ref<PublicResource[]>([])
const news = ref<PublicContent[]>([])
const policies = ref<PublicContent[]>([])
const matches = ref<PublicMatch[]>([])
const goals = ref<GoalRankingRow[]>([])
const stars = ref<PublicCard[]>([])
const matchTab = ref<MatchTab>('LIVE')
const updatedAt = ref('')
const followedTeam = ref(readFollowedTeam())

// 关注学校后，相关资讯优先展示，其余仍按发布时间倒序。
const orderedNews = computed(() => {
  const list = news.value
    .slice()
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
  const team = followedTeam.value
  if (!team) return list
  const hit = (item: PublicContent) => `${item.title}${item.summary || ''}`.includes(team)
  return [...list.filter(hit), ...list.filter((item) => !hit(item))]
})
const featured = computed(() => orderedNews.value[0])
const newsRest = computed(() => orderedNews.value.slice(1, 4))
// 超过合理时长仍为 LIVE 的场次仍放在“正在进行”页签，但状态显示为“赛况待更新”。
const liveMatches = computed(() =>
  matches.value
    .filter((m) => ['LIVE', 'STALE'].includes(matchDisplayStatus(m)))
    .slice()
    .sort((a, b) => {
      const order = Number(matchDisplayStatus(b) === 'LIVE') - Number(matchDisplayStatus(a) === 'LIVE')
      return order || dayjs(a.kickoffAt).valueOf() - dayjs(b.kickoffAt).valueOf()
    }),
)
const scheduledMatches = computed(() =>
  matches.value
    .filter((m) => matchDisplayStatus(m) === 'SCHEDULED')
    .slice()
    .sort((a, b) => dayjs(a.kickoffAt).valueOf() - dayjs(b.kickoffAt).valueOf()),
)
const finishedMatches = computed(() =>
  matches.value
    .filter((m) => matchDisplayStatus(m) === 'FINISHED')
    .slice()
    .sort((a, b) => dayjs(b.kickoffAt).valueOf() - dayjs(a.kickoffAt).valueOf()),
)
const upcomingMatches = computed(() => scheduledMatches.value.slice(0, 4))
const stripMatches = computed(() => {
  const active = [...liveMatches.value, ...upcomingMatches.value]
  return (active.length ? active : finishedMatches.value).slice(0, 4)
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
// 首屏图片优先使用后台轮播资源位；正式上线时由组委会上传授权的校园赛事照片。
const heroImage = computed(() => banners.value[0]?.imageUrl || IMG.stadium)
// 移动端首屏更高，竖幅人物图能保留完整动作，避免横幅球场图被裁成一条。
// 演示数据以球场图作桌面占位；后台换成正式校园照片后，移动端会优先使用该图。
const heroMobileImage = computed(() => {
  const banner = banners.value[0]?.imageUrl
  return banner && banner !== IMG.stadium ? banner : IMG.youth
})

const materialsPolicy = computed(() =>
  policies.value.find((policy) => /报名材料|材料准备/.test(policy.title)),
)
const followOptions = computed(() => {
  const names = new Set<string>()
  matches.value.forEach((match) => {
    if (match.homeTeamName) names.add(match.homeTeamName)
    if (match.awayTeamName) names.add(match.awayTeamName)
  })
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
})
const followedMatches = computed(() =>
  matches.value.filter(
    (match) => match.homeTeamName === followedTeam.value || match.awayTeamName === followedTeam.value,
  ),
)
const followMatch = computed(() => {
  const list = followedMatches.value
  return (
    list.find((match) => ['LIVE', 'STALE'].includes(matchDisplayStatus(match))) ||
    list
      .filter((match) => matchDisplayStatus(match) === 'SCHEDULED')
      .slice()
      .sort((a, b) => dayjs(a.kickoffAt).valueOf() - dayjs(b.kickoffAt).valueOf())[0] ||
    list
      .filter((match) => matchDisplayStatus(match) === 'FINISHED')
      .slice()
      .sort((a, b) => dayjs(b.kickoffAt).valueOf() - dayjs(a.kickoffAt).valueOf())[0]
  )
})

onMounted(async () => {
  try {
    const [resourceRes, newsRes, policyRes, matchRes, goalRes, pubRes] = await Promise.all([
      publicApi.resources(),
      publicApi.contents({ page: 1, pageSize: 6, contentType: 'NEWS' }),
      publicApi.contents({ page: 1, pageSize: 5, contentType: 'POLICY' }),
      publicApi.matches({ page: 1, pageSize: 50 }),
      publicApi.goals({ groupCategory: 'PRIMARY' }),
      publicApi.publications({ page: 1, pageSize: 4 }),
    ])
    banners.value = resourceRes.items
    news.value = newsRes.items
    policies.value = policyRes.items
    matches.value = matchRes.items
    goals.value = goalRes.rows.slice(0, 5)
    stars.value = pubRes.items
    if (!liveMatches.value.length) {
      matchTab.value = scheduledMatches.value.length ? 'SCHEDULED' : 'FINISHED'
    }
    if (followedTeam.value && !followOptions.value.includes(followedTeam.value)) {
      followedTeam.value = ''
    }
  } catch {
    // 门户内容加载失败时保持空态
  } finally {
    updatedAt.value = dayjs().format('HH:mm')
    loading.value = false
  }
})

watch(followedTeam, (value) => saveFollowedTeam(value))

function formatDate(value?: string) {
  return value ? dayjs(value).format('MM.DD') : '--'
}

function formatKickoff(value?: string) {
  if (!value) return '待定'
  const d = dayjs(value)
  return `${d.format('MM月DD日')} ${d.format('HH:mm')}`
}

function matchCta(status?: string) {
  if (status === 'LIVE') return '查看实时赛况'
  if (status === 'STALE') return '查看已记录赛况'
  if (status === 'SCHEDULED') return '查看赛程详情'
  return '查看比赛结果'
}

function scoreText(match: PublicMatch) {
  const status = matchDisplayStatus(match)
  if (status === 'SCHEDULED') return 'VS'
  if (match.status === 'CANCELLED') return '—'
  return `${match.homeScore} : ${match.awayScore}`
}

function opponentName(match: PublicMatch) {
  return match.homeTeamName === followedTeam.value ? match.awayTeamName : match.homeTeamName
}

function followScore(match: PublicMatch) {
  return matchDisplayStatus(match) === 'SCHEDULED'
    ? 'VS'
    : `${match.homeScore} : ${match.awayScore}`
}

function policyImportant(title: string) {
  return /报名|材料/.test(title)
}

</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="hero__bg">
        <picture>
          <source media="(max-width: 760px)" :srcset="heroMobileImage" />
          <img :src="heroImage" alt="青少年足球联赛" />
        </picture>
        <div class="hero__shade" />
      </div>
      <div class="container hero__inner">
        <div class="hero__copy">
          <span class="hero__eyebrow">四川省青少年校园足球联赛 · 2026 赛季</span>
          <h1>四川省中小学<br />足球联赛</h1>
          <p>
            赛事官方信息发布平台。集中查询赛程比分、竞赛规程、政策文件与人才公示，了解全省校园足球赛事进展。
          </p>
          <div class="hero__tasks">
            <router-link to="/matches" class="hero-task hero-task--primary">
              <el-icon><Calendar /></el-icon>
              <span>
                <strong>查看赛程</strong>
                <small>比分与轮次</small>
              </span>
            </router-link>
            <router-link to="/login" class="hero-task">
              <el-icon><Ticket /></el-icon>
              <span>
                <strong>球队报名</strong>
                <small>球队与高校</small>
              </span>
            </router-link>
            <router-link to="/policies" class="hero-task">
              <el-icon><Document /></el-icon>
              <span>
                <strong>政策公告</strong>
                <small>规程与材料</small>
              </span>
            </router-link>
          </div>
          <div class="hero__stats-block">
            <span class="hero__stats-scope">2026 赛季 · 全省统计</span>
            <div class="hero__stats">
              <div>
                <strong class="num">128</strong>
                <span>本届参赛球队</span>
              </div>
              <div>
                <strong class="num">2,436</strong>
                <span>本届注册球员</span>
              </div>
              <div>
                <strong class="num">186</strong>
                <span>已完赛场次</span>
              </div>
              <div>
                <strong class="num">36</strong>
                <span>公示人数</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="featuredMatch" class="hero-match">
          <div class="hero-match__tabs" role="tablist" aria-label="比赛状态筛选">
            <button
              v-for="tab in MATCH_TABS"
              :key="tab.key"
              type="button"
              role="tab"
              class="hero-match__tab"
              :class="{ 'is-active': matchTab === tab.key }"
              :aria-selected="matchTab === tab.key"
              @click="matchTab = tab.key"
            >
              {{ tab.label }}
              <span v-if="tab.key === 'LIVE' && liveMatches.length" class="hero-match__count">
                {{ liveMatches.length }}
              </span>
            </button>
          </div>

          <div class="hero-match__head">
            <span class="hero-match__status">
              <span v-if="featuredStatus === 'LIVE'" class="live-dot" />
              <StatusTag :status="featuredStatus" kind="match" />
            </span>
            <span class="hero-match__group">{{ featuredMatch.groupName || featuredMatch.eventName }}</span>
          </div>

          <p v-if="showFallbackNote" class="hero-match__fallback">该时段暂无比赛，以下为最近一场</p>

          <div class="hero-match__teams">
            <div class="team">
              <span class="team__badge">{{ featuredMatch.homeTeamName.slice(0, 1) }}</span>
              <strong>{{ featuredMatch.homeTeamName }}</strong>
            </div>
            <div class="hero-match__score">
              <template v-if="featuredMatch.status !== 'SCHEDULED'">
                <span class="num">{{ featuredMatch.homeScore }}</span>
                <i>:</i>
                <span class="num">{{ featuredMatch.awayScore }}</span>
              </template>
              <template v-else>
                <span class="vs">VS</span>
              </template>
            </div>
            <div class="team">
              <span class="team__badge">{{ featuredMatch.awayTeamName.slice(0, 1) }}</span>
              <strong>{{ featuredMatch.awayTeamName }}</strong>
            </div>
          </div>
          <div class="hero-match__meta">
            <span><el-icon><Calendar /></el-icon>{{ formatKickoff(featuredMatch.kickoffAt) }}</span>
            <span><el-icon><Location /></el-icon>{{ featuredMatch.venue || '场地待定' }}</span>
          </div>
          <router-link :to="`/matches/${featuredMatch.id}`" class="hero-match__link">
            {{ matchCta(featuredStatus) }}
            <el-icon><ArrowRight /></el-icon>
          </router-link>
          <span v-if="updatedAt" class="hero-match__updated">页面数据更新于 {{ updatedAt }}</span>
        </div>

        <div v-else class="hero-match hero-match--empty">
          <span class="hero-match__group">赛程</span>
          <p>当前暂无进行中或即将开始的比赛。</p>
          <router-link to="/matches" class="hero-match__link">
            查看全部赛程
            <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>
      </div>
    </section>

    <section v-if="followOptions.length" class="follow-strip">
      <div class="container follow-strip__inner">
        <div class="follow-strip__pick">
          <span class="follow-strip__label">关注学校 / 球队</span>
          <el-select
            v-model="followedTeam"
            class="follow-select"
            placeholder="选择学校或球队"
            filterable
            clearable
          >
            <el-option v-for="team in followOptions" :key="team" :label="team" :value="team" />
          </el-select>
        </div>

        <router-link v-if="followedTeam && followMatch" :to="`/matches/${followMatch.id}`" class="follow-strip__match">
          <StatusTag :status="matchDisplayStatus(followMatch)" kind="match" />
          <strong>{{ followedTeam }}</strong>
          <span class="follow-strip__opponent">对阵 {{ opponentName(followMatch) }}</span>
          <span class="follow-strip__score num">{{ followScore(followMatch) }}</span>
          <span class="follow-strip__time">{{ formatKickoff(followMatch.kickoffAt) }}</span>
          <el-icon><ArrowRight /></el-icon>
        </router-link>
        <p v-else-if="followedTeam" class="follow-strip__hint">
          暂未查到该校比赛，<router-link to="/matches">查看全部赛程</router-link>
        </p>
        <p v-else class="follow-strip__hint">
          关注后，首页优先显示该校的下一场比赛与最新赛果；关注记录仅保存在本机浏览器。
        </p>
      </div>
    </section>

    <section class="container home-section">
      <div class="headline">
        <div>
          <h2>赛事资讯</h2>
        </div>
        <router-link to="/news" class="more-link">
          全部资讯 <el-icon><ArrowRight /></el-icon>
        </router-link>
      </div>

      <div class="news-layout" v-loading="loading">
        <router-link v-if="featured" :to="`/news/${featured.id}`" class="feature-card">
          <div class="feature-card__cover">
            <img :src="featured.publicCoverUrl || IMG.match" :alt="featured.title" />
            <span class="feature-card__tag">焦点</span>
          </div>
          <div class="feature-card__body">
            <span class="feature-card__date">{{ formatDate(featured.publishedAt) }}</span>
            <h3>{{ featured.title }}</h3>
            <p>{{ featured.summary }}</p>
          </div>
        </router-link>

        <div class="news-list">
          <router-link
            v-for="item in newsRest"
            :key="item.id"
            :to="`/news/${item.id}`"
            class="news-row"
          >
            <span class="news-row__date">
              <strong class="num">{{ formatDate(item.publishedAt).split('.')[1] }}</strong>
              <small>{{ formatDate(item.publishedAt).split('.')[0] }}月</small>
            </span>
            <span class="news-row__body">
              <strong>{{ item.title }}</strong>
              <small>{{ item.summary }}</small>
            </span>
            <el-icon class="news-row__arrow"><ArrowRight /></el-icon>
          </router-link>
          <el-empty v-if="!loading && !newsRest.length" description="暂无资讯" :image-size="70" />
        </div>

        <aside class="policy-panel">
          <div class="policy-panel__head">
            <div>
              <h3>政策公告</h3>
              <p>报名、参赛与资格审查的正式依据</p>
            </div>
            <router-link to="/policies">全部</router-link>
          </div>
          <router-link
            v-for="policy in policies"
            :key="policy.id"
            :to="`/policies/${policy.id}`"
            class="policy-row"
          >
            <span class="policy-row__tag" :class="{ 'is-important': policyImportant(policy.title) }">
              {{ policyKind(policy.title) }}
            </span>
            <span class="policy-row__body">
              <span class="policy-row__title">{{ policy.title }}</span>
              <span class="policy-row__date">{{ formatDate(policy.publishedAt) }}</span>
            </span>
          </router-link>
          <router-link
            :to="materialsPolicy ? `/policies/${materialsPolicy.id}` : '/policies'"
            class="policy-panel__all"
          >
            查看报名办法与材料要求
            <el-icon><ArrowRight /></el-icon>
          </router-link>
          <div class="policy-assist">
            <el-icon><Medal /></el-icon>
            <div>
              <strong>政策原文问答</strong>
              <span>点击右下角“政策问答”，回答均标注原文依据。</span>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <section class="match-section">
      <div class="container home-section">
        <div class="headline headline--light">
          <div>
            <h2>赛程与比分</h2>
          </div>
          <router-link to="/matches" class="more-link more-link--light">
            全部赛程 <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>

        <div class="match-strip">
          <router-link
            v-for="match in stripMatches"
            :key="match.id"
            :to="`/matches/${match.id}`"
            class="match-card"
          >
            <div class="match-card__top">
              <StatusTag :status="matchDisplayStatus(match)" kind="match" />
              <span>{{ match.groupName }}</span>
            </div>
            <div class="match-card__row">
              <span class="match-card__team">{{ match.homeTeamName }}</span>
              <span
                class="match-card__score num"
                :class="{ 'is-live': matchDisplayStatus(match) === 'LIVE' }"
              >
                {{ scoreText(match) }}
              </span>
              <span class="match-card__team match-card__team--right">{{ match.awayTeamName }}</span>
            </div>
            <div class="match-card__meta">
              <span>{{ formatKickoff(match.kickoffAt) }}</span>
              <span>{{ match.venue || '场地待定' }}</span>
            </div>
          </router-link>
          <div v-if="!stripMatches.length" class="match-empty">
            当前没有可展示的比赛，赛程发布后将在此更新。
          </div>
        </div>
      </div>
    </section>

    <section class="container home-section">
      <div class="split-layout">
        <div class="ranking-card">
          <div class="headline headline--compact">
            <div>
              <h2>小学组射手榜</h2>
              <span class="headline__note">各组别分别统计，完整榜单可按组查看</span>
            </div>
            <router-link to="/rankings" class="more-link">
              完整榜单 <el-icon><ArrowRight /></el-icon>
            </router-link>
          </div>
          <div class="ranking-list">
            <div v-for="row in goals" :key="row.athleteId" class="ranking-row">
              <span class="ranking-row__rank num" :class="{ 'is-top': row.rank <= 3 }">{{ row.rank }}</span>
              <span class="ranking-row__avatar">{{ row.athleteName.slice(0, 1) }}</span>
              <span class="ranking-row__body">
                <strong>{{ row.athleteName }}</strong>
                <small>{{ row.teamName }}</small>
              </span>
              <span class="ranking-row__goals num">
                <el-icon><Football /></el-icon>
                {{ row.goals }}<i>球</i>
              </span>
            </div>
            <el-empty v-if="!loading && !goals.length" description="暂无进球数据" :image-size="70" />
          </div>
        </div>

        <div class="star-panel">
          <div class="headline headline--compact">
            <div>
              <h2>最新公示</h2>
            </div>
            <router-link to="/publications" class="more-link">
              全部公示 <el-icon><ArrowRight /></el-icon>
            </router-link>
          </div>
          <div class="star-grid">
            <router-link
              v-for="star in stars"
              :key="star.publicationId"
              to="/publications"
              class="star-card"
            >
              <span class="star-card__avatar">{{ star.displayName.slice(0, 1) }}</span>
              <strong>{{ star.displayName }}</strong>
              <small>{{ star.teamName }}</small>
              <span class="star-card__group">{{ star.groupName }}</span>
            </router-link>
            <el-empty v-if="!loading && !stars.length" description="暂无公示" :image-size="70" />
          </div>
          <p class="star-note">公示名单仅展示经审核确认的公开信息，姓名按脱敏规则展示。</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  background: var(--paper);
}

.hero {
  position: relative;
  min-height: 540px;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: var(--brand-900);
}

.hero__bg {
  position: absolute;
  inset: 0;
}

.hero__bg picture {
  display: block;
  width: 100%;
  height: 100%;
}

.hero__bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 58% 50%;
}

.hero__shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(7, 52, 39, 0.97) 0%, rgba(7, 52, 39, 0.86) 48%, rgba(7, 52, 39, 0.34) 100%),
    linear-gradient(0deg, rgba(7, 52, 39, 0.88), transparent 58%);
}

.hero__inner {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(330px, 0.65fr);
  align-items: center;
  gap: 48px;
  padding: 56px 0;
}

.hero__copy {
  min-width: 0;
}

.hero__eyebrow {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.72);
}

.hero__copy h1 {
  margin-top: 14px;
  font-size: clamp(36px, 4.2vw, 54px);
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: 0.01em;
  color: #fff;
}

.hero__copy p {
  max-width: 540px;
  margin-top: 18px;
  font-size: 16px;
  line-height: 1.9;
  color: #dce8df;
}

.hero__tasks {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  max-width: 560px;
  margin-top: 26px;
}

.hero-task {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 56px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.07);
  color: #fff;
  transition: background 0.16s ease, border-color 0.16s ease;
}

.hero-task:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.34);
}

.hero-task .el-icon {
  flex-shrink: 0;
  font-size: 17px;
}

.hero-task span {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.hero-task strong {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}

.hero-task small {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.58);
  white-space: nowrap;
}

.hero-task--primary {
  border-color: var(--lime);
  background: var(--lime);
  color: var(--brand-900);
}

.hero-task--primary:hover {
  border-color: var(--lime);
  background: #d6f88a;
}

.hero-task--primary small {
  color: rgba(7, 59, 44, 0.66);
}

.hero__stats-block {
  margin-top: 30px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.16);
}

.hero__stats-scope {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.56);
}

.hero__stats {
  display: flex;
  gap: 40px;
  margin-top: 10px;
}

.hero__stats div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hero__stats strong {
  font-size: 25px;
  line-height: 1.2;
  color: #fff;
}

.hero__stats span {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.64);
}

.hero-match {
  min-width: 0;
  padding: 18px 20px 16px;
  border-radius: 8px;
  background: #0a4a37;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #fff;
}

.hero-match__tabs {
  display: flex;
  gap: 14px;
  padding-bottom: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.hero-match__tab {
  position: relative;
  padding: 0 0 8px;
  border: none;
  background: none;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.58);
  cursor: pointer;
}

.hero-match__tab:hover {
  color: #fff;
}

.hero-match__tab.is-active {
  color: #fff;
  font-weight: 600;
}

.hero-match__tab.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--lime);
}

.hero-match__count {
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.12);
  font-family: var(--font-display);
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.78);
}

.hero-match__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hero-match__status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.hero-match__group {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.62);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-match__fallback {
  margin-top: 8px;
  font-size: 10.5px;
  color: #ffc9a3;
}

.hero-match__teams {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  margin: 20px 0 16px;
}

.team {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.team__badge {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}

.team strong {
  font-size: 12.5px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.92);
}

.hero-match__score {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 30px;
  font-weight: 700;
  color: #fff;
}

.hero-match__score i {
  font-style: normal;
  color: rgba(255, 255, 255, 0.4);
}

.hero-match__score .vs {
  font-size: 12px;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.5);
}

.hero-match__meta {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 13px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.68);
}

.hero-match__meta span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hero-match__link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  transition: background 0.16s ease, border-color 0.16s ease;
}

.hero-match__link:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.4);
}

.hero-match__updated {
  display: block;
  margin-top: 8px;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
  text-align: right;
}

.hero-match--empty {
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
  min-height: 200px;
}

.hero-match--empty p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}

.follow-strip {
  background: #fff;
  border-bottom: 1px solid var(--line);
}

.follow-strip__inner {
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 64px;
  padding: 11px 0;
}

.follow-strip__pick {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.follow-strip__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-700);
  white-space: nowrap;
}

.follow-select {
  width: 190px;
}

.follow-select :deep(.el-select__wrapper) {
  min-height: 34px;
  background: var(--paper);
  box-shadow: none;
  border: 1px solid var(--line);
}

.follow-select :deep(.el-select__wrapper.is-focused) {
  border-color: var(--brand-500);
}

.follow-strip__match {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin-left: auto;
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
}

.follow-strip__match strong {
  font-size: 12.5px;
  color: var(--ink-900);
  white-space: nowrap;
}

.follow-strip__opponent {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--ink-500);
}

.follow-strip__score {
  font-size: 13px;
  font-weight: 700;
  color: var(--brand-800);
  white-space: nowrap;
}

.follow-strip__time {
  font-size: 11px;
  color: var(--ink-500);
  white-space: nowrap;
}

.follow-strip__match .el-icon {
  flex-shrink: 0;
  color: var(--ink-300);
}

.follow-strip__hint {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--ink-500);
}

.follow-strip__hint a {
  color: var(--brand-700);
  font-weight: 600;
}

.home-section {
  padding: 56px 0;
}

.headline {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.headline h2 {
  font-size: 24px;
  font-weight: 600;
  color: var(--ink-900);
}

.headline__note {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: var(--ink-500);
}

.headline--light h2 {
  color: #fff;
}

.headline--compact {
  margin-bottom: 16px;
}

.headline--compact h2 {
  font-size: 19px;
}

.more-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  color: var(--ink-500);
}

.more-link:hover {
  color: var(--brand-700);
}

.more-link--light {
  color: rgba(255, 255, 255, 0.56);
}

.news-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.95fr) minmax(250px, 0.6fr);
  gap: 24px;
}

.feature-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--line);
}

.feature-card__cover {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: var(--brand-50);
}

.feature-card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.feature-card:hover img {
  transform: scale(1.04);
}

.feature-card__tag {
  position: absolute;
  left: 14px;
  top: 14px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--lime);
  color: var(--brand-900);
  font-size: 10px;
  font-weight: 600;
}

.feature-card__body {
  padding: 18px 20px 21px;
}

.feature-card__date {
  font-size: 11.5px;
  color: var(--ink-500);
}

.feature-card__body h3 {
  margin-top: 9px;
  font-size: 20px;
  line-height: 1.45;
}

.feature-card__body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 9px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--ink-500);
}

.news-list {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.news-row {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 16px 2px;
  border-bottom: 1px solid var(--line);
}

.news-row:first-child {
  padding-top: 4px;
}

.news-row__date {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 44px;
}

.news-row__date strong {
  font-size: 21px;
  line-height: 1;
  color: var(--brand-800);
}

.news-row__date small {
  margin-top: 2px;
  font-size: 10px;
  color: var(--ink-500);
}

.news-row__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.news-row__body strong {
  font-size: 15px;
  line-height: 1.5;
  color: var(--ink-900);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.news-row__body small {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink-500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.news-row__arrow {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--ink-300);
}

.news-row:hover .news-row__arrow {
  color: var(--brand-700);
}

.policy-panel {
  padding: 18px;
  border-radius: 8px;
  background: #edf5ef;
  border: 1px solid var(--line);
  align-self: start;
}

.policy-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(8, 127, 91, 0.14);
}

.policy-panel__head h3 {
  font-size: 15px;
  font-weight: 600;
}

.policy-panel__head p {
  margin-top: 3px;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--ink-500);
}

.policy-panel__head a {
  flex-shrink: 0;
  padding-top: 2px;
  font-size: 11.5px;
  color: var(--brand-700);
}

.policy-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 11px 0;
  border-bottom: 1px solid rgba(8, 127, 91, 0.12);
}

.policy-row__tag {
  flex-shrink: 0;
  margin-top: 1px;
  padding: 2px 5px;
  border: 1px solid #d3e6da;
  border-radius: 3px;
  background: #fff;
  font-size: 9.5px;
  line-height: 1.4;
  color: var(--brand-700);
  white-space: nowrap;
}

.policy-row__tag.is-important {
  border-color: #f6d5c2;
  background: var(--live-soft);
  color: var(--live);
}

.policy-row__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.policy-row__title {
  font-size: 13px;
  line-height: 1.55;
  color: var(--ink-700);
}

.policy-row__date {
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--ink-500);
}

.policy-row:hover .policy-row__title {
  color: var(--brand-800);
  font-weight: 600;
}

.policy-panel__all {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  padding: 7px 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-700);
}

.policy-assist {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  padding: 12px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid var(--line);
  color: var(--brand-700);
}

.policy-assist strong {
  display: block;
  font-size: 11.5px;
  color: var(--ink-900);
}

.policy-assist span {
  display: block;
  margin-top: 3px;
  font-size: 10.5px;
  line-height: 1.65;
  color: var(--ink-500);
}

.match-section {
  background: var(--brand-900);
  color: #fff;
}

.match-section .home-section {
  padding: 52px 0 58px;
}

.match-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.match-card {
  padding: 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.13);
  transition: background 0.16s ease, border-color 0.16s ease;
}

.match-card:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.24);
}

.match-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.6);
}

.match-card__row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  margin: 15px 0 12px;
}

.match-card__team {
  font-size: 13px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.9);
}

.match-card__team--right {
  text-align: right;
}

.match-card__score {
  font-size: 19px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
}

.match-card__score.is-live {
  color: var(--lime);
}

.match-card__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.62);
}

.match-empty {
  grid-column: 1 / -1;
  padding: 28px;
  text-align: center;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.6);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 8px;
}

.split-layout {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 26px;
}

.ranking-card,
.star-panel {
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.ranking-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--line);
}

.ranking-row:last-child {
  border-bottom: none;
}

.ranking-row__rank {
  width: 22px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-300);
}

.ranking-row__rank.is-top {
  color: var(--brand-700);
}

.ranking-row__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-800);
  font-size: 12px;
  font-weight: 700;
}

.ranking-row__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ranking-row__body strong {
  font-size: 15px;
}

.ranking-row__body small {
  font-size: 13px;
  color: var(--ink-500);
}

.ranking-row__goals {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--brand-700);
  font-size: 17px;
  font-weight: 700;
}

.ranking-row__goals .el-icon {
  font-size: 14px;
}

.ranking-row__goals i {
  margin-left: 1px;
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
}

.star-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.star-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 10px;
  border-radius: 6px;
  background: var(--paper);
  border: 1px solid transparent;
  text-align: center;
  transition: 0.16s;
}

.star-card:hover {
  border-color: var(--brand-500);
  background: var(--brand-50);
}

.star-card__avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  margin-bottom: 4px;
  border-radius: 50%;
  background: var(--brand-700);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.star-card strong {
  font-size: 13px;
}

.star-card small {
  font-size: 11px;
  color: var(--ink-500);
}

.star-card__group {
  margin-top: 4px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9.5px;
}

.star-note {
  margin-top: 14px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-500);
}

@media (max-width: 1080px) {
  .hero__inner {
    grid-template-columns: minmax(0, 1fr);
    gap: 30px;
  }

  .hero-match {
    max-width: 460px;
  }

  .news-layout {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  }

  .policy-panel {
    grid-column: 1 / -1;
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
    object-position: 50% 44%;
  }

  .hero__inner {
    gap: 26px;
    padding: 38px 0 34px;
  }

  .hero__copy h1 {
    font-size: 32px;
  }

  .hero__copy p {
    margin-top: 14px;
    font-size: 15px;
    line-height: 1.85;
  }

  .hero__tasks {
    gap: 6px;
    margin-top: 22px;
  }

  .hero-task {
    gap: 7px;
    min-height: 54px;
    padding: 7px 8px;
  }

  .hero-task .el-icon {
    font-size: 15px;
  }

  .hero-task strong {
    font-size: 12px;
  }

  .hero-task small {
    font-size: 9.5px;
  }

  .hero__stats-block {
    margin-top: 24px;
  }

  .hero__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 20px;
    margin-top: 10px;
  }

  .hero__stats strong {
    font-size: 21px;
  }

  .hero__stats span {
    font-size: 11px;
  }

  .hero-match {
    max-width: none;
    padding: 16px;
  }

  .follow-strip__inner {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 14px 0;
  }

  .follow-strip__pick {
    justify-content: space-between;
  }

  .follow-select {
    width: min(210px, 62%);
  }

  .follow-strip__match {
    margin-left: 0;
    flex-wrap: wrap;
  }

  .follow-strip__hint {
    margin-left: 0;
  }

  .news-layout,
  .split-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .match-strip {
    grid-template-columns: 1fr;
  }

  .home-section {
    padding: 40px 0;
  }
}

@media (max-width: 420px) {
  .hero-task {
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    min-height: 70px;
  }

  .hero-task .el-icon {
    display: none;
  }

  .hero-task strong {
    font-size: 12px;
  }

  .follow-strip__label {
    font-size: 11.5px;
  }

  .follow-select {
    width: 58%;
  }
}
</style>
