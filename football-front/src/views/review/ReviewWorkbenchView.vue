<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, Download, Refresh, Search, Stamp } from '@element-plus/icons-vue'
import { enrollmentApi, eventApi, fileApi } from '../../api'
import type { EnrollmentDetail } from '../../api'
import type { Enrollment, EnrollmentAttachment, Event, EventGroup, ReviewRecord } from '../../api/types'
import { subjectTypeLabel } from '../../config/labels'
import { useAuthStore } from '../../stores/auth'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import StatCard from '../../components/common/StatCard.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'

const auth = useAuthStore()
const loading = ref(false)
const rows = ref<Enrollment[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const counts = reactive({ city: 0, province: 0, approved: 0, rejected: 0 })
const activeStatus = ref(auth.roles.includes('CITY') ? 'PENDING_CITY_REVIEW' : 'PENDING_PROVINCE_REVIEW')
const keyword = ref('')
const events = ref<Event[]>([])
const groups = ref<EventGroup[]>([])
const filters = reactive({ eventId: '', groupId: '' })

const drawerVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<EnrollmentDetail | null>(null)
const reviews = ref<ReviewRecord[]>([])
const reviewing = ref(false)

const stages = computed(() => {
  if (auth.roles.includes('CITY')) {
    return [{ value: 'PENDING_CITY_REVIEW', label: '待市州初审' }]
  }
  return [
    { value: 'PENDING_CITY_REVIEW', label: '待市州初审' },
    { value: 'PENDING_PROVINCE_REVIEW', label: '待省级终审' },
  ]
})

const tabs = computed(() => [
  ...stages.value,
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已驳回' },
])

const currentStageLabel = computed(() =>
  detail.value?.status === 'PENDING_CITY_REVIEW' ? '市州初审' : '省级终审',
)

async function load() {
  loading.value = true
  try {
    const res = await enrollmentApi.list({
      page: page.value,
      pageSize: pageSize.value,
      status: activeStatus.value,
      eventId: filters.eventId || undefined,
      groupId: filters.groupId || undefined,
      teamName: keyword.value || undefined,
    })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadCounts() {
  const [city, province, approved, rejected] = await Promise.all([
    enrollmentApi.list({ page: 1, pageSize: 1, status: 'PENDING_CITY_REVIEW' }),
    enrollmentApi.list({ page: 1, pageSize: 1, status: 'PENDING_PROVINCE_REVIEW' }),
    enrollmentApi.list({ page: 1, pageSize: 1, status: 'APPROVED' }),
    enrollmentApi.list({ page: 1, pageSize: 1, status: 'REJECTED' }),
  ])
  counts.city = city.total
  counts.province = province.total
  counts.approved = approved.total
  counts.rejected = rejected.total
}

async function openReview(row: Enrollment) {
  drawerVisible.value = true
  detailLoading.value = true
  detail.value = null
  reviews.value = []
  try {
    detail.value = await enrollmentApi.get(row.id)
    reviews.value = await enrollmentApi.reviews(row.id)
  } catch {
    drawerVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

async function approve() {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(
      detail.value.status === 'PENDING_CITY_REVIEW'
        ? '确认通过市州初审？报名将进入省级终审环节。'
        : '确认通过省级终审？通过后报名状态将变为「已通过」。',
      '审核通过',
      { confirmButtonText: '确认通过', cancelButtonText: '再核对一下', type: 'success' },
    )
    reviewing.value = true
    await enrollmentApi.review(detail.value.id, { decision: 'APPROVE' })
    ElMessage.success('审核已通过')
    drawerVisible.value = false
    await Promise.all([load(), loadCounts()])
  } catch {
    // 取消或异常
  } finally {
    reviewing.value = false
  }
}

async function reject() {
  if (!detail.value) return
  try {
    const { value } = await ElMessageBox.prompt('请填写具体驳回原因，参赛单位将收到通知并可修改后重新提交。', '驳回报名', {
      confirmButtonText: '确认驳回',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：盖章报名表缺少学校公章',
      inputValidator: (val) => (val && val.trim().length >= 6 ? true : '请至少填写 6 个字符'),
    })
    reviewing.value = true
    await enrollmentApi.review(detail.value.id, { decision: 'REJECT', reason: value })
    ElMessage.success('已驳回并通知参赛单位')
    drawerVisible.value = false
    await Promise.all([load(), loadCounts()])
  } catch {
    // 取消
  } finally {
    reviewing.value = false
  }
}

async function downloadAttachment(attachment: EnrollmentAttachment) {
  try {
    const downloaded = await fileApi.download(attachment.fileId, attachment.fileName)
    ElMessage.success(downloaded ? '文件已开始下载' : '演示环境已模拟下载，接入后端后将下载真实文件')
  } catch {
    // 拦截器提示
  }
}

async function downloadPlayers() {
  if (!detail.value) return
  try {
    const downloaded = await enrollmentApi.downloadPlayers(detail.value.id)
    ElMessage.success(downloaded ? '球员信息表已开始下载' : '演示环境已模拟下载，接入后端后将下载真实 Word 文件')
  } catch {
    // 拦截器提示
  }
}

async function loadEvents() {
  try {
    const res = await eventApi.available({ page: 1, pageSize: 100 })
    events.value = res.items
  } catch {
    events.value = []
  }
}

async function loadGroups(eventId: string) {
  if (!eventId) {
    groups.value = []
    return
  }
  try {
    groups.value = await eventApi.availableGroups(eventId)
  } catch {
    groups.value = []
  }
}

function changeEvent(eventId: string) {
  filters.groupId = ''
  loadGroups(eventId)
  search()
}

function switchStatus(value: string) {
  activeStatus.value = value
  page.value = 1
  load()
}

function search() {
  page.value = 1
  load()
}

onMounted(() => {
  loadEvents()
  load()
  loadCounts()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="审核工作台"
      description="按审核阶段集中处理报名单。审核前请核对球员资格、材料完整性与盖章文件，驳回时必须填写明确原因。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="() => { load(); loadCounts() }">刷新</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="待市州初审" :value="counts.city" hint="学校球队报名" :icon="Stamp" tone="amber" />
      <StatCard label="待省级终审" :value="counts.province" hint="已通过市州初审" :icon="Stamp" tone="green" />
      <StatCard label="累计通过" :value="counts.approved" hint="当前范围内" :icon="Check" tone="lime" />
      <StatCard label="累计驳回" :value="counts.rejected" hint="需参赛单位整改" :icon="Close" tone="blue" />
    </div>

    <section class="page-card">
      <div class="review-toolbar">
        <div class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            type="button"
            class="tab"
            :class="{ 'is-active': activeStatus === tab.value }"
            @click="switchStatus(tab.value)"
          >
            {{ tab.label }}
          </button>
        </div>
        <div class="search-box">
          <el-select v-model="filters.eventId" placeholder="全部赛事" clearable style="width: 190px" @change="changeEvent">
            <el-option v-for="event in events" :key="event.id" :label="event.name" :value="event.id" />
          </el-select>
          <el-select
            v-model="filters.groupId"
            :placeholder="filters.eventId ? '全部组别' : '请先选择赛事'"
            :disabled="!filters.eventId"
            clearable
            style="width: 150px"
            @change="search"
          >
            <el-option v-for="group in groups" :key="group.id" :label="group.name" :value="group.id" />
          </el-select>
          <el-input
            v-model="keyword"
            placeholder="搜索球队名称"
            :prefix-icon="Search"
            clearable
            @keyup.enter="search"
            @clear="search"
          />
          <el-button type="primary" plain @click="search">查询</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="参赛球队" min-width="210">
          <template #default="{ row }">
            <div class="team-cell">
              <span class="team-cell__avatar">{{ row.teamName.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.teamName }}</strong>
                <small>提交 {{ row.submissionNo }} 次</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="赛事 / 组别" min-width="190">
          <template #default="{ row }">
            <div class="stack">
              <strong>{{ row.eventName }}</strong>
              <small>{{ row.groupName }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="cityName" label="市州" width="110" />
        <el-table-column label="球员" width="80" align="center">
          <template #default="{ row }"><span class="num">{{ row.playerCount }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }"><StatusTag :status="row.status" kind="enrollment" /></template>
        </el-table-column>
        <el-table-column label="提交时间" width="150">
          <template #default="{ row }">
            <span class="muted">{{ dayjs(row.updatedAt).format('MM-DD HH:mm') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'PENDING_CITY_REVIEW' || row.status === 'PENDING_PROVINCE_REVIEW'"
              type="primary"
              size="small"
              @click="openReview(row)"
            >
              开始审核
            </el-button>
            <el-button v-else size="small" @click="openReview(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
        @current-change="load"
        @size-change="search"
      />
    </section>

    <el-drawer v-model="drawerVisible" size="680px" :with-header="false" class="review-drawer">
      <div v-loading="detailLoading" class="review-drawer__inner">
        <template v-if="detail">
          <header class="drawer-head">
            <div>
              <span class="drawer-head__eyebrow">审核 · {{ currentStageLabel }}</span>
              <h2>{{ detail.teamName }}</h2>
              <p>{{ detail.eventName }} · {{ detail.groupName }} · {{ detail.cityName }}</p>
            </div>
            <StatusTag :status="detail.status" kind="enrollment" size="default" />
          </header>

          <section class="drawer-section">
            <h3>报名信息</h3>
            <div class="drawer-grid">
              <div><span>参赛主体</span><strong>{{ subjectTypeLabel(detail.subjectType) }}</strong></div>
              <div><span>联系人</span><strong>{{ detail.contactName }}</strong></div>
              <div><span>联系电话</span><strong>{{ detail.maskedContactPhone || '—' }}</strong></div>
              <div><span>球员人数</span><strong class="num">{{ detail.playerCount }}</strong></div>
              <div><span>提交次数</span><strong class="num">{{ detail.submissionNo }}</strong></div>
              <div><span>最后更新</span><strong>{{ dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm') }}</strong></div>
            </div>
          </section>

          <section class="drawer-section">
            <div class="section-head">
              <h3>球员名单 <small>{{ (detail.players || []).length }} 人</small></h3>
              <el-button size="small" text type="primary" :icon="Download" @click="downloadPlayers">
                导出球员信息表
              </el-button>
            </div>
            <el-table :data="detail.players || []" size="small" max-height="260">
              <el-table-column prop="athleteName" label="姓名" width="100" />
              <el-table-column prop="maskedIdNumber" label="身份证号" min-width="160" />
              <el-table-column prop="jerseyNumber" label="号码" width="60" />
              <el-table-column prop="position" label="位置" width="80" />
              <el-table-column prop="schoolName" label="学校" min-width="140" />
            </el-table>
            <el-empty v-if="!(detail.players || []).length" description="名单为空" :image-size="60" />
          </section>

          <section class="drawer-section">
            <h3>报名材料</h3>
            <div class="material-list">
              <div v-for="att in detail.attachments || []" :key="att.id" class="material">
                <span class="material__type">{{ att.materialType === 'STAMPED_FORM' ? '盖章报名表' : '学籍证明' }}</span>
                <strong>{{ att.fileName }}</strong>
                <el-button size="small" text type="primary" @click="downloadAttachment(att)">下载</el-button>
              </div>
              <el-empty v-if="!(detail.attachments || []).length" description="未上传材料" :image-size="60" />
            </div>
          </section>

          <section class="drawer-section">
            <h3>审核记录</h3>
            <div class="history">
              <div v-for="record in reviews" :key="record.id" class="history-row">
                <span class="history-row__dot" :class="`is-${(record.action || '').toLowerCase()}`" />
                <div>
                  <strong>{{ record.action === 'APPROVE' ? '审核通过' : record.action === 'REJECT' ? '审核驳回' : record.action === 'WITHDRAW' ? '撤回' : '提交' }}</strong>
                  <p v-if="record.reason">{{ record.reason }}</p>
                  <small>{{ record.operatorName }} · {{ dayjs(record.createdAt).format('YYYY-MM-DD HH:mm') }}</small>
                </div>
              </div>
              <el-empty v-if="!reviews.length" description="暂无审核记录" :image-size="60" />
            </div>
          </section>

          <footer v-if="detail.status === 'PENDING_CITY_REVIEW' || detail.status === 'PENDING_PROVINCE_REVIEW'" class="drawer-foot">
            <el-button :icon="Close" type="danger" plain :loading="reviewing" @click="reject">驳回</el-button>
            <el-button :icon="Check" type="success" :loading="reviewing" @click="approve">
              {{ detail.status === 'PENDING_CITY_REVIEW' ? '通过并提交终审' : '终审通过' }}
            </el-button>
          </footer>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.review-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 11px;
  background: var(--paper);
}

.tab {
  padding: 7px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 12px;
  color: var(--ink-500);
  cursor: pointer;
}

.tab.is-active {
  background: #fff;
  color: var(--brand-800);
  font-weight: 700;
  box-shadow: 0 1px 4px rgba(10, 55, 38, 0.08);
}

.search-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.search-box .el-input {
  width: 220px;
}

.team-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.team-cell__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.team-cell strong,
.stack strong {
  display: block;
  font-size: 12.5px;
}

.team-cell small,
.stack small {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--ink-300);
}

.review-drawer__inner {
  min-height: 300px;
  padding: 2px 4px 30px;
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.drawer-head__eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-600);
}

.drawer-head h2 {
  margin-top: 6px;
  font-size: 21px;
}

.drawer-head p {
  margin-top: 5px;
  font-size: 11px;
  color: var(--ink-500);
}

.drawer-section {
  padding: 18px 0;
  border-bottom: 1px solid var(--line);
}

.drawer-section h3 {
  margin-bottom: 12px;
  font-size: 13.5px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-head h3 {
  margin-bottom: 0;
}

.drawer-section h3 small {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 400;
  color: var(--ink-300);
}

.drawer-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.drawer-grid div {
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--paper);
}

.drawer-grid span {
  display: block;
  font-size: 9.5px;
  color: var(--ink-300);
}

.drawer-grid strong {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 500;
}

.material-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.material {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
}

.material__type {
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9px;
  flex-shrink: 0;
}

.material strong {
  flex: 1;
  font-size: 11.5px;
  font-weight: 500;
}

.history {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-row {
  display: flex;
  gap: 10px;
}

.history-row__dot {
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--brand-500);
  flex-shrink: 0;
}

.history-row__dot.is-reject {
  background: #d86969;
}

.history-row strong {
  font-size: 11.5px;
}

.history-row p {
  margin-top: 3px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.history-row small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.drawer-foot {
  position: sticky;
  bottom: -30px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin: 0 -4px -30px;
  padding: 14px 18px;
  background: #fff;
  border-top: 1px solid var(--line);
}

@media (max-width: 760px) {
  .drawer-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .search-box {
    width: 100%;
  }

  .search-box .el-input {
    flex: 1;
    width: auto;
  }
}
</style>
