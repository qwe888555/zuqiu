<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { DataAnalysis, Download, Refresh, Trophy, User, Warning } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { eventApi, matchApi } from '../../api'
import type { Event, Match, MatchEvent } from '../../api/types'
import { EVENT_LEVELS, eventLevelLabel, eventLevelOf } from '../../config/labels'
import { usePermission } from '../../composables/usePermission'
import { mapLimit, fetchAllPages } from '../../utils/asyncPool'
import {
  buildPlayerStats,
  buildStandings,
  summarizeCoverage,
  type MatchWithEvents,
  type PlayerStatRow,
  type PlayerTrace,
  type StandingRow,
} from '../../utils/statsAggregation'
import { toCsv } from '../../utils/csv'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'

const router = useRouter()
const { can } = usePermission()

const activeTab = ref<'events' | 'players' | 'enrollments'>('events')
const dateRange = ref<[string, string]>([
  dayjs().startOf('year').format('YYYY-MM-DD'),
  dayjs().format('YYYY-MM-DD'),
])
const level = ref('')

const loading = ref(false)
const events = ref<Event[]>([])
const matchesByEvent = ref<Record<string, Match[]>>({})

const playerEventId = ref('')
const playerLoading = ref(false)
const playerRows = ref<PlayerStatRow[]>([])
const playerCoverage = ref('')
const playerCardsAvailable = ref(true)
const playerTruncated = ref(false)
const playerKeyword = ref('')
const playerTeamFilter = ref('')

const standingsVisible = ref(false)
const standingsEvent = ref<Event | null>(null)
const activeGroupId = ref('')

const traceVisible = ref(false)
const tracePlayer = ref<PlayerStatRow | null>(null)

const rangeStart = computed(() => dayjs(dateRange.value[0]).startOf('day'))
const rangeEnd = computed(() => dayjs(dateRange.value[1]).endOf('day'))

function inRange(kickoffAt?: string): boolean {
  if (!kickoffAt) return false
  const time = dayjs(kickoffAt)
  if (!time.isValid()) return false
  return !time.isBefore(rangeStart.value) && !time.isAfter(rangeEnd.value)
}

const filteredEvents = computed(() =>
  events.value.filter((event) => !level.value || eventLevelOf(event.eventCategory) === level.value),
)

interface EventRow {
  event: Event
  matches: Match[]
  groups: { id: string; name: string }[]
  teamCount: number
  goals: number
  dateStart?: string
  dateEnd?: string
}

const eventRows = computed<EventRow[]>(() => {
  const rows: EventRow[] = []
  for (const event of filteredEvents.value) {
    const matches = (matchesByEvent.value[event.id] || []).filter((match) => inRange(match.kickoffAt))
    if (!matches.length) continue
    const groups = new Map<string, string>()
    const teams = new Set<string>()
    let goals = 0
    for (const match of matches) {
      if (match.groupId) groups.set(match.groupId, match.groupName || match.groupId)
      if (match.homeTeamId) teams.add(match.homeTeamId)
      if (match.awayTeamId) teams.add(match.awayTeamId)
      if (match.status === 'FINISHED') {
        goals += (match.homeScore || 0) + (match.awayScore || 0)
      }
    }
    const times = matches
      .map((match) => match.kickoffAt)
      .filter(Boolean)
      .sort((a, b) => dayjs(a).valueOf() - dayjs(b).valueOf())
    rows.push({
      event,
      matches,
      groups: [...groups.entries()].map(([id, name]) => ({ id, name })),
      teamCount: teams.size,
      goals,
      dateStart: times[0],
      dateEnd: times[times.length - 1],
    })
  }
  return rows.sort((a, b) => dayjs(b.dateEnd || 0).valueOf() - dayjs(a.dateEnd || 0).valueOf())
})

const totalMatches = computed(() => eventRows.value.reduce((sum, row) => sum + row.matches.length, 0))
const totalGoals = computed(() => eventRows.value.reduce((sum, row) => sum + row.goals, 0))
const totalTeams = computed(() => {
  const teams = new Set<string>()
  for (const row of eventRows.value) {
    for (const match of row.matches) {
      if (match.homeTeamId) teams.add(match.homeTeamId)
      if (match.awayTeamId) teams.add(match.awayTeamId)
    }
  }
  return teams.size
})

function dateText(value?: string): string {
  return value ? dayjs(value).format('YYYY-MM-DD') : '—'
}

async function load() {
  loading.value = true
  try {
    const useManage = can('event.manage')
    const page = await fetchAllPages(
      (pageNo, pageSize) =>
        useManage
          ? eventApi.list({ page: pageNo, pageSize })
          : eventApi.available({ page: pageNo, pageSize }),
      100,
      20,
    )
    events.value = page.items
    if (page.truncated) ElMessage.warning('赛事数量较多，仅加载前 20 页')

    const targets = filteredEvents.value
    const results = await mapLimit(targets, 4, async (event) => {
      const res = await fetchAllPages(
        (pageNo, pageSize) => matchApi.list({ eventId: event.id, page: pageNo, pageSize }),
        100,
        20,
      )
      return [event.id, res.items] as const
    })
    const map: Record<string, Match[]> = {}
    for (const [eventId, items] of results) map[eventId] = items
    matchesByEvent.value = map
    if (playerEventId.value && !events.value.some((event) => event.id === playerEventId.value)) {
      playerEventId.value = ''
      playerRows.value = []
    }
  } catch {
    events.value = []
    matchesByEvent.value = {}
  } finally {
    loading.value = false
  }
}

function standingsMatches(eventId: string, groupId: string): Match[] {
  return (matchesByEvent.value[eventId] || []).filter(
    (match) => inRange(match.kickoffAt) && match.groupId === groupId,
  )
}

const groupOptions = computed(() => {
  if (!standingsEvent.value) return []
  const event = standingsEvent.value
  const map = new Map<string, string>()
  for (const match of matchesByEvent.value[event.id] || []) {
    if (!inRange(match.kickoffAt) || !match.groupId) continue
    map.set(match.groupId, match.groupName || match.groupId)
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }))
})

const standings = computed<StandingRow[]>(() => {
  if (!standingsEvent.value || !activeGroupId.value) return []
  return buildStandings(standingsMatches(standingsEvent.value.id, activeGroupId.value))
})

function openStandings(row: EventRow) {
  standingsEvent.value = row.event
  activeGroupId.value = row.groups[0]?.id || ''
  standingsVisible.value = true
}

function exportStandings() {
  if (!standings.value.length) return ElMessage.info('当前组别暂无可导出的积分榜')
  const header = ['名次', '球队', '赛', '胜', '平', '负', '进球', '失球', '净胜球', '积分']
  const lines = standings.value.map((row) => [
    row.rank,
    row.teamName,
    row.played,
    row.won,
    row.drawn,
    row.lost,
    row.gf,
    row.ga,
    row.gd,
    row.points,
  ])
  const blob = new Blob([`﻿${toCsv([header, ...lines])}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${standingsEvent.value?.name || '赛事'}-${groupOptions.value.find((g) => g.id === activeGroupId.value)?.name || '积分榜'}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

async function loadPlayers() {
  if (!playerEventId.value) return
  const event = events.value.find((item) => item.id === playerEventId.value)
  if (!event) return
  playerLoading.value = true
  playerRows.value = []
  playerTruncated.value = false
  playerCoverage.value = ''
  try {
    const all = (matchesByEvent.value[event.id] || []).filter((match) => inRange(match.kickoffAt))
    const limited = all.slice(0, 60)
    playerTruncated.value = all.length > limited.length
    const details = await mapLimit(limited, 4, async (match): Promise<MatchWithEvents> => {
      try {
        const res = await fetchAllPages<MatchEvent>(
          (pageNo, pageSize) => matchApi.events(match.id, { page: pageNo, pageSize }),
          200,
          10,
        )
        return { match, events: res.items }
      } catch {
        // 明细接口失败时保留 undefined，页面按“缺失事件”统计，不伪造 0。
        return { match }
      }
    })
    playerCardsAvailable.value = details.some((item) => item.events !== undefined)
    playerRows.value = buildPlayerStats(details).sort(
      (a, b) => b.goals - a.goals || b.redCards - a.redCards || b.yellowCards - a.yellowCards,
    )
    playerCoverage.value = summarizeCoverage(details, playerTruncated.value).text
  } catch {
    playerRows.value = []
    playerCoverage.value = '球员数据加载失败，请稍后重试'
  } finally {
    playerLoading.value = false
  }
}

const playerTeams = computed(() =>
  [...new Set(playerRows.value.map((row) => row.teamName).filter(Boolean) as string[])].sort(),
)

const displayPlayerRows = computed(() => {
  const keyword = playerKeyword.value.trim()
  return playerRows.value.filter(
    (row) =>
      (!playerTeamFilter.value || row.teamName === playerTeamFilter.value) &&
      (!keyword || row.athleteName.includes(keyword) || (row.teamName || '').includes(keyword)),
  )
})

const visibleMatches = computed(() => {
  const map = new Map<string, Match>()
  for (const list of Object.values(matchesByEvent.value)) {
    for (const match of list) map.set(match.id, match)
  }
  return map
})

function openTrace(row: PlayerStatRow) {
  tracePlayer.value = row
  traceVisible.value = true
}

function openMatch(matchId: string) {
  const match = visibleMatches.value.get(matchId)
  if (!match) return
  if (match.published) router.push({ name: 'portal-match-detail', params: { id: matchId } })
  else router.push({ name: 'match-console', params: { id: matchId } })
}

function traceKindLabel(kind: PlayerTrace['kind']) {
  return { GOAL: '进球', YELLOW_CARD: '黄牌', RED_CARD: '红牌' }[kind]
}

function traceMatchCount(row: PlayerStatRow): number {
  return new Set(row.traces.map((trace) => trace.matchId)).size
}

function resetPlayers() {
  playerRows.value = []
  playerCoverage.value = ''
  playerTruncated.value = false
  playerCardsAvailable.value = true
}

// 日期范围或级别变化后，已加载的球员数据不再对应当前口径，清空等待重新加载。
watch([dateRange, level], resetPlayers, { deep: true })

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="赛事统计"
      description="按时间范围与赛事级别汇总比赛、球队名次和球员数据。名次由已发布赛果推算，可在赛事级别下钻查看组别积分榜。"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新数据</el-button>
      </template>
    </PageHeader>

    <section class="page-card filter-card">
      <span class="filter-card__label">比赛日期</span>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        :clearable="false"
        style="width: 280px"
      />
      <span class="filter-card__label">赛事级别</span>
      <el-select v-model="level" placeholder="全部级别" clearable style="width: 150px">
        <el-option v-for="item in EVENT_LEVELS" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <span class="filter-card__spacer" />
      <span class="muted">按比赛开球时间筛选；未安排比赛的赛事不计入</span>
    </section>

    <el-tabs v-model="activeTab" class="stats-tabs">
      <el-tab-pane label="赛事与名次" name="events">
        <div class="stat-grid">
          <StatCard label="纳入赛事" :value="eventRows.length" hint="区间内有比赛" :icon="Trophy" tone="green" />
          <StatCard label="比赛场次" :value="totalMatches" hint="含未结束场次" :icon="DataAnalysis" tone="blue" />
          <StatCard label="参赛球队" :value="totalTeams" hint="去重球队" :icon="User" tone="lime" />
          <StatCard label="进球总数" :value="totalGoals" hint="仅统计已结束比赛" :icon="Warning" tone="amber" />
        </div>

        <section class="page-card">
          <div class="section-title">
            赛事列表
            <small>点击「查看名次」按组别查看积分榜</small>
          </div>
          <el-table v-loading="loading" :data="eventRows" style="width: 100%">
            <el-table-column label="赛事" min-width="220">
              <template #default="{ row }">
                <div class="event-cell">
                  <el-tag size="small" effect="plain">{{ eventLevelLabel(row.event.eventCategory) }}</el-tag>
                  <strong>{{ row.event.name }}</strong>
                  <small>{{ row.event.season }}</small>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="比赛日期" width="220">
              <template #default="{ row }">
                {{ dateText(row.dateStart) }} ~ {{ dateText(row.dateEnd) }}
              </template>
            </el-table-column>
            <el-table-column label="场次" width="80" align="center">
              <template #default="{ row }">{{ row.matches.length }}</template>
            </el-table-column>
            <el-table-column label="组别" width="80" align="center">
              <template #default="{ row }">{{ row.groups.length }}</template>
            </el-table-column>
            <el-table-column label="球队" width="80" align="center">
              <template #default="{ row }">{{ row.teamCount }}</template>
            </el-table-column>
            <el-table-column label="进球" width="80" align="center">
              <template #default="{ row }">{{ row.goals }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120" align="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openStandings(row)">查看名次</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty
            v-if="!loading && !eventRows.length"
            description="当前日期范围与级别下没有已安排比赛的赛事"
            :image-size="80"
          />
        </section>
      </el-tab-pane>

      <el-tab-pane label="球员数据" name="players">
        <section class="page-card filter-card">
          <span class="filter-card__label">赛事</span>
          <el-select
            v-model="playerEventId"
            placeholder="请选择赛事"
            filterable
            style="width: 280px"
            @change="resetPlayers"
          >
            <el-option
              v-for="row in eventRows"
              :key="row.event.id"
              :label="row.event.name"
              :value="row.event.id"
            />
          </el-select>
          <el-button type="primary" :loading="playerLoading" :disabled="!playerEventId" @click="loadPlayers">
            加载球员数据
          </el-button>
          <template v-if="playerRows.length">
            <el-input v-model="playerKeyword" placeholder="搜索球员/球队" clearable style="width: 180px" />
            <el-select v-model="playerTeamFilter" placeholder="全部球队" clearable style="width: 170px">
              <el-option v-for="team in playerTeams" :key="team" :label="team" :value="team" />
            </el-select>
          </template>
        </section>

        <el-alert
          v-if="playerRows.length && !playerCardsAvailable"
          class="coverage-alert"
          type="warning"
          :closable="false"
          show-icon
          title="逐场事件明细不可用"
          description="当前接口未返回比赛事件，进球与红黄牌仅能展示部分数据；缺失部分不记为 0。"
        />

        <section v-if="playerRows.length || playerLoading" class="page-card">
          <div class="section-title">
            进球与红黄牌
            <small v-if="playerCoverage">{{ playerCoverage }}；点击行查看逐场明细</small>
          </div>
          <el-table v-loading="playerLoading" :data="displayPlayerRows" style="width: 100%" @row-click="openTrace">
            <el-table-column type="index" label="#" width="60" align="center" />
            <el-table-column label="球员" min-width="160">
              <template #default="{ row }">
                <strong>{{ row.athleteName }}</strong>
                <el-tag v-if="row.byNameMatch" size="small" type="info" effect="plain">按姓名匹配</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="teamName" label="球队" min-width="160">
              <template #default="{ row }">{{ row.teamName || '—' }}</template>
            </el-table-column>
            <el-table-column prop="goals" label="进球" width="90" align="center" />
            <el-table-column label="黄牌" width="90" align="center">
              <template #default="{ row }">
                {{ playerCardsAvailable ? row.yellowCards : '—' }}
              </template>
            </el-table-column>
            <el-table-column label="红牌" width="90" align="center">
              <template #default="{ row }">
                {{ playerCardsAvailable ? row.redCards : '—' }}
              </template>
            </el-table-column>
            <el-table-column label="可追溯场次" width="120" align="center">
              <template #default="{ row }">{{ traceMatchCount(row) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="right">
              <template #default="{ row }">
                <el-button link type="primary" @click.stop="openTrace(row)">明细</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <el-empty
          v-else-if="!playerLoading"
          description="请选择赛事并加载球员数据；逐场事件按需读取，避免一次性请求过多"
          :image-size="80"
        />
      </el-tab-pane>

      <el-tab-pane label="报名分布" name="enrollments">
        <section class="page-card enroll-panel">
          <h3>报名分布统一下钻</h3>
          <p>
            报名球队、球员及市州/学校分布已在「报名统计」页维护，支持选择“全部赛事”并按报名期与日期范围合并统计。
            本页不重复实现，避免两处口径不一致。
          </p>
          <el-button type="primary" @click="router.push('/console/enrollment-stats')">前往报名统计</el-button>
        </section>
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="standingsVisible" size="720px" :title="standingsEvent?.name || '赛事名次'">
      <el-alert
        class="drawer-alert"
        type="info"
        :closable="false"
        show-icon
        title="名次按已发布且比分完整的赛果推算"
        description="胜 3 分、平 1 分、负 0 分，依次比较积分、净胜球、进球数；该结果不是官方奖项，淘汰赛名次以组委会公示为准。"
      />
      <div class="drawer-toolbar">
        <el-radio-group v-model="activeGroupId">
          <el-radio-button v-for="group in groupOptions" :key="group.id" :value="group.id">
            {{ group.name }}
          </el-radio-button>
        </el-radio-group>
        <el-button :icon="Download" :disabled="!standings.length" @click="exportStandings">导出 CSV</el-button>
      </div>
      <el-table :data="standings" style="width: 100%">
        <el-table-column label="名次" width="80" align="center">
          <template #default="{ row }">
            <span v-if="row.rank === 1">🥇 1</span>
            <span v-else-if="row.rank === 2">🥈 2</span>
            <span v-else-if="row.rank === 3">🥉 3</span>
            <span v-else>{{ row.rank }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="teamName" label="球队" min-width="160" />
        <el-table-column prop="played" label="赛" width="60" align="center" />
        <el-table-column prop="won" label="胜" width="60" align="center" />
        <el-table-column prop="drawn" label="平" width="60" align="center" />
        <el-table-column prop="lost" label="负" width="60" align="center" />
        <el-table-column prop="gf" label="进" width="60" align="center" />
        <el-table-column prop="ga" label="失" width="60" align="center" />
        <el-table-column prop="gd" label="净" width="60" align="center" />
        <el-table-column prop="points" label="积分" width="70" align="center">
          <template #default="{ row }"><strong class="num">{{ row.points }}</strong></template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!standings.length" description="该组别暂无已结束且比分完整的比赛" :image-size="70" />
    </el-drawer>

    <el-drawer v-model="traceVisible" size="680px" :title="`${tracePlayer?.athleteName || ''} · 逐场明细`">
      <el-table :data="tracePlayer?.traces || []" style="width: 100%">
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag :type="row.kind === 'GOAL' ? 'success' : row.kind === 'RED_CARD' ? 'danger' : 'warning'" size="small">
              {{ traceKindLabel(row.kind) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="matchLabel" label="比赛" min-width="180" />
        <el-table-column prop="opponentName" label="对手" min-width="120">
          <template #default="{ row }">{{ row.opponentName || '—' }}</template>
        </el-table-column>
        <el-table-column label="时间" width="150">
          <template #default="{ row }">
            {{ row.kickoffAt ? dayjs(row.kickoffAt).format('MM-DD HH:mm') : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="分钟" width="80" align="center">
          <template #default="{ row }">
            {{ typeof row.minute === 'number' ? `${row.minute}${row.stoppageMinute ? `+${row.stoppageMinute}` : ''}'` : '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="scoreText" label="比分" width="80" align="center">
          <template #default="{ row }">{{ row.scoreText || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openMatch(row.matchId)">查看比赛</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!tracePlayer?.traces.length" description="暂无可追溯的逐场事件" :image-size="70" />
    </el-drawer>
  </div>
</template>

<style scoped>
.filter-card {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 16px 20px;
}

.filter-card__spacer {
  flex: 1;
}

.filter-card__label {
  font-size: 12px;
  color: var(--ink-500);
}

.stats-tabs {
  margin-top: 18px;
}

.event-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.event-cell strong {
  font-size: 12.5px;
}

.event-cell small {
  color: var(--ink-300);
  font-size: 11px;
}

.coverage-alert {
  margin-bottom: 14px;
}

.drawer-alert {
  margin-bottom: 16px;
}

.drawer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.enroll-panel {
  padding: 28px;
}

.enroll-panel h3 {
  margin: 0 0 10px;
  font-size: 17px;
}

.enroll-panel p {
  max-width: 640px;
  margin: 0 0 18px;
  color: var(--ink-500);
  line-height: 1.8;
  font-size: 12.5px;
}

@media (max-width: 760px) {
  .filter-card .el-select,
  .filter-card .el-date-editor {
    width: 100% !important;
  }

  .filter-card__spacer {
    display: none;
  }
}
</style>
