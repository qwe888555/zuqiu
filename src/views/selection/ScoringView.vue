﻿﻿﻿<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { eventApi } from '../../api'
import {
  GROUP_TYPE_LABEL,
  ROUND_LABEL,
  selectionDossierApi,
  selectionScoreApi,
  selectionTemplateApi,
  type CandidateDossier,
} from '../../api/selection'
import type {
  Event,
  SelectionGroupType,
  SelectionRound,
  SelectionScoreRecord,
  SelectionTemplate,
} from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'

interface DossierRow {
  athleteId: string
  realName: string
  teamName?: string
  groupName?: string
  schoolName?: string
}

const loading = ref(false)
const events = ref<Event[]>([])
const eventId = ref('')
const groupType = ref<SelectionGroupType>('PRIMARY')
const round = ref<SelectionRound>('INITIAL')
const template = ref<SelectionTemplate | null>(null)
const scores = ref<SelectionScoreRecord[]>([])
const total = ref(0)
const keyword = ref('')

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const searchKeyword = ref('')
const searching = ref(false)
const candidates = ref<DossierRow[]>([])
const selectedAthlete = ref<DossierRow | null>(null)
const values = reactive<Record<string, number>>({})

const groupTypeOptions = Object.entries(GROUP_TYPE_LABEL) as Array<[SelectionGroupType, string]>
const roundOptions = Object.entries(ROUND_LABEL) as Array<[SelectionRound, string]>

const avgScore = computed(() => {
  if (!scores.value.length) return 0
  const list = scores.value.map((score) => score.totalScore)
  return Math.round((list.reduce((sum, value) => sum + value, 0) / list.length) * 10) / 10
})

const canEntry = computed(() => !!template.value && !!eventId.value)

async function loadEvents() {
  try {
    const res = await eventApi.list({ page: 1, pageSize: 50 })
    events.value = res.items
    if (!eventId.value) eventId.value = events.value[0]?.id || ''
  } catch {
    events.value = []
  }
}

async function loadTemplate() {
  template.value = null
  try {
    const res = await selectionTemplateApi.list({ groupType: groupType.value, round: round.value, status: 1, page: 1, size: 1 })
    template.value = res.items[0] || null
  } catch {
    template.value = null
  }
}

async function loadScores() {
  if (!eventId.value) {
    scores.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const res = await selectionScoreApi.list({
      eventId: eventId.value,
      groupType: groupType.value,
      round: round.value,
      keyword: keyword.value || undefined,
      page: 1,
      size: 100,
    })
    scores.value = res.items
    total.value = res.total
  } catch {
    scores.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function changeContext() {
  keyword.value = ''
  await loadTemplate()
  await loadScores()
}

function search() {
  loadScores()
}

function resetValues() {
  Object.keys(values).forEach((key) => delete values[key])
  template.value?.dimensions.forEach((dim) => {
    values[dim.code] = 0
  })
}

async function openCreate() {
  if (!eventId.value) return ElMessage.warning('请先选择赛事')
  if (!template.value) return ElMessage.warning('当前组别与轮次尚未启用评分模板')
  editingId.value = null
  selectedAthlete.value = null
  searchKeyword.value = ''
  candidates.value = []
  resetValues()
  dialogVisible.value = true
}

function openEdit(score: SelectionScoreRecord) {
  editingId.value = score.id
  candidates.value = []
  searchKeyword.value = ''
  selectedAthlete.value = {
    athleteId: score.candidateId,
    realName: score.candidateName,
    teamName: score.teamName,
    groupName: score.groupTypeLabel,
  }
  Object.keys(values).forEach((key) => delete values[key])
  score.items.forEach((item) => {
    values[item.code] = item.score
  })
  dialogVisible.value = true
}

function toCandidate(dossier: CandidateDossier): DossierRow {
  return {
    athleteId: dossier.id,
    realName: dossier.athlete.realName,
    teamName: dossier.teams?.[0]?.name,
    schoolName: dossier.athlete.schoolName,
  }
}

async function searchAthletes() {
  if (!searchKeyword.value.trim()) return
  searching.value = true
  try {
    const res = await selectionDossierApi.search({ athleteName: searchKeyword.value.trim() })
    candidates.value = res.items.map(toCandidate)
  } catch {
    candidates.value = []
  } finally {
    searching.value = false
  }
}

function chooseAthlete(row: DossierRow) {
  selectedAthlete.value = row
  candidates.value = []
}

async function save() {
  if (!template.value || !eventId.value) return
  if (!selectedAthlete.value) return ElMessage.warning('请选择运动员')
  if (template.value.dimensions.some((dim) => values[dim.code] == null)) return ElMessage.warning('请填写全部维度得分')
  saving.value = true
  try {
    const scoresPayload = template.value.dimensions.map((dim) => ({
      dimensionCode: dim.code,
      score: Number(values[dim.code]) || 0,
    }))
    if (editingId.value) {
      await selectionScoreApi.update(editingId.value, scoresPayload)
      ElMessage.success('评分已更新，已生成的遴选结果将标记为待重算')
    } else {
      await selectionScoreApi.create({
        eventId: eventId.value,
        groupType: groupType.value,
        round: round.value,
        templateId: template.value.id,
        candidateId: selectedAthlete.value.athleteId,
        scores: scoresPayload,
      })
      ElMessage.success('评分已录入')
    }
    dialogVisible.value = false
    await loadScores()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadEvents()
  await loadTemplate()
  await loadScores()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="评分录入"
      description="按赛事、组别与轮次录入运动员各维度得分。系统按权重自动折算百分制总分，修改后已有遴选结果将标记为待重算。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="loadScores">刷新</el-button>
        <el-button type="primary" :icon="Plus" :disabled="!canEntry" @click="openCreate">录入评分</el-button>
      </template>
    </PageHeader>

    <section class="page-card filter-card">
      <div class="filter-row">
        <el-select v-model="eventId" placeholder="选择赛事" style="width: 260px" @change="changeContext">
          <el-option v-for="event in events" :key="event.id" :label="event.name" :value="event.id" />
        </el-select>
        <el-select v-model="groupType" style="width: 130px" @change="changeContext">
          <el-option v-for="[value, label] in groupTypeOptions" :key="value" :label="label" :value="value" />
        </el-select>
        <el-radio-group v-model="round" @change="changeContext">
          <el-radio-button v-for="[value, label] in roundOptions" :key="value" :value="value">{{ label }}</el-radio-button>
        </el-radio-group>
        <el-input
          v-model="keyword"
          placeholder="搜索运动员姓名"
          :prefix-icon="Search"
          clearable
          style="width: 200px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" plain @click="search">查询</el-button>
        <span class="filter-spacer" />
        <span class="muted">平均总分 <strong class="num avg">{{ avgScore }}</strong></span>
      </div>

      <div v-if="template" class="rule-strip">
        <span class="rule-strip__name">{{ template.name }}</span>
        <span v-for="dim in template.dimensions" :key="dim.code" class="rule-strip__dim">
          {{ dim.name }}
          <b>{{ dim.weight }}%</b>
          <small>/ {{ dim.maxScore }} 分</small>
        </span>
      </div>
      <div v-else class="rule-strip is-empty">
        当前「{{ GROUP_TYPE_LABEL[groupType] }} · {{ ROUND_LABEL[round] }}」尚未启用评分模板，请先在「评分模板」中创建。
      </div>
    </section>

    <section class="page-card">
      <div class="section-title">评分记录 <small>共 {{ total }} 条</small></div>
      <el-table v-loading="loading" :data="scores" style="width: 100%">
        <el-table-column label="运动员" min-width="180">
          <template #default="{ row }">
            <div class="athlete-cell">
              <span class="athlete-cell__avatar">{{ row.candidateName.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.candidateName }}</strong>
                <small>{{ row.teamName || '—' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="维度得分" min-width="320">
          <template #default="{ row }">
            <div class="score-chips">
              <span v-for="dim in row.items" :key="dim.code" class="score-chip">
                {{ dim.name || dim.code }}
                <b class="num">{{ dim.score }}</b>
                <small>/ {{ dim.maxScore }}</small>
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="总分" width="100" align="center">
          <template #default="{ row }">
            <span class="total-score num">{{ row.totalScore }}</span>
          </template>
        </el-table-column>
        <el-table-column label="版本" width="90" align="center">
          <template #default="{ row }"><span class="muted">第 {{ row.version }} 版</span></template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">修改</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !scores.length" description="当前赛事下暂无评分记录" :image-size="80" />
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId ? '修改评分' : '录入评分'" width="680px">
      <el-form label-position="top">
        <el-form-item label="运动员">
          <div v-if="editingId || selectedAthlete" class="selected-athlete">
            <span class="selected-athlete__avatar">{{ selectedAthlete?.realName.slice(0, 1) }}</span>
            <div>
              <strong>{{ selectedAthlete?.realName }}</strong>
              <small>{{ selectedAthlete?.teamName || '球队未登记' }}</small>
            </div>
            <el-button v-if="!editingId" link type="primary" @click="selectedAthlete = null">重新选择</el-button>
          </div>
          <template v-else>
            <div class="search-row">
              <el-input
                v-model="searchKeyword"
                placeholder="输入运动员姓名后搜索"
                :prefix-icon="Search"
                @keyup.enter="searchAthletes"
              />
              <el-button :loading="searching" @click="searchAthletes">搜索</el-button>
            </div>
            <div v-if="candidates.length" class="candidate-list">
              <button
                v-for="person in candidates"
                :key="person.athleteId"
                type="button"
                class="candidate"
                @click="chooseAthlete(person)"
              >
                <span class="candidate__avatar">{{ person.realName.slice(0, 1) }}</span>
                <span class="candidate__info">
                  <strong>{{ person.realName }}</strong>
                  <small>{{ person.teamName || '球队未登记' }} · {{ person.schoolName || '学校未登记' }}</small>
                </span>
              </button>
            </div>
          </template>
        </el-form-item>

        <div class="dim-grid">
          <div v-for="dim in template?.dimensions || []" :key="dim.code" class="dim-field">
            <div class="dim-field__head">
              <span>{{ dim.name }}</span>
              <small>满分 {{ dim.maxScore }} · 权重 {{ dim.weight }}%</small>
            </div>
            <el-input-number v-model="values[dim.code]" :min="0" :max="dim.maxScore" style="width: 100%" />
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          {{ editingId ? '保存修改' : '提交评分' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filter-card {
  padding: 16px 20px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-spacer {
  flex: 1;
}

.avg {
  margin-left: 4px;
  font-size: 16px;
  color: var(--brand-800);
}

.muted {
  font-size: 10px;
  color: var(--ink-300);
}

.rule-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
}

.rule-strip.is-empty {
  font-size: 10.5px;
  color: #c08a3e;
}

.rule-strip__name {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-800);
}

.rule-strip__dim {
  padding: 4px 9px;
  border-radius: 6px;
  background: var(--paper);
  font-size: 9.5px;
  color: var(--ink-500);
}

.rule-strip__dim b {
  margin-left: 3px;
  color: var(--brand-700);
}

.rule-strip__dim small {
  color: var(--ink-300);
}

.athlete-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}

.athlete-cell__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 11px;
  font-weight: 700;
}

.athlete-cell strong {
  display: block;
  font-size: 12px;
}

.athlete-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.score-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.score-chip {
  padding: 3px 8px;
  border-radius: 5px;
  background: var(--paper);
  font-size: 9.5px;
  color: var(--ink-500);
}

.score-chip b {
  margin-left: 4px;
  color: var(--brand-800);
}

.score-chip small {
  color: var(--ink-300);
}

.total-score {
  font-size: 16px;
  font-weight: 700;
  color: var(--brand-800);
}

.selected-athlete {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--brand-100);
  border-radius: 10px;
  background: var(--brand-50);
}

.selected-athlete__avatar,
.candidate__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-700);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.selected-athlete div {
  flex: 1;
}

.selected-athlete strong {
  display: block;
  font-size: 12px;
}

.selected-athlete small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-500);
}

.search-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.search-row .el-input {
  flex: 1;
}

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  max-height: 190px;
  overflow-y: auto;
  margin-top: 8px;
}

.candidate {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.candidate:hover {
  border-color: var(--brand-500);
}

.candidate__info strong {
  display: block;
  font-size: 11.5px;
}

.candidate__info small {
  display: block;
  margin-top: 1px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.dim-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.dim-field {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.dim-field__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.dim-field__head span {
  font-size: 12px;
  font-weight: 600;
}

.dim-field__head small {
  font-size: 9px;
  color: var(--ink-300);
}

@media (max-width: 640px) {
  .dim-grid {
    grid-template-columns: 1fr;
  }
}
</style>
