<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { Refresh, View } from '@element-plus/icons-vue'
import { accountApi, auditApi } from '../../api'
import type { Account, AuditLog } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const loading = ref(false)
const rows = ref<AuditLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
/** 后端审计列表只支持 logType / objectId / from / to，避免传无效筛选参数。 */
const filters = reactive({ logType: '' })
const accountCache = new Map<string, Promise<Account | null>>()

function fetchAccount(id: string) {
  let pending = accountCache.get(id)
  if (!pending) {
    pending = accountApi.get(id).catch(() => null)
    accountCache.set(id, pending)
  }
  return pending
}

/** 审计投影不含操作人姓名，按 operatorAccountId 补全。 */
async function enrichLog(row: AuditLog): Promise<AuditLog> {
  if (!row.operatorAccountId || row.operatorName) return row
  const account = await fetchAccount(row.operatorAccountId)
  return { ...row, operatorName: account?.displayName || account?.username }
}

function operatorLabel(row: AuditLog) {
  if (row.operatorName) return row.operatorName
  if (row.operatorAccountId) return `账号 ${row.operatorAccountId.slice(-6)}`
  return '系统'
}

const drawerVisible = ref(false)
const detail = ref<AuditLog | null>(null)

const logTypeLabel: Record<string, string> = {
  OPERATION: '操作日志',
  LOGIN: '登录日志',
  ENROLLMENT: '报名日志',
}

const objectTypeLabel: Record<string, string> = {
  ACCOUNT: '账号',
  PERSON: '人员',
  TEAM: '球队',
  ENROLLMENT: '报名',
  MATCH: '比赛',
  CONTENT: '内容',
  MATERIAL: '材料',
  SELECTION: '遴选',
  IDENTITY: '身份核验',
}

const successCount = computed(() => rows.value.filter((row) => row.outcome === 'SUCCESS').length)
const failureCount = computed(() => rows.value.filter((row) => row.outcome === 'FAILURE').length)
const loginCount = computed(() => rows.value.filter((row) => row.logType === 'LOGIN').length)

async function load() {
  loading.value = true
  try {
    const res = await auditApi.list({
      page: page.value,
      pageSize: pageSize.value,
      logType: filters.logType || undefined,
    })
    rows.value = await Promise.all(res.items.map(enrichLog))
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function openDetail(row: AuditLog) {
  detail.value = row
  drawerVisible.value = true
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="操作日志"
      description="记录账号登录、业务操作与报名关键动作，供审计追溯。日志只读，不可编辑或删除。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="日志总数" :value="total" hint="当前筛选范围" :icon="Refresh" tone="green" />
      <StatCard label="成功" :value="successCount" hint="当前页统计" :icon="Refresh" tone="lime" />
      <StatCard label="失败" :value="failureCount" hint="当前页统计" :icon="Refresh" tone="amber" />
      <StatCard label="登录记录" :value="loginCount" hint="当前页统计" :icon="Refresh" tone="blue" />
    </div>

    <section class="page-card">
      <FilterBar :summary="'共 ' + total + ' 条日志'">
        <el-select v-model="filters.logType" placeholder="全部日志类型" clearable @change="search">
          <el-option label="操作日志" value="OPERATION" />
          <el-option label="登录日志" value="LOGIN" />
          <el-option label="报名日志" value="ENROLLMENT" />
        </el-select>
        <el-button type="primary" plain @click="search">查询</el-button>
      </FilterBar>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="时间" width="160">
          <template #default="{ row }">
            <span class="muted">{{ dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ logTypeLabel[row.logType || 'OPERATION'] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作人" width="150">
          <template #default="{ row }">{{ operatorLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="动作" width="150">
          <template #default="{ row }">
            <code class="action-code">{{ row.action || '—' }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="summary" label="操作摘要" min-width="260">
          <template #default="{ row }">{{ row.summary || '—' }}</template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.outcome === 'FAILURE' ? 'danger' : 'success'" size="small" effect="plain">
              {{ row.outcome === 'FAILURE' ? '失败' : '成功' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="View" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        @current-change="load"
        @size-change="search"
      />
    </section>

    <el-drawer v-model="drawerVisible" size="480px" :with-header="false">
      <div v-if="detail" class="log-detail">
        <header class="detail-head">
          <span class="detail-head__eyebrow">操作日志</span>
          <h2>{{ detail.summary || detail.action || '日志详情' }}</h2>
          <p>{{ dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss') }}</p>
          <el-tag :type="detail.outcome === 'FAILURE' ? 'danger' : 'success'" size="small" effect="plain">
            {{ detail.outcome === 'FAILURE' ? '失败' : '成功' }}
          </el-tag>
        </header>

        <div class="info-grid">
          <div><span>日志类型</span><strong>{{ logTypeLabel[detail.logType || 'OPERATION'] }}</strong></div>
          <div><span>操作人</span><strong>{{ operatorLabel(detail) }}</strong></div>
          <div><span>操作动作</span><strong>{{ detail.action || '—' }}</strong></div>
          <div><span>对象类型</span><strong>{{ objectTypeLabel[detail.objectType || ''] || detail.objectType || '—' }}</strong></div>
          <div><span>对象 ID</span><strong class="mono">{{ detail.objectId || '—' }}</strong></div>
          <div><span>日志 ID</span><strong class="mono">{{ detail.id }}</strong></div>
        </div>

        <div class="summary-box">
          <span>操作摘要</span>
          <p>{{ detail.summary || '该条日志未记录摘要信息。' }}</p>
        </div>

        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="日志为只读审计数据"
          description="如需追溯业务细节，请结合对象 ID 在对应业务模块中查询。"
        />
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.action-code {
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--paper);
  border: 1px solid var(--line);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 10px;
  color: var(--brand-800);
}

.detail-head {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.detail-head__eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-600);
}

.detail-head h2 {
  margin-top: 5px;
  font-size: 19px;
  line-height: 1.45;
}

.detail-head p {
  margin: 5px 0 8px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: 16px;
}

.info-grid > div {
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--paper);
}

.info-grid span {
  display: block;
  font-size: 9.5px;
  color: var(--ink-300);
}

.info-grid strong {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 500;
  word-break: break-all;
}

.mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 10.5px;
}

.summary-box {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 9px;
  background: var(--brand-50);
}

.summary-box span {
  font-size: 9.5px;
  color: var(--ink-300);
}

.summary-box p {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--ink-700);
}

.log-detail :deep(.el-alert) {
  margin-top: 14px;
}
</style>
