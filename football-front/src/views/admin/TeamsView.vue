<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { OfficeBuilding, Refresh, Search, Trophy, User, View } from '@element-plus/icons-vue'
import { orgApi, teamApi } from '../../api'
import type { GroupCategory, Match, Organization, Team, TeamCoach, TeamMember } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const router = useRouter()

const categoryLabels: Record<GroupCategory, string> = {
  PRIMARY: '小学组',
  MIDDLE: '初中组',
  UNIVERSITY: '大学组',
}

const rows = ref<Team[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(12)
const loading = ref(false)
const cities = ref<Organization[]>([])
const filters = reactive({ cityOrgId: '', category: '' as '' | GroupCategory, keyword: '' })

const drawerVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<Team | null>(null)
const members = ref<TeamMember[]>([])
const coaches = ref<TeamCoach[]>([])
const recentMatches = ref<Match[]>([])
const activeTab = ref('roster')

const citiesCovered = computed(
  () => new Set(rows.value.map((team) => team.cityName).filter(Boolean)).size,
)
const playerCount = computed(() =>
  rows.value.reduce((sum, team) => sum + (team.memberCount || 0), 0),
)
const approvedCount = computed(() => rows.value.filter((team) => team.status === 'APPROVED').length)

async function loadCities() {
  try {
    const res = await orgApi.list({ page: 1, pageSize: 100, orgType: 'CITY' })
    cities.value = res.items
  } catch {
    cities.value = []
  }
}

async function load() {
  loading.value = true
  try {
    const res = await teamApi.list({
      page: page.value,
      pageSize: pageSize.value,
      cityOrgId: filters.cityOrgId || undefined,
      category: filters.category || undefined,
      keyword: filters.keyword.trim() || undefined,
    })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function resetFilters() {
  filters.cityOrgId = ''
  filters.category = ''
  filters.keyword = ''
  page.value = 1
  load()
}

function changePage(value: number) {
  page.value = value
  load()
}

function categoryLabel(category?: GroupCategory) {
  return category ? categoryLabels[category] : '—'
}

function formatDate(value?: string) {
  return value ? dayjs(value).format('YYYY-MM-DD') : '—'
}

function matchScore(match: Match) {
  if (match.homeScore === undefined || match.awayScore === undefined) return 'VS'
  return `${match.homeScore} : ${match.awayScore}`
}

async function openDetail(team: Team) {
  drawerVisible.value = true
  activeTab.value = 'roster'
  detailLoading.value = true
  detail.value = team
  members.value = []
  coaches.value = []
  recentMatches.value = []
  try {
    const [teamDetail, memberRes, coachRes, matchRes] = await Promise.all([
      teamApi.get(team.id),
      teamApi.members(team.id, { page: 1, pageSize: 100 }),
      teamApi.coaches(team.id, { page: 1, pageSize: 100 }),
      teamApi.matches(team.id, { page: 1, pageSize: 6 }),
    ])
    detail.value = teamDetail
    members.value = memberRes.items
    coaches.value = coachRes.items
    recentMatches.value = matchRes.items
  } catch {
    // 拦截器提示
  } finally {
    detailLoading.value = false
  }
}

function goMatches() {
  drawerVisible.value = false
  router.push('/console/matches')
}

onMounted(async () => {
  await Promise.all([loadCities(), load()])
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="参赛队伍"
      eyebrow="TOURNAMENT TEAMS"
      description="管理员跨市州查看全省参赛队伍，按市州与组别筛选，进入球队可查看球员、教练与近期赛程。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Trophy" @click="goMatches">前往赛事编排</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="参赛队伍" :value="total" hint="全省已建档球队" :icon="Trophy" tone="green" />
      <StatCard label="覆盖市州" :value="citiesCovered" hint="当前页统计" :icon="OfficeBuilding" tone="blue" />
      <StatCard label="在册球员" :value="playerCount" hint="当前页球员合计" :icon="User" tone="lime" />
      <StatCard label="已认证" :value="approvedCount" hint="当前页已通过队伍" :icon="User" tone="amber" />
    </div>

    <div class="filter-bar">
      <el-select
        v-model="filters.cityOrgId"
        placeholder="全部市州"
        clearable
        style="width: 170px"
        @change="search"
      >
        <el-option v-for="city in cities" :key="city.id" :label="city.name" :value="city.id" />
      </el-select>
      <el-select
        v-model="filters.category"
        placeholder="全部组别"
        clearable
        style="width: 150px"
        @change="search"
      >
        <el-option label="小学组" value="PRIMARY" />
        <el-option label="初中组" value="MIDDLE" />
        <el-option label="大学组" value="UNIVERSITY" />
      </el-select>
      <el-input
        v-model="filters.keyword"
        placeholder="搜索球队或学校名称"
        clearable
        style="width: 260px"
        :prefix-icon="Search"
        @keyup.enter="search"
        @clear="search"
      />
      <el-button type="primary" :icon="Search" @click="search">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </div>

    <section class="page-card table-card">
      <el-table v-loading="loading" :data="rows" row-key="id" style="width: 100%">
        <el-table-column label="球队" min-width="260">
          <template #default="{ row }">
            <div class="team-cell">
              <span class="team-mark">{{ row.name.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.name }}</strong>
                <small>{{ row.schoolName || row.shortName || '—' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="cityName" label="市州" width="110" />
        <el-table-column label="组别" width="100">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" round>{{ categoryLabel(row.category) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="coachName" label="主教练" width="110">
          <template #default="{ row }">{{ row.coachName || '—' }}</template>
        </el-table-column>
        <el-table-column label="球员" width="80" align="center">
          <template #default="{ row }">{{ row.memberCount ?? 0 }} 人</template>
        </el-table-column>
        <el-table-column label="认证状态" width="110">
          <template #default="{ row }">
            <StatusTag :status="row.status" kind="review" />
          </template>
        </el-table-column>
        <el-table-column label="建档日期" width="120">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="View" @click="openDetail(row)">查看</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-state">
            <el-icon :size="26"><Trophy /></el-icon>
            <p>当前筛选条件下没有参赛队伍</p>
          </div>
        </template>
      </el-table>

      <div class="pagination-row">
        <span class="pagination-hint">共 {{ total }} 支队伍</span>
        <el-pagination
          background
          layout="prev, pager, next"
          :current-page="page"
          :page-size="pageSize"
          :total="total"
          @current-change="changePage"
        />
      </div>
    </section>

    <el-drawer v-model="drawerVisible" size="720px" :with-header="false">
      <div v-loading="detailLoading" class="team-drawer">
        <header class="drawer-head">
          <span class="drawer-mark">{{ detail?.name?.slice(0, 1) || '球' }}</span>
          <div class="drawer-title">
            <span class="eyebrow">TEAM PROFILE</span>
            <h2>{{ detail?.name || '球队详情' }}</h2>
            <p>
              {{ detail?.cityName || '—' }} · {{ categoryLabel(detail?.category) }} ·
              {{ detail?.schoolName || '—' }}
            </p>
          </div>
          <StatusTag :status="detail?.status" kind="review" size="large" />
        </header>

        <div class="drawer-stats">
          <div><span>主教练</span><strong>{{ detail?.coachName || '—' }}</strong></div>
          <div><span>在册球员</span><strong>{{ members.length }} 人</strong></div>
          <div><span>教练团队</span><strong>{{ coaches.length }} 人</strong></div>
          <div><span>建档日期</span><strong>{{ formatDate(detail?.createdAt) }}</strong></div>
        </div>

        <p v-if="detail?.intro" class="team-intro">{{ detail.intro }}</p>

        <el-tabs v-model="activeTab">
          <el-tab-pane label="球员名单" name="roster">
            <el-table :data="members" size="small" max-height="340">
              <el-table-column label="#" width="54" align="center">
                <template #default="{ row }">
                  <span class="jersey">{{ row.jerseyNumber ?? '—' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="athleteName" label="姓名" min-width="110" />
              <el-table-column prop="position" label="位置" width="80">
                <template #default="{ row }">{{ row.position || '—' }}</template>
              </el-table-column>
              <el-table-column prop="maskedIdNumber" label="证件号" min-width="130">
                <template #default="{ row }">{{ row.maskedIdNumber || '—' }}</template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <StatusTag :status="row.status" kind="review" />
                </template>
              </el-table-column>
              <template #empty><div class="drawer-empty">暂无球员</div></template>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="教练团队" name="coaches">
            <el-table :data="coaches" size="small" max-height="340">
              <el-table-column prop="coachName" label="姓名" min-width="110" />
              <el-table-column prop="coachCategory" label="职务" width="110">
                <template #default="{ row }">{{ row.coachCategory || '教练员' }}</template>
              </el-table-column>
              <el-table-column prop="maskedPhone" label="联系电话" min-width="130">
                <template #default="{ row }">{{ row.maskedPhone || '—' }}</template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <StatusTag :status="row.status" kind="review" />
                </template>
              </el-table-column>
              <template #empty><div class="drawer-empty">暂无教练</div></template>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="近期赛程" name="matches">
            <div v-if="recentMatches.length" class="match-list">
              <div v-for="match in recentMatches" :key="match.id" class="match-row">
                <div class="match-date">
                  <strong>{{ dayjs(match.kickoffAt).format('MM-DD') }}</strong>
                  <small>{{ dayjs(match.kickoffAt).format('HH:mm') }}</small>
                </div>
                <div class="match-teams">
                  <span>{{ match.homeTeamName }}</span>
                  <strong>{{ matchScore(match) }}</strong>
                  <span>{{ match.awayTeamName }}</span>
                </div>
                <StatusTag :status="match.status" kind="match" />
              </div>
            </div>
            <div v-else class="drawer-empty">暂无比赛安排</div>
          </el-tab-pane>
        </el-tabs>

        <div class="drawer-actions">
          <el-button @click="drawerVisible = false">关闭</el-button>
          <el-button type="primary" :icon="Trophy" @click="goMatches">查看全部赛程</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.table-card {
  padding: 6px 18px 14px;
}

.team-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.team-mark,
.drawer-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--brand-700), var(--brand-500));
  color: var(--lime);
  font-size: 13px;
  font-weight: 700;
}

.team-cell strong {
  display: block;
  font-size: 12px;
}

.team-cell small {
  display: block;
  margin-top: 1px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.pagination-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 4px 2px;
}

.pagination-hint {
  font-size: 10.5px;
  color: var(--ink-300);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 34px 0;
  color: var(--ink-300);
  font-size: 11px;
}

.team-drawer {
  min-height: 300px;
}

.drawer-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.drawer-mark {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  font-size: 20px;
}

.drawer-title {
  flex: 1;
  min-width: 0;
}

.eyebrow {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--brand-600);
}

.drawer-title h2 {
  margin-top: 3px;
  font-size: 20px;
}

.drawer-title p {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.drawer-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.drawer-stats > div {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--paper);
}

.drawer-stats span {
  display: block;
  font-size: 9px;
  color: var(--ink-300);
}

.drawer-stats strong {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 600;
}

.team-intro {
  margin-top: 14px;
  padding: 11px 13px;
  border-left: 3px solid var(--brand-500);
  border-radius: 0 9px 9px 0;
  background: var(--brand-50);
  font-size: 10.5px;
  line-height: 1.8;
  color: var(--ink-500);
}

.jersey {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 22px;
  padding: 0 5px;
  border-radius: 6px;
  background: var(--paper);
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  color: var(--brand-700);
}

.drawer-empty {
  padding: 26px 0;
  text-align: center;
  font-size: 10.5px;
  color: var(--ink-300);
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.match-date {
  width: 46px;
  flex-shrink: 0;
  text-align: center;
}

.match-date strong {
  display: block;
  font-family: var(--font-display);
  font-size: 12px;
}

.match-date small {
  font-size: 9px;
  color: var(--ink-300);
}

.match-teams {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
}

.match-teams span:last-child {
  text-align: right;
}

.match-teams strong {
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--paper);
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--brand-700);
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed var(--line);
}

@media (max-width: 720px) {
  .drawer-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
