<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { selectionApi } from '../../api'
import type { SelectionRule, SelectionScore } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'

interface DossierRow {
  athleteId: string
  realName: string
  teamName?: string
  groupName?: string
  schoolName?: string
}

const loading = ref(false)
const rules = ref<SelectionRule[]>([])
const ruleId = ref('')
const scores = ref<SelectionScore[]>([])
const total = ref(0)
const keyword = ref('')

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const searchKeyword = ref('')
const searching = ref(false)
const candidates = ref<DossierRow[]>([])
const selectedAthlete = ref<DossierRow | null>(null)
const remark = ref('')
const values = reactive<Record<string, number>>({})

const currentRule = computed(() => rules.value.find((rule) => rule.id === ruleId.value))
const confirmedRules = computed(() => rules.value.filter((rule) => rule.confirmed))
const avgScore = computed(() => {
  if (!scores.value.length) return 0
  const list = scores.value.map((score) => score.totalScore ?? sumDimensions(score))
  return Math.round((list.reduce((sum, value) => sum + value, 0) / list.length) * 10) / 10
})

function sumDimensions(score: SelectionScore) {
  return score.dimensionScores.reduce((sum, item) => sum + (Number(item.value) || 0), 0)
}

async function loadRules() {
  try {
    const res = await selectionApi.rules({ page: 1, pageSize: 100 })
    rules.value = res.items
    if (!ruleId.value) {
      ruleId.value = confirmedRules.value[0]?.id || rules.value[0]?.id || ''
    }
  } catch {
    rules.value = []
  }
}

async function loadScores() {
  if (!ruleId.value) {
    scores.value = []
    return
  }
  loading.value = true
  try {
    const res = await selectionApi.scores({
      page: 1,
      pageSize: 100,
      ruleId: ruleId.value,
      keyword: keyword.value || undefined,
    })
    scores.value = res.items
    total.value = res.total
  } catch {
    scores.value = []
  } finally {
    loading.value = false
  }
}

async function changeRule() {
  keyword.value = ''
  await loadScores()
}

function search() {
  loadScores()
}

async function openCreate() {
  if (!currentRule.value) return ElMessage.warning('请先选择评分规则')
  if (!currentRule.value.confirmed) return ElMessage.warning('该规则尚未确认，无法录入评分')
  editingId.value = null
  selectedAthlete.value = null
  searchKeyword.value = ''
  candidates.value = []
  remark.value = ''
  currentRule.value.dimensions.forEach((dim) => {
    values[dim.key] = 0
  })
  dialogVisible.value = true
}

function openEdit(score: SelectionScore) {
  if (!currentRule.value) return
  editingId.value = score.id
  candidates.value = []
  searchKeyword.value = ''
  selectedAthlete.value = {
    athleteId: score.athleteId,
    realName: score.athleteName,
    teamName: score.teamName,
  }
  remark.value = score.remark || ''
  currentRule.value.dimensions.forEach((dim) => {
    values[dim.key] = score.dimensionScores.find((item) => item.key === dim.key)?.value || 0
  })
  dialogVisible.value = true
}

async function searchAthletes() {
  if (!searchKeyword.value.trim()) return
  searching.value = true
  try {
    const res = await selectionApi.dossiers({ keyword: searchKeyword.value.trim() })
    candidates.value = res as unknown as DossierRow[]
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
  if (!currentRule.value) return
  if (!selectedAthlete.value) return ElMessage.warning('请选择运动员')
  if (!currentRule.value.confirmed) return ElMessage.warning('规则未确认')
  saving.value = true
  try {
    const dimensionScores = currentRule.value.dimensions.map((dim) => ({
      key: dim.key,
      label: dim.label,
      value: Number(values[dim.key]) || 0,
      maxScore: dim.maxScore,
    }))
    if (editingId.value) {
      await selectionApi.updateScore(editingId.value, { dimensionScores, remark: remark.value })
      ElMessage.success('评分已更新')
    } else {
      await selectionApi.createScore({
        ruleId: currentRule.value.id,
        athleteId: selectedAthlete.value.athleteId,
        dimensionScores,
        remark: remark.value,
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
  await loadRules()
  await loadScores()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="评分录入"
      description="按已确认的评分规则录入运动员各维度得分。系统按权重自动折算百分制总分，支持后续修正与留痕。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="loadScores">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">录入评分</el-button>
      </template>
    </PageHeader>

    <section class="page-card filter-card">
      <div class="filter-row">
        <el-select v-model="ruleId" placeholder="选择评分规则" style="width: 340px" @change="changeRule">
          <el-option
            v-for="rule in rules"
            :key="rule.id"
            :label="`${rule.eventName || '赛事'} · ${rule.groupName || '组别'} · ${rule.round === 'PRELIMINARY' ? '初选' : '终选'}`"
            :value="rule.id"
          >
            <div class="rule-option">
              <span>{{ rule.eventName }} · {{ rule.groupName }} · {{ rule.round === 'PRELIMINARY' ? '初选' : '终选' }}</span>
              <small :class="{ 'is-pending': !rule.confirmed }">{{ rule.confirmed ? '已确认' : '待确认' }}</small>
            </div>
          </el-option>
        </el-select>
        <el-input
          v-model="keyword"
          placeholder="搜索运动员或球队"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" plain @click="search">查询</el-button>
        <span class="filter-spacer" />
        <span class="muted">平均总分 <strong class="num avg">{{ avgScore }}</strong></span>
      </div>

      <div v-if="currentRule" class="rule-strip">
        <span v-for="dim in currentRule.dimensions" :key="dim.key" class="rule-strip__dim">
          {{ dim.label }}
          <b>{{ Math.round(dim.weight * 100) }}%</b>
          <small>/ {{ dim.maxScore }} 分</small>
        </span>
        <span class="rule-strip__top">入围 {{ currentRule.topN }} 人</span>
      </div>
    </section>

    <section class="page-card">
      <div class="section-title">评分记录 <small>共 {{ total }} 条</small></div>
      <el-table v-loading="loading" :data="scores" style="width: 100%">
        <el-table-column label="运动员" min-width="180">
          <template #default="{ row }">
            <div class="athlete-cell">
              <span class="athlete-cell__avatar">{{ row.athleteName.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.athleteName }}</strong>
                <small>{{ row.teamName || '—' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="维度得分" min-width="320">
          <template #default="{ row }">
            <div class="score-chips">
              <span v-for="dim in row.dimensionScores" :key="dim.key" class="score-chip">
                {{ dim.label || dim.key }}
                <b class="num">{{ dim.value }}</b>
                <small>/ {{ dim.maxScore || 100 }}</small>
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="总分" width="100" align="center">
          <template #default="{ row }">
            <span class="total-score num">{{ row.totalScore ?? sumDimensions(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="录入" width="140">
          <template #default="{ row }">
            <div class="stack">
              <strong>{{ row.operatorName || '—' }}</strong>
              <small>第 {{ row.scoreRevision || 1 }} 版</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">修改</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !scores.length" description="该规则下暂无评分记录" :image-size="80" />
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
          <div v-for="dim in currentRule?.dimensions || []" :key="dim.key" class="dim-field">
            <div class="dim-field__head">
              <span>{{ dim.label }}</span>
              <small>满分 {{ dim.maxScore }} · 权重 {{ Math.round(dim.weight * 100) }}%</small>
            </div>
            <el-input-number v-model="values[dim.key]" :min="0" :max="dim.maxScore" style="width: 100%" />
          </div>
        </div>

        <el-form-item label="评语 / 备注" style="margin-top: 14px">
          <el-input v-model="remark" type="textarea" :rows="3" placeholder="选填，可记录突出表现或评分依据" />
        </el-form-item>
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

.rule-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.rule-option small {
  font-size: 9px;
  color: var(--brand-700);
}

.rule-option small.is-pending {
  color: #c08a3e;
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

.rule-strip__top {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  color: var(--brand-700);
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

.stack strong {
  display: block;
  font-size: 11px;
  font-weight: 500;
}

.stack small {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: var(--ink-300);
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
