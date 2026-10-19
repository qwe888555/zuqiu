<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ArrowRight, Calendar, Location, Medal, Trophy } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type {
  GoalRankingRow,
  PublicContent,
  PublicMatch,
  PublicResource,
} from '../../api/types'
import { IMG } from '../../mock/data'
import StatusTag from '../../components/common/StatusTag.vue'

interface PublicCard {
  publicationId: string
  targetType: string
  displayName: string
  teamName?: string
  cityName?: string
  groupName?: string
  publicPhotoUrl?: string
}

const loading = ref(true)
const banners = ref<PublicResource[]>([])
const news = ref<PublicContent[]>([])
const policies = ref<PublicContent[]>([])
const matches = ref<PublicMatch[]>([])
const goals = ref<GoalRankingRow[]>([])
const stars = ref<PublicCard[]>([])

const featured = computed(() => news.value[0])
const newsRest = computed(() => news.value.slice(1, 5))
const liveMatches = computed(() => matches.value.filter((m) => m.status === 'LIVE'))
const upcomingMatches = computed(() => matches.value.filter((m) => m.status === 'SCHEDULED').slice(0, 3))
const heroMatch = computed(() => liveMatches.value[0] || upcomingMatches.value[0])
const heroImage = computed(() => banners.value[0]?.imageUrl || IMG.stadium)

onMounted(async () => {
  try {
    const [resourceRes, newsRes, policyRes, matchRes, goalRes, pubRes] = await Promise.all([
      publicApi.resources(),
      publicApi.contents({ page: 1, pageSize: 6, contentType: 'NEWS' }),
      publicApi.contents({ page: 1, pageSize: 5, contentType: 'POLICY' }),
      publicApi.matches({ page: 1, pageSize: 20 }),
      publicApi.goals({}),
      publicApi.publications({ page: 1, pageSize: 4 }),
    ])
    banners.value = resourceRes.items
    news.value = newsRes.items
    policies.value = policyRes.items
    matches.value = matchRes.items
    goals.value = goalRes.rows.slice(0, 5)
    stars.value = pubRes.items
  } catch {
    // 门户内容加载失败时保持空态
  } finally {
    loading.value = false
  }
})

function formatDate(value?: string) {
  return value ? dayjs(value).format('MM.DD') : '--'
}

function formatKickoff(value?: string) {
  if (!value) return '待定'
  const d = dayjs(value)
  return `${d.format('MM月DD日')} ${d.format('HH:mm')}`
}

</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="hero__bg">
        <img :src="heroImage" alt="青少年足球联赛" />
        <div class="hero__shade" />
      </div>
      <div class="container hero__inner">
        <div class="hero__copy">
          <span class="hero__eyebrow">2026 PROVINCIAL YOUTH FOOTBALL LEAGUE</span>
          <h1>绿茵逐梦<br /><em>少年当燃</em></h1>
          <p>
            四川省中小学足球联赛官方信息平台。看赛程、追比分、查政策，见证每一位少年的高光时刻。
          </p>
          <div class="hero__actions">
            <router-link to="/matches" class="btn btn--lime">
              进入赛事中心
              <el-icon><ArrowRight /></el-icon>
            </router-link>
            <router-link to="/login" class="btn btn--ghost">球队报名入口</router-link>
          </div>
          <div class="hero__stats">
            <div>
              <strong class="num">128</strong>
              <span>参赛球队</span>
            </div>
            <div>
              <strong class="num">2,436</strong>
              <span>注册球员</span>
            </div>
            <div>
              <strong class="num">186</strong>
              <span>已完赛场次</span>
            </div>
            <div>
              <strong class="num">36</strong>
              <span>公示人才</span>
            </div>
          </div>
        </div>

        <div v-if="heroMatch" class="hero-match">
          <div class="hero-match__head">
            <span class="live-pill" :class="{ 'is-live': heroMatch.status === 'LIVE' }">
              {{ heroMatch.status === 'LIVE' ? 'LIVE · 正在进行' : 'NEXT MATCH · 即将开始' }}
            </span>
            <span class="hero-match__group">{{ heroMatch.groupName }}</span>
          </div>
          <div class="hero-match__teams">
            <div class="team">
              <span class="team__badge">{{ heroMatch.homeTeamName.slice(0, 1) }}</span>
              <strong>{{ heroMatch.homeTeamName }}</strong>
            </div>
            <div class="hero-match__score">
              <template v-if="heroMatch.status !== 'SCHEDULED'">
                <span class="num">{{ heroMatch.homeScore }}</span>
                <i>:</i>
                <span class="num">{{ heroMatch.awayScore }}</span>
              </template>
              <template v-else>
                <span class="vs">VS</span>
              </template>
            </div>
            <div class="team">
              <span class="team__badge team__badge--away">{{ heroMatch.awayTeamName.slice(0, 1) }}</span>
              <strong>{{ heroMatch.awayTeamName }}</strong>
            </div>
          </div>
          <div class="hero-match__meta">
            <span><el-icon><Calendar /></el-icon>{{ formatKickoff(heroMatch.kickoffAt) }}</span>
            <span><el-icon><Location /></el-icon>{{ heroMatch.venue }}</span>
          </div>
          <router-link :to="`/matches/${heroMatch.id}`" class="hero-match__link">
            查看比赛详情
            <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>
      </div>
    </section>

    <section class="container home-section">
      <div class="headline">
        <div>
          <span class="headline__eyebrow">LATEST NEWS</span>
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
            <span class="policy-panel__eyebrow">POLICY</span>
            <h3>政策公告</h3>
            <router-link to="/policies">更多</router-link>
          </div>
          <router-link
            v-for="(policy, index) in policies"
            :key="policy.id"
            :to="`/policies/${policy.id}`"
            class="policy-row"
          >
            <span class="policy-row__index num">0{{ index + 1 }}</span>
            <span class="policy-row__title">{{ policy.title }}</span>
          </router-link>
          <div class="policy-assist">
            <el-icon><Medal /></el-icon>
            <div>
              <strong>政策看不懂？</strong>
              <span>点击右下角“政策问答”，从原文找答案。</span>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <section class="match-section">
      <div class="container home-section">
        <div class="headline headline--light">
          <div>
            <span class="headline__eyebrow">MATCH CENTER</span>
            <h2>赛事中心</h2>
          </div>
          <router-link to="/matches" class="more-link more-link--light">
            全部赛程 <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>

        <div class="match-strip">
          <router-link
            v-for="match in [...liveMatches, ...upcomingMatches].slice(0, 4)"
            :key="match.id"
            :to="`/matches/${match.id}`"
            class="match-card"
          >
            <div class="match-card__top">
              <StatusTag :status="match.status" kind="match" />
              <span>{{ match.groupName }}</span>
            </div>
            <div class="match-card__row">
              <span class="match-card__team">{{ match.homeTeamName }}</span>
              <span class="match-card__score num">
                {{ match.status === 'SCHEDULED' ? 'VS' : `${match.homeScore} : ${match.awayScore}` }}
              </span>
              <span class="match-card__team match-card__team--right">{{ match.awayTeamName }}</span>
            </div>
            <div class="match-card__meta">
              <span>{{ formatKickoff(match.kickoffAt) }}</span>
              <span>{{ match.venue }}</span>
            </div>
          </router-link>
          <div v-if="!liveMatches.length && !upcomingMatches.length" class="match-empty">
            暂无进行中或即将开始的比赛
          </div>
        </div>
      </div>
    </section>

    <section class="container home-section">
      <div class="split-layout">
        <div class="ranking-card">
          <div class="headline headline--compact">
            <div>
              <span class="headline__eyebrow">TOP SCORERS</span>
              <h2>射手榜</h2>
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
                <el-icon><Trophy /></el-icon>
                {{ row.goals }}
              </span>
            </div>
            <el-empty v-if="!loading && !goals.length" description="暂无进球数据" :image-size="70" />
          </div>
        </div>

        <div class="star-panel">
          <div class="headline headline--compact">
            <div>
              <span class="headline__eyebrow">TALENT SPOTLIGHT</span>
              <h2>公示之星</h2>
            </div>
            <router-link to="/publications" class="more-link">
              更多 <el-icon><ArrowRight /></el-icon>
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
  background: #fff;
}

.hero {
  position: relative;
  min-height: 560px;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: var(--brand-900);
}

.hero__bg {
  position: absolute;
  inset: 0;
}

.hero__bg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero__shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(4, 34, 24, 0.94) 0%, rgba(4, 34, 24, 0.78) 52%, rgba(4, 34, 24, 0.42) 100%),
    linear-gradient(0deg, rgba(4, 34, 24, 0.9), transparent 50%);
}

.hero__inner {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
  align-items: center;
  gap: 48px;
  padding: 64px 0;
}

.hero__eyebrow {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.26em;
  color: var(--lime);
}

.hero__copy h1 {
  margin-top: 16px;
  font-size: clamp(44px, 5.6vw, 72px);
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: 0.01em;
  color: #fff;
}

.hero__copy h1 em {
  font-style: normal;
  color: var(--lime);
}

.hero__copy p {
  max-width: 480px;
  margin-top: 20px;
  font-size: 13.5px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.66);
}

.hero__actions {
  display: flex;
  gap: 12px;
  margin-top: 28px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 22px;
  border-radius: 12px;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  transition: transform 0.16s ease;
}

.btn:hover {
  transform: translateY(-2px);
}

.btn--lime {
  background: var(--lime);
  color: var(--brand-900);
}

.btn--ghost {
  border: 1px solid rgba(255, 255, 255, 0.28);
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

.hero__stats {
  display: flex;
  gap: 42px;
  margin-top: 40px;
  padding-top: 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.hero__stats div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hero__stats strong {
  font-size: 25px;
  color: #fff;
}

.hero__stats span {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.44);
}

.hero-match {
  padding: 22px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(18px);
  color: #fff;
}

.hero-match__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.live-pill {
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.7);
}

.live-pill.is-live {
  background: rgba(255, 86, 86, 0.18);
  color: #ff9c9c;
}

.hero-match__group {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.46);
}

.hero-match__teams {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  margin: 22px 0 18px;
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
  width: 44px;
  height: 44px;
  border-radius: 13px;
  background: var(--lime);
  color: var(--brand-900);
  font-size: 17px;
  font-weight: 800;
}

.team__badge--away {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}

.team strong {
  font-size: 11.5px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.84);
}

.hero-match__score {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 28px;
  font-weight: 700;
}

.hero-match__score i {
  font-style: normal;
  color: rgba(255, 255, 255, 0.32);
}

.hero-match__score .vs {
  font-size: 12px;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.4);
}

.hero-match__meta {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 14px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.56);
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
  margin-top: 6px;
  padding: 9px 12px;
  border-radius: 9px;
  background: var(--lime);
  color: var(--brand-900);
  font-size: 12px;
  font-weight: 700;
}

.home-section {
  padding: 58px 0;
}

.headline {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 26px;
}

.headline__eyebrow {
  display: block;
  margin-bottom: 6px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.24em;
  color: var(--brand-600);
}

.headline h2 {
  font-size: 28px;
  letter-spacing: 0.02em;
  color: var(--ink-900);
}

.headline--light h2 {
  color: #fff;
}

.headline--light .headline__eyebrow {
  color: var(--lime);
}

.headline--compact {
  margin-bottom: 18px;
}

.headline--compact h2 {
  font-size: 21px;
}

.more-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
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
  border-radius: 18px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-card);
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
  padding: 3px 9px;
  border-radius: 6px;
  background: var(--lime);
  color: var(--brand-900);
  font-size: 10px;
  font-weight: 700;
}

.feature-card__body {
  padding: 18px 20px 21px;
}

.feature-card__date {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--brand-600);
}

.feature-card__body h3 {
  margin-top: 9px;
  font-size: 19px;
  line-height: 1.45;
}

.feature-card__body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 9px;
  font-size: 12px;
  line-height: 1.75;
  color: var(--ink-500);
}

.news-list {
  display: flex;
  flex-direction: column;
}

.news-row {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px 2px;
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
  font-size: 9px;
  color: var(--ink-300);
}

.news-row__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.news-row__body strong {
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--ink-900);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.news-row__body small {
  font-size: 11px;
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
  padding: 20px;
  border-radius: 18px;
  background: var(--brand-50);
  border: 1px solid #dcefe4;
  align-self: start;
}

.policy-panel__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.policy-panel__eyebrow {
  font-size: 8.5px;
  letter-spacing: 0.2em;
  color: var(--brand-600);
}

.policy-panel__head h3 {
  font-size: 16px;
}

.policy-panel__head a {
  margin-left: auto;
  font-size: 11px;
  color: var(--brand-700);
}

.policy-row {
  display: flex;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px dashed #d5e8db;
}

.policy-row__index {
  font-size: 10px;
  color: var(--brand-500);
  padding-top: 2px;
}

.policy-row__title {
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-700);
}

.policy-row:hover .policy-row__title {
  color: var(--brand-800);
  font-weight: 600;
}

.policy-assist {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  padding: 12px;
  border-radius: 11px;
  background: #fff;
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
  font-size: 10px;
  line-height: 1.6;
  color: var(--ink-500);
}

.match-section {
  background:
    radial-gradient(circle at 88% 10%, rgba(200, 241, 105, 0.14), transparent 32%),
    linear-gradient(150deg, #075c40, #054331);
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
  padding: 15px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.11);
  transition: background 0.16s ease, transform 0.16s ease;
}

.match-card:hover {
  background: rgba(255, 255, 255, 0.11);
  transform: translateY(-2px);
}

.match-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.42);
}

.match-card__row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  margin: 15px 0 12px;
}

.match-card__team {
  font-size: 11.5px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.82);
}

.match-card__team--right {
  text-align: right;
}

.match-card__score {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
}

.match-card__meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.4);
}

.match-empty {
  grid-column: 1 / -1;
  padding: 28px;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  border: 1px dashed rgba(255, 255, 255, 0.16);
  border-radius: 14px;
}

.split-layout {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 26px;
}

.ranking-card,
.star-panel {
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 18px;
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
  font-size: 12.5px;
}

.ranking-row__body small {
  font-size: 10.5px;
  color: var(--ink-500);
}

.ranking-row__goals {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--brand-700);
  font-size: 14px;
  font-weight: 700;
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
  border-radius: 12px;
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
  width: 46px;
  height: 46px;
  margin-bottom: 4px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand-700), var(--brand-500));
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}

.star-card strong {
  font-size: 12.5px;
}

.star-card small {
  font-size: 10px;
  color: var(--ink-500);
}

.star-card__group {
  margin-top: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9px;
}

.star-note {
  margin-top: 14px;
  font-size: 9.5px;
  line-height: 1.7;
  color: var(--ink-300);
}

@media (max-width: 1080px) {
  .hero__inner {
    grid-template-columns: 1fr;
    gap: 30px;
  }

  .hero-match {
    max-width: 420px;
  }

  .news-layout {
    grid-template-columns: 1.2fr 1fr;
  }

  .policy-panel {
    grid-column: 1 / -1;
  }

  .match-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .hero__stats {
    gap: 24px;
  }

  .hero__copy h1 {
    font-size: 42px;
  }

  .news-layout,
  .split-layout {
    grid-template-columns: 1fr;
  }

  .match-strip {
    grid-template-columns: 1fr;
  }

  .home-section {
    padding: 40px 0;
  }
}
</style>
