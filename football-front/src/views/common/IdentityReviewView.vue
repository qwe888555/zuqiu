<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Camera, Check, Close, Refresh, VideoCamera } from '@element-plus/icons-vue'
import { identityApi } from '../../api'
import type { IdentityCheck } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import StatCard from '../../components/common/StatCard.vue'

const loading = ref(false)
const rows = ref<IdentityCheck[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = reactive({ manualStatus: '', machineStatus: '' })

const drawerVisible = ref(false)
const reviewing = ref(false)
const detail = ref<IdentityCheck | null>(null)

const machineLabel: Record<string, string> = {
  NOT_RUN: '未比对',
  MATCH: '比对一致',
  MISMATCH: '比对不一致',
  UNAVAILABLE: '服务不可用',
}

const modeLabel: Record<string, string> = {
  FACE_COMPARE: '人脸比对',
  MANUAL: '人工核验',
}

const confirmedCount = computed(() => rows.value.filter((row) => row.manualStatus === 'CONFIRMED').length)
const pendingCount = computed(() => rows.value.filter((row) => row.manualStatus === 'PENDING' || row.manualStatus === 'NOT_REVIEWED').length)
const mismatchCount = computed(() => rows.value.filter((row) => row.machineStatus === 'MISMATCH').length)

async function load() {
  loading.value = true
  try {
    const res = await identityApi.list({
      page: page.value,
      pageSize: pageSize.value,
      manualStatus: filters.manualStatus || undefined,
      machineStatus: filters.machineStatus || undefined,
    })
    rows.value = res.items
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

async function openDetail(row: IdentityCheck) {
  drawerVisible.value = true
  detail.value = null
  try {
    detail.value = await identityApi.get(row.id)
  } catch {
    drawerVisible.value = false
  }
}

async function review(decision: 'CONFIRM_IDENTITY' | 'REJECT_IDENTITY') {
  if (!detail.value) return
  if (decision === 'CONFIRM_IDENTITY') {
    try {
      await ElMessageBox.confirm(
        `确认「${detail.value.athleteName}」与报名档案为同一人？确认后允许参赛。`,
        '确认身份',
        { confirmButtonText: '确认身份', cancelButtonText: '取消', type: 'success' },
      )
    } catch {
      return
    }
    reviewing.value = true
    try {
      await identityApi.review(detail.value.id, { decision })
      ElMessage.success('已确认身份')
      drawerVisible.value = false
      await load()
    } catch {
      // 拦截器提示
    } finally {
      reviewing.value = false
    }
    return
  }

  try {
    const { value } = await ElMessageBox.prompt('请填写驳回原因，记录将保留以备追溯。', '驳回身份核验', {
      confirmButtonText: '确认驳回',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：现场证件与报名信息不一致',
      inputValidator: (val) => (val && val.trim().length >= 4 ? true : '请至少填写 4 个字符'),
    })
    reviewing.value = true
    await identityApi.review(detail.value.id, { decision, reason: value })
    ElMessage.success('已驳回并记录原因')
    drawerVisible.value = false
    await load()
  } catch {
    // 取消或异常
  } finally {
    reviewing.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="身份核验"
      eyebrow="IDENTITY VERIFICATION"
      description="查看赛前人脸比对与人工核验记录。比对不一致或服务不可用时，需由记录员现场核验证件后人工确认。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="核验记录" :value="total" hint="当前筛选范围" :icon="VideoCamera" tone="green" />
      <StatCard label="已确认" :value="confirmedCount" hint="允许参赛" :icon="Check" tone="lime" />
      <StatCard label="待人工复核" :value="pendingCount" hint="需现场处理" :icon="Camera" tone="amber" />
      <StatCard label="比对不一致" :value="mismatchCount" hint="重点核查" :icon="Close" tone="blue" />
    </div>

    <section class="page-card">
      <div class="filter-bar">
        <el-select v-model="filters.manualStatus" placeholder="人工核验状态" clearable @change="search">
          <el-option label="未复核" value="NOT_REVIEWED" />
          <el-option label="待核验" value="PENDING" />
          <el-option label="已确认" value="CONFIRMED" />
          <el-option label="已驳回" value="REJECTED" />
        </el-select>
        <el-select v-model="filters.machineStatus" placeholder="人脸比对结果" clearable @change="search">
          <el-option label="比对一致" value="MATCH" />
          <el-option label="比对不一致" value="MISMATCH" />
          <el-option label="未比对" value="NOT_RUN" />
          <el-option label="服务不可用" value="UNAVAILABLE" />
        </el-select>
        <span class="filter-bar__spacer" />
        <span class="muted">共 {{ total }} 条记录</span>
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="运动员" min-width="180">
          <template #default="{ row }">
            <div class="person-cell">
              <span class="person-cell__avatar">{{ row.athleteName.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.athleteName }}</strong>
                <small>{{ row.teamName || '球队未登记' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="matchLabel" label="比赛" min-width="200">
          <template #default="{ row }">{{ row.matchLabel || '—' }}</template>
        </el-table-column>
        <el-table-column label="核验方式" width="110">
          <template #default="{ row }">{{ modeLabel[row.mode] }}</template>
        </el-table-column>
        <el-table-column label="人脸比对" width="120">
          <template #default="{ row }">
            <el-tag
              :type="row.machineStatus === 'MATCH' ? 'success' : row.machineStatus === 'MISMATCH' ? 'danger' : 'info'"
              size="small"
              effect="plain"
            >
              {{ machineLabel[row.machineStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="人工核验" width="120">
          <template #default="{ row }"><StatusTag :status="row.manualStatus" kind="identity" /></template>
        </el-table-column>
        <el-table-column label="核验时间" width="160">
          <template #default="{ row }">
            <span class="muted">{{ dayjs(row.createdAt).format('MM-DD HH:mm') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">
              {{ row.manualStatus === 'PENDING' || row.manualStatus === 'NOT_REVIEWED' ? '处理' : '查看' }}
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

    <el-drawer v-model="drawerVisible" size="540px" :with-header="false">
      <div v-if="detail" class="identity-detail">
        <header class="detail-head">
          <span class="detail-head__eyebrow">IDENTITY CHECK</span>
          <h2>{{ detail.athleteName }}</h2>
          <p>{{ detail.matchLabel || '比赛未登记' }} · {{ detail.teamName || '球队未登记' }}</p>
          <StatusTag :status="detail.manualStatus" kind="identity" size="default" />
        </header>

        <div class="capture">
          <img v-if="detail.capturedPhotoUrl" :src="detail.capturedPhotoUrl" alt="现场照片" />
          <div v-else class="capture__placeholder">
            <el-icon :size="30"><Camera /></el-icon>
            <span>暂无现场采集照片</span>
            <small>正式环境由记录员现场拍照上传</small>
          </div>
          <span class="capture__label">现场采集</span>
        </div>

        <div class="info-grid">
          <div><span>核验方式</span><strong>{{ modeLabel[detail.mode] }}</strong></div>
          <div><span>人脸比对</span><strong>{{ machineLabel[detail.machineStatus] }}</strong></div>
          <div><span>采集时间</span><strong>{{ dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm') }}</strong></div>
          <div><span>复核人</span><strong>{{ detail.reviewerName || '—' }}</strong></div>
        </div>

        <div v-if="detail.manualReason" class="reason-box">
          <span>复核意见</span>
          <p>{{ detail.manualReason }}</p>
        </div>

        <el-alert
          v-if="detail.machineStatus === 'MISMATCH'"
          type="warning"
          :closable="false"
          show-icon
          title="人脸比对不一致"
          description="请核对参赛证、身份证原件与报名照片，确认无误后方可人工通过；存在冒名顶替嫌疑时应驳回并上报。"
        />

        <footer v-if="detail.manualStatus === 'PENDING' || detail.manualStatus === 'NOT_REVIEWED'" class="detail-foot">
          <el-button type="danger" plain :icon="Close" :loading="reviewing" @click="review('REJECT_IDENTITY')">
            驳回
          </el-button>
          <el-button type="success" :icon="Check" :loading="reviewing" @click="review('CONFIRM_IDENTITY')">
            确认身份
          </el-button>
        </footer>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.person-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}

.person-cell__avatar {
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

.person-cell strong {
  display: block;
  font-size: 12.5px;
}

.person-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.detail-head {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.detail-head__eyebrow {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--brand-600);
}

.detail-head h2 {
  margin-top: 5px;
  font-size: 21px;
}

.detail-head p {
  margin: 5px 0 8px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.capture {
  position: relative;
  margin-top: 16px;
  border-radius: 13px;
  overflow: hidden;
  background: var(--paper);
}

.capture img {
  width: 100%;
  height: 240px;
  object-fit: cover;
}

.capture__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--ink-300);
}

.capture__placeholder span {
  margin-top: 8px;
  font-size: 12px;
}

.capture__placeholder small {
  margin-top: 3px;
  font-size: 9.5px;
}

.capture__label {
  position: absolute;
  left: 10px;
  bottom: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(4, 40, 27, 0.65);
  color: #fff;
  font-size: 9px;
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
}

.reason-box {
  margin-top: 14px;
  padding: 11px 13px;
  border-radius: 9px;
  background: #fbf4ef;
}

.reason-box span {
  font-size: 9.5px;
  color: var(--ink-300);
}

.reason-box p {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-700);
}

.detail-foot {
  position: sticky;
  bottom: -30px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin: 20px -4px -30px;
  padding: 14px 16px;
  background: #fff;
  border-top: 1px solid var(--line);
}

.identity-detail {
  padding-bottom: 30px;
}

.identity-detail :deep(.el-alert) {
  margin-top: 14px;
}
</style>
