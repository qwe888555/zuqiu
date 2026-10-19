<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { FolderOpened, Refresh, Search } from '@element-plus/icons-vue'
import { selectionApi, teamApi } from '../../api'
import type { Material, Match, Person, SelectionScore, Team } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'

interface DossierRow {
  athleteId: string
  realName: string
  maskedIdNumber?: string
  gender?: string
  birthDate?: string
  schoolName?: string
  teamId?: string
  teamName?: string
  reviewStatus?: string
  materialCount?: number
}

interface DossierDetail {
  person: Person
  team?: Team
  materials: Material[]
  matches: Match[]
  scores: SelectionScore[]
}

const loading = ref(false)
const searched = ref(false)
const rows = ref<DossierRow[]>([])
const teams = ref<Team[]>([])
const query = reactive({ keyword: '', idNumber: '', teamId: '' })

const drawerVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<DossierDetail | null>(null)

async function loadTeams() {
  try {
    const res = await teamApi.list({ page: 1, pageSize: 200 })
    teams.value = res.items
  } catch {
    teams.value = []
  }
}

async function search() {
  if (!query.keyword && !query.idNumber && !query.teamId) {
    searched.value = false
    rows.value = []
    return
  }
  loading.value = true
  searched.value = true
  try {
    const res = await selectionApi.dossiers({
      keyword: query.keyword || undefined,
      idNumber: query.idNumber || undefined,
      teamId: query.teamId || undefined,
    })
    rows.value = res as unknown as DossierRow[]
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function reset() {
  query.keyword = ''
  query.idNumber = ''
  query.teamId = ''
  rows.value = []
  searched.value = false
}

async function openDossier(row: DossierRow) {
  drawerVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const res = await selectionApi.dossier(row.athleteId)
    detail.value = res as unknown as DossierDetail
  } catch {
    drawerVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

function scoreTotal(score: SelectionScore) {
  if (typeof score.totalScore === 'number') return score.totalScore
  return score.dimensionScores.reduce((sum, item) => sum + item.value, 0)
}

onMounted(loadTeams)
</script>

<template>
  <div class="page">
    <PageHeader
      title="遴选档案"
      eyebrow="SELECTION DOSSIERS"
      description="按姓名、证件号后四位或球队检索运动员档案。档案聚合个人资料、履历材料、比赛经历与历史评分。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="search">刷新</el-button>
      </template>
    </PageHeader>

    <section class="page-card search-card">
      <div class="search-grid">
        <el-input
          v-model="query.keyword"
          placeholder="运动员姓名"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
        />
        <el-input
          v-model="query.idNumber"
          placeholder="证件号后四位"
          maxlength="4"
          clearable
          @keyup.enter="search"
        />
        <el-select v-model="query.teamId" placeholder="全部球队" clearable filterable>
          <el-option v-for="team in teams" :key="team.id" :label="team.name" :value="team.id" />
        </el-select>
        <el-button type="primary" :icon="Search" :loading="loading" @click="search">检索档案</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
      <p class="search-hint">至少填写一项条件。证件号仅支持后四位模糊匹配，避免敏感信息泄露。</p>
    </section>

    <section v-if="searched" class="page-card">
      <div class="section-title">检索结果 <small>{{ rows.length }} 份档案</small></div>
      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="运动员" min-width="200">
          <template #default="{ row }">
            <div class="person-cell">
              <span class="person-cell__avatar">{{ row.realName.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.realName }}</strong>
                <small>{{ row.maskedIdNumber || '证件号未登记' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="teamName" label="所属球队" min-width="180">
          <template #default="{ row }">{{ row.teamName || '—' }}</template>
        </el-table-column>
        <el-table-column prop="schoolName" label="学校" min-width="180" />
        <el-table-column label="年龄" width="80" align="center">
          <template #default="{ row }">
            <span class="num">{{ row.birthDate ? dayjs().diff(dayjs(row.birthDate), 'year') : '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="材料" width="80" align="center">
          <template #default="{ row }"><span class="num">{{ row.materialCount || 0 }}</span></template>
        </el-table-column>
        <el-table-column label="档案状态" width="110">
          <template #default="{ row }"><StatusTag :status="row.reviewStatus" kind="review" /></template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="FolderOpened" @click="openDossier(row)">查看档案</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" description="未检索到符合条件的运动员档案" :image-size="80" />
    </section>

    <section v-else class="page-card empty-state">
      <div class="empty-state__icon"><el-icon :size="30"><FolderOpened /></el-icon></div>
      <h3>检索运动员档案</h3>
      <p>输入姓名、证件号后四位或选择球队，即可查看聚合档案与遴选评分记录。</p>
    </section>

    <el-drawer v-model="drawerVisible" size="720px" :with-header="false">
      <div v-loading="detailLoading" class="dossier">
        <template v-if="detail">
          <header class="dossier-head">
            <span class="dossier-head__avatar">{{ detail.person.realName.slice(0, 1) }}</span>
            <div class="dossier-head__info">
              <span class="dossier-head__eyebrow">ATHLETE DOSSIER</span>
              <h2>{{ detail.person.realName }}</h2>
              <p>
                {{ detail.person.maskedIdNumber || '证件号未登记' }} ·
                {{ detail.team?.name || '暂无球队' }} ·
                {{ detail.person.schoolName || '学校未登记' }}
              </p>
            </div>
            <StatusTag :status="detail.person.reviewStatus" kind="review" />
          </header>

          <section class="dossier-section">
            <h3>基础信息</h3>
            <div class="info-grid">
              <div><span>性别</span><strong>{{ detail.person.gender === 'FEMALE' ? '女' : detail.person.gender === 'MALE' ? '男' : '未说明' }}</strong></div>
              <div><span>出生日期</span><strong>{{ detail.person.birthDate || '—' }}</strong></div>
              <div><span>年龄</span><strong class="num">{{ detail.person.birthDate ? dayjs().diff(dayjs(detail.person.birthDate), 'year') : '—' }}</strong></div>
              <div><span>学籍号</span><strong>{{ detail.person.maskedStudentNumber || '—' }}</strong></div>
              <div><span>所属球队</span><strong>{{ detail.team?.name || '—' }}</strong></div>
              <div><span>市州</span><strong>{{ detail.team?.cityName || '—' }}</strong></div>
            </div>
          </section>

          <section class="dossier-section">
            <h3>履历材料 <small>{{ detail.materials.length }} 份</small></h3>
            <div class="material-list">
              <div v-for="material in detail.materials" :key="material.id" class="material-row">
                <span class="material-row__type">{{ material.materialLabel }}</span>
                <strong>{{ material.title }}</strong>
                <StatusTag :status="material.reviewStatus" kind="review" />
              </div>
              <el-empty v-if="!detail.materials.length" description="暂无履历材料" :image-size="60" />
            </div>
          </section>

          <section class="dossier-section">
            <h3>比赛经历 <small>最近 {{ detail.matches.length }} 场</small></h3>
            <div class="match-list">
              <div v-for="match in detail.matches" :key="match.id" class="match-row">
                <span class="match-row__date">{{ dayjs(match.kickoffAt).format('MM-DD') }}</span>
                <span class="match-row__teams">
                  {{ match.homeTeamName }} <b class="num">{{ match.homeScore ?? 0 }} : {{ match.awayScore ?? 0 }}</b>
                  {{ match.awayTeamName }}
                </span>
                <StatusTag :status="match.status" kind="match" />
              </div>
              <el-empty v-if="!detail.matches.length" description="暂无比赛记录" :image-size="60" />
            </div>
          </section>

          <section class="dossier-section">
            <h3>遴选评分记录</h3>
            <el-table :data="detail.scores" size="small">
              <el-table-column label="轮次" width="90">
                <template #default="{ row }">{{ row.round === 'PRELIMINARY' ? '初选' : '终选' }}</template>
              </el-table-column>
              <el-table-column label="各维度得分" min-width="260">
                <template #default="{ row }">
                  <span v-for="dim in row.dimensionScores" :key="dim.key" class="dim-chip">
                    {{ dim.label || dim.key }} {{ dim.value }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="总分" width="80" align="center">
                <template #default="{ row }"><strong class="num">{{ scoreTotal(row) }}</strong></template>
              </el-table-column>
              <el-table-column prop="operatorName" label="录入人" width="100" />
            </el-table>
            <el-empty v-if="!detail.scores.length" description="暂无评分记录" :image-size="60" />
          </section>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.search-card {
  padding: 20px;
}

.search-grid {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1.2fr auto auto;
  gap: 10px;
  align-items: center;
}

.search-hint {
  margin-top: 10px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.person-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.person-cell__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.person-cell strong {
  display: block;
  font-size: 12.5px;
}

.person-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-state__icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--brand-50);
  color: var(--brand-600);
}

.empty-state h3 {
  margin-top: 16px;
  font-size: 15px;
}

.empty-state p {
  margin-top: 6px;
  font-size: 11px;
  color: var(--ink-500);
}

.dossier-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.dossier-head__avatar {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  border-radius: 50%;
  background: linear-gradient(145deg, var(--brand-700), var(--brand-900));
  color: var(--lime);
  font-size: 22px;
  font-weight: 700;
}

.dossier-head__info {
  flex: 1;
}

.dossier-head__eyebrow {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--brand-600);
}

.dossier-head h2 {
  margin-top: 4px;
  font-size: 21px;
}

.dossier-head p {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.dossier-section {
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}

.dossier-section h3 {
  margin-bottom: 12px;
  font-size: 13.5px;
}

.dossier-section h3 small {
  margin-left: 5px;
  font-size: 10px;
  font-weight: 400;
  color: var(--ink-300);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}

.info-grid > div {
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--paper);
}

.info-grid span {
  display: block;
  font-size: 9.5px;
  color: var(--ink-300);
}

.info-grid strong {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 500;
}

.material-list,
.match-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.material-row,
.match-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
}

.material-row__type {
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9px;
  flex-shrink: 0;
}

.material-row strong {
  flex: 1;
  font-size: 11.5px;
  font-weight: 500;
}

.match-row__date {
  width: 46px;
  font-size: 10px;
  color: var(--ink-300);
}

.match-row__teams {
  flex: 1;
  font-size: 11px;
}

.match-row__teams b {
  margin: 0 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--paper);
  font-size: 11px;
}

.dim-chip {
  display: inline-block;
  margin: 2px 5px 2px 0;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--paper);
  font-size: 9.5px;
  color: var(--ink-500);
}

@media (max-width: 900px) {
  .search-grid {
    grid-template-columns: 1fr 1fr;
  }

  .info-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .search-grid {
    grid-template-columns: 1fr;
  }
}
</style>
