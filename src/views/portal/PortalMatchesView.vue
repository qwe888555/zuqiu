<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Calendar, Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicMatch } from '../../api/types'
import PaginationBar from '../../components/common/PaginationBar.vue'
import MatchScheduleRow from '../../components/portal/MatchScheduleRow.vue'
import {
  MATCH_SECTIONS,
  matchDisplayStatus,
  readFollowedTeam,
  sortPublicMatches,
} from '../../utils/portal'

const loading = ref(false)
const allItems = ref<PublicMatch[]>([])
const page = ref(1)
const pageSize = 12
const status = ref('')
const date = ref('')
const groupName = ref('')
const keyword = ref('')
const onlyFollowed = ref(false)
const followedTeam = ref(readFollowedTeam())

type ViewMode = 'list' | 'calendar'
const viewMode = ref<ViewMode>('list')
const month = ref(dayjs().startOf('month'))
const selectedDay = ref('')

const todayKey = dayjs().format('YYYY-MM-DD')
const quickDates = [
  { key: 'all', label: '全部', value: '' },
  { key: 'yesterday', label: '昨天', value: dayjs().subtract(1, 'day').format('YYYY-MM-DD') },
  { key: 'today', label: '今天', value: todayKey },
  { key: 'tomorrow', label: '明天', value: dayjs().add(1, 'day').format('YYYY-MM-DD') },
]

interface CalendarCell {
  key: string
  day: number
  isToday: boolean
  matches: PublicMatch[]
}

function isFollowed(match: PublicMatch) {
  return (
    Boolean(followedTeam.value) &&
    (match.homeTeamName === followedTeam.value || match.awayTeamName === followedTeam.value)
  )
}

// 不含日期：用于月历，避免“今天/明天”把整月视图压成一天。
const keywordScoped = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return allItems.value.filter((match) => {
    if (groupName.value && match.groupName !== groupName.value) return false
    if (onlyFollowed.value && !isFollowed(match)) return false
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
  return value
    ? dateScoped.value.filter((match) => matchDisplayStatus(match) === value).length
    : dateScoped.value.length
}

const statusTabs = computed(() => [
  { label: '全部', value: '', count: statusCount('') },
  { label: '进行中', value: 'LIVE', count: statusCount('LIVE') },
  { label: '待更新', value: 'STALE', count: statusCount('STALE') },
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

const selectedDayMatches = computed(
  () => calendarCells.value.find((cell) => cell?.key === selectedDay.value)?.matches || [],
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
    followedTeam.value = readFollowedTeam()
    if (!date.value && todayCount.value) date.value = todayKey
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

function setQuickDate(value: string) {
  date.value = value
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
  onlyFollowed.value = false
  page.value = 1
}

function formatDayLabel(key: string) {
  if (key === '日期待定') return key
  const d = dayjs(key)
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.format('MM月DD日')} · ${weekdays[d.day()]}`
}

function formatTime(value?: string) {
  return value ? dayjs(value).format('HH:mm') : '--:--'
}

onMounted(load)
</script>

<template>
  <div class="matches-page">
    <section class="page-hero">
      <div class="container hero-grid">
        <div>
          <h1>赛程与比分</h1>
          <p>查询赛程安排、实时比分与比赛事件，按日期或赛历查看全部场次。</p>
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
          <div class="quick-dates">
            <button
              v-for="item in quickDates"
              :key="item.key"
              type="button"
              class="quick-date"
              :class="{ 'is-active': date === item.value }"
              @click="setQuickDate(item.value)"
            >
              {{ item.label }}
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
              日历
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
          <button
            v-if="followedTeam"
            type="button"
            class="follow-chip"
            :class="{ 'is-active': onlyFollowed }"
            :title="`只看 ${followedTeam} 的比赛`"
            @click="onlyFollowed = !onlyFollowed; page = 1"
          >
            只看关注
          </button>
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
              :followed-team="followedTeam"
            />
          </div>
        </section>

        <el-empty v-if="!loading && !filteredItems.length" description="没有符合条件的比赛">
          <el-button type="primary" plain @click="resetFilters">查看全部比赛</el-button>
        </el-empty>
      </div>

      <div v-else v-loading="loading" class="calendar-wrap">
        <div class="calendar-head">
          <button type="button" class="month-btn" aria-label="上个月" @click="changeMonth(-1)">‹</button>
          <strong class="num">{{ month.format('YYYY 年 MM 月') }}</strong>
          <button type="button" class="month-btn" aria-label="下个月" @click="changeMonth(1)">›</button>
          <span class="calendar-head__count">{{ monthMatchCount }} 场比赛</span>
          <el-button text size="small" @click="goToday">回到本月</el-button>
        </div>

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
              <span class="calendar-cell__day num">{{ cell.day }}</span>
              <span v-if="cell.matches.length" class="calendar-cell__count">{{ cell.matches.length }}</span>
              <span class="calendar-cell__matches">
                <span v-for="match in cell.matches.slice(0, 2)" :key="match.id">
                  {{ formatTime(match.kickoffAt) }}
                  {{ match.homeTeamName.slice(0, 4) }}
                  <b v-if="matchDisplayStatus(match) !== 'SCHEDULED'" class="num">
                    {{ match.homeScore }}:{{ match.awayScore }}
                  </b>
                  <b v-else>vs</b>
                  {{ match.awayTeamName.slice(0, 4) }}
                </span>
                <small v-if="cell.matches.length > 2">+{{ cell.matches.length - 2 }}</small>
              </span>
            </button>
          </template>
        </div>

        <div v-if="selectedDay" class="calendar-day">
          <div class="section-head">
            <span class="section-head__label">{{ formatDayLabel(selectedDay) }}</span>
            <span class="section-head__count">{{ selectedDayMatches.length }} 场</span>
          </div>
          <div v-if="selectedDayMatches.length" class="match-list">
            <MatchScheduleRow
              v-for="match in selectedDayMatches"
              :key="match.id"
              :match="match"
              :followed-team="followedTeam"
            />
          </div>
          <el-empty v-else description="当天没有比赛" :image-size="60" />
        </div>

        <el-empty v-if="!loading && !monthMatchCount" description="本月暂无比赛安排" :image-size="70" />
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
  padding-bottom: 60px;
  background: var(--paper);
}

.page-hero {
  padding: 28px 0 26px;
  background: var(--brand-900);
  color: #fff;
}

.hero-grid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.page-hero h1 {
  font-size: 27px;
  font-weight: 600;
}

.page-hero p {
  margin-top: 7px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
}

.hero-stats {
  display: flex;
  gap: 26px;
}

.hero-stats div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hero-stats strong {
  font-size: 26px;
  line-height: 1;
  color: var(--lime);
}

.hero-stats span {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.62);
}

.match-body {
  margin-top: 20px;
}

.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 20px;
  border-radius: 8px;
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
  gap: 4px;
  flex-wrap: wrap;
}

.status-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 8px 13px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 13.5px;
  color: var(--ink-500);
  cursor: pointer;
}

.status-tab:hover {
  background: var(--paper);
}

.status-tab.is-active {
  background: var(--brand-700);
  color: #fff;
  font-weight: 600;
}

.status-tab__count {
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(24, 53, 43, 0.07);
  font-size: 11.5px;
}

.status-tab.is-active .status-tab__count {
  background: rgba(255, 255, 255, 0.18);
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--live);
  box-shadow: 0 0 0 3px rgba(181, 71, 8, 0.14);
}

.quick-dates {
  display: flex;
  gap: 4px;
}

.quick-date {
  min-height: 36px;
  padding: 6px 13px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  font-size: 13px;
  color: var(--ink-500);
  cursor: pointer;
  transition: 0.15s;
}

.quick-date:hover {
  border-color: var(--brand-500);
  color: var(--brand-700);
}

.quick-date.is-active {
  border-color: var(--brand-700);
  background: var(--brand-50);
  color: var(--brand-800);
  font-weight: 600;
}

.filter-row--controls {
  padding-top: 10px;
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
  min-height: 34px;
  padding: 5px 14px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 13px;
  color: var(--ink-500);
  cursor: pointer;
  transition: 0.16s;
}

.view-switch button.is-active {
  background: #fff;
  color: var(--brand-800);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(16, 33, 26, 0.08);
}

.date-picker {
  width: 168px;
}

.group-select {
  width: 150px;
}

.team-search {
  width: 210px;
}

.follow-chip {
  min-height: 36px;
  padding: 6px 12px;
  border: 1px dashed var(--brand-500);
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  color: var(--brand-700);
  cursor: pointer;
}

.follow-chip.is-active {
  border-style: solid;
  background: var(--brand-700);
  color: #fff;
}

.time-note {
  font-size: 12.5px;
  color: var(--ink-500);
}

.schedule {
  min-height: 180px;
}

.match-section {
  margin-bottom: 22px;
}

.section-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 9px;
  padding-left: 2px;
}

.section-head__label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-900);
}

.section-head__label.is-live {
  color: var(--live);
}

.section-head__label.is-upcoming {
  color: var(--whistle);
}

.section-head__label.is-stale {
  color: var(--ink-500);
}

.section-head__label.is-finished {
  color: var(--ink-700);
}

.section-head__count {
  font-size: 13px;
  color: var(--ink-500);
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

/* 赛历：把整月赛程压进一张球场视角的排期板 */
.calendar-wrap {
  min-height: 180px;
  padding: 16px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line);
}

.calendar-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.calendar-head strong {
  font-size: 17px;
  color: var(--ink-900);
}

.calendar-head .month-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: var(--ink-500);
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
}

.calendar-head .month-btn:hover {
  border-color: var(--brand-500);
  color: var(--brand-700);
}

.calendar-head__count {
  margin-left: 6px;
  padding: 3px 8px;
  border-radius: 3px;
  background: var(--brand-50);
  font-size: 12px;
  color: var(--brand-700);
}

.calendar-head .el-button {
  margin-left: auto;
}

.calendar-week,
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 5px;
}

.calendar-week {
  margin-bottom: 5px;
  font-size: 12px;
  color: var(--ink-500);
  text-align: center;
}

.calendar-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 84px;
  padding: 6px 7px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: 0.16s;
  overflow: hidden;
}

.calendar-cell.is-blank {
  border-color: transparent;
  background: transparent;
  cursor: default;
}

.calendar-cell:hover {
  border-color: var(--brand-500);
}

.calendar-cell.has-match {
  background: #f7fbf9;
}

.calendar-cell.is-today .calendar-cell__day {
  color: var(--brand-700);
  font-weight: 700;
}

.calendar-cell.is-selected {
  border-color: var(--brand-700);
  background: var(--brand-50);
  box-shadow: inset 0 0 0 1px var(--brand-700);
}

.calendar-cell__day {
  font-size: 12.5px;
  color: var(--ink-700);
}

.calendar-cell__count {
  position: absolute;
  top: 5px;
  right: 6px;
  min-width: 16px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--brand-700);
  color: #fff;
  font-size: 9.5px;
  text-align: center;
}

.calendar-cell__matches {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.calendar-cell__matches span {
  display: block;
  padding: 2px 4px;
  border-radius: 4px;
  background: rgba(11, 122, 83, 0.08);
  font-size: 9.5px;
  line-height: 1.4;
  color: var(--brand-800);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.calendar-cell__matches b {
  font-weight: 700;
}

.calendar-cell__matches small {
  font-size: 9.5px;
  color: var(--ink-500);
}

.calendar-day {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
}

@media (max-width: 860px) {
  .filter-row--controls {
    width: 100%;
  }

  .team-search {
    flex: 1;
    min-width: 180px;
    width: auto;
  }

  .calendar-cell {
    min-height: 66px;
  }

  .calendar-cell__matches span {
    font-size: 9px;
  }
}

@media (max-width: 560px) {
  .page-hero {
    padding: 22px 0 20px;
  }

  .page-hero h1 {
    font-size: 23px;
  }

  .hero-grid {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }

  .hero-stats {
    gap: 22px;
  }

  .filter-panel {
    align-items: stretch;
  }

  .filter-row--top {
    align-items: flex-start;
    flex-direction: column;
  }

  .status-tabs {
    width: 100%;
    flex-wrap: wrap;
  }

  .quick-dates {
    width: 100%;
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 2px;
  }

  .status-tab,
  .quick-date {
    flex-shrink: 0;
  }

  .date-picker,
  .group-select {
    flex: 1;
    min-width: 140px;
    width: auto;
  }

  .team-search {
    flex-basis: 100%;
  }

  .view-switch {
    width: 100%;
    justify-content: center;
  }

  .view-switch button {
    flex: 1;
  }

  .calendar-wrap {
    padding: 12px 8px;
  }

  .calendar-grid,
  .calendar-week {
    gap: 2px;
  }

  .calendar-cell {
    min-height: 46px;
    padding: 4px;
  }

  .calendar-cell__matches {
    display: none;
  }

  .calendar-cell.has-match {
    background: var(--brand-100);
  }

  .calendar-cell__count {
    top: 2px;
    right: 2px;
  }
}
</style>
