<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Medal, Refresh, Stamp, View } from '@element-plus/icons-vue'
import { selectionApi } from '../../api'
import type { SelectionResult, SelectionRule } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'

const loading = ref(false)
const generating = ref(false)
const rows = ref<SelectionResult[]>([])
const total = ref(0)
const rules = ref<SelectionRule[]>([])

const generateVisible = ref(false)
const generateRuleId = ref('')

const drawerVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<SelectionResult | null>(null)

const confirmedRules = computed(() => rules.value.filter((rule) => rule.confirmed))
const staleCount = computed(() => rows.value.filter((row) => row.stale).length)

const roundLabel: Record<string, string> = { PRELIMINARY: '初选', FINAL: '终选' }

async function load() {
  loading.value = true
  try {
    const res = await selectionApi.results({ page: 1, pageSize: 100 })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadRules() {
  try {
    const res = await selectionApi.rules({ page: 1, pageSize: 100 })
    rules.value = res.items
  } catch {
    rules.value = []
  }
}

function openGenerate() {
  generateRuleId.value = confirmedRules.value[0]?.id || ''
  generateVisible.value = true
}

async function generate() {
  if (!generateRuleId.value) return ElMessage.warning('请选择已确认的评分规则')
  try {
    await ElMessageBox.confirm(
      '将按当前评分版本生成正式结果并冻结名单。评分后续变更会使结果标记为「已过期」，需重新生成。',
      '生成正式结果',
      { confirmButtonText: '生成结果', cancelButtonText: '取消', type: 'warning' },
    )
    generating.value = true
    const result = await selectionApi.generate(generateRuleId.value)
    ElMessage.success('正式结果已生成')
    generateVisible.value = false
    await load()
    await openDetail(result)
  } catch {
    // 取消或异常
  } finally {
    generating.value = false
  }
}

async function openDetail(row: SelectionResult) {
  drawerVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await selectionApi.result(row.id)
  } catch {
    drawerVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

onMounted(() => {
  load()
  loadRules()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="正式结果"
      description="从已确认的评分规则生成正式入围名单。结果冻结评分版本，用于公示与上报；评分变更后需重新生成。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Stamp" @click="openGenerate">生成正式结果</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="结果批次" :value="total" hint="历次生成记录" :icon="Medal" tone="green" />
      <StatCard label="已确认规则" :value="confirmedRules.length" hint="可生成结果" :icon="Stamp" tone="lime" />
      <StatCard label="已过期" :value="staleCount" hint="评分已变更" :icon="Refresh" tone="amber" />
    </div>

    <section class="page-card">
      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="赛事 / 组别" min-width="240">
          <template #default="{ row }">
            <div class="result-cell">
              <span class="result-cell__icon"><el-icon><Medal /></el-icon></span>
              <div>
                <strong>{{ row.eventName || '赛事' }}</strong>
                <small>{{ row.groupName || '组别' }} · {{ roundLabel[row.round] }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="入围人数" width="110" align="center">
          <template #default="{ row }"><span class="num">{{ row.rows.length }}</span></template>
        </el-table-column>
        <el-table-column label="评分版本" width="110" align="center">
          <template #default="{ row }"><span class="num">v{{ row.sourceScoreRevision }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.stale" type="warning" size="small" effect="plain">已过期</el-tag>
            <el-tag v-else type="success" size="small" effect="plain">有效</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="生成时间" width="170">
          <template #default="{ row }">{{ dayjs(row.createdAt).format('YYYY-MM-DD HH:mm') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="View" @click="openDetail(row)">查看名单</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" description="尚未生成正式结果" :image-size="80" />
    </section>

    <el-dialog v-model="generateVisible" title="生成正式结果" width="520px">
      <p class="generate-tip">
        请选择已确认的评分规则。生成后系统按入围名额截取名单，并列分数保留同分选手。
      </p>
      <el-select v-model="generateRuleId" placeholder="选择评分规则" style="width: 100%">
        <el-option
          v-for="rule in confirmedRules"
          :key="rule.id"
          :label="`${rule.eventName || '赛事'} · ${rule.groupName || '组别'} · ${roundLabel[rule.round]}`"
          :value="rule.id"
        />
      </el-select>
      <el-empty v-if="!confirmedRules.length" description="暂无已确认的规则，请先确认评分规则" :image-size="60" />
      <template #footer>
        <el-button @click="generateVisible = false">取消</el-button>
        <el-button type="primary" :loading="generating" :disabled="!confirmedRules.length" @click="generate">
          生成结果
        </el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="drawerVisible" size="640px" :with-header="false">
      <div v-loading="detailLoading" class="result-detail">
        <template v-if="detail">
          <header class="detail-head">
            <div>
              <span class="detail-head__eyebrow">正式遴选结果</span>
              <h2>{{ detail.eventName }}</h2>
              <p>{{ detail.groupName }} · {{ roundLabel[detail.round] }} · 第 {{ detail.sourceScoreRevision }} 版评分</p>
            </div>
            <el-tag :type="detail.stale ? 'warning' : 'success'" effect="dark" size="large">
              {{ detail.stale ? '已过期' : '正式结果' }}
            </el-tag>
          </header>

          <div class="detail-meta">
            <div><span>入围人数</span><strong class="num">{{ detail.rows.length }}</strong></div>
            <div><span>生成时间</span><strong>{{ dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') }}</strong></div>
            <div><span>结果编号</span><strong>{{ detail.id }}</strong></div>
          </div>

          <div class="section-title">入围名单</div>
          <el-table :data="detail.rows" size="small">
            <el-table-column label="名次" width="70" align="center">
              <template #default="{ row }">
                <span class="rank-badge" :class="{ 'is-top': row.rank <= 3 }">{{ row.rank }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="athleteName" label="运动员" width="110" />
            <el-table-column prop="teamName" label="所属球队" min-width="170">
              <template #default="{ row }">{{ row.teamName || '—' }}</template>
            </el-table-column>
            <el-table-column label="总分" width="80" align="center">
              <template #default="{ row }"><strong class="num">{{ row.totalScore }}</strong></template>
            </el-table-column>
          </el-table>

          <el-alert
            class="detail-alert"
            type="info"
            :closable="false"
            show-icon
            title="结果发布说明"
            description="当前原型仅完成结果生成。正式系统中还需经省级管理员确认并同步至门户公示；过期结果不可直接发布。"
          />
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
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
  .detail-meta {
    grid-template-columns: 1fr;
  }
}
</style>
