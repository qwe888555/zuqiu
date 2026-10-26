<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { FolderOpened, Refresh, Search } from '@element-plus/icons-vue'
import { teamApi } from '../../api'
import { selectionDossierApi, type CandidateDossier } from '../../api/selection'
import type { Team } from '../../api/types'
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

const loading = ref(false)
const searched = ref(false)
const rows = ref<DossierRow[]>([])
const teams = ref<Team[]>([])
const query = reactive({ athleteName: '', idNumber: '', teamId: '' })

const drawerVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<CandidateDossier | null>(null)
const detailTeams = computed(() => detail.value?.teams || [])
const detailMaterials = computed(() => detail.value?.materials || [])
const detailMatches = computed(() => detail.value?.matchRecords || [])
const primaryTeam = computed(() => detailTeams.value[0])

/** 详情与检索结果都按 CandidateDossier 聚合结构返回，这里拍平成表格行。 */
function toDossierRow(dossier: CandidateDossier): DossierRow {
  const athlete = dossier.athlete
  const team = dossier.teams?.[0]
  return {
    athleteId: dossier.id,
    realName: athlete.realName,
    maskedIdNumber: athlete.maskedIdNumber,
    gender: athlete.gender,
    birthDate: athlete.birthDate,
    schoolName: athlete.schoolName,
    teamId: team?.id,
    teamName: team?.name,
    reviewStatus: athlete.reviewStatus,
    materialCount: dossier.materials?.length || 0,
  }
}

async function loadTeams() {
  try {
    const res = await teamApi.list({ page: 1, pageSize: 200 })
    teams.value = res.items
  } catch {
    teams.value = []
  }
}

async function search() {
  if (!query.athleteName.trim() && !query.idNumber.trim() && !query.teamId) {
    searched.value = false
    rows.value = []
    return
  }
  if (query.idNumber && !/^\d{17}[\dXx]$/.test(query.idNumber.trim())) {
    return ElMessage.warning('身份证号需填写完整的 18 位')
  }
  loading.value = true
  searched.value = true
  try {
    const res = await selectionDossierApi.search({
      athleteName: query.athleteName.trim() || undefined,
      idNumber: query.idNumber.trim() || undefined,
      teamId: query.teamId || undefined,
    })
    rows.value = res.items.map(toDossierRow)
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function reset() {
  query.athleteName = ''
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
    detail.value = await selectionDossierApi.get(row.athleteId)
  } catch {
    drawerVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

onMounted(loadTeams)
</script>

<template>
  <div class="page">
    <PageHeader
      title="遴选档案"
      description="按姓名、完整证件号或球队检索运动员档案。档案聚合个人资料、履历材料与比赛经历。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="search">刷新</el-button>
      </template>
    </PageHeader>

    <section class="page-card search-card">
      <div class="search-grid">
        <el-input
          v-model="query.athleteName"
          placeholder="运动员姓名"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
        />
        <el-input
          v-model="query.idNumber"
          placeholder="完整身份证号"
          maxlength="18"
          clearable
          @keyup.enter="search"
        />
        <el-select v-model="query.teamId" placeholder="全部球队" clearable filterable>
          <el-option v-for="team in teams" :key="team.id" :label="team.name" :value="team.id" />
        </el-select>
        <el-button type="primary" :icon="Search" :loading="loading" @click="search">检索档案</el-button>
        <el-button @click="reset">重置</el-button>
      </div>
      <p class="search-hint">至少填写一项条件。证件号按完整 18 位做精确匹配，服务端不回显身份证号。</p>
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
            <span class="dossier-head__avatar">{{ detail.athlete.realName.slice(0, 1) }}</span>
            <div class="dossier-head__info">
              <span class="dossier-head__eyebrow">运动员档案</span>
              <h2>{{ detail.athlete.realName }}</h2>
              <p>
                {{ detail.athlete.maskedIdNumber || '证件号未登记' }} ·
                {{ primaryTeam?.name || '暂无球队' }} ·
                {{ detail.athlete.schoolName || '学校未登记' }}
              </p>
            </div>
            <StatusTag :status="detail.athlete.reviewStatus" kind="review" />
          </header>

          <section class="dossier-section">
            <h3>基础信息</h3>
            <div class="info-grid">
              <div><span>性别</span><strong>{{ detail.athlete.gender === 'FEMALE' ? '女' : detail.athlete.gender === 'MALE' ? '男' : '未说明' }}</strong></div>
              <div><span>出生日期</span><strong>{{ detail.athlete.birthDate || '—' }}</strong></div>
              <div><span>年龄</span><strong class="num">{{ detail.athlete.birthDate ? dayjs().diff(dayjs(detail.athlete.birthDate), 'year') : '—' }}</strong></div>
              <div><span>学籍号</span><strong>{{ detail.athlete.maskedStudentNumber || '—' }}</strong></div>
              <div><span>所属球队</span><strong>{{ primaryTeam?.name || '—' }}</strong></div>
              <div><span>市州</span><strong>{{ primaryTeam?.cityName || '—' }}</strong></div>
            </div>
          </section>

          <section class="dossier-section">
            <h3>履历材料 <small>{{ detailMaterials.length }} 份</small></h3>
            <div class="material-list">
              <div v-for="material in detailMaterials" :key="material.id" class="material-row">
                <span class="material-row__type">{{ material.materialLabel }}</span>
                <strong>{{ material.title }}</strong>
                <StatusTag :status="material.reviewStatus" kind="review" />
              </div>
              <el-empty v-if="!detailMaterials.length" description="暂无履历材料" :image-size="60" />
            </div>
          </section>

          <section class="dossier-section">
            <h3>比赛经历 <small>最近 {{ detailMatches.length }} 场</small></h3>
            <div class="match-list">
              <div v-for="match in detailMatches" :key="match.id" class="match-row">
                <span class="match-row__date">{{ match.kickoffAt ? dayjs(match.kickoffAt).format('MM-DD') : '—' }}</span>
                <span class="match-row__teams">
                  {{ match.homeTeamName }} <b class="num">{{ match.homeScore ?? 0 }} : {{ match.awayScore ?? 0 }}</b>
                  {{ match.awayTeamName }}
                </span>
                <StatusTag :status="match.status" kind="match" />
              </div>
              <el-empty v-if="!detailMatches.length" description="暂无比赛记录" :image-size="60" />
            </div>
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
  border-radius: var(--radius-md);
  background: var(--brand-50);
  color: var(--brand-700);
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
  background: var(--brand-700);
  color: #fff;
  font-size: 22px;
  font-weight: 700;
}

.dossier-head__info {
  flex: 1;
}

.dossier-head__eyebrow {
  font-size: 10.5px;
  font-weight: 600;
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
