<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { DataAnalysis, Download, Refresh, Trophy, User, Warning } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { enrollmentApi, eventApi } from '../../api'
import type { Event, StatRow } from '../../api/types'
import { usePermission } from '../../composables/usePermission'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'

const { can } = usePermission()
const loading = ref(false)
const exporting = ref<'xlsx' | 'zip' | ''>('')
const events = ref<Event[]>([])
const rows = ref<StatRow[]>([])
const eventId = ref('')
const dimension = ref<'city' | 'group' | 'subjectType'>('city')

const totalTeams = computed(() => rows.value.reduce((sum, row) => sum + row.teamCount, 0))
const totalAthletes = computed(() => rows.value.reduce((sum, row) => sum + row.athleteCount, 0))
const totalPending = computed(() => rows.value.reduce((sum, row) => sum + (row.pendingCount || 0), 0))
const totalApproved = computed(() => rows.value.reduce((sum, row) => sum + (row.approvedCount || 0), 0))

const maxTeamCount = computed(() => Math.max(1, ...rows.value.map((row) => row.teamCount)))

const dimensionLabel = computed(
  () => ({ city: '市州', group: '组别', subjectType: '报送主体' })[dimension.value],
)

async function load() {
  loading.value = true
  try {
    rows.value = await enrollmentApi.statistics({
      eventId: eventId.value || undefined,
      dimension: dimension.value,
    })
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadEvents() {
  try {
    const res = await eventApi.list({ page: 1, pageSize: 50 })
    events.value = res.items
  } catch {
    events.value = []
  }
}

async function exportData(kind: 'xlsx' | 'zip') {
  exporting.value = kind
  try {
    const params = { eventId: eventId.value || undefined }
    const downloaded =
      kind === 'xlsx'
        ? await enrollmentApi.exportRegistrations(params)
        : await enrollmentApi.exportDocuments(params)
    ElMessage.success(
      downloaded ? '文件已开始下载' : '演示环境已模拟导出，接入后端后将下载真实文件',
    )
  } catch {
    // 拦截器提示
  } finally {
    exporting.value = ''
  }
}

onMounted(() => {
  loadEvents()
  load()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="报名统计"
      eyebrow="ENROLLMENT ANALYTICS"
      description="按市州、组别或报送主体聚合报名数据，辅助审核排期与名额统筹。数据实时来源于报名主档。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <template v-if="can('enrollment.export')">
          <el-button :icon="Download" :loading="exporting === 'xlsx'" @click="exportData('xlsx')">
            导出 Excel
          </el-button>
          <el-button
            type="primary"
            plain
            :icon="Download"
            :loading="exporting === 'zip'"
            @click="exportData('zip')"
          >
            打包报名资料
          </el-button>
        </template>
      </template>
    </PageHeader>

    <section class="page-card filter-card">
      <el-select v-model="eventId" placeholder="全部赛事" clearable style="width: 280px" @change="load">
        <el-option v-for="event in events" :key="event.id" :label="event.name" :value="event.id" />
      </el-select>
      <el-radio-group v-model="dimension" @change="load">
        <el-radio-button value="city">按市州</el-radio-button>
        <el-radio-button value="group">按组别</el-radio-button>
        <el-radio-button value="subjectType">按主体</el-radio-button>
      </el-radio-group>
      <span class="filter-card__spacer" />
      <span class="muted">统计口径：当前账号数据范围内</span>
    </section>

    <div class="stat-grid">
      <StatCard label="参赛队伍" :value="totalTeams" hint="提交报名单的球队" :icon="Trophy" tone="green" />
      <StatCard label="报名球员" :value="totalAthletes" hint="各报名单球员合计" :icon="User" tone="lime" />
      <StatCard label="待审核" :value="totalPending" hint="需尽快处理" :icon="Warning" tone="amber" />
      <StatCard label="已通过" :value="totalApproved" hint="完成终审" :icon="DataAnalysis" tone="blue" />
    </div>

    <div class="grid-sidebar">
      <section class="page-card">
        <div class="section-title">分布明细 <small>按{{ dimensionLabel }}聚合</small></div>
        <el-table v-loading="loading" :data="rows" style="width: 100%">
          <el-table-column prop="label" :label="dimensionLabel" min-width="160">
            <template #default="{ row }">
              <div class="label-cell">
                <span class="label-cell__mark">{{ String(row.label).slice(0, 1) }}</span>
                <strong>{{ row.label }}</strong>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="队伍数" width="120">
            <template #default="{ row }">
              <div class="bar-cell">
                <span class="num">{{ row.teamCount }}</span>
                <span class="bar"><i :style="{ width: `${(row.teamCount / maxTeamCount) * 100}%` }" /></span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="athleteCount" label="球员数" width="100" align="center">
            <template #default="{ row }"><span class="num">{{ row.athleteCount }}</span></template>
          </el-table-column>
          <el-table-column label="待审" width="90" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.pendingCount" type="warning" size="small" effect="light">{{ row.pendingCount }}</el-tag>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="通过" width="90" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.approvedCount" type="success" size="small" effect="light">{{ row.approvedCount }}</el-tag>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="驳回" width="90" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.rejectedCount" type="danger" size="small" effect="light">{{ row.rejectedCount }}</el-tag>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loading && !rows.length" description="当前筛选条件下暂无数据" :image-size="80" />
      </section>

      <aside class="page-card progress-card">
        <div class="section-title">审核进度</div>
        <div class="donut-wrap">
          <div
            class="donut"
            :style="{
              background: `conic-gradient(var(--brand-700) 0 ${totalTeams ? (totalApproved / totalTeams) * 100 : 0}%, #f0b95b ${totalTeams ? (totalApproved / totalTeams) * 100 : 0}% ${totalTeams ? ((totalApproved + totalPending) / totalTeams) * 100 : 0}%, #f1e6e6 0)`,
            }"
          >
            <div class="donut__inner">
              <strong class="num">{{ totalTeams ? Math.round((totalApproved / totalTeams) * 100) : 0 }}%</strong>
              <span>终审通过率</span>
            </div>
          </div>
        </div>
        <div class="legend">
          <div><span class="dot dot--green" />已通过 <strong class="num">{{ totalApproved }}</strong></div>
          <div><span class="dot dot--amber" />审核中 <strong class="num">{{ totalPending }}</strong></div>
          <div><span class="dot dot--gray" />草稿/驳回 <strong class="num">{{ Math.max(0, totalTeams - totalApproved - totalPending) }}</strong></div>
        </div>
        <el-alert
          class="progress-tip"
          type="info"
          :closable="false"
          show-icon
          title="建议优先处理待审数量较多的市州"
          description="审核工作台支持按状态与球队名称筛选，可结合本页数据安排审核批次。"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.filter-card {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  padding: 16px 20px;
}

.filter-card__spacer {
  flex: 1;
}

.label-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}

.label-cell__mark {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 11px;
  font-weight: 700;
}

.label-cell strong {
  font-size: 12.5px;
}

.bar-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar-cell .num {
  width: 22px;
  font-size: 12px;
  font-weight: 600;
}

.bar {
  flex: 1;
  height: 5px;
  border-radius: 99px;
  background: var(--brand-100);
  overflow: hidden;
}

.bar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--brand-700);
}

.progress-card {
  align-self: start;
}

.donut-wrap {
  display: grid;
  place-items: center;
  padding: 22px 0 18px;
}

.donut {
  display: grid;
  place-items: center;
  width: 168px;
  height: 168px;
  border-radius: 50%;
}

.donut__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 118px;
  height: 118px;
  border-radius: 50%;
  background: #fff;
  box-shadow: inset 0 0 0 1px var(--line);
}

.donut__inner strong {
  font-size: 28px;
  color: var(--brand-800);
}

.donut__inner span {
  margin-top: 2px;
  font-size: 9px;
  color: var(--ink-300);
}

.legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend div {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: var(--ink-500);
}

.legend strong {
  margin-left: auto;
  color: var(--ink-900);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
}

.dot--green {
  background: var(--brand-700);
}

.dot--amber {
  background: #f0b95b;
}

.dot--gray {
  background: #ede3e3;
}

.progress-tip {
  margin-top: 18px;
}

@media (max-width: 760px) {
  .filter-card {
    align-items: stretch;
  }

  .filter-card .el-select {
    width: 100% !important;
  }

  .filter-card__spacer {
    display: none;
  }
}
</style>
