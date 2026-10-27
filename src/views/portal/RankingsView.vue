<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Medal, Trophy } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { GoalRankingRow, PublicEvent } from '../../api/types'
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
const rankedRows = computed(() => {
  const sorted = [...rows.value].sort(
    (a, b) => b.goals - a.goals || a.athleteName.localeCompare(b.athleteName, 'zh-Hans-CN'),
  )
  let lastGoals: number | null = null
  let lastRank = 0
  return sorted.map((row, index) => {
    const rank = row.goals === lastGoals ? lastRank : index + 1
    lastGoals = row.goals
    lastRank = rank
    return { ...row, rank }
  })
})

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

function podiumFoot(row: GoalRankingRow, index: number) {
  if (index === 0) {
    if (leaderTied.value) return '与追赶者并列榜首'
    if (!nextBest.value) return '本组唯一上榜球员'
    return `领先次席 ${leadMargin.value} 球`
  }
  return gapToLeader(row.goals) ? `距榜首 ${gapToLeader(row.goals)} 球` : '与榜首并列'
}

async function fetchGoals(id: string) {
  return publicApi.goals({ eventId: id, category: category.value })
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
      generatedAt.value = res.generatedAt
      return
    }
    // 首次进入按状态优先探测，跳过尚无进球数据的赛事。
    for (const event of events.value) {
      const res = await fetchGoals(event.id)
      if (res.rows.length) {
        eventId.value = event.id
        rows.value = res.rows
        generatedAt.value = res.generatedAt
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
            统计生成于 {{ generatedTime }} · 以记录台确认数据为准
          </span>
        </div>
      </div>

      <div v-loading="loading" class="ranking-content">
        <div
          v-if="podium.length"
          class="podium"
          :class="`podium--${podium.length}`"
        >
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
              <span>{{ podiumFoot(row, index) }}</span>
              <span>占全组 {{ goalShare(row.goals) }}%</span>
            </footer>
          </article>
        </div>

        <section v-if="rest.length" class="list-card">
          <header class="list-card__head">
            <div class="list-card__title">
              <strong>其余球员</strong>
              <span>共 {{ rest.length }} 名球员，按组内进球数排序</span>
            </div>
            <span class="list-card__scope">{{ currentCategoryLabel }}</span>
          </header>

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

        <p v-if="!loading && rows.length && !rest.length" class="solo-note">
          本组共 {{ rows.length }} 名球员，完整榜单已在上方展示。
        </p>

        <div v-if="!loading && !rows.length" class="empty-card">
          <el-empty :description="`${currentCategoryLabel}暂无进球数据`" />
        </div>
      </div>

      <p class="ranking-note">
        <el-icon><Medal /></el-icon>
        <span>
          射手榜数据来源于比赛记录台提交并确认的进球事件；同一球员按组内总进球数排名，进球相同并列。
          如对统计有异议，请由参赛单位向组委会书面申诉。
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
  /* 筛选项、领奖台、其余榜单共用同一内容宽度，左右边缘保持对齐。 */
  --ranking-width: 1080px;
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

.podium-card.is-rank-2::before {
  background: linear-gradient(90deg, transparent, #aebfb6, transparent);
}

.podium-card.is-rank-3::before {
  background: linear-gradient(90deg, transparent, #c9a27a, transparent);
}

.podium-card:not(.is-leader):hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 26px rgba(7, 59, 44, 0.08);
}

.podium-card.is-leader {
  min-height: 292px;
  border-color: transparent;
  background:
    radial-gradient(120% 120% at 86% 0%, rgba(200, 243, 106, 0.18) 0%, transparent 56%),
    linear-gradient(150deg, #0a4a37 0%, #062f24 100%);
  color: #fff;
  box-shadow: 0 14px 30px rgba(7, 59, 44, 0.18);
}

.podium-card.is-leader::after {
  content: '';
  position: absolute;
  right: -120px;
  bottom: -150px;
  width: 320px;
  height: 320px;
  border: 1px solid rgba(255, 255, 255, 0.06);
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
  color: rgba(255, 255, 255, 0.38);
}

.is-leader .podium-card__rank b {
  color: rgba(255, 255, 255, 0.34);
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

.is-leader .podium-card__tag {
  border: 1px solid rgba(200, 243, 106, 0.24);
  background: rgba(200, 243, 106, 0.1);
  color: var(--lime);
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
  background: #eef2f0;
  color: #5c6f65;
}

.is-rank-3 .podium-card__avatar {
  background: #f7efe6;
  color: #9a6a3d;
}

.is-leader .podium-card__avatar {
  width: 54px;
  height: 54px;
  background: linear-gradient(145deg, var(--lime), #a7df3e);
  color: var(--brand-900);
  font-size: 20px;
  box-shadow: 0 0 0 6px rgba(200, 243, 106, 0.1);
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
  color: #fff;
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

.is-leader .podium-card__team {
  color: rgba(255, 255, 255, 0.55);
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

.is-leader .podium-card__score strong {
  font-size: 42px;
  color: var(--lime);
}

.podium-card__score span {
  font-size: 12px;
  color: var(--ink-300);
}

.is-leader .podium-card__score span {
  color: rgba(255, 255, 255, 0.5);
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
  background: rgba(255, 255, 255, 0.12);
}

.podium-card__bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--brand-500), var(--brand-700));
}

.is-rank-2 .podium-card__bar i {
  background: linear-gradient(90deg, #c3d1ca, #96a99f);
}

.is-rank-3 .podium-card__bar i {
  background: linear-gradient(90deg, #d9bd9f, #b98b5f);
}

.is-leader .podium-card__bar i {
  background: linear-gradient(90deg, #8fd23c, var(--lime));
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

.is-leader .podium-card__foot {
  border-top-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.46);
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
  color: rgba(255, 255, 255, 0.72);
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

.list-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 22px;
  border-bottom: 1px solid var(--line);
}

.list-card__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.list-card__title strong {
  font-size: 15px;
  color: var(--ink-900);
}

.list-card__title span {
  font-size: 11.5px;
  color: var(--ink-300);
}

.list-card__scope {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--brand-50);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-700);
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

.solo-note {
  width: min(100%, var(--ranking-width));
  margin: 0 auto 18px;
  padding: 13px 16px;
  border: 1px dashed var(--line-strong);
  border-radius: 9px;
  background: #fff;
  font-size: 12px;
  color: var(--ink-500);
  text-align: center;
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
  margin: 18px auto 0;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.62);
  font-size: 12px;
  line-height: 1.75;
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

  .list-card__title span {
    display: none;
  }
}

@media (max-width: 560px) {
  .page-hero {
    padding: 28px 0 26px;
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

  .list-card__head {
    padding: 13px 16px;
  }

  .list-row__goals {
    font-size: 18px;
  }

  .ranking-note {
    padding: 11px 13px;
  }
}
</style>
