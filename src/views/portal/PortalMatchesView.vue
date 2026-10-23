<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ArrowRight, Calendar, Location, Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicMatch } from '../../api/types'
import PaginationBar from '../../components/common/PaginationBar.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import MatchScheduleRow from '../../components/portal/MatchScheduleRow.vue'
import { MATCH_SECTIONS, matchDisplayStatus, sortPublicMatches } from '../../utils/portal'

const loading = ref(false)
const allItems = ref<PublicMatch[]>([])
const page = ref(1)
const pageSize = 12
const status = ref('')
const date = ref('')
const groupName = ref('')
const keyword = ref('')

type ViewMode = 'list' | 'calendar'
const viewMode = ref<ViewMode>('calendar')
const month = ref(dayjs().startOf('month'))
const selectedDay = ref('')

const todayKey = dayjs().format('YYYY-MM-DD')

interface CalendarCell {
  key: string
  day: number
  isToday: boolean
  matches: PublicMatch[]
}

// 不含日期：用于月历，避免“今天/明天”把整月视图压成一天。
const keywordScoped = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return allItems.value.filter((match) => {
    if (groupName.value && match.groupName !== groupName.value) return false
    if (kw) {
      const haystack = `${match.homeTeamName} ${match.awayTeamName} ${match.venue || ''} ${match.groupName || ''}`
      if (!haystack.toLowerCase().includes(kw)) return false
    }
    return true
  })
})

// 日期筛选后的范围：状态页签计数与列表都基于它，避免“全部 7 场”却只显示 1 场。
const dateScoped = computed(() =>
  keywordScoped.value.filter(
    (match) =>
      !date.value ||
      (match.kickoffAt && dayjs(match.kickoffAt).format('YYYY-MM-DD') === date.value),
  ),
)

function statusCount(value: string) {
  // 列表按所选日期计数；赛历按整月计数，页签数字才与日历上的场次一致。
  const scope = viewMode.value === 'calendar' ? keywordScoped.value : dateScoped.value
  return value
    ? scope.filter((match) => matchDisplayStatus(match) === value).length
    : scope.length
}

const statusTabs = computed(() => [
  { label: '全部', value: '', count: statusCount('') },
  { label: '进行中', value: 'LIVE', count: statusCount('LIVE') },
  { label: '未开赛', value: 'SCHEDULED', count: statusCount('SCHEDULED') },
  { label: '已结束', value: 'FINISHED', count: statusCount('FINISHED') },
])

const groups = computed(() => {
  const map = new Set(allItems.value.map((m) => m.groupName).filter(Boolean) as string[])
  return Array.from(map)
})

const todayCount = computed(
  () =>
    allItems.value.filter(
      (m) => m.kickoffAt && dayjs(m.kickoffAt).format('YYYY-MM-DD') === todayKey,
    ).length,
)

const filteredItems = computed(() =>
  status.value
    ? dateScoped.value.filter((match) => matchDisplayStatus(match) === status.value)
    : dateScoped.value,
)

const listSections = computed(() => {
  const sorted = sortPublicMatches(filteredItems.value)
  const start = (page.value - 1) * pageSize
  const paged = sorted.slice(start, start + pageSize)
  return MATCH_SECTIONS.map((section) => ({
    ...section,
    items: paged.filter((match) => matchDisplayStatus(match) === section.key),
  })).filter((section) => section.items.length)
})

const total = computed(() => filteredItems.value.length)

// 日历不受“昨天/今天/明天”影响，否则整月视图只剩一天；状态筛选仍然生效。
const calendarItems = computed(() =>
  status.value
    ? keywordScoped.value.filter((match) => matchDisplayStatus(match) === status.value)
    : keywordScoped.value,
)

const calendarCells = computed<(CalendarCell | null)[]>(() => {
  const start = month.value.startOf('month')
  const cells: (CalendarCell | null)[] = []
  for (let i = 0; i < start.day(); i += 1) cells.push(null)
  for (let d = 1; d <= month.value.daysInMonth(); d += 1) {
    const current = start.date(d)
    const key = current.format('YYYY-MM-DD')
    cells.push({
      key,
      day: d,
      isToday: key === todayKey,
      matches: calendarItems.value.filter(
        (match) => match.kickoffAt && dayjs(match.kickoffAt).format('YYYY-MM-DD') === key,
      ),
    })
  }
  return cells
})

const monthMatchCount = computed(() =>
  calendarCells.value.reduce((sum, cell) => sum + (cell?.matches.length || 0), 0),
)

const monthStats = computed(() => {
  const stats = { live: 0, scheduled: 0, finished: 0 }
  calendarCells.value.forEach((cell) => {
    cell?.matches.forEach((match) => {
      const value = matchDisplayStatus(match)
      if (value === 'LIVE') stats.live += 1
      else if (value === 'SCHEDULED') stats.scheduled += 1
      else if (value === 'FINISHED') stats.finished += 1
    })
  })
  return stats
})

const selectedDayMatches = computed(() =>
  (calendarCells.value.find((cell) => cell?.key === selectedDay.value)?.matches || [])
    .slice()
    .sort((a, b) => dayjs(a.kickoffAt).valueOf() - dayjs(b.kickoffAt).valueOf()),
)

function selectDefaultDay() {
  const cells = calendarCells.value.filter((cell): cell is CalendarCell => Boolean(cell))
  const todayCell = cells.find((cell) => cell.key === todayKey)
  const firstMatchDay = cells.find((cell) => cell.matches.length)
  selectedDay.value =
    (todayCell?.matches.length ? todayCell : firstMatchDay || todayCell || cells[0])?.key || ''
}

async function load() {
  loading.value = true
  try {
    // 公开接口没有排序与球队搜索参数，一次取回后在本地分组、排序、分页。
    const res = await publicApi.matches({ page: 1, pageSize: 200 })
    allItems.value = res.items
    if (!date.value && todayCount.value && viewMode.value === 'list') date.value = todayKey
    if (viewMode.value === 'calendar') selectDefaultDay()
  } catch {
    allItems.value = []
  } finally {
    loading.value = false
  }
}

function switchStatus(value: string) {
  status.value = value
  page.value = 1
}

function switchView(mode: ViewMode) {
  if (viewMode.value === mode) return
  viewMode.value = mode
  page.value = 1
  if (mode === 'calendar') {
    selectedDay.value = ''
    selectDefaultDay()
  }
}

function changeMonth(offset: number) {
  month.value = month.value.add(offset, 'month')
  selectedDay.value = ''
  selectDefaultDay()
}

function goToday() {
  month.value = dayjs().startOf('month')
  selectDefaultDay()
}

function resetFilters() {
  status.value = ''
  date.value = ''
  groupName.value = ''
  keyword.value = ''
  page.value = 1
}

function formatDayLabel(key: string) {
  if (!key) return '选择日期'
  const d = dayjs(key)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.format('MM月DD日')} · ${weekdays[d.day()]}`
}

function formatTime(value?: string) {
  return value ? dayjs(value).format('HH:mm') : '--:--'
}

function agendaScore(match: PublicMatch) {
  const display = matchDisplayStatus(match)
  if (display === 'SCHEDULED') return 'VS'
  if (display === 'CANCELLED') return '—'
  return `${match.homeScore} : ${match.awayScore}`
}

function statusTone(value: string) {
  return `is-${value.toLowerCase()}`
}

onMounted(load)
</script>

<template>
  <div class="matches-page">
    <section class="page-hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          <span class="hero-kicker">FIXTURES &amp; RESULTS · 2026 SEASON</span>
          <h1>赛程与比分</h1>
          <p>查询赛程安排、实时比分与比赛事件。可以按状态筛选，也可以在赛历中按日期查看。</p>
        </div>
        <div v-if="!loading" class="hero-stats">
          <div>
            <strong class="num">{{ todayCount }}</strong>
            <span>今日比赛</span>
          </div>
          <div>
            <strong class="num">{{ allItems.length }}</strong>
            <span>已发布场次</span>
          </div>
        </div>
      </div>
    </section>

    <div class="container match-body">
      <div class="filter-panel">
        <div class="filter-row filter-row--top">
          <div class="status-tabs">
            <button
              v-for="tab in statusTabs"
              :key="tab.value"
              type="button"
              class="status-tab"
              :class="{ 'is-active': status === tab.value }"
              @click="switchStatus(tab.value)"
            >
              <span v-if="tab.value === 'LIVE'" class="live-dot" />
              {{ tab.label }}
              <span class="status-tab__count num">{{ tab.count }}</span>
            </button>
          </div>
        </div>

        <div class="filter-row filter-row--controls">
          <div class="view-switch">
            <button
              type="button"
              :class="{ 'is-active': viewMode === 'list' }"
              @click="switchView('list')"
            >
              列表
            </button>
            <button
              type="button"
              :class="{ 'is-active': viewMode === 'calendar' }"
              @click="switchView('calendar')"
            >
              赛历
            </button>
          </div>
          <el-date-picker
            v-if="viewMode === 'list'"
            v-model="date"
            type="date"
            size="large"
            placeholder="选择比赛日期"
            value-format="YYYY-MM-DD"
            :prefix-icon="Calendar"
            class="date-picker"
            @change="page = 1"
          />
          <el-select
            v-model="groupName"
            size="large"
            placeholder="全部组别"
            clearable
            class="group-select"
            @change="page = 1"
          >
            <el-option v-for="group in groups" :key="group" :label="group" :value="group" />
          </el-select>
          <el-input
            v-model="keyword"
            size="large"
            placeholder="搜索学校或球队"
            :prefix-icon="Search"
            clearable
            class="team-search"
            @input="page = 1"
          />
          <el-button text @click="resetFilters">重置</el-button>
        </div>

        <p class="time-note">所有时间均为北京时间（UTC+8）· 赛况状态以组委会确认结果为准</p>
      </div>

      <div v-if="viewMode === 'list'" v-loading="loading" class="schedule">
        <section v-for="section in listSections" :key="section.key" class="match-section">
          <div class="section-head">
            <span class="section-head__label" :class="`is-${section.tone}`">
              <i v-if="section.tone === 'live'" class="live-dot" />
              {{ section.label }}
            </span>
            <span class="section-head__count">{{ section.items.length }} 场</span>
          </div>

          <div class="match-list">
            <MatchScheduleRow
              v-for="match in section.items"
              :key="match.id"
              :match="match"
            />
          </div>
        </section>

        <el-empty v-if="!loading && !filteredItems.length" description="没有符合条件的比赛">
          <el-button type="primary" plain @click="resetFilters">查看全部比赛</el-button>
        </el-empty>
      </div>

      <div v-else v-loading="loading" class="calendar-layout">
        <section class="calendar-panel">
          <header class="calendar-head">
            <div class="month-nav">
              <button type="button" class="month-btn" aria-label="上个月" @click="changeMonth(-1)">‹</button>
              <strong class="num">{{ month.format('YYYY 年 MM 月') }}</strong>
              <button type="button" class="month-btn" aria-label="下个月" @click="changeMonth(1)">›</button>
            </div>
            <div class="month-meta">
              <span class="month-count num">{{ monthMatchCount }} 场</span>
              <button type="button" class="today-link" @click="goToday">回到本月</button>
            </div>
          </header>

          <div class="calendar-week">
            <span v-for="week in ['日', '一', '二', '三', '四', '五', '六']" :key="week">{{ week }}</span>
          </div>

          <div class="calendar-grid">
            <template v-for="(cell, index) in calendarCells" :key="cell?.key || `blank-${index}`">
              <div v-if="!cell" class="calendar-cell is-blank" />
              <button
                v-else
                type="button"
                class="calendar-cell"
                :class="{
                  'is-today': cell.isToday,
                  'is-selected': cell.key === selectedDay,
                  'has-match': cell.matches.length,
                }"
                @click="selectedDay = cell.key"
              >
                <span class="calendar-cell__top">
                  <span class="calendar-cell__day num">{{ cell.day }}</span>
                  <span v-if="cell.matches.length" class="calendar-cell__count num">
                    {{ cell.matches.length }}
                  </span>
                </span>
                <span v-if="cell.matches.length" class="calendar-cell__marks">
                  <i
                    v-for="match in cell.matches.slice(0, 3)"
                    :key="match.id"
                    :class="statusTone(matchDisplayStatus(match))"
                  />
                </span>
                <span v-if="cell.matches.length" class="calendar-cell__hint">
                  {{ formatTime(cell.matches[0].kickoffAt) }} 开赛
                </span>
              </button>
            </template>
          </div>

          <footer class="calendar-legend">
            <span><i class="is-live" />进行中 {{ monthStats.live }}</span>
            <span><i class="is-scheduled" />未开赛 {{ monthStats.scheduled }}</span>
            <span><i class="is-finished" />已结束 {{ monthStats.finished }}</span>
          </footer>
        </section>

        <aside class="day-panel">
          <header class="day-head">
            <span class="day-kicker">DAY AGENDA</span>
            <div class="day-title">
              <h3>{{ formatDayLabel(selectedDay) }}</h3>
              <span>{{ selectedDayMatches.length }} 场</span>
            </div>
          </header>

          <div v-if="selectedDayMatches.length" class="agenda-list">
            <router-link
              v-for="match in selectedDayMatches"
              :key="match.id"
              :to="`/matches/${match.id}`"
              class="agenda-card"
            >
              <div class="agenda-card__top">
                <strong class="num">{{ formatTime(match.kickoffAt) }}</strong>
                <StatusTag :status="matchDisplayStatus(match)" kind="match" />
                <span class="agenda-card__group">{{ match.groupName || '组别待定' }}</span>
              </div>

              <div class="agenda-matchup">
                <div class="agenda-team">
                  <span class="agenda-team__badge">{{ match.homeTeamName.slice(0, 1) }}</span>
                  <span class="agenda-team__name">{{ match.homeTeamName }}</span>
                </div>
                <span class="agenda-score num" :class="{ 'is-upcoming': matchDisplayStatus(match) === 'SCHEDULED' }">
                  {{ agendaScore(match) }}
                </span>
                <div class="agenda-team agenda-team--away">
                  <span class="agenda-team__badge">{{ match.awayTeamName.slice(0, 1) }}</span>
                  <span class="agenda-team__name">{{ match.awayTeamName }}</span>
                </div>
              </div>

              <div class="agenda-card__foot">
                <span>
                  <el-icon><Location /></el-icon>
                  {{ match.venue || '场地待定' }}
                </span>
                <span class="agenda-card__more">
                  比赛详情
                  <el-icon><ArrowRight /></el-icon>
                </span>
              </div>
            </router-link>
          </div>

          <div v-else class="day-empty">
            <span class="day-empty__mark">—</span>
            <strong>当天没有比赛</strong>
            <p>选择赛历中带圆点标记的日期，查看当天赛程。</p>
          </div>
        </aside>

        <el-empty
          v-if="!loading && !monthMatchCount"
          class="calendar-empty"
          description="本月暂无比赛安排"
          :image-size="70"
        />
      </div>

      <PaginationBar
        v-if="viewMode === 'list'"
        v-model:page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        hide-when-single
      />
    </div>
  </div>
</template>

<style scoped>
.matches-page {
  min-height: 70vh;
  padding-bottom: 64px;
  background: var(--paper);
}

.page-hero {
  padding: 34px 0 38px;
  background: var(--brand-900);
  color: #fff;
}

.hero-grid {
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
  font-size: clamp(30px, 3.4vw, 42px);
  font-weight: 700;
  line-height: 1.2;
}

.page-hero p {
  max-width: 660px;
  margin-top: 11px;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.6);
}

.hero-stats {
  display: flex;
  gap: 26px;
  flex-shrink: 0;
}

.hero-stats div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hero-stats strong {
  font-size: 21px;
  font-weight: 700;
  line-height: 1;
  color: var(--lime);
}

.hero-stats span {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.48);
}

.match-body {
  margin-top: 20px;
}

.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 11px 14px;
  margin-bottom: 18px;
  border-radius: 9px;
  background: #fff;
  border: 1px solid var(--line);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-row--top {
  justify-content: space-between;
}

.status-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.status-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-size: 12.5px;
  color: var(--ink-500);
  cursor: pointer;
  transition: 0.15s;
}

.status-tab:hover {
  background: var(--paper);
  color: var(--ink-900);
}

.status-tab.is-active {
  background: var(--brand-900);
  color: #fff;
  font-weight: 600;
}

.status-tab__count {
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(24, 53, 43, 0.07);
  font-size: 10px;
}

.status-tab.is-active .status-tab__count {
  background: rgba(255, 255, 255, 0.18);
  color: var(--lime);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--live);
  box-shadow: 0 0 0 3px rgba(181, 71, 8, 0.14);
}

.filter-row--controls {
  padding-top: 9px;
  border-top: 1px solid var(--line);
}

.view-switch {
  display: inline-flex;
  padding: 2px;
  border-radius: 6px;
  background: var(--paper);
  border: 1px solid var(--line);
}

.view-switch button {
  min-height: 32px;
  padding: 0 13px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 12px;
  color: var(--ink-500);
  cursor: pointer;
}

.view-switch button.is-active {
  background: #fff;
  color: var(--brand-800);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(24, 53, 43, 0.1);
}

.date-picker {
  width: 170px;
}

.group-select {
  width: 150px;
}

.team-search {
  width: 210px;
}

.time-note {
  padding-top: 2px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.schedule {
  min-height: 200px;
}

.match-section + .match-section {
  margin-top: 20px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 9px;
}

.section-head__label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-900);
}

.section-head__count {
  font-size: 11.5px;
  color: var(--ink-300);
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ---------- 赛历 ---------- */
.calendar-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(330px, 0.8fr);
  align-items: start;
  gap: 16px;
  min-height: 300px;
}

.calendar-panel {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #fff;
}

.calendar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.month-nav {
  display: flex;
  align-items: center;
  gap: 10px;
}

.month-nav strong {
  min-width: 132px;
  font-size: 17px;
  font-weight: 700;
  text-align: center;
  color: var(--ink-900);
}

.month-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #fff;
  color: var(--ink-500);
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  transition: 0.15s;
}

.month-btn:hover {
  border-color: var(--brand-500);
  color: var(--brand-700);
}

.month-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.month-count {
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--brand-50);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-700);
}

.today-link {
  border: none;
  background: transparent;
  font-size: 10.5px;
  color: var(--ink-500);
  cursor: pointer;
}

.today-link:hover {
  color: var(--brand-700);
}

.calendar-week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  padding-bottom: 7px;
  border-bottom: 1px solid var(--line);
}

.calendar-week span {
  font-size: 10px;
  color: var(--ink-300);
  text-align: center;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 3px;
  margin-top: 7px;
}

.calendar-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 68px;
  padding: 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.14s, border-color 0.14s;
}

.calendar-cell:hover {
  background: var(--paper);
}

.calendar-cell.is-blank {
  cursor: default;
}

.calendar-cell.is-today {
  border-color: var(--brand-100);
  background: #fbfdf9;
}

.calendar-cell.is-selected {
  border-color: var(--brand-700);
  background: var(--brand-50);
}

.calendar-cell__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.calendar-cell__day {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-700);
}

.calendar-cell.is-today .calendar-cell__day {
  color: var(--brand-700);
}

.calendar-cell.is-selected .calendar-cell__day {
  color: var(--brand-900);
}

.calendar-cell__count {
  min-width: 15px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--brand-900);
  font-size: 8.5px;
  line-height: 15px;
  color: var(--lime);
  text-align: center;
}

.calendar-cell__marks {
  display: flex;
  gap: 3px;
  margin-top: 9px;
}

.calendar-cell__marks i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ink-300);
}

.calendar-cell__marks .is-live {
  background: var(--live);
  box-shadow: 0 0 0 2px rgba(181, 71, 8, 0.12);
}

.calendar-cell__marks .is-scheduled {
  background: var(--brand-500);
}

.calendar-cell__marks .is-finished {
  background: var(--ink-300);
}

.calendar-cell__hint {
  margin-top: auto;
  padding-top: 5px;
  font-size: 8.5px;
  color: var(--ink-300);
}

.calendar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid var(--line);
}

.calendar-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.calendar-legend i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ink-300);
}

.calendar-legend i.is-live {
  background: var(--live);
}

.calendar-legend i.is-scheduled {
  background: var(--brand-500);
}

.calendar-legend i.is-finished {
  background: var(--ink-300);
}

.day-panel {
  position: sticky;
  top: 92px;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #fff;
}

.day-head {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.day-kicker {
  font-family: var(--font-display);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--brand-600);
}

.day-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 5px;
}

.day-title h3 {
  font-size: 17px;
  font-weight: 700;
  color: var(--ink-900);
}

.day-title span {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--ink-300);
}

.agenda-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.agenda-card {
  display: block;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  transition: border-color 0.15s, background-color 0.15s;
}

.agenda-card:hover {
  border-color: var(--brand-500);
  background: #fbfdf9;
}

.agenda-card__top {
  display: flex;
  align-items: center;
  gap: 7px;
}

.agenda-card__top > strong {
  font-size: 13px;
  color: var(--ink-900);
}

.agenda-card__group {
  margin-left: auto;
  overflow: hidden;
  font-size: 9.5px;
  color: var(--ink-300);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.agenda-matchup {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.agenda-team {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.agenda-team--away {
  flex-direction: row-reverse;
  text-align: right;
}

.agenda-team__badge {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 5px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9px;
  font-weight: 700;
}

.agenda-team__name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--ink-900);
}

.agenda-score {
  flex-shrink: 0;
  min-width: 40px;
  font-size: 15px;
  font-weight: 800;
  color: var(--brand-800);
  text-align: center;
  white-space: nowrap;
}

.agenda-score.is-upcoming {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ink-300);
}

.agenda-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--line);
  font-size: 9.5px;
  color: var(--ink-300);
}

.agenda-card__foot > span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.agenda-card__more {
  flex-shrink: 0;
  color: var(--brand-700);
  font-weight: 600;
}

.day-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 42px 10px 34px;
  text-align: center;
}

.day-empty__mark {
  font-size: 25px;
  color: var(--line-strong);
}

.day-empty strong {
  font-size: 13px;
  color: var(--ink-700);
}

.day-empty p {
  font-size: 10.5px;
  line-height: 1.65;
  color: var(--ink-300);
}

.calendar-empty {
  grid-column: 1 / -1;
}

@media (max-width: 1040px) {
  .calendar-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .day-panel {
    position: static;
  }

  .agenda-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .hero-grid {
    align-items: flex-start;
    flex-direction: column;
    gap: 18px;
  }

  .hero-stats strong {
    font-size: 19px;
  }

  .date-picker,
  .group-select,
  .team-search {
    width: 100%;
  }
}

@media (max-width: 720px) {
  .page-hero {
    padding: 26px 0 28px;
  }

  .filter-row--top {
    align-items: flex-start;
    flex-direction: column;
  }

  .calendar-panel,
  .day-panel {
    padding: 14px;
  }

  .calendar-cell {
    min-height: 58px;
    padding: 6px;
  }

  .calendar-cell__hint {
    display: none;
  }

  .agenda-list {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 520px) {
  .status-tab {
    padding: 0 9px;
  }

  .calendar-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 9px;
  }

  .month-meta {
    width: 100%;
    justify-content: space-between;
  }

  .calendar-cell {
    min-height: 48px;
    padding: 4px;
  }

  .calendar-cell__day {
    font-size: 11px;
  }

  .calendar-cell__count {
    display: none;
  }

  .calendar-cell__marks {
    margin-top: 6px;
  }
}
</style>
