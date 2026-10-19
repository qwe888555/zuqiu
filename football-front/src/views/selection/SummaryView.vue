<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DataAnalysis, Download, Medal, Refresh, TrendCharts } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { selectionApi } from '../../api'
import type { SelectionRule, SelectionSummary, SelectionSummaryRow } from '../../api/types'
import { usePermission } from '../../composables/usePermission'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'

const router = useRouter()
const { can } = usePermission()
const loading = ref(false)
const exporting = ref(false)
const rules = ref<SelectionRule[]>([])
const ruleId = ref('')
const summary = ref<SelectionSummary | null>(null)

const currentRule = computed(() => rules.value.find((rule) => rule.id === ruleId.value))
const rows = computed(() => summary.value?.rows || [])
const podium = computed(() => rows.value.slice(0, 3))
const avgScore = computed(() =>
  rows.value.length
    ? Math.round((rows.value.reduce((sum, row) => sum + row.totalScore, 0) / rows.value.length) * 10) / 10
    : 0,
)
const topScore = computed(() => (rows.value.length ? Math.max(...rows.value.map((row) => row.totalScore)) : 0))

async function loadRules() {
  try {
    const res = await selectionApi.rules({ page: 1, pageSize: 100 })
    rules.value = res.items
    if (!ruleId.value) ruleId.value = rules.value[0]?.id || ''
  } catch {
    rules.value = []
  }
}

async function loadSummary() {
  if (!ruleId.value) {
    summary.value = null
    return
  }
  loading.value = true
  try {
    summary.value = await selectionApi.summary(ruleId.value)
  } catch {
    summary.value = null
  } finally {
    loading.value = false
  }
}

async function changeRule() {
  await loadSummary()
}

function cutoffClass(rank: number) {
  const topN = currentRule.value?.topN || 0
  return rank <= topN ? 'is-in' : ''
}

function rowClassName({ row }: { row: SelectionSummaryRow }) {
  return cutoffClass(row.rank)
}

async function exportSummary() {
  if (!ruleId.value) return
  exporting.value = true
  try {
    const downloaded = await selectionApi.exportSummary(ruleId.value)
    ElMessage.success(
      downloaded ? '文件已开始下载' : '演示环境已模拟导出，接入后端后将下载真实文件',
    )
  } catch {
    // 拦截器提示
  } finally {
    exporting.value = false
  }
}

onMounted(async () => {
  await loadRules()
  await loadSummary()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="排名汇总"
      eyebrow="RANKING SUMMARY"
      description="根据当前评分实时计算排名。并列分数保留并列名次；排名仅作参考，正式结果需在「正式结果」中生成并发布。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="loadSummary">刷新</el-button>
        <el-button
          v-if="can('selection.manage')"
          :icon="Download"
          :loading="exporting"
          :disabled="!ruleId"
          @click="exportSummary"
        >
          导出汇总
        </el-button>
        <el-button type="primary" plain @click="router.push('/console/selection/results')">前往正式结果</el-button>
      </template>
    </PageHeader>

    <section class="page-card filter-card">
      <el-select v-model="ruleId" placeholder="选择评分规则" style="width: 380px" @change="changeRule">
        <el-option
          v-for="rule in rules"
          :key="rule.id"
          :label="`${rule.eventName || '赛事'} · ${rule.groupName || '组别'} · ${rule.round === 'PRELIMINARY' ? '初选' : '终选'}`"
          :value="rule.id"
        />
      </el-select>
      <span v-if="currentRule" class="rule-meta">
        <el-tag :type="currentRule.confirmed ? 'success' : 'warning'" size="small" effect="plain">
          {{ currentRule.confirmed ? '规则已确认' : '规则待确认' }}
        </el-tag>
        <span class="muted">评分版本 {{ summary?.scoreRevision || '—' }} · 入围 {{ currentRule.topN }} 人</span>
      </span>
      <span class="filter-spacer" />
      <span class="muted">{{ summary?.round === 'FINAL' ? '终选' : '初选' }}排名</span>
    </section>

    <div class="stat-grid">
      <StatCard label="参与评分" :value="rows.length" hint="当前规则下人数" :icon="TrendCharts" tone="green" />
      <StatCard label="最高分" :value="topScore" hint="百分制折算" :icon="Medal" tone="lime" />
      <StatCard label="平均分" :value="avgScore" hint="全部评分均值" :icon="DataAnalysis" tone="blue" />
      <StatCard label="评分版本" :value="summary?.scoreRevision || 0" hint="每次修改递增" :icon="Refresh" tone="amber" />
    </div>

    <div class="summary-grid">
      <section class="page-card podium-card">
        <div class="section-title">前三名 <small>实时排名</small></div>
        <div class="podium">
          <div
            v-for="(row, index) in podium"
            :key="row.athleteId"
            class="podium-item"
            :class="`is-${index + 1}`"
          >
            <span class="podium-item__rank num">{{ row.rank }}</span>
            <span class="podium-item__avatar">{{ row.athleteName.slice(0, 1) }}</span>
            <strong>{{ row.athleteName }}</strong>
            <small>{{ row.teamName || '球队未登记' }}</small>
            <b class="num">{{ row.totalScore }}</b>
          </div>
          <el-empty v-if="!podium.length" description="暂无评分数据" :image-size="70" />
        </div>
      </section>

      <section class="page-card">
        <div class="section-title">完整排名 <small>{{ rows.length }} 人</small></div>
        <el-table v-loading="loading" :data="rows" style="width: 100%" :row-class-name="rowClassName">
          <el-table-column label="名次" width="80" align="center">
            <template #default="{ row }">
              <span class="rank-badge" :class="{ 'is-top': row.rank <= 3 }">{{ row.rank }}</span>
            </template>
          </el-table-column>
          <el-table-column label="运动员" min-width="180">
            <template #default="{ row }">
              <div class="athlete-cell">
                <span class="athlete-cell__avatar">{{ row.athleteName.slice(0, 1) }}</span>
                <strong>{{ row.athleteName }}</strong>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="teamName" label="所属球队" min-width="200">
            <template #default="{ row }">{{ row.teamName || '—' }}</template>
          </el-table-column>
          <el-table-column label="总分" width="110" align="center">
            <template #default="{ row }">
              <strong class="total num">{{ row.totalScore }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="入围" width="90" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.rank <= (currentRule?.topN || 0)" type="success" size="small" effect="plain">入围</el-tag>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loading && !rows.length" description="暂无排名数据" :image-size="80" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.filter-card {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 20px;
}

.rule-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-spacer {
  flex: 1;
}

.summary-grid {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.podium {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.podium-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 15px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
}

.podium-item.is-1 {
  background: linear-gradient(135deg, #fdf8e8, #fffdf7);
  border-color: #eadfb9;
}

.podium-item.is-2 {
  background: linear-gradient(135deg, #f4f6f8, #fcfdfd);
}

.podium-item.is-3 {
  background: linear-gradient(135deg, #faf3ee, #fdfbf9);
  border-color: #ecdccf;
}

.podium-item__rank {
  width: 22px;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-300);
  text-align: center;
}

.podium-item.is-1 .podium-item__rank {
  color: #c99a2e;
}

.podium-item__avatar {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 13px;
  font-weight: 700;
}

.podium-item strong {
  font-size: 12.5px;
}

.podium-item small {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: var(--ink-300);
}

.podium-item b {
  margin-left: auto;
  font-size: 18px;
  color: var(--brand-800);
}

.rank-badge {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: var(--paper);
  font-size: 10.5px;
  font-weight: 700;
  color: var(--ink-500);
}

.rank-badge.is-top {
  background: var(--brand-700);
  color: #fff;
}

.athlete-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.athlete-cell__avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 10px;
  font-weight: 700;
}

.athlete-cell strong {
  font-size: 12px;
}

.total {
  font-size: 14px;
  color: var(--brand-800);
}

:deep(.el-table .is-in) {
  --el-table-tr-bg-color: rgba(232, 248, 240, 0.5);
}

@media (max-width: 980px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
