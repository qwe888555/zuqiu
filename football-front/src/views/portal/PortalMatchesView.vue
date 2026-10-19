<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Calendar, Location } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicMatch } from '../../api/types'
import StatusTag from '../../components/common/StatusTag.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'

const loading = ref(false)
const items = ref<PublicMatch[]>([])
const page = ref(1)
const total = ref(0)
const status = ref('')
const date = ref('')
const groupName = ref('')

const statusTabs = [
  { label: '全部', value: '' },
  { label: '进行中', value: 'LIVE' },
  { label: '未开赛', value: 'SCHEDULED' },
  { label: '已结束', value: 'FINISHED' },
]

const groups = computed(() => {
  const map = new Set(items.value.map((m) => m.groupName).filter(Boolean) as string[])
  return Array.from(map)
})

const filteredItems = computed(() =>
  groupName.value ? items.value.filter((m) => m.groupName === groupName.value) : items.value,
)

const groupedByDate = computed(() => {
  const map = new Map<string, PublicMatch[]>()
  filteredItems.value.forEach((match) => {
    const key = match.kickoffAt ? dayjs(match.kickoffAt).format('YYYY-MM-DD') : '日期待定'
    if (!map.has(key)) map.set(key, [])
    map.get(key)?.push(match)
  })
  return Array.from(map.entries())
})

async function load() {
  loading.value = true
  try {
    const res = await publicApi.matches({
      page: page.value,
      pageSize: 20,
      status: status.value || undefined,
      date: date.value || undefined,
      groupId: undefined,
    })
    items.value = res.items
    total.value = res.total
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

function switchStatus(value: string) {
  status.value = value
  page.value = 1
  load()
}

function resetFilters() {
  status.value = ''
  date.value = ''
  groupName.value = ''
  page.value = 1
  load()
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
      <div class="container">
        <span class="eyebrow">MATCH CENTER · 2026</span>
        <h1>赛事中心</h1>
        <p>实时比分、赛程与图文直播，关注每一场绿茵对决。</p>
      </div>
    </section>

    <div class="container match-body">
      <div class="filter-panel">
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
          </button>
        </div>
        <div class="filter-controls">
          <el-date-picker
            v-model="date"
            type="date"
            placeholder="按比赛日期筛选"
            value-format="YYYY-MM-DD"
            :prefix-icon="Calendar"
            @change="load"
          />
          <el-select v-model="groupName" placeholder="全部组别" clearable class="group-select">
            <el-option v-for="group in groups" :key="group" :label="group" :value="group" />
          </el-select>
          <el-button text @click="resetFilters">重置</el-button>
        </div>
      </div>

      <div v-loading="loading" class="schedule">
        <section v-for="[day, list] in groupedByDate" :key="day" class="day-block">
          <div class="day-head">
            <span class="day-head__date">{{ formatDayLabel(day) }}</span>
            <span class="day-head__count">{{ list.length }} 场比赛</span>
          </div>

          <div class="match-list">
            <router-link
              v-for="match in list"
              :key="match.id"
              :to="`/matches/${match.id}`"
              class="match-row"
              :class="{ 'is-live': match.status === 'LIVE' }"
            >
              <div class="match-row__time">
                <strong class="num">{{ formatTime(match.kickoffAt) }}</strong>
                <StatusTag :status="match.status" kind="match" />
              </div>
              <div class="match-row__group">{{ match.groupName }}</div>
              <div class="match-row__teams">
                <span class="team team--home">{{ match.homeTeamName }}</span>
                <span class="score num">
                  <template v-if="match.status === 'SCHEDULED'">VS</template>
                  <template v-else>{{ match.homeScore }} : {{ match.awayScore }}</template>
                </span>
                <span class="team team--away">{{ match.awayTeamName }}</span>
              </div>
              <div class="match-row__venue">
                <el-icon><Location /></el-icon>
                {{ match.venue }}
              </div>
              <span class="match-row__arrow">›</span>
            </router-link>
          </div>
        </section>

        <el-empty v-if="!loading && !items.length" description="没有符合条件的比赛">
          <el-button type="primary" plain @click="resetFilters">查看全部比赛</el-button>
        </el-empty>
      </div>

      <PaginationBar
        v-model:page="page"
        :page-size="20"
        :total="total"
        layout="prev, pager, next"
        hide-when-single
        @current-change="load"
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
  padding: 54px 0 42px;
  background:
    radial-gradient(circle at 85% 30%, rgba(200, 241, 105, 0.16), transparent 35%),
    linear-gradient(150deg, #075c40, #054331);
  color: #fff;
}

.eyebrow {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.24em;
  color: var(--lime);
}

.page-hero h1 {
  margin-top: 9px;
  font-size: 36px;
}

.page-hero p {
  margin-top: 9px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.56);
}

.match-body {
  margin-top: -18px;
  position: relative;
}

.filter-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin-bottom: 24px;
  border-radius: 15px;
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-card);
}

.status-tabs {
  display: flex;
  gap: 4px;
}

.status-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 15px;
  border: none;
  border-radius: 9px;
  background: transparent;
  font-size: 12.5px;
  color: var(--ink-500);
  cursor: pointer;
}

.status-tab.is-active {
  background: var(--brand-700);
  color: #fff;
  font-weight: 600;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff5f5f;
  box-shadow: 0 0 0 3px rgba(255, 95, 95, 0.15);
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-select {
  width: 150px;
}

.schedule {
  min-height: 180px;
}

.day-block {
  margin-bottom: 26px;
}

.day-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
  padding-left: 2px;
}

.day-head__date {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-900);
}

.day-head__count {
  font-size: 10.5px;
  color: var(--ink-300);
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-row {
  display: grid;
  grid-template-columns: 94px 90px minmax(0, 1.6fr) minmax(180px, 0.7fr) 24px;
  align-items: center;
  gap: 14px;
  padding: 15px 18px;
  border-radius: 13px;
  background: #fff;
  border: 1px solid var(--line);
  transition: 0.16s;
}

.match-row:hover {
  border-color: var(--brand-500);
  box-shadow: var(--shadow-card);
  transform: translateX(2px);
}

.match-row.is-live {
  border-left: 3px solid #ff5f5f;
}

.match-row__time {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.match-row__time strong {
  font-size: 16px;
  color: var(--ink-900);
}

.match-row__group {
  font-size: 10.5px;
  color: var(--ink-500);
}

.match-row__teams {
  display: grid;
  grid-template-columns: 1fr 72px 1fr;
  align-items: center;
  gap: 10px;
}

.team {
  font-size: 13px;
  color: var(--ink-900);
}

.team--home {
  text-align: right;
}

.team--away {
  text-align: left;
}

.score {
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: var(--brand-800);
  letter-spacing: 0.02em;
}

.match-row__venue {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.match-row__arrow {
  color: var(--ink-300);
  font-size: 20px;
  text-align: right;
}

@media (max-width: 860px) {
  .filter-controls {
    width: 100%;
    flex-wrap: wrap;
  }

  .match-row {
    grid-template-columns: 1fr auto;
    gap: 10px;
  }

  .match-row__time {
    flex-direction: row;
    align-items: center;
  }

  .match-row__group,
  .match-row__venue,
  .match-row__arrow {
    display: none;
  }

  .match-row__teams {
    grid-column: 1 / -1;
    order: 2;
  }
}

@media (max-width: 560px) {
  .filter-panel {
    align-items: stretch;
  }

  .status-tabs {
    width: 100%;
    overflow-x: auto;
  }

  .status-tab {
    flex-shrink: 0;
  }

  .filter-controls .el-date-editor {
    flex: 1;
    min-width: 150px;
  }
}
</style>
