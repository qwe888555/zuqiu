<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { Calendar, DataAnalysis, Football, Refresh, Warning } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { meApi, publicApi } from '../../api'
import type { GoalRankingRow, Person, PublicEvent, PublicMatch, Team } from '../../api/types'
import { useAuthStore } from '../../stores/auth'
import { fetchAllPages, mapLimit } from '../../utils/asyncPool'
import {
  buildPlayerStats,
  normalizeTeamName,
  summarizeCoverage,
  type MatchWithEvents,
  type PlayerStatRow,
  type PlayerTrace,
} from '../../utils/statsAggregation'
import { eventCategoryLabel } from '../../config/labels'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'

interface MyMatchRow {
  event: PublicEvent
  match: PublicMatch
  side: 'HOME' | 'AWAY' | ''
}

interface MyEventRow {
  event: PublicEvent
  matches: MyMatchRow[]
  teams: string[]
  dateStart?: string
  dateEnd?: string
}

const router = useRouter()
const auth = useAuthStore()

const activeTab = ref<'events' | 'goals' | 'cards'>('events')
const loading = ref(false)
const detailsLoading = ref(false)
const profile = ref<Person | null>(null)
const teams = ref<Team[]>([])
const events = ref<PublicEvent[]>([])
const matchesByEvent = ref<Record<string, PublicMatch[]>>({})
const goalRows = ref<GoalRankingRow[]>([])
const details = ref<MatchWithEvents[]>([])
const detailsLoaded = ref(false)
const detailsTruncated = ref(false)
const coverageText = ref('')

const nameMatchedGoals = ref(false)

/** 本人的球队 ID；新后端公开比赛已返回主客队 ID，优先按 ID 精确匹配。 */
const myTeamIds = computed(() => {
  const ids = new Set<string>()
  for (const team of teams.value) if (team.id) ids.add(team.id)
  for (const id of auth.user?.teamIds || []) if (id) ids.add(id)
  return ids
})

const teamNames = computed(() => {
  const names = new Set<string>()
  for (const team of teams.value) {
    if (team.name) names.add(normalizeTeamName(team.name))
    if (team.shortName) names.add(normalizeTeamName(team.shortName))
  }
  if (profile.value?.teamName) names.add(normalizeTeamName(profile.value.teamName))
  names.delete('')
  return names
})

const isAthletePerson = computed(
  () => !!profile.value?.kinds?.includes('ATHLETE') || auth.roles.includes('ATHLETE'),
)
const isCoachPerson = computed(
  () => !!profile.value?.kinds?.includes('COACH') || auth.roles.includes('COACH'),
)
/** 纯教练账号不参与球员统计；同时具备运动员身份的账号仍按运动员口径展示。 */
const coachOnly = computed(() => isCoachPerson.value && !isAthletePerson.value)
const pageDescription = computed(() =>
  coachOnly.value
    ? '汇总所执教球队参与的赛事与比赛。教练账号不参与球员进球与红黄牌统计，相关球员数据请前往赛事统计或比赛记录台查看。'
    : '汇总本人参与的赛事、比赛、进球与红黄牌。仅展示公开接口可核验的数据，缺失明细时不做补造。',
)
/** 档案接口失败时用登录态里的 personId 兜底，避免整页无法匹配本人数据。 */
const profileId = computed(() => profile.value?.id || auth.user?.personId || '')
const profileName = computed(() => profile.value?.realName?.trim() || '')

/**
 * 球队 ID 精确匹配优先；ID 缺失或本地球队列表未覆盖历史球队时，
 * 仍回退到名称匹配，避免漏掉本人过往参赛记录。
 */
function isMyTeam(id?: string, name?: string): boolean {
  if (id && myTeamIds.value.has(id)) return true
  const normalized = normalizeTeamName(name)
  return !!normalized && teamNames.value.has(normalized)
}

const myMatches = computed<MyMatchRow[]>(() => {
  const rows: MyMatchRow[] = []
  for (const event of events.value) {
    for (const match of matchesByEvent.value[event.id] || []) {
      const home = isMyTeam(match.homeTeamId, match.homeTeamName)
      const away = isMyTeam(match.awayTeamId, match.awayTeamName)
      if (home || away) {
        rows.push({ event, match, side: home && away ? '' : home ? 'HOME' : 'AWAY' })
      }
    }
  }
  return rows.sort((a, b) => dayjs(b.match.kickoffAt || 0).valueOf() - dayjs(a.match.kickoffAt || 0).valueOf())
})

const myEvents = computed<MyEventRow[]>(() => {
  const map = new Map<string, MyEventRow>()
  for (const row of myMatches.value) {
    let item = map.get(row.event.id)
    if (!item) {
      item = { event: row.event, matches: [], teams: [], dateStart: undefined, dateEnd: undefined }
      map.set(row.event.id, item)
    }
    item.matches.push(row)
    const sides: [string | undefined, string | undefined][] = [
      [row.match.homeTeamId, row.match.homeTeamName],
      [row.match.awayTeamId, row.match.awayTeamName],
    ]
    for (const [id, name] of sides) {
      if (isMyTeam(id, name) && name && !item.teams.includes(name)) item.teams.push(name)
    }
  }
  for (const item of map.values()) {
    const times = item.matches
      .map((row) => row.match.kickoffAt)
      .filter(Boolean)
      .sort((a, b) => dayjs(a).valueOf() - dayjs(b).valueOf())
    item.dateStart = times[0]
    item.dateEnd = times[times.length - 1]
  }
  return [...map.values()].sort((a, b) => dayjs(b.dateEnd || 0).valueOf() - dayjs(a.dateEnd || 0).valueOf())
})

const totalGoals = computed(() => goalRows.value.reduce((sum, row) => sum + row.goals, 0))

const myPlayerRows = computed<PlayerStatRow[]>(() => {
  const stats = buildPlayerStats(details.value)
  return stats.filter((row) => {
    if (profileId.value && row.athleteId === profileId.value) return true
    return (
      !profileId.value &&
      !!profileName.value &&
      row.athleteName === profileName.value &&
      (!row.teamName || isMyTeam(undefined, row.teamName))
    )
  })
})

const detailsAvailable = computed(() => details.value.some((item) => item.events !== undefined))
const cardsAvailable = computed(() => detailsAvailable.value)

const myTraces = computed<PlayerTrace[]>(() =>
  myPlayerRows.value.flatMap((row) => row.traces).sort((a, b) => {
    const timeA = a.kickoffAt ? Date.parse(a.kickoffAt) : 0
    const timeB = b.kickoffAt ? Date.parse(b.kickoffAt) : 0
    return timeB - timeA
  }),
)
const goalTraces = computed(() => myTraces.value.filter((trace) => trace.kind === 'GOAL'))
const cardTraces = computed(() =>
  myTraces.value.filter((trace) => trace.kind === 'YELLOW_CARD' || trace.kind === 'RED_CARD'),
)
const yellowCards = computed(() => cardTraces.value.filter((trace) => trace.kind === 'YELLOW_CARD').length)
const redCards = computed(() => cardTraces.value.filter((trace) => trace.kind === 'RED_CARD').length)

async function loadBase() {
  loading.value = true
  try {
    const [profileResult, teamsResult] = await Promise.allSettled([
      meApi.profile({ silentError: true }),
      meApi.teams({ silentError: true }),
    ])
    profile.value = profileResult.status === 'fulfilled' ? profileResult.value : null
    teams.value = teamsResult.status === 'fulfilled' ? teamsResult.value : []

    const eventPage = await fetchAllPages(
      (page, pageSize) => publicApi.events({ page, pageSize }),
      100,
      20,
    )
    events.value = eventPage.items
    if (eventPage.truncated) ElMessage.warning('赛事数量较多，仅加载前 20 页')

    const results = await mapLimit(events.value, 4, async (event) => {
      try {
        const res = await fetchAllPages(
          (page, pageSize) => publicApi.matches({ eventId: event.id, page, pageSize }),
          100,
          20,
        )
        return [event.id, res.items] as const
      } catch {
        return [event.id, [] as PublicMatch[]] as const
      }
    })
    matchesByEvent.value = Object.fromEntries(results)

    // 纯教练账号没有球员进球/红黄牌数据，跳过射手榜请求，避免无意义查询。
    if (!coachOnly.value) await loadGoals()
  } catch {
    events.value = []
    matchesByEvent.value = {}
    goalRows.value = []
  } finally {
    loading.value = false
  }
}

function matchesPlayer(row: GoalRankingRow): boolean {
  if (profileId.value && row.athleteId === profileId.value) return true
  return (
    !!profileName.value &&
    row.athleteName === profileName.value &&
    isMyTeam(row.teamId, row.teamName)
  )
}

async function loadGoals() {
  const eventIds = [...new Set(myMatches.value.map((row) => row.event.id))]
  const collected: GoalRankingRow[] = []
  for (const eventId of eventIds) {
    try {
      const page = await fetchAllPages<GoalRankingRow>(
        async (pageNo, pageSize) => {
          const res = await publicApi.goals({ eventId, page: pageNo, pageSize })
          return { items: res.rows, page: pageNo, pageSize }
        },
        100,
        20,
      )
      collected.push(...page.items)
    } catch {
      // 单个赛事射手榜失败不阻断其他赛事
    }
  }
  const byAthlete = new Map<string, GoalRankingRow>()
  for (const row of collected.filter(matchesPlayer)) {
    const key = row.athleteId || `${row.teamName || ''}:${row.athleteName}`
    const current = byAthlete.get(key)
    if (current) {
      current.goals += row.goals
    } else {
      byAthlete.set(key, { ...row })
    }
  }
  goalRows.value = [...byAthlete.values()].sort((a, b) => b.goals - a.goals)
  nameMatchedGoals.value = goalRows.value.some((row) => !row.athleteId)
  if (myMatches.value.length && !goalRows.value.length) {
    // 公开射手榜可能只覆盖已发布赛果，这里不作为错误处理。
  }
}

async function loadDetails() {
  if (detailsLoaded.value || detailsLoading.value) return
  detailsLoading.value = true
  try {
    const list = myMatches.value.map((row) => row.match)
    const limited = list.slice(0, 60)
    detailsTruncated.value = list.length > limited.length
    details.value = await mapLimit(limited, 4, async (match): Promise<MatchWithEvents> => {
      try {
        const detail = await publicApi.match(match.id)
        return { match, events: detail.events }
      } catch {
        return { match }
      }
    })
    detailsLoaded.value = true
    coverageText.value = summarizeCoverage(details.value, detailsTruncated.value).text
    if (!detailsAvailable.value) {
      ElMessage.info('公开接口未提供逐场事件明细，红黄牌与逐场进球暂无法展示')
    }
  } finally {
    detailsLoading.value = false
  }
}

function switchTab(name: string | number) {
  if ((name === 'goals' || name === 'cards') && !detailsLoaded.value) {
    void loadDetails()
  }
}

function refresh() {
  details.value = []
  detailsLoaded.value = false
  coverageText.value = ''
  void loadBase()
}

function dateText(value?: string): string {
  return value ? dayjs(value).format('YYYY-MM-DD') : '—'
}

function matchDate(value?: string): string {
  return value ? dayjs(value).format('MM-DD HH:mm') : '—'
}

function openMatch(matchId: string) {
  router.push({ name: 'portal-match-detail', params: { id: matchId } })
}

function openEvent(eventId: string) {
  router.push({ name: 'portal-matches', query: { eventId } })
}

function minuteText(trace: PlayerTrace): string {
  if (typeof trace.minute !== 'number') return '—'
  return `${trace.minute}${trace.stoppageMinute ? `+${trace.stoppageMinute}` : ''}'`
}

function traceKindLabel(kind: PlayerTrace['kind']) {
  return { GOAL: '进球', YELLOW_CARD: '黄牌', RED_CARD: '红牌' }[kind]
}

onMounted(loadBase)
</script>

<template>
  <div class="page">
    <PageHeader title="我的赛事数据" :description="pageDescription">
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="coachOnly"
      class="scope-alert"
      type="info"
      :closable="false"
      show-icon
      title="教练账号数据口径"
      description="本页按所执教球队匹配公开赛程，展示球队参赛赛事与场次；教练不参与球员进球/红黄牌统计，因此不展示球员个人 KPI 与明细。"
    />
    <el-alert
      v-else
      class="scope-alert"
      type="info"
      :closable="false"
      show-icon
      title="数据口径说明"
      description="公开赛程优先按主客队 ID 匹配本人参赛场次，旧接口无 ID 时回退为球队名称匹配；公开详情未提供逐场事件时，只展示公开射手榜汇总，红黄牌显示为“—”。"
    />

    <div v-if="coachOnly" class="stat-grid">
      <StatCard
        label="执教赛事"
        :value="myEvents.length"
        :hint="myTeamIds.size ? '球队 ID 优先匹配' : '按球队名称匹配'"
        :icon="Calendar"
        tone="green"
      />
      <StatCard label="执教场次" :value="myMatches.length" hint="公开赛程中的场次" :icon="Football" tone="blue" />
      <StatCard label="执教球队" :value="teams.length" hint="本人所属球队" :icon="DataAnalysis" tone="lime" />
      <StatCard label="球员数据" value="—" hint="教练账号不参与球员统计" :icon="Warning" tone="amber" />
    </div>
    <div v-else class="stat-grid">
      <StatCard
        label="参赛赛事"
        :value="myEvents.length"
        :hint="myTeamIds.size ? '球队 ID 优先匹配' : '按球队名称匹配'"
        :icon="Calendar"
        tone="green"
      />
      <StatCard label="参赛场次" :value="myMatches.length" hint="公开赛程中的场次" :icon="Football" tone="blue" />
      <StatCard label="累计进球" :value="totalGoals" hint="公开射手榜汇总" :icon="DataAnalysis" tone="lime" />
      <StatCard
        label="红黄牌"
        :value="cardsAvailable ? `${yellowCards} 黄 / ${redCards} 红` : '—'"
        :hint="cardsAvailable ? '逐场事件统计' : '公开接口未提供逐场事件'"
        :icon="Warning"
        tone="amber"
      />
    </div>

    <el-tabs v-model="activeTab" class="my-tabs" @tab-change="switchTab">
      <el-tab-pane label="参赛赛事" name="events">
        <section class="page-card">
          <div class="section-title">
            参赛记录
            <small>点击赛事查看公开赛程，点击比赛查看详情</small>
          </div>
          <el-table v-loading="loading" :data="myEvents" style="width: 100%">
            <el-table-column label="赛事" min-width="220">
              <template #default="{ row }">
                <div class="event-cell">
                  <el-tag size="small" effect="plain">
                    {{ eventCategoryLabel(row.event.eventCategory, row.event.eventCategoryLabel) }}
                  </el-tag>
                  <strong>{{ row.event.name }}</strong>
                  <small>{{ row.event.season }}</small>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="本人球队" min-width="150">
              <template #default="{ row }">{{ row.teams.join(' / ') || '—' }}</template>
            </el-table-column>
            <el-table-column label="场次" width="80" align="center">
              <template #default="{ row }">{{ row.matches.length }}</template>
            </el-table-column>
            <el-table-column label="日期范围" width="220">
              <template #default="{ row }">{{ dateText(row.dateStart) }} ~ {{ dateText(row.dateEnd) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="110" align="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openEvent(row.event.id)">查看赛程</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty
            v-if="!loading && !myEvents.length"
            description="未匹配到本人参赛记录。公开赛程仅覆盖已公布比赛；若球队近期变更且旧接口未返回球队 ID，可能暂时无法匹配。"
            :image-size="80"
          />
        </section>

        <section v-if="myMatches.length" class="page-card">
          <div class="section-title">参赛场次</div>
          <el-table :data="myMatches" max-height="460" style="width: 100%">
            <el-table-column label="比赛" min-width="220">
              <template #default="{ row }">
                <strong>{{ row.match.homeTeamName || '主队' }}</strong>
                <span class="score num">{{ row.match.homeScore }} : {{ row.match.awayScore }}</span>
                <strong>{{ row.match.awayTeamName || '客队' }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="赛事/组别" min-width="180">
              <template #default="{ row }">
                {{ row.event.name }}<br />
                <small class="muted">{{ row.match.groupName || '未分组' }}</small>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="130">
              <template #default="{ row }">{{ matchDate(row.match.kickoffAt) }}</template>
            </el-table-column>
            <el-table-column prop="match.status" label="状态" width="110" />
            <el-table-column label="操作" width="90" align="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openMatch(row.match.id)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane v-if="!coachOnly" label="进球明细" name="goals">
        <section class="page-card">
          <div class="section-title">
            进球汇总
            <small v-if="goalRows.length">公开射手榜累计；逐场明细在下方</small>
          </div>
          <el-table v-loading="loading" :data="goalRows" style="width: 100%">
            <el-table-column type="index" label="#" width="60" align="center" />
            <el-table-column prop="athleteName" label="球员" min-width="140" />
            <el-table-column prop="teamName" label="球队" min-width="160">
              <template #default="{ row }">{{ row.teamName || '—' }}</template>
            </el-table-column>
            <el-table-column prop="goals" label="进球" width="90" align="center">
              <template #default="{ row }"><strong class="num">{{ row.goals }}</strong></template>
            </el-table-column>
          </el-table>
          <el-alert
            v-if="nameMatchedGoals"
            class="inline-alert"
            type="warning"
            :closable="false"
            show-icon
            title="部分进球记录缺少运动员 ID"
            description="已按姓名与本人球队交叉匹配，可能存在同名误匹配，请以赛果记录为准。"
          />
          <el-empty v-if="!loading && !goalRows.length" description="公开射手榜暂未统计到本人进球" :image-size="70" />
        </section>

        <section class="page-card">
          <div class="section-title">
            逐场进球明细
            <small v-if="coverageText">{{ coverageText }}</small>
          </div>
          <el-alert
            v-if="detailsLoaded && !detailsAvailable"
            class="inline-alert"
            type="warning"
            :closable="false"
            show-icon
            title="公开接口未提供逐场事件"
            description="无法核验每粒进球对应的比赛与分钟，本页不展示推测明细；累计进球以上方汇总为准。"
          />
          <el-table v-else v-loading="detailsLoading" :data="goalTraces" style="width: 100%">
            <el-table-column prop="matchLabel" label="比赛" min-width="200" />
            <el-table-column prop="opponentName" label="对手" min-width="130">
              <template #default="{ row }">{{ row.opponentName || '—' }}</template>
            </el-table-column>
            <el-table-column label="时间" width="140">
              <template #default="{ row }">{{ matchDate(row.kickoffAt) }}</template>
            </el-table-column>
            <el-table-column label="分钟" width="80" align="center">
              <template #default="{ row }">{{ minuteText(row) }}</template>
            </el-table-column>
            <el-table-column label="比分" width="80" align="center">
              <template #default="{ row }">{{ row.scoreText || '—' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90" align="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openMatch(row.matchId)">比赛</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty
            v-if="detailsLoaded && detailsAvailable && !goalTraces.length"
            description="逐场事件中暂无本人进球记录"
            :image-size="70"
          />
        </section>
      </el-tab-pane>

      <el-tab-pane v-if="!coachOnly" label="红黄牌明细" name="cards">
        <section class="page-card">
          <div class="section-title">
            红黄牌记录
            <small v-if="coverageText">{{ coverageText }}</small>
          </div>
          <el-alert
            v-if="detailsLoaded && !cardsAvailable"
            class="inline-alert"
            type="warning"
            :closable="false"
            show-icon
            title="逐场事件明细不可用"
            description="公开接口未提供逐场事件，红黄牌数量与明细暂无法核验，页面不显示 0 以免误导。"
          />
          <template v-else>
            <div class="card-kpis">
              <div class="card-kpi card-kpi--yellow">
                <span>黄牌</span>
                <strong class="num">{{ cardsAvailable ? yellowCards : '—' }}</strong>
              </div>
              <div class="card-kpi card-kpi--red">
                <span>红牌</span>
                <strong class="num">{{ cardsAvailable ? redCards : '—' }}</strong>
              </div>
            </div>
            <el-table v-loading="detailsLoading" :data="cardTraces" style="width: 100%">
              <el-table-column label="类型" width="90">
                <template #default="{ row }">
                  <el-tag :type="row.kind === 'RED_CARD' ? 'danger' : 'warning'" size="small">
                    {{ traceKindLabel(row.kind) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="matchLabel" label="比赛" min-width="200" />
              <el-table-column prop="opponentName" label="对手" min-width="130">
                <template #default="{ row }">{{ row.opponentName || '—' }}</template>
              </el-table-column>
              <el-table-column label="时间" width="140">
                <template #default="{ row }">{{ matchDate(row.kickoffAt) }}</template>
              </el-table-column>
              <el-table-column label="分钟" width="80" align="center">
                <template #default="{ row }">{{ minuteText(row) }}</template>
              </el-table-column>
              <el-table-column prop="note" label="原因" min-width="140">
                <template #default="{ row }">{{ row.note || '—' }}</template>
              </el-table-column>
              <el-table-column label="操作" width="90" align="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openMatch(row.matchId)">比赛</el-button>
                </template>
              </el-table-column>
            </el-table>
            <el-empty
              v-if="detailsLoaded && cardsAvailable && !cardTraces.length"
              description="逐场事件中暂无本人红黄牌记录"
              :image-size="70"
            />
          </template>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.scope-alert {
  margin-bottom: 16px;
}

.my-tabs {
  margin-top: 8px;
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

.score {
  margin: 0 8px;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-800);
  font-weight: 700;
}

.inline-alert {
  margin-top: 12px;
}

.card-kpis {
  display: flex;
  gap: 14px;
  margin-bottom: 16px;
}

.card-kpi {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 120px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--brand-50);
}

.card-kpi span {
  font-size: 11px;
  color: var(--ink-500);
}

.card-kpi strong {
  font-size: 24px;
}

.card-kpi--yellow strong {
  color: #b8850c;
}

.card-kpi--red strong {
  color: #c0392b;
}
</style>
