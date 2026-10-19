<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { enrollmentApi, eventApi } from '../../api'
import type { Enrollment, Event, PrecheckIssue } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const router = useRouter()
const loading = ref(false)
const submitting = ref('')
const rows = ref<Enrollment[]>([])
const total = ref(0)
const events = ref<Event[]>([])
const page = ref(1)
const pageSize = ref(10)
const precheckVisible = ref(false)
const precheckIssues = ref<PrecheckIssue[]>([])

const filters = reactive({
  eventId: '',
  status: '',
  keyword: '',
})

const statusOptions = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'PENDING_CITY_REVIEW', label: '待市州审核' },
  { value: 'PENDING_PROVINCE_REVIEW', label: '待省级终审' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'WITHDRAWN', label: '已撤回' },
]

const subjectLabel = (type: string) =>
  type === 'SCHOOL_TEAM' ? '学校球队' : type === 'UNIVERSITY' ? '高校' : '市州代报'

async function load() {
  loading.value = true
  try {
    const res = await enrollmentApi.list({
      page: page.value,
      pageSize: pageSize.value,
      eventId: filters.eventId || undefined,
      status: filters.status || undefined,
      teamName: filters.keyword || undefined,
    })
    rows.value = res.items
    total.value = res.total
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

function search() {
  page.value = 1
  load()
}

function reset() {
  filters.eventId = ''
  filters.status = ''
  filters.keyword = ''
  page.value = 1
  load()
}

function goCreate() {
  router.push('/console/enrollments/create')
}

function goDetail(row: Enrollment) {
  router.push(`/console/enrollments/${row.id}`)
}

function canEdit(row: Enrollment) {
  return row.status === 'DRAFT' || row.status === 'REJECTED' || row.status === 'WITHDRAWN'
}

async function handleSubmit(row: Enrollment) {
  submitting.value = row.id
  try {
    const result = await enrollmentApi.precheck(row.id)
    if (!result.passed) {
      precheckIssues.value = result.issues
      precheckVisible.value = true
      return
    }
    await ElMessageBox.confirm(
      '预检已通过。提交后将生成报名快照，进入审核流程且不可直接修改，是否继续？',
      '提交报名',
      { confirmButtonText: '确认提交', cancelButtonText: '再检查一下', type: 'warning' },
    )
    await enrollmentApi.submit(row.id)
    ElMessage.success('报名已提交，等待审核')
    await load()
  } catch {
    // 用户取消或接口错误
  } finally {
    submitting.value = ''
  }
}

async function handleWithdraw(row: Enrollment) {
  try {
    const { value } = await ElMessageBox.prompt('请填写撤回原因，撤回后可重新编辑并再次提交。', '撤回报名', {
      confirmButtonText: '确认撤回',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：球员名单需要调整',
      inputValidator: (val) => (val && val.trim().length >= 4 ? true : '请至少填写 4 个字符'),
    })
    await enrollmentApi.withdraw(row.id, value)
    ElMessage.success('报名已撤回')
    await load()
  } catch {
    // 取消操作
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
      title="报名管理"
      eyebrow="ENROLLMENT"
      description="管理参赛报名单、球员名单与审核材料。提交前系统会自动预检，通过后进入审核流程。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="goCreate">新建报名</el-button>
      </template>
    </PageHeader>

    <section class="page-card">
      <div class="filter-bar">
        <el-select v-model="filters.eventId" placeholder="全部赛事" clearable @change="search">
          <el-option v-for="event in events" :key="event.id" :label="event.name" :value="event.id" />
        </el-select>
        <el-select v-model="filters.status" placeholder="全部状态" clearable @change="search">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          placeholder="搜索球队名称"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" plain @click="search">查询</el-button>
        <el-button text @click="reset">重置</el-button>
        <span class="filter-bar__spacer" />
        <span class="muted">共 {{ total }} 条报名记录</span>
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="参赛球队" min-width="200">
          <template #default="{ row }">
            <div class="team-cell" @click="goDetail(row)">
              <span class="team-cell__avatar">{{ row.teamName.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.teamName }}</strong>
                <small>{{ subjectLabel(row.subjectType) }}</small>
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
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <StatusTag :status="row.status" kind="enrollment" />
          </template>
        </el-table-column>
        <el-table-column label="球员" width="80" align="center">
          <template #default="{ row }">
            <span class="num">{{ row.playerCount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="提交次数" width="90" align="center">
          <template #default="{ row }">
            <span class="muted">{{ row.submissionNo }} 次</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="150">
          <template #default="{ row }">
            <span class="muted">{{ dayjs(row.updatedAt).format('MM-DD HH:mm') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="goDetail(row)">详情</el-button>
            <el-button
              v-if="canEdit(row)"
              link
              type="primary"
              :loading="submitting === row.id"
              @click="handleSubmit(row)"
            >
              提交
            </el-button>
            <el-button
              v-if="row.status === 'PENDING_CITY_REVIEW' || row.status === 'PENDING_PROVINCE_REVIEW'"
              link
              type="warning"
              @click="handleWithdraw(row)"
            >
              撤回
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="load"
        @size-change="search"
      />
    </section>

    <el-dialog v-model="precheckVisible" title="预检未通过" width="560px">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="请先处理以下问题，再提交报名"
        description="报名单提交后会生成不可变快照，请确保信息完整准确。"
      />
      <div class="issue-list">
        <div v-for="(issue, index) in precheckIssues" :key="index" class="issue">
          <el-tag :type="issue.severity === 'ERROR' ? 'danger' : 'warning'" size="small" effect="light">
            {{ issue.severity === 'ERROR' ? '必须处理' : '建议处理' }}
          </el-tag>
          <div>
            <strong>{{ issue.message }}</strong>
            <small v-if="issue.field">字段：{{ issue.field }}</small>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="precheckVisible = false">返回修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.team-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
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

.stack strong {
  font-weight: 500;
  color: var(--ink-700);
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 16px;
}

.issue {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 10px;
  background: var(--paper);
}

.issue strong {
  display: block;
  font-size: 12px;
  line-height: 1.6;
}

.issue small {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: var(--ink-300);
}
</style>
