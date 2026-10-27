<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DataAnalysis, Download, Refresh, Setting, Trophy, User, Warning } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { enrollmentApi, eventApi } from '../../api'
import type { Event, StatRow } from '../../api/types'
import { usePermission } from '../../composables/usePermission'
import { pickDefaultEventId } from '../../utils/events'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'
import CityHeatMap from '../../components/stats/CityHeatMap.vue'

const { can } = usePermission()
const router = useRouter()
const loading = ref(false)
const eventsLoading = ref(false)
const exporting = ref<'xlsx' | 'zip' | ''>('')
const events = ref<Event[]>([])
const rows = ref<StatRow[]>([])
const eventId = ref('')
// 成员3 统计接口的 dimension 枚举为 CITY / UNIVERSITY / GROUP，且 eventId 必填。
const dimension = ref<'CITY' | 'UNIVERSITY' | 'GROUP'>('CITY')
const selectedCity = ref('')

function cityKey(label: string) {
  return label
    .replace(/(藏族羌族自治州|彝族自治州|藏族自治州|自治州|地区|市|州)$/g, '')
    .trim()
}

const displayRows = computed(() =>
  selectedCity.value
    ? rows.value.filter((row) => cityKey(row.label) === selectedCity.value)
    : rows.value,
)

const topCity = computed(() =>
  [...rows.value].filter((row) => row.teamCount > 0).sort((a, b) => b.teamCount - a.teamCount)[0],
)

/** 当前下钻的市州聚合行（key 为市州组织主键，用于报名单筛选）。 */
const selectedRow = computed(() =>
  selectedCity.value
    ? rows.value.find((row) => cityKey(row.label) === selectedCity.value)
    : undefined,
)

function openCityEnrollments() {
  if (!selectedRow.value?.key) return
  router.push({
    path: '/console/enrollments',
    query: {
      eventId: eventId.value,
      cityOrgId: selectedRow.value.key,
      cityName: selectedRow.value.label,
    },
  })
}

function selectCity(city: string) {
  if (selectedCity.value === city) {
    selectedCity.value = ''
    return
  }
  if (!rows.value.some((row) => cityKey(row.label) === city)) {
    ElMessage.info('该市州在当前赛事范围内暂无报名数据')
    return
  }
  selectedCity.value = city
}

function changeDimension() {
  selectedCity.value = ''
  load()
}

const totalTeams = computed(() => rows.value.reduce((sum, row) => sum + row.teamCount, 0))
const totalAthletes = computed(() => rows.value.reduce((sum, row) => sum + row.athleteCount, 0))
const totalPending = computed(() => rows.value.reduce((sum, row) => sum + (row.pendingCount || 0), 0))
const totalApproved = computed(() => rows.value.reduce((sum, row) => sum + (row.approvedCount || 0), 0))

const maxTeamCount = computed(() => Math.max(1, ...rows.value.map((row) => row.teamCount)))

const dimensionLabel = computed(
  () => ({ CITY: '市州', UNIVERSITY: '学校', GROUP: '组别' })[dimension.value],
)

const emptyEventDescription = computed(() =>
  can('event.manage')
    ? '当前后端尚未返回任何赛事数据。'
    : '当前账号数据范围内没有可统计的赛事。请联系赛事管理员创建或开放赛事后重试。',
)

async function load() {
  if (!eventId.value) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    // 统计接口分页返回，默认 pageSize=20；市州/学校维度可能超过一页，这里按 total 取全量。
    const collected: StatRow[] = []
    let page = 1
    let total = 0
    do {
      const res = await enrollmentApi.statistics({
        eventId: eventId.value,
        dimension: dimension.value,
        page,
        pageSize: 100,
      })
      collected.push(...res.items)
      total = res.total
      if (res.items.length < (res.pageSize || 100)) break
      page += 1
    } while (collected.length < total && page <= 50)
    rows.value = collected
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadEvents() {
  eventsLoading.value = true
  try {
    // /events 仅 ADMIN、PROVINCE_REVIEWER 可用；市州账号改走全角色可见的赛事列表。
    const res = can('event.manage')
      ? await eventApi.list({ page: 1, pageSize: 100 })
      : await eventApi.available({ page: 1, pageSize: 100 })
    events.value = res.items
    if (!eventId.value || !events.value.some((event) => event.id === eventId.value)) {
      eventId.value = pickDefaultEventId(events.value)
    }
  } catch {
    events.value = []
  } finally {
    eventsLoading.value = false
  }
}

/** 赛事可能在其他标签页刚创建，刷新时一并重拉赛事列表。 */
async function refresh() {
  await loadEvents()
  await load()
}

async function exportData(kind: 'xlsx' | 'zip') {
  if (!eventId.value) {
    return ElMessage.warning(
      events.value.length
        ? '请先选择赛事'
        : '暂无可选赛事，请先在「赛事与组别」创建赛事后再导出',
    )
  }
  exporting.value = kind
  try {
    const payload = {
      filters: { eventId: eventId.value },
      scope: 'FILTERED' as const,
    }
    const downloaded =
      kind === 'xlsx'
        ? await enrollmentApi.exportRegistrations(payload)
        : await enrollmentApi.exportDocuments(payload)
    ElMessage.success(
      downloaded ? '文件已开始下载' : '演示环境已模拟导出，接入后端后将下载真实文件',
    )
  } catch {
    // 拦截器提示
  } finally {
    exporting.value = ''
  }
}

onMounted(refresh)
</script>

<template>
  <div class="page">
    <PageHeader
      title="报名统计"
      description="按市州、组别或报送学校聚合报名数据，辅助审核排期与名额统筹。数据实时来源于报名主档。"
    >
      <template #actions>
        <el-button :icon="Refresh" :loading="eventsLoading || loading" @click="refresh">刷新</el-button>
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
      <span class="filter-card__label">赛事</span>
      <el-select
        v-model="eventId"
        placeholder="请选择赛事"
        style="width: 280px"
        :loading="eventsLoading"
        :disabled="!events.length"
        @change="load"
      >
        <el-option v-for="event in events" :key="event.id" :label="event.name" :value="event.id" />
      </el-select>
      <el-radio-group v-model="dimension" @change="changeDimension">
        <el-radio-button value="CITY">按市州</el-radio-button>
        <el-radio-button value="UNIVERSITY">按学校</el-radio-button>
        <el-radio-button value="GROUP">按组别</el-radio-button>
      </el-radio-group>
      <span class="filter-card__spacer" />
      <span class="muted">统计口径：当前账号数据范围内</span>
    </section>

    <div v-if="!eventsLoading && !events.length" class="event-empty">
      <el-alert
        type="warning"
        show-icon
        :closable="false"
        title="暂无可选赛事，暂时无法统计与导出"
        :description="emptyEventDescription"
      />
      <el-button
        v-if="can('event.manage')"
        class="event-empty__action"
        type="primary"
        :icon="Setting"
        @click="router.push('/console/events')"
      >
        前往赛事与组别
      </el-button>
    </div>

    <div class="stat-grid">
      <StatCard label="报名球队" :value="totalTeams" hint="学校报送的参赛球队" :icon="Trophy" tone="green" />
      <StatCard label="报名球员" :value="totalAthletes" hint="各报名单球员合计" :icon="User" tone="lime" />
      <StatCard label="待审核" :value="totalPending" hint="需尽快处理" :icon="Warning" tone="amber" />
      <StatCard label="已通过" :value="totalApproved" hint="完成终审" :icon="DataAnalysis" tone="blue" />
    </div>

    <section v-if="dimension === 'CITY'" class="page-card heat-card">
      <div class="section-title">
        市州报名热力
        <small>点击市州查看明细，示意布局不按行政区划比例</small>
      </div>
      <div class="heat-layout">
        <CityHeatMap :rows="rows" :selected="selectedCity" @select="selectCity" />
        <aside class="heat-insights">
          <span class="heat-insights__eyebrow">全省概览</span>
          <div class="heat-insights__hero">
            <strong class="num">{{ rows.filter((row) => row.teamCount > 0).length }}</strong>
            <span>个市州已有报名</span>
          </div>
          <div class="insight-row">
            <span>报名领先</span>
            <b>{{ topCity?.label || '—' }}</b>
            <small v-if="topCity" class="num">{{ topCity.teamCount }} 支</small>
          </div>
          <div class="insight-row">
            <span>待审报名</span>
            <b class="num">{{ totalPending }}</b>
            <small>需尽快处理</small>
          </div>
          <div class="insight-row">
            <span>覆盖球员</span>
            <b class="num">{{ totalAthletes }}</b>
            <small>当前统计范围</small>
          </div>
          <template v-if="selectedCity">
            <el-button type="primary" plain size="small" @click="openCityEnrollments">
              查看该市州报名单
            </el-button>
            <el-button link type="primary" @click="selectedCity = ''">
              清除「{{ selectedCity }}」筛选
            </el-button>
          </template>
          <p v-else class="heat-insights__tip">点击左侧任一有数据的市州，可下钻查看该市州报名明细。</p>
        </aside>
      </div>
    </section>

    <div class="grid-sidebar">
      <section class="page-card">
        <div class="section-title">
          分布明细
          <small>按{{ dimensionLabel }}聚合</small>
          <el-tag v-if="selectedCity" size="small" closable @close="selectedCity = ''">
            {{ selectedCity }}
          </el-tag>
        </div>
        <el-table v-loading="loading" :data="displayRows" style="width: 100%">
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
        <el-empty
          v-if="!loading && !displayRows.length"
          :description="
            !eventId
              ? '暂无可选赛事，请先创建赛事'
              : selectedCity
                ? '该市州在当前赛事范围内暂无报名'
                : '当前筛选条件下暂无数据'
          "
          :image-size="80"
        >
          <el-button
            v-if="!eventId && can('event.manage')"
            type="primary"
            plain
            :icon="Setting"
            @click="router.push('/console/events')"
          >
            前往赛事与组别
          </el-button>
        </el-empty>
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

.filter-card__label {
  font-size: 12px;
  color: var(--ink-500);
}

.event-empty {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.event-empty .el-alert {
  flex: 1;
  min-width: 260px;
}

.event-empty__action {
  flex-shrink: 0;
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

.heat-card {
  padding: 20px 22px 18px;
}

.heat-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(210px, 0.45fr);
  gap: 24px;
  margin-top: 16px;
}

.heat-insights {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 8px;
  background: var(--brand-900);
  color: rgba(255, 255, 255, 0.62);
}

.heat-insights__eyebrow {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.56);
}

.heat-insights__hero {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding-bottom: 10px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.16);
}

.heat-insights__hero strong {
  font-size: 32px;
  line-height: 1;
  color: #fff;
}

.heat-insights__hero span {
  font-size: 10px;
}

.insight-row {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 10.5px;
}

.insight-row span {
  width: 56px;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.42);
}

.insight-row b {
  color: #fff;
  font-size: 12px;
}

.insight-row small {
  margin-left: auto;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.42);
}

.heat-insights :deep(.el-button.is-link) {
  align-self: flex-start;
  padding-left: 0;
  color: var(--lime);
}

.heat-insights__tip {
  margin-top: auto;
  font-size: 9.5px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.38);
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

@media (max-width: 992px) {
  .heat-layout {
    grid-template-columns: 1fr;
  }
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
