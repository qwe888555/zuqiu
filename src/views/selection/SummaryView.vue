﻿<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DataAnalysis, Download, Medal, Refresh, TrendCharts } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { eventApi } from '../../api'
import {
  GROUP_TYPE_LABEL,
  ROUND_LABEL,
  selectionResultApi,
  selectionScoreApi,
} from '../../api/selection'
import type { Event, SelectionGroupType, SelectionRound, SelectionScoreRecord } from '../../api/types'
import { usePermission } from '../../composables/usePermission'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'

const router = useRouter()
const { can } = usePermission()
const loading = ref(false)
const exporting = ref(false)
const events = ref<Event[]>([])
const eventId = ref('')
const groupType = ref<SelectionGroupType>('PRIMARY')
const round = ref<SelectionRound>('INITIAL')
const rows = ref<SelectionScoreRecord[]>([])
const quota = ref<number | null>(null)

const groupTypeOptions = Object.entries(GROUP_TYPE_LABEL) as Array<[SelectionGroupType, string]>
const roundOptions = Object.entries(ROUND_LABEL) as Array<[SelectionRound, string]>

const podium = computed(() => rows.value.slice(0, 3))
const avgScore = computed(() =>
  rows.value.length
    ? Math.round((rows.value.reduce((sum, row) => sum + row.totalScore, 0) / rows.value.length) * 10) / 10
    : 0,
)
const topScore = computed(() => (rows.value.length ? Math.max(...rows.value.map((row) => row.totalScore)) : 0))

async function loadEvents() {
  try {
    const res = await eventApi.list({ page: 1, pageSize: 50 })
    events.value = res.items
    if (!eventId.value) eventId.value = events.value[0]?.id || ''
  } catch {
    events.value = []
  }
}

async function loadQuota() {
  quota.value = null
  if (!eventId.value) return
  try {
    const batch = await selectionResultApi.latest({ eventId: eventId.value, groupType: groupType.value })
    quota.value = batch?.quota ?? null
  } catch {
    quota.value = null
  }
}

async function loadSummary() {
  if (!eventId.value) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    rows.value = await selectionScoreApi.summary({
      eventId: eventId.value,
      groupType: groupType.value,
      round: round.value,
    })
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function changeContext() {
  await loadQuota()
  await loadSummary()
}

function rowClassName({ row }: { row: SelectionScoreRecord }) {
  return quota.value && (row.rankNo || 0) <= quota.value ? 'is-in' : ''
}

async function exportSummary() {
  if (!eventId.value) return
  exporting.value = true
  try {
    const downloaded = await selectionScoreApi.exportScores({
      eventId: eventId.value,
      groupType: groupType.value,
      round: round.value,
    })
    ElMessage.success(downloaded ? '文件已开始下载' : '演示环境已模拟导出，接入后端后将下载真实文件')
  } catch {
    // 拦截器提示
  } finally {
    exporting.value = false
  }
}

onMounted(async () => {
  await loadEvents()
  await loadQuota()
  await loadSummary()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="排名汇总"
      description="根据评分实时计算排名，分数相同保留并列名次。正式入围名单需在「正式结果」中按名额生成并发布。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="loadSummary">刷新</el-button>
        <el-button
          v-if="can('selection.manage')"
          :icon="Download"
          :loading="exporting"
          :disabled="!eventId"
          @click="exportSummary"
        >
          导出汇总
        </el-button>
        <el-button type="primary" plain @click="router.push('/console/selection/results')">前往正式结果</el-button>
      </template>
    </PageHeader>

    <section class="page-card filter-card">
      <el-select v-model="eventId" placeholder="选择赛事" style="width: 260px" @change="changeContext">
        <el-option v-for="event in events" :key="event.id" :label="event.name" :value="event.id" />
      </el-select>
      <el-select v-model="groupType" style="width: 130px" @change="changeContext">
        <el-option v-for="[value, label] in groupTypeOptions" :key="value" :label="label" :value="value" />
      </el-select>
      <el-radio-group v-model="round" @change="changeContext">
        <el-radio-button v-for="[value, label] in roundOptions" :key="value" :value="value">{{ label }}</el-radio-button>
      </el-radio-group>
      <span class="filter-spacer" />
      <span class="muted">{{ GROUP_TYPE_LABEL[groupType] }} · {{ ROUND_LABEL[round] }}排名</span>
    </section>

    <div class="stat-grid">
      <StatCard label="参与评分" :value="rows.length" hint="当前轮次人数" :icon="TrendCharts" tone="green" />
      <StatCard label="最高分" :value="topScore" hint="百分制折算" :icon="Medal" tone="lime" />
      <StatCard label="平均分" :value="avgScore" hint="全部评分均值" :icon="DataAnalysis" tone="blue" />
      <StatCard label="入围名额" :value="quota ?? '—'" hint="取自现行结果批次" :icon="Refresh" tone="amber" />
    </div>

    <div class="summary-grid">
      <section class="page-card podium-card">
        <div class="section-title">前三名 <small>实时排名</small></div>
        <div class="podium">
          <div
            v-for="(row, index) in podium"
            :key="row.candidateId"
            class="podium-item"
            :class="`is-${index + 1}`"
          >
            <span class="podium-item__rank num">{{ row.rankNo }}</span>
            <span class="podium-item__avatar">{{ row.candidateName.slice(0, 1) }}</span>
            <div>
              <strong>{{ row.candidateName }}</strong>
              <small>{{ row.teamName || '球队未登记' }}</small>
            </div>
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
              <span class="rank-badge" :class="{ 'is-top': (row.rankNo || 0) <= 3 }">{{ row.rankNo }}</span>
            </template>
          </el-table-column>
          <el-table-column label="运动员" min-width="180">
            <template #default="{ row }">
              <div class="athlete-cell">
                <span class="athlete-cell__avatar">{{ row.candidateName.slice(0, 1) }}</span>
                <strong>{{ row.candidateName }}</strong>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="所属球队" min-width="200">
            <template #default="{ row }">{{ row.teamName || '—' }}</template>
          </el-table-column>
          <el-table-column label="总分" width="110" align="center">
            <template #default="{ row }">
              <strong class="total num">{{ row.totalScore }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="入围" width="90" align="center">
            <template #default="{ row }">
              <el-tag v-if="quota && (row.rankNo || 0) <= quota" type="success" size="small" effect="plain">入围</el-tag>
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

.filter-spacer {
  flex: 1;
}

.muted {
  font-size: 10px;
  color: var(--ink-300);
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
  border-radius: var(--radius-md);
  background: #fff;
}

.podium-item.is-1 {
  background: #fdf9ee;
  border-color: #eadfb9;
}

.podium-item.is-2 {
  background: #f7f8fa;
}

.podium-item.is-3 {
  background: #fbf6f2;
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
