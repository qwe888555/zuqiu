﻿﻿﻿<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Medal, Refresh, Stamp, View } from '@element-plus/icons-vue'
import { eventApi } from '../../api'
import {
  GROUP_TYPE_LABEL,
  ROUND_LABEL,
  selectionResultApi,
} from '../../api/selection'
import type {
  Event,
  SelectionGroupType,
  SelectionResultBatch,
  SelectionRound,
} from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'

const loading = ref(false)
const generating = ref(false)
const events = ref<Event[]>([])
const eventId = ref('')
const groupType = ref<SelectionGroupType>('PRIMARY')
const batches = ref<SelectionResultBatch[]>([])

const generateVisible = ref(false)
const form = reactive({
  resultRound: 'FINAL' as SelectionRound,
  quota: 11,
  initialWeight: 40,
  finalWeight: 60,
})

const drawerVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<SelectionResultBatch | null>(null)

const groupTypeOptions = Object.entries(GROUP_TYPE_LABEL) as Array<[SelectionGroupType, string]>
const roundOptions = Object.entries(ROUND_LABEL) as Array<[SelectionRound, string]>

const activeBatch = computed(() => batches.value.find((batch) => batch.active) || null)
const staleCount = computed(() => batches.value.filter((batch) => batch.stale).length)

async function loadEvents() {
  try {
    const res = await eventApi.list({ page: 1, pageSize: 50 })
    events.value = res.items
    if (!eventId.value) eventId.value = events.value[0]?.id || ''
  } catch {
    events.value = []
  }
}

async function loadBatches() {
  if (!eventId.value) {
    batches.value = []
    return
  }
  loading.value = true
  try {
    batches.value = await selectionResultApi.batches({ eventId: eventId.value, groupType: groupType.value })
  } catch {
    batches.value = []
  } finally {
    loading.value = false
  }
}

async function changeContext() {
  await loadBatches()
}

function openGenerate(source?: SelectionResultBatch) {
  if (!eventId.value) return ElMessage.warning('请选择赛事')
  form.resultRound = source?.resultRound || 'FINAL'
  form.quota = source?.quota || 11
  form.initialWeight = Math.round((source?.initialWeight ?? 0.4) * 100)
  form.finalWeight = Math.round((source?.finalWeight ?? 0.6) * 100)
  generateVisible.value = true
}

async function generate() {
  if (!eventId.value) return
  if (form.initialWeight + form.finalWeight !== 100) return ElMessage.warning('初选与复选权重之和需为 100%')
  try {
    await ElMessageBox.confirm(
      '将按当前评分生成新的结果批次，原有批次转为历史版本；评分后续变更会使该批次标记为「待重算」。',
      '生成遴选结果',
      { confirmButtonText: '生成结果', cancelButtonText: '取消', type: 'warning' },
    )
    generating.value = true
    const batch = await selectionResultApi.generate({
      eventId: eventId.value,
      groupType: groupType.value,
      resultRound: form.resultRound,
      quota: form.quota,
      initialWeight: form.initialWeight / 100,
      finalWeight: form.finalWeight / 100,
    })
    ElMessage.success('遴选结果已生成')
    generateVisible.value = false
    await loadBatches()
    drawerVisible.value = true
    detail.value = batch
  } catch {
    // 取消或异常
  } finally {
    generating.value = false
  }
}

async function openDetail(row: SelectionResultBatch) {
  drawerVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    if (row.items?.length) {
      detail.value = row
    } else {
      const latest = await selectionResultApi.latest({ eventId: row.eventId, groupType: row.groupType })
      if (latest && latest.id === row.id) {
        detail.value = latest
      } else {
        detail.value = row
        ElMessage.info('仅现行批次可直接查看完整名单，历史批次请导出查看')
      }
    }
  } catch {
    detail.value = row
  } finally {
    detailLoading.value = false
  }
}

onMounted(async () => {
  await loadEvents()
  await loadBatches()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="正式结果"
      description="按赛事与组别生成遴选结果批次。批次冻结当时的评分与权重口径，用于公示与上报；评分变更后需重新生成。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="loadBatches">刷新</el-button>
        <el-button type="primary" :icon="Stamp" @click="openGenerate()">生成遴选结果</el-button>
      </template>
    </PageHeader>

    <section class="page-card filter-card">
      <el-select v-model="eventId" placeholder="选择赛事" style="width: 280px" @change="changeContext">
        <el-option v-for="event in events" :key="event.id" :label="event.name" :value="event.id" />
      </el-select>
      <el-select v-model="groupType" style="width: 130px" @change="changeContext">
        <el-option v-for="[value, label] in groupTypeOptions" :key="value" :label="label" :value="value" />
      </el-select>
      <span class="filter-spacer" />
      <span class="muted">现行批次：{{ activeBatch ? `第 ${activeBatch.versionNo} 版` : '暂无' }}</span>
    </section>

    <div class="stat-grid">
      <StatCard label="结果批次" :value="batches.length" hint="历次生成记录" :icon="Medal" tone="green" />
      <StatCard label="现行入围" :value="activeBatch?.items.length ?? 0" hint="已生效名单人数" :icon="Stamp" tone="lime" />
      <StatCard label="待重算" :value="staleCount" hint="评分已变更批次" :icon="Refresh" tone="amber" />
    </div>

    <section class="page-card">
      <el-table v-loading="loading" :data="batches" style="width: 100%">
        <el-table-column label="赛事 / 组别" min-width="240">
          <template #default="{ row }">
            <div class="result-cell">
              <span class="result-cell__icon"><el-icon><Medal /></el-icon></span>
              <div>
                <strong>{{ row.groupTypeLabel }}遴选结果</strong>
                <small>{{ row.resultRoundLabel }} · 第 {{ row.versionNo }} 版</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="入围人数" width="100" align="center">
          <template #default="{ row }"><span class="num">{{ row.quota }}</span></template>
        </el-table-column>
        <el-table-column label="权重口径" width="150">
          <template #default="{ row }">
            <span class="muted">初 {{ Math.round(row.initialWeight * 100) }}% / 复 {{ Math.round(row.finalWeight * 100) }}%</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.stale" type="warning" size="small" effect="plain">待重算</el-tag>
            <el-tag v-else-if="row.active" type="success" size="small" effect="plain">现行</el-tag>
            <el-tag v-else type="info" size="small" effect="plain">历史</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="生成时间" width="170">
          <template #default="{ row }"><span class="muted">{{ row.generatedAt || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="View" @click="openDetail(row)">查看名单</el-button>
            <el-button v-if="!row.active" link type="primary" @click="openGenerate(row)">重新生成</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !batches.length" description="尚未生成遴选结果" :image-size="80" />
    </section>

    <el-dialog v-model="generateVisible" title="生成遴选结果" width="540px">
      <p class="generate-tip">
        按当前评分生成结果批次，超出名额的运动员不入围；分数相同时按球员编号稳定排序。
      </p>
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="结果轮次">
            <el-radio-group v-model="form.resultRound">
              <el-radio-button v-for="[value, label] in roundOptions" :key="value" :value="value">{{ label }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="入围名额">
            <el-input-number v-model="form.quota" :min="1" :max="200" style="width: 100%" />
          </el-form-item>
          <el-form-item label="初选权重（%）">
            <el-input-number v-model="form.initialWeight" :min="0" :max="100" :step="5" style="width: 100%" />
          </el-form-item>
          <el-form-item label="复选权重（%）">
            <el-input-number v-model="form.finalWeight" :min="0" :max="100" :step="5" style="width: 100%" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="generateVisible = false">取消</el-button>
        <el-button type="primary" :loading="generating" @click="generate">生成结果</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="drawerVisible" size="660px" :with-header="false">
      <div v-loading="detailLoading" class="result-detail">
        <template v-if="detail">
          <header class="detail-head">
            <div>
              <span class="detail-head__eyebrow">遴选结果 · 第 {{ detail.versionNo }} 版</span>
              <h2>{{ detail.groupTypeLabel }}遴选入围名单</h2>
              <p>{{ detail.resultRoundLabel }} · 名额 {{ detail.quota }} 人 · 生成于 {{ detail.generatedAt || '—' }}</p>
            </div>
            <el-tag :type="detail.stale ? 'warning' : 'success'" effect="dark" size="large">
              {{ detail.stale ? '待重算' : '现行结果' }}
            </el-tag>
          </header>

          <div class="detail-meta">
            <div><span>入围人数</span><strong class="num">{{ detail.items.length }}</strong></div>
            <div><span>权重口径</span><strong>初 {{ Math.round(detail.initialWeight * 100) }}% / 复 {{ Math.round(detail.finalWeight * 100) }}%</strong></div>
            <div><span>批次编号</span><strong>{{ detail.id }}</strong></div>
          </div>

          <div class="section-title">入围名单</div>
          <el-table :data="detail.items" size="small">
            <el-table-column label="名次" width="70" align="center">
              <template #default="{ row }">
                <span class="rank-badge" :class="{ 'is-top': row.rankNo <= 3 }">{{ row.rankNo }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="candidateName" label="运动员" width="100" />
            <el-table-column prop="teamName" label="所属球队" min-width="150">
              <template #default="{ row }">{{ row.teamName || '—' }}</template>
            </el-table-column>
            <el-table-column label="初选" width="72" align="center">
              <template #default="{ row }"><span class="num">{{ row.initialScore ?? '—' }}</span></template>
            </el-table-column>
            <el-table-column label="复选" width="72" align="center">
              <template #default="{ row }"><span class="num">{{ row.finalScore || '—' }}</span></template>
            </el-table-column>
            <el-table-column label="综合分" width="84" align="center">
              <template #default="{ row }"><strong class="num">{{ row.compositeScore }}</strong></template>
            </el-table-column>
          </el-table>

          <el-alert
            class="detail-alert"
            type="info"
            :closable="false"
            show-icon
            title="结果发布说明"
            description="结果批次本身仅冻结名单。公示需在「报名公示」中按名单发布，过期批次不可直接发布。"
          />
        </template>
      </div>
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

.filter-spacer {
  flex: 1;
}

.muted {
  font-size: 10px;
  color: var(--ink-300);
}

.result-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.result-cell__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.result-cell strong {
  display: block;
  font-size: 12.5px;
}

.result-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.generate-tip {
  margin-bottom: 14px;
  font-size: 11px;
  line-height: 1.8;
  color: var(--ink-500);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.detail-head__eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-600);
}

.detail-head h2 {
  margin-top: 6px;
  font-size: 21px;
}

.detail-head p {
  margin-top: 5px;
  font-size: 11px;
  color: var(--ink-500);
}

.detail-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 16px 0;
}

.detail-meta > div {
  padding: 11px 13px;
  border-radius: 9px;
  background: var(--paper);
}

.detail-meta span {
  display: block;
  font-size: 9.5px;
  color: var(--ink-300);
}

.detail-meta strong {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 500;
  word-break: break-all;
}

.rank-badge {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--paper);
  font-size: 10px;
  font-weight: 700;
  color: var(--ink-500);
}

.rank-badge.is-top {
  background: var(--brand-700);
  color: #fff;
}

.detail-alert {
  margin-top: 18px;
}

@media (max-width: 640px) {
  .form-grid,
  .detail-meta {
    grid-template-columns: 1fr;
  }
}
</style>
