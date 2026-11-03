<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Document, Refresh } from '@element-plus/icons-vue'
import { materialApi, meApi } from '../../api'
import type { Material, Person } from '../../api/types'
import { httpStatusOf } from '../../utils/httpError'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import StatCard from '../../components/common/StatCard.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const loading = ref(false)
const rows = ref<Material[]>([])
const total = ref(0)
const person = ref<Person | null>(null)
const filterStatus = ref('')
/** 后端数据范围未开放（403）时提示只读。 */
const restricted = ref(false)
/** 账号未绑定人员档案（404）。 */
const profileMissing = ref(false)

const pageDescription = '查看本人已归档的履历材料，用于资格审查与遴选。'

const filteredRows = computed(() =>
  filterStatus.value ? rows.value.filter((row) => row.reviewStatus === filterStatus.value) : rows.value,
)

const approvedCount = computed(() => rows.value.filter((m) => m.reviewStatus === 'APPROVED').length)
const pendingCount = computed(() => rows.value.filter((m) => m.reviewStatus === 'PENDING').length)
const rejectedCount = computed(() => rows.value.filter((m) => m.reviewStatus === 'REJECTED').length)

async function load() {
  loading.value = true
  try {
    try {
      person.value = await meApi.profile({ silentError: true })
      profileMissing.value = false
    } catch (error) {
      person.value = null
      profileMissing.value = httpStatusOf(error) === 404
      rows.value = []
      total.value = 0
      return
    }
    try {
      const res = await materialApi.list(
        {
          page: 1,
          pageSize: 100,
          ownerType: 'PERSON',
          ownerId: person.value.id,
        },
        { silentError: true },
      )
      rows.value = res.items
      total.value = res.total
      restricted.value = false
    } catch (error) {
      rows.value = []
      total.value = 0
      restricted.value = httpStatusOf(error) === 403
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="履历材料"
      :description="pageDescription"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="profileMissing"
      class="state-alert"
      type="warning"
      :closable="false"
      show-icon
      title="当前账号未绑定人员档案"
      description="请联系组委会管理员将账号与人员档案绑定后，再查看履历材料。"
    />
    <el-alert
      v-else-if="restricted"
      class="state-alert"
      type="info"
      :closable="false"
      show-icon
      title="履历材料由学校或管理员维护"
      description="材料上传与审核由学校端或管理员操作，本人仅可查看已归档的材料；如有材料缺失请联系所在学校。"
    />

    <div class="stat-grid">
      <StatCard label="材料总数" :value="total" hint="个人履历材料" :icon="Document" tone="green" />
      <StatCard label="已通过" :value="approvedCount" hint="可用于遴选" :icon="Document" tone="lime" />
      <StatCard label="待审核" :value="pendingCount" hint="等待审核处理" :icon="Document" tone="amber" />
      <StatCard label="已驳回" :value="rejectedCount" hint="需重新提交" :icon="Document" tone="blue" />
    </div>

    <section class="page-card">
      <FilterBar :summary="'共 ' + filteredRows.length + ' 份材料'">
        <el-radio-group v-model="filterStatus">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="PENDING">待审核</el-radio-button>
          <el-radio-button value="APPROVED">已通过</el-radio-button>
          <el-radio-button value="REJECTED">已驳回</el-radio-button>
        </el-radio-group>
      </FilterBar>

      <el-table v-loading="loading" :data="filteredRows" style="width: 100%">
        <el-table-column label="材料名称" min-width="260">
          <template #default="{ row }">
            <div class="material-cell">
              <span class="material-cell__icon"><el-icon><Document /></el-icon></span>
              <div>
                <strong>{{ row.title }}</strong>
                <small>{{ row.fileName || '文件未登记' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="materialLabel" label="类型" width="120" />
        <el-table-column label="提交时间" width="160">
          <template #default="{ row }">{{ dayjs(row.createdAt).format('YYYY-MM-DD HH:mm') }}</template>
        </el-table-column>
        <el-table-column label="审核状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.reviewStatus" kind="review" /></template>
        </el-table-column>
        <el-table-column label="审核意见" min-width="200">
          <template #default="{ row }">
            <span :class="{ muted: !row.reviewReason }">{{ row.reviewReason || '—' }}</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!loading && !filteredRows.length"
        :description="
          profileMissing
            ? '绑定人员档案后即可查看材料'
            : restricted
              ? '材料数据范围暂未开放'
              : '暂无履历材料'
        "
        :image-size="80"
      />
    </section>
  </div>
</template>

<style scoped>
.state-alert {
  margin-bottom: 16px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.material-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.material-cell__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-600);
  flex-shrink: 0;
}

.material-cell strong {
  display: block;
  font-size: 13px;
}

.material-cell small {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--ink-400);
}

.muted {
  color: var(--ink-300);
}

@media (max-width: 768px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
