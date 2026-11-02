<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Medal, Trophy } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { GoalRankingRow, PublicEvent } from '../../api/types'
import { useVisiblePolling } from '../../composables/useVisiblePolling'
import { goalGapToPrevious, rankGoalRows } from '../../utils/goalRanking'
import { sortPublicEvents } from '../../utils/portal'

const loading = ref(false)
const rows = ref<GoalRankingRow[]>([])
const events = ref<PublicEvent[]>([])
const eventId = ref('')
const category = ref('PRIMARY')
const generatedAt = ref('')

const categories = [
  { label: '小学组', value: 'PRIMARY' },
  { label: '中学组', value: 'MIDDLE' },
]

const currentCategoryLabel = computed(
  () => categories.find((item) => item.value === category.value)?.label || '当前组别',
)

/**
 * 公开接口返回的 rank 是跨组别生成的，切组后会出现空号。
 * 这里按组内进球数重排；同分并列，后续名次顺延（1、1、3）。
 */
const rankedRows = computed(() => rankGoalRows(rows.value))

const podium = computed(() => rankedRows.value.slice(0, 3))
const rest = computed(() => rankedRows.value.slice(3))
const leader = computed(() => rankedRows.value[0])
const topGoals = computed(() => leader.value?.goals || 0)
const totalGoals = computed(() => rankedRows.value.reduce((sum, row) => sum + row.goals, 0))
const leaderTied = computed(
  () => leader.value !== undefined && rankedRows.value.filter((row) => row.goals === leader.value?.goals).length > 1,
)
const nextBest = computed(() => rankedRows.value.find((row) => row.goals < topGoals.value))
const leadMargin = computed(() =>
  leader.value && nextBest.value ? leader.value.goals - nextBest.value.goals : 0,
)
const generatedTime = computed(() =>
  generatedAt.value ? dayjs(generatedAt.value).format('MM-DD HH:mm') : '',
)

function padRank(rank: number) {
  return String(rank).padStart(2, '0')
}

function barWidth(goals: number) {
  return `${Math.max(5, Math.round((goals / (topGoals.value || 1)) * 100))}%`
}

function gapToLeader(goals: number) {
  return topGoals.value - goals
}

function goalShare(goals: number) {
  return totalGoals.value ? Math.round((goals / totalGoals.value) * 100) : 0
}

function isTied(row: GoalRankingRow) {
  return rankedRows.value.filter((item) => item.goals === row.goals).length > 1
}

function rankTag(row: GoalRankingRow) {
  if (row.goals === topGoals.value) return leaderTied.value ? '并列领跑' : '组内领跑'
  return isTied(row) ? '并列追赶' : '追赶中'
}

function podiumFoot(index: number) {
  if (index === 0) {
    if (leaderTied.value) return '与追赶者并列榜首'
    if (!nextBest.value) return '本组唯一上榜球员'
    return `领先次席 ${leadMargin.value} 球`
  }
  const gap = goalGapToPrevious(rankedRows.value, index)
  if (gap === null) return '追赶中'
  return gap ? `距上一名 ${gap} 球` : '与上一名同分'
}

async function fetchGoals(id: string) {
  return publicApi.goals({ eventId: id, category: category.value })
}

function markRefreshed() {
  // 接口不返回统计生成时间，使用前端成功刷新时间并明确标注口径。
  generatedAt.value = new Date().toISOString()
}

async function refreshSilently() {
  if (!eventId.value || loading.value) return
  try {
    const res = await fetchGoals(eventId.value)
    rows.value = res.rows
    markRefreshed()
  } catch {
    // 静默刷新失败保留上一次结果
  }
}

async function load() {
  loading.value = true
  try {
    // /public/events 免登录，访客据此取得射手榜所需的赛事上下文。
    if (!events.value.length) {
      const res = await publicApi.events({ page: 1, pageSize: 50 })
      events.value = sortPublicEvents(res.items)
    }
    if (eventId.value) {
      const res = await fetchGoals(eventId.value)
      rows.value = res.rows
      markRefreshed()
      return
    }
    // 首次进入按状态优先探测，跳过尚无进球数据的赛事。
    for (const event of events.value) {
      const res = await fetchGoals(event.id)
      if (res.rows.length) {
        eventId.value = event.id
        rows.value = res.rows
        markRefreshed()
        return
      }
    }
    eventId.value = events.value[0]?.id || ''
    rows.value = []
    generatedAt.value = ''
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function changeEvent() {
  generatedAt.value = ''
  await load()
}

function switchCategory(value: string) {
  if (category.value === value) return
  category.value = value
  load()
}

onMounted(load)
useVisiblePolling(refreshSilently, 30_000)
</script>

<template>
  <div class="ranking-page">
    <section class="page-hero">
      <span class="hero-orbit" aria-hidden="true" />
      <div class="container hero-grid">
        <div class="hero-copy">
          <span class="hero-kicker">TOP SCORERS · 2026 SEASON</span>
          <h1>射手榜</h1>
          <p>按组别统计已确认赛果中的进球数据；同分并列，后续名次顺延。</p>
        </div>
        <div v-if="!loading" class="hero-stats">
          <div>
            <strong class="num">{{ rows.length }}</strong>
            <span>上榜球员</span>
          </div>
          <div>
            <strong class="num">{{ topGoals }}</strong>
            <span>组内最高进球</span>
          </div>
          <div>
            <strong class="num">{{ totalGoals }}</strong>
            <span>累计进球</span>
          </div>
        </div>
      </div>
    </section>

    <div class="container ranking-body">
      <div class="ranking-toolbar">
        <div class="toolbar-controls">
          <el-select
            v-model="eventId"
            size="large"
            placeholder="选择赛事"
            class="event-select"
            @change="changeEvent"
          >
            <el-option
              v-for="event in events"
              :key="event.id"
              :label="event.name"
              :value="event.id"
            />
          </el-select>
          <span class="toolbar-divider" aria-hidden="true" />
          <div class="scope-tabs" role="tablist" aria-label="选择组别">
            <button
              v-for="item in categories"
              :key="item.value"
              type="button"
              role="tab"
              class="scope-tab"
              :class="{ 'is-active': category === item.value }"
              :aria-selected="category === item.value"
              @click="switchCategory(item.value)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>
        <div class="toolbar-meta">
          <span class="scope-note">
            <i />
            {{ currentCategoryLabel }} · 组内排名
          </span>
          <span v-if="generatedTime" class="updated">
            本页更新于 {{ generatedTime }} · 以记录台确认数据为准
          </span>
        </div>
      </div>

      <div v-loading="loading" class="ranking-content">
        <div v-if="podium.length" class="podium-hall">
          <span class="podium-hall__pitch" aria-hidden="true">
            <i class="podium-hall__box podium-hall__box--left" />
            <i class="podium-hall__box podium-hall__box--right" />
            <i class="podium-hall__spot" />
          </span>
          <div class="podium" :class="`podium--${podium.length}`">
          <article
            v-for="(row, index) in podium"
            :key="row.athleteId"
            class="podium-card"
            :class="[
              index === 0 ? 'is-leader' : `is-position-${index + 1}`,
              `is-rank-${row.rank}`,
            ]"
          >
            <header class="podium-card__head">
              <span class="podium-card__rank">
                <i>RANK</i>
                <b class="num">{{ padRank(row.rank) }}</b>
              </span>
              <span class="podium-card__tag">
                <el-icon v-if="index === 0"><Trophy /></el-icon>
                {{ rankTag(row) }}
              </span>
            </header>

            <span class="podium-card__avatar">{{ row.athleteName.slice(0, 1) }}</span>
            <strong class="podium-card__name">{{ row.athleteName }}</strong>
            <span class="podium-card__team">{{ row.teamName }}</span>

            <div class="podium-card__score">
              <strong class="num">{{ row.goals }}</strong>
              <span>球</span>
            </div>

            <div class="podium-card__bar">
              <i :style="{ width: barWidth(row.goals) }" />
            </div>

            <footer class="podium-card__foot">
              <span>{{ podiumFoot(index) }}</span>
              <span>占全组 {{ goalShare(row.goals) }}%</span>
            </footer>
          </article>
          </div>
        </div>

        <section v-if="rest.length" class="list-card">
          <div class="list-head" aria-hidden="true">
            <span>排名</span>
            <span>球员 / 所属球队</span>
            <span>进球进度</span>
            <span class="align-right">进球数</span>
          </div>

          <div v-for="row in rest" :key="row.athleteId" class="list-row">
            <span class="list-row__rank num">{{ padRank(row.rank) }}</span>
            <span class="list-row__player">
              <span class="list-row__avatar">{{ row.athleteName.slice(0, 1) }}</span>
              <span class="list-row__who">
                <strong>{{ row.athleteName }}</strong>
                <small>{{ row.teamName }}</small>
              </span>
            </span>
            <span class="list-row__progress">
              <span class="list-row__bar">
                <i :style="{ width: barWidth(row.goals) }" />
              </span>
              <span class="list-row__meta">
                <small>{{ gapToLeader(row.goals) ? `距榜首 ${gapToLeader(row.goals)} 球` : '并列榜首' }}</small>
                <small>占全组 {{ goalShare(row.goals) }}%</small>
              </span>
            </span>
            <span class="list-row__goals num">{{ row.goals }}<i>球</i></span>
          </div>
        </section>

        <div v-if="!loading && !rows.length" class="empty-card">
          <el-empty :description="`${currentCategoryLabel}暂无进球数据`" />
        </div>
      </div>

      <p v-if="!loading && rows.length" class="ranking-note">
        <el-icon><Medal /></el-icon>
        <span>
          {{ currentCategoryLabel }}共 {{ rows.length }} 名球员 · 同分并列，后续名次顺延 ·
          数据以记录台确认赛果为准。如有异议，请由参赛单位向组委会书面申诉。
        </span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.ranking-page {
  min-height: 70vh;
  padding-bottom: 64px;
  background: var(--paper);
}

.page-hero {
  position: relative;
  overflow: hidden;
  padding: 30px 0 28px;
  background: linear-gradient(118deg, #062f24 0%, #073b2c 54%, #0a4a37 100%);
  color: #fff;
}

.page-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(58% 120% at 88% 0%, rgba(200, 243, 106, 0.14) 0%, transparent 62%);
  pointer-events: none;
}

.hero-orbit {
  position: absolute;
  top: -190px;
  right: 6%;
  width: 380px;
  height: 380px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 50%;
  box-shadow: inset 0 0 0 46px rgba(255, 255, 255, 0.016);
  pointer-events: none;
}

.hero-grid {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 30px;
}

.hero-copy {
  min-width: 0;
}

.hero-kicker {
  display: block;
  margin-bottom: 9px;
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--lime);
}

.page-hero h1 {
  font-size: clamp(28px, 3.1vw, 38px);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.01em;
}

.page-hero p {
  max-width: 620px;
  margin-top: 11px;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.6);
}

.hero-stats {
  display: flex;
  align-items: flex-end;
  flex-shrink: 0;
}

.hero-stats div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 22px;
  border-left: 1px solid rgba(255, 255, 255, 0.12);
}

.hero-stats div:first-child {
  padding-left: 0;
  border-left: none;
}

.hero-stats div:last-child {
  padding-right: 0;
}

.hero-stats strong {
  font-size: 21px;
  font-weight: 700;
  line-height: 1;
  color: var(--lime);
}

.hero-stats span {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
}

.ranking-body {
  /* 与其他门户页面共用 .container 的内容宽度，避免榜单区看起来被单独收窄。 */
  --ranking-width: 1360px;
  margin-top: 20px;
}

.ranking-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  width: min(100%, var(--ranking-width));
  margin: 0 auto 16px;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: linear-gradient(180deg, #fff 0%, #fbfcfa 100%);
  box-shadow: 0 6px 18px rgba(7, 59, 44, 0.045);
}

.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-wrap: wrap;
}

.event-select {
  width: 280px;
  flex-shrink: 0;
}

.toolbar-divider {
  width: 1px;
  height: 22px;
  flex-shrink: 0;
  background: var(--line);
}

.scope-tabs {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  border: 1px solid #e7eee5;
  border-radius: 9px;
  background: #f3f7f2;
}

.scope-tab {
  min-height: 34px;
  padding: 0 20px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 12.5px;
  color: var(--ink-500);
  cursor: pointer;
  transition: background 0.18s, color 0.18s, box-shadow 0.18s;
}

.scope-tab:hover {
  color: var(--ink-900);
  background: rgba(255, 255, 255, 0.8);
}

.scope-tab.is-active {
  background: var(--brand-900);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(7, 59, 44, 0.18);
}

.toolbar-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-left: auto;
}

.scope-note {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--brand-50);
  font-size: 11.5px;
  color: var(--brand-700);
  white-space: nowrap;
}

.scope-note i {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-500);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.7);
}

.updated {
  padding-left: 14px;
  border-left: 1px solid var(--line);
  font-size: 11px;
  color: var(--ink-300);
}

.ranking-content {
  min-height: 240px;
}

/* ---------- 领奖台 ---------- */

.podium {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr);
  align-items: end;
  gap: 14px;
  width: min(100%, var(--ranking-width));
  margin: 0 auto 16px;
}

/* 经典领奖台：第二在左、第一居中、第三在右。
   位置与名次分开，避免并列名次导致两张卡片抢同一个栅格顺序。 */
.podium .is-position-2 {
  order: 1;
}

.podium .is-leader {
  order: 2;
}

.podium .is-position-3 {
  order: 3;
}

.podium--1 {
  grid-template-columns: minmax(0, 460px);
  justify-content: center;
}

/* 只有两名球员时不做高低台阶，两张卡片等高对齐，避免左侧出现悬空缺口。 */
.podium--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
}

.podium--2 .podium-card {
  min-height: 292px;
}

.podium-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 244px;
  padding: 16px 20px 14px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  text-align: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.podium-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 22%;
  right: 22%;
  height: 3px;
  border-radius: 0 0 4px 4px;
}

.podium-card.is-rank-2 {
  background: linear-gradient(150deg, #fafafa 0%, #ebebeb 55%, #d0d0d0 100%);
  border-color: #c5c5c5;
}

.podium-card.is-rank-2::before {
  background: linear-gradient(90deg, transparent, #b8b8b8, transparent);
}

.podium-card.is-rank-3 {
  background: linear-gradient(150deg, #fdf2e4 0%, #f0cfa6 55%, #d49a5f 100%);
  border-color: #c9924f;
}

.podium-card.is-rank-3::before {
  background: linear-gradient(90deg, transparent, #b87333, transparent);
}

.podium-card:not(.is-leader):hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 26px rgba(120, 90, 40, 0.12);
}

.podium-card.is-leader {
  min-height: 292px;
  border-color: transparent;
  background:
    radial-gradient(120% 120% at 86% 0%, rgba(255, 248, 200, 0.35) 0%, transparent 56%),
    linear-gradient(150deg, #f9d976 0%, #e6a23c 50%, #b8860b 100%);
  color: #3d2800;
  box-shadow: 0 14px 30px rgba(180, 120, 20, 0.28);
}

.podium-card.is-leader::after {
  content: '';
  position: absolute;
  right: -120px;
  bottom: -150px;
  width: 320px;
  height: 320px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  pointer-events: none;
}

.podium-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.podium-card__rank {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  line-height: 1;
}

.podium-card__rank i {
  font-family: var(--font-display);
  font-size: 9px;
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--ink-300);
}

.podium-card__rank b {
  font-size: 20px;
  font-weight: 800;
  color: var(--ink-300);
}

.is-leader .podium-card__rank i {
  color: rgba(61, 40, 0, 0.45);
}

.is-leader .podium-card__rank b {
  color: rgba(61, 40, 0, 0.4);
}

.podium-card__tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--paper);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ink-500);
}

.is-rank-2 .podium-card__tag {
  background: rgba(255, 255, 255, 0.5);
  color: #4a4a4a;
}

.is-rank-3 .podium-card__tag {
  background: rgba(255, 255, 255, 0.45);
  color: #7a4a1e;
}

.is-leader .podium-card__tag {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.25);
  color: #3d2800;
}

.podium-card__avatar {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin-top: 13px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 17px;
  font-weight: 700;
}

.is-rank-2 .podium-card__avatar {
  background: linear-gradient(145deg, #f0f0f0, #b0b0b0);
  color: #4a4a4a;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.6);
}

.is-rank-3 .podium-card__avatar {
  background: linear-gradient(145deg, #f0c896, #b87333);
  color: #5a3210;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.4);
}

.is-leader .podium-card__avatar {
  width: 54px;
  height: 54px;
  background: linear-gradient(145deg, #ffe680, #e0a020);
  color: #5a3a00;
  font-size: 20px;
  box-shadow: 0 0 0 6px rgba(255, 215, 0, 0.22), inset 0 1px 2px rgba(255, 255, 255, 0.5);
}

.podium-card__name {
  max-width: 100%;
  margin-top: 9px;
  overflow: hidden;
  font-size: 16.5px;
  font-weight: 700;
  color: var(--ink-900);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.is-leader .podium-card__name {
  font-size: 18px;
  color: #3d2800;
}

.podium-card__team {
  max-width: 100%;
  margin-top: 4px;
  overflow: hidden;
  font-size: 12px;
  color: var(--ink-500);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.is-rank-2 .podium-card__team {
  color: #6a6a6a;
}

.is-rank-3 .podium-card__team {
  color: #8a5a2e;
}

.is-leader .podium-card__team {
  color: rgba(61, 40, 0, 0.6);
}

.podium-card__score {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: auto;
  padding-top: 12px;
}

.podium-card__score strong {
  font-size: 34px;
  font-weight: 800;
  line-height: 0.9;
  color: var(--brand-700);
}

.is-rank-2 .podium-card__score strong {
  color: #4a4a4a;
}

.is-rank-3 .podium-card__score strong {
  color: #8a4a14;
}

.is-leader .podium-card__score strong {
  font-size: 42px;
  color: #3d2800;
}

.podium-card__score span {
  font-size: 12px;
  color: var(--ink-300);
}

.is-rank-2 .podium-card__score span {
  color: #8a8a8a;
}

.is-rank-3 .podium-card__score span {
  color: #a87a4a;
}

.is-leader .podium-card__score span {
  color: rgba(61, 40, 0, 0.55);
}

.podium-card__bar {
  width: 100%;
  height: 4px;
  margin-top: 11px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--paper);
}

.is-leader .podium-card__bar {
  background: rgba(61, 40, 0, 0.12);
}

.podium-card__bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--brand-500), var(--brand-700));
}

.is-rank-2 .podium-card__bar i {
  background: linear-gradient(90deg, #d0d0d0, #8a8a8a);
}

.is-rank-3 .podium-card__bar i {
  background: linear-gradient(90deg, #e0b070, #b87333);
}

.is-leader .podium-card__bar i {
  background: linear-gradient(90deg, #ffd54f, #e65100);
}

.podium-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px solid var(--line);
  font-size: 10px;
  color: var(--ink-300);
}

.is-rank-2 .podium-card__foot {
  border-top-color: rgba(0, 0, 0, 0.08);
  color: #7a7a7a;
}

.is-rank-3 .podium-card__foot {
  border-top-color: rgba(120, 70, 20, 0.15);
  color: #9a6a3a;
}

.is-rank-2 .podium-card__foot span:last-child {
  color: #5a5a5a;
}

.is-rank-3 .podium-card__foot span:last-child {
  color: #7a4a1e;
}

.is-leader .podium-card__foot {
  border-top-color: rgba(61, 40, 0, 0.18);
  color: rgba(61, 40, 0, 0.55);
}

.podium-card__foot span:first-child {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.podium-card__foot span:last-child {
  flex-shrink: 0;
  color: var(--ink-500);
}

.is-leader .podium-card__foot span:last-child {
  color: rgba(61, 40, 0, 0.75);
}

/* ---------- 荣誉殿堂：与首页射手榜共用深绿 + 冠军金语言 ---------- */

.podium-hall {
  position: relative;
  overflow: hidden;
  width: min(100%, var(--ranking-width));
  margin: 0 auto 12px;
  padding: 22px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background:
    radial-gradient(ellipse at 88% -10%, rgba(200, 243, 106, 0.16), transparent 46%),
    radial-gradient(ellipse at 50% -24%, rgba(233, 185, 84, 0.16), transparent 56%),
    linear-gradient(145deg, #052a20 0%, var(--brand-900) 52%, #0a4a37 100%);
  box-shadow: 0 18px 40px rgba(7, 59, 44, 0.16);
}

.podium-hall__pitch {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.podium-hall__pitch::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  border-left: 1px solid rgba(255, 255, 255, 0.05);
}

.podium-hall__pitch::after {
  content: '';
  position: absolute;
  top: 46%;
  left: 50%;
  width: 520px;
  height: 520px;
  border: 1px solid rgba(255, 255, 255, 0.035);
  border-radius: 50%;
  box-shadow: 0 0 0 64px rgba(255, 255, 255, 0.008);
  transform: translate(-50%, -50%);
}

.podium-hall__box {
  position: absolute;
  top: 50%;
  width: 100px;
  height: 210px;
  border: 1px solid rgba(255, 255, 255, 0.03);
  transform: translateY(-50%);
}

.podium-hall__box--left {
  left: -1px;
  border-left: 0;
  border-radius: 0 10px 10px 0;
}

.podium-hall__box--right {
  right: -1px;
  border-right: 0;
  border-radius: 10px 0 0 10px;
}

.podium-hall__spot {
  position: absolute;
  top: 46%;
  left: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.13);
  transform: translate(-50%, -50%);
}

.podium-hall .podium {
  position: relative;
  z-index: 1;
  width: 100%;
  margin: 0;
}

.podium-hall .podium-card {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.07);
  color: #fff;
  animation: hall-rise 0.55s cubic-bezier(0.2, 0.7, 0.3, 1) both;
}

.podium-hall .podium .is-position-2 {
  animation-delay: 0.06s;
}

.podium-hall .podium .is-position-3 {
  animation-delay: 0.12s;
}

@keyframes hall-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.podium-hall .podium-card.is-rank-2 {
  border-color: rgba(211, 228, 218, 0.3);
  background: linear-gradient(180deg, rgba(226, 238, 231, 0.1), rgba(255, 255, 255, 0.04));
}

.podium-hall .podium-card.is-rank-3 {
  border-color: rgba(214, 154, 98, 0.38);
  background: linear-gradient(180deg, rgba(214, 154, 98, 0.12), rgba(255, 255, 255, 0.04));
}

.podium-hall .podium-card.is-leader {
  border-color: rgba(233, 185, 84, 0.58);
  background:
    radial-gradient(ellipse at 50% -18%, rgba(233, 185, 84, 0.24), transparent 62%),
    linear-gradient(180deg, rgba(233, 185, 84, 0.14), rgba(255, 255, 255, 0.05));
  color: #fff;
  box-shadow:
    0 16px 32px rgba(0, 0, 0, 0.26),
    inset 0 1px 0 rgba(255, 230, 170, 0.22);
}

.podium-hall .podium-card.is-leader::after {
  border-color: rgba(255, 255, 255, 0.1);
}

.podium-hall .podium-card::before {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.28), transparent);
}

.podium-hall .podium-card.is-leader::before {
  background: linear-gradient(90deg, transparent, #e9b954, transparent);
}

.podium-hall .podium-card.is-rank-2::before {
  background: linear-gradient(90deg, transparent, #b8c6bd, transparent);
}

.podium-hall .podium-card.is-rank-3::before {
  background: linear-gradient(90deg, transparent, #c98a56, transparent);
}

.podium-hall .podium-card:not(.is-leader):hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.2);
}

.podium-hall .podium-card__rank i {
  color: #b9cec1;
}

.podium-hall .podium-card__rank b {
  color: #fff;
}

.podium-hall .podium-card.is-leader .podium-card__rank i,
.podium-hall .podium-card.is-leader .podium-card__rank b {
  color: rgba(242, 207, 125, 0.72);
}

.podium-hall .podium-card__tag {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.08);
  color: var(--on-dark-2);
}

.podium-hall .is-rank-2 .podium-card__tag {
  background: rgba(226, 238, 231, 0.1);
  color: #dfeae3;
}

.podium-hall .is-rank-3 .podium-card__tag {
  background: rgba(214, 154, 98, 0.13);
  color: #f0c9a5;
}

.podium-hall .podium-card.is-leader .podium-card__tag {
  border-color: rgba(233, 185, 84, 0.42);
  background: rgba(233, 185, 84, 0.14);
  color: #f2cf7d;
}

.podium-hall .podium-card__avatar {
  border: 2px solid rgba(255, 255, 255, 0.18);
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.04));
  color: #fff;
}

.podium-hall .is-rank-2 .podium-card__avatar {
  border-color: rgba(211, 228, 218, 0.65);
  background: linear-gradient(145deg, rgba(226, 238, 231, 0.3), rgba(255, 255, 255, 0.05));
  color: #e8f1ec;
  box-shadow: none;
}

.podium-hall .is-rank-3 .podium-card__avatar {
  border-color: rgba(214, 154, 98, 0.72);
  background: linear-gradient(145deg, rgba(214, 154, 98, 0.28), rgba(255, 255, 255, 0.05));
  color: #f7d8b8;
  box-shadow: none;
}

.podium-hall .podium-card.is-leader .podium-card__avatar {
  border-color: rgba(255, 226, 154, 0.9);
  background: linear-gradient(145deg, #fbe3a1, #e9b954 58%, #c9922f);
  color: #4a3008;
  box-shadow:
    0 0 0 6px rgba(233, 185, 84, 0.16),
    0 0 26px rgba(233, 185, 84, 0.22);
  animation: hall-champion-glow 3.6s ease-in-out infinite;
}

@keyframes hall-champion-glow {
  0%,
  100% {
    box-shadow:
      0 0 0 6px rgba(233, 185, 84, 0.16),
      0 0 26px rgba(233, 185, 84, 0.22);
  }

  50% {
    box-shadow:
      0 0 0 10px rgba(233, 185, 84, 0.04),
      0 0 34px rgba(233, 185, 84, 0.12);
  }
}

.podium-hall .podium-card__name {
  color: #fff;
}

.podium-hall .podium-card.is-leader .podium-card__name {
  color: #fff;
}

.podium-hall .podium-card__team {
  color: #c3d6ca;
}

.podium-hall .is-rank-2 .podium-card__team {
  color: rgba(232, 241, 236, 0.66);
}

.podium-hall .is-rank-3 .podium-card__team {
  color: rgba(247, 216, 184, 0.7);
}

.podium-hall .podium-card.is-leader .podium-card__team {
  color: rgba(242, 207, 125, 0.76);
}

.podium-hall .podium-card__score strong {
  color: #fff;
}

.podium-hall .is-rank-2 .podium-card__score strong {
  color: #e8f1ec;
}

.podium-hall .is-rank-3 .podium-card__score strong {
  color: #f7d8b8;
}

.podium-hall .podium-card.is-leader .podium-card__score strong {
  font-size: 48px;
  color: #f2cf7d;
}

.podium-hall .podium-card__score span {
  color: #b9cec1;
}

.podium-hall .is-rank-2 .podium-card__score span {
  color: rgba(232, 241, 236, 0.6);
}

.podium-hall .is-rank-3 .podium-card__score span {
  color: rgba(247, 216, 184, 0.6);
}

.podium-hall .podium-card.is-leader .podium-card__score span {
  color: rgba(242, 207, 125, 0.7);
}

.podium-hall .podium-card__bar {
  background: rgba(255, 255, 255, 0.1);
}

.podium-hall .podium-card.is-leader .podium-card__bar {
  background: rgba(255, 255, 255, 0.12);
}

.podium-hall .podium-card__bar i {
  background: linear-gradient(90deg, rgba(200, 243, 106, 0.45), var(--lime));
}

.podium-hall .is-rank-2 .podium-card__bar i {
  background: linear-gradient(90deg, rgba(226, 238, 231, 0.4), #b8c6bd);
}

.podium-hall .is-rank-3 .podium-card__bar i {
  background: linear-gradient(90deg, rgba(214, 154, 98, 0.4), #c98a56);
}

.podium-hall .is-leader .podium-card__bar i {
  background: linear-gradient(90deg, rgba(233, 185, 84, 0.45), #e9b954);
}

.podium-hall .podium-card__foot {
  border-top-color: rgba(255, 255, 255, 0.1);
  color: #b9cec1;
}

.podium-hall .is-rank-2 .podium-card__foot {
  border-top-color: rgba(255, 255, 255, 0.1);
  color: rgba(232, 241, 236, 0.66);
}

.podium-hall .is-rank-3 .podium-card__foot {
  border-top-color: rgba(255, 255, 255, 0.1);
  color: rgba(247, 216, 184, 0.7);
}

.podium-hall .podium-card__foot span:last-child {
  color: var(--on-dark-2);
}

.podium-hall .is-rank-2 .podium-card__foot span:last-child {
  color: #dfeae3;
}

.podium-hall .is-rank-3 .podium-card__foot span:last-child {
  color: #f0c9a5;
}

.podium-hall .is-leader .podium-card__foot {
  border-top-color: rgba(233, 185, 84, 0.24);
  color: rgba(242, 207, 125, 0.72);
}

.podium-hall .is-leader .podium-card__foot span:last-child {
  color: #f2cf7d;
}

@media (prefers-reduced-motion: reduce) {
  .podium-hall .podium-card,
  .podium-hall .podium-card.is-leader .podium-card__avatar {
    animation: none;
  }
}

/* ---------- 完整榜单 ---------- */

.list-card {
  width: min(100%, var(--ranking-width));
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  box-shadow: var(--shadow-card);
}

.list-head,
.list-row {
  display: grid;
  grid-template-columns: 68px minmax(0, 1.5fr) minmax(180px, 1fr) 100px;
  align-items: center;
  gap: 16px;
  padding: 0 22px;
}

.list-head {
  height: 40px;
  background: #f8faf8;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--ink-300);
}

.list-row {
  min-height: 64px;
  transition: background 0.15s;
}

.list-row + .list-row {
  border-top: 1px solid var(--line);
}

.list-row:hover {
  background: #fafcf9;
}

.list-row__rank {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-300);
}

.list-row__player {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.list-row__avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.list-row__who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.list-row__who strong {
  overflow: hidden;
  font-size: 14px;
  color: var(--ink-900);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.list-row__who small {
  overflow: hidden;
  font-size: 11px;
  color: var(--ink-500);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.list-row__progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.list-row__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.list-row__bar {
  display: block;
  width: 100%;
  height: 5px;
  flex: none;
  overflow: hidden;
  border-radius: 3px;
  background: var(--paper);
}

.list-row__bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--brand-500), var(--brand-700));
}

.list-row__goals {
  font-size: 20px;
  font-weight: 800;
  color: var(--brand-700);
  text-align: right;
}

.list-row__goals i {
  margin-left: 2px;
  font-size: 10px;
  font-style: normal;
  font-weight: 500;
  color: var(--ink-300);
}

.align-right {
  text-align: right;
}

.empty-card {
  width: min(100%, var(--ranking-width));
  margin: 0 auto;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
}

.ranking-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: min(100%, var(--ranking-width));
  margin: 12px auto 0;
  padding: 9px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--ink-500);
}

.ranking-note .el-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

@media (max-width: 1000px) {
  .podium-card {
    min-height: 232px;
    padding: 14px 16px 13px;
  }

  .podium-card.is-leader,
  .podium--2 .podium-card {
    min-height: 272px;
  }

  .list-head,
  .list-row {
    grid-template-columns: 56px minmax(0, 1.4fr) minmax(150px, 1fr) 84px;
    gap: 12px;
    padding: 0 18px;
  }
}

@media (max-width: 900px) {
  .hero-grid {
    align-items: flex-start;
    flex-direction: column;
    gap: 22px;
  }

  .hero-stats div {
    padding: 0 22px;
  }

  .hero-stats strong {
    font-size: 21px;
  }
}

@media (max-width: 820px) {
  .podium,
  .podium--2 {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 窄屏改回 1、2、3 的顺序，方便从上往下读 */
  .podium .is-leader,
  .podium .is-position-2,
  .podium .is-position-3 {
    order: initial;
  }

  .podium-card,
  .podium-card.is-leader,
  .podium--2 .podium-card {
    min-height: 0;
  }

  .podium-card__score {
    padding-top: 12px;
  }

  .podium-card.is-leader .podium-card__score strong {
    font-size: 42px;
  }
}

@media (max-width: 980px) {
  .toolbar-meta {
    width: 100%;
    margin-left: 0;
  }
}

@media (max-width: 760px) {
  .ranking-toolbar {
    align-items: stretch;
    flex-direction: column;
    padding: 9px;
  }

  .toolbar-controls {
    width: 100%;
    gap: 9px;
  }

  .event-select,
  .scope-tabs {
    width: 100%;
  }

  .toolbar-divider {
    display: none;
  }

  .scope-tab {
    flex: 1;
  }

  .toolbar-meta {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 0 3px;
  }

  .updated {
    padding-left: 0;
    border-left: none;
  }

  .list-head {
    display: none;
  }

  .list-row {
    grid-template-columns: 44px minmax(0, 1fr) 68px;
    gap: 10px;
    min-height: 62px;
    padding: 0 16px;
  }

  .list-row__progress {
    display: none;
  }

}

@media (max-width: 560px) {
  .page-hero {
    padding: 28px 0 26px;
  }

  .podium-hall {
    padding: 14px;
  }

  .page-hero p {
    font-size: 13px;
  }

  .hero-stats {
    width: 100%;
    justify-content: space-between;
  }

  .hero-stats div {
    flex: 1;
    padding: 0 14px;
  }

  .hero-stats div:first-child {
    padding-left: 0;
  }

  .hero-stats div:last-child {
    padding-right: 0;
  }

  .hero-stats strong {
    font-size: 18px;
  }

  .hero-stats span {
    font-size: 10px;
  }

  .podium-card {
    padding: 14px 16px 13px;
  }

  .podium-card__foot {
    font-size: 10px;
  }

  .list-row__goals {
    font-size: 18px;
  }

  .ranking-note {
    padding: 11px 13px;
  }
}
</style>
