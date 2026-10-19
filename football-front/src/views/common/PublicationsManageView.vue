<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close, Medal, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { enrollmentApi, personApi, publicationApi } from '../../api'
import type { Enrollment, Person, Publication } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import StatCard from '../../components/common/StatCard.vue'

const loading = ref(false)
const rows = ref<Publication[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = reactive({ targetType: '', active: '' })

const dialogVisible = ref(false)
const saving = ref(false)
const searching = ref(false)
const searchKeyword = ref('')
const candidates = ref<{ id: string; name: string; sub: string }[]>([])
const selectedTarget = ref<{ id: string; name: string; sub: string } | null>(null)
const form = reactive({
  targetType: 'ATHLETE',
  keyword: '',
})

const typeOptions = [
  { value: 'ATHLETE', label: '运动员' },
  { value: 'COACH', label: '教练员' },
  { value: 'ENROLLMENT', label: '参赛单位' },
]

const typeLabel: Record<string, string> = {
  ATHLETE: '运动员',
  COACH: '教练员',
  ENROLLMENT: '参赛单位',
}

const activeCount = computed(() => rows.value.filter((row) => row.active).length)
const athleteCount = computed(() => rows.value.filter((row) => row.targetType === 'ATHLETE').length)
const coachCount = computed(() => rows.value.filter((row) => row.targetType === 'COACH').length)

async function load() {
  loading.value = true
  try {
    const res = await publicationApi.list({
      page: page.value,
      pageSize: pageSize.value,
      targetType: filters.targetType || undefined,
      active: filters.active === '' ? undefined : filters.active === 'active',
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

function openCreate() {
  form.targetType = 'ATHLETE'
  selectedTarget.value = null
  candidates.value = []
  searchKeyword.value = ''
  dialogVisible.value = true
}

async function doSearch() {
  if (!searchKeyword.value.trim()) return
  searching.value = true
  try {
    if (form.targetType === 'ENROLLMENT') {
      const res = await enrollmentApi.list({
        page: 1,
        pageSize: 20,
        teamName: searchKeyword.value.trim(),
        status: 'APPROVED',
      })
      candidates.value = (res.items as Enrollment[]).map((item) => ({
        id: item.id,
        name: item.teamName,
        sub: `${item.eventName} · ${item.groupName}`,
      }))
    } else {
      const res = await personApi.search({ keyword: searchKeyword.value.trim() })
      const kind = form.targetType === 'ATHLETE' ? 'ATHLETE' : 'COACH'
      candidates.value = res
        .filter((person: Person) => person.kinds.includes(kind))
        .map((person) => ({
          id: person.id,
          name: person.realName,
          sub: `${person.teamName || '未关联球队'} · ${person.schoolName || '学校未登记'}`,
        }))
    }
  } catch {
    candidates.value = []
  } finally {
    searching.value = false
  }
}

async function create() {
  if (!selectedTarget.value) return ElMessage.warning('请先搜索并选择公示对象')
  saving.value = true
  try {
    await publicationApi.create({
      targetType: form.targetType,
      targetId: selectedTarget.value.id,
    })
    ElMessage.success('公示已发布')
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function cancel(row: Publication) {
  try {
    await ElMessageBox.confirm(`确认撤销「${row.targetName || '该对象'}」的公示？撤销后将不再展示在门户。`, '撤销公示', {
      confirmButtonText: '确认撤销',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await publicationApi.cancel(row.id)
    ElMessage.success('公示已撤销')
    await load()
  } catch {
    // 取消
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="公示管理"
      eyebrow="PUBLICATION MANAGEMENT"
      description="管理门户公示的运动员、教练员与参赛单位名单。公示仅展示必要信息，撤销后立即从门户下线。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增公示</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="公示记录" :value="total" hint="累计发布" :icon="Medal" tone="green" />
      <StatCard label="公示中" :value="activeCount" hint="门户可见" :icon="Medal" tone="lime" />
      <StatCard label="运动员" :value="athleteCount" hint="当前页统计" :icon="Medal" tone="blue" />
      <StatCard label="教练员" :value="coachCount" hint="当前页统计" :icon="Medal" tone="amber" />
    </div>

    <section class="page-card">
      <div class="filter-bar">
        <el-select v-model="filters.targetType" placeholder="全部对象" clearable @change="search">
          <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.active" placeholder="全部状态" clearable @change="search">
          <el-option label="公示中" value="active" />
          <el-option label="已撤销" value="cancelled" />
        </el-select>
        <span class="filter-bar__spacer" />
        <span class="muted">共 {{ total }} 条公示</span>
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="公示对象" min-width="220">
          <template #default="{ row }">
            <div class="target-cell">
              <span class="target-cell__avatar">{{ (row.targetName || '?').slice(0, 1) }}</span>
              <div>
                <strong>{{ row.targetName || '—' }}</strong>
                <small>{{ typeLabel[row.targetType] }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="球队 / 单位" min-width="190">
          <template #default="{ row }">{{ row.teamName || '—' }}</template>
        </el-table-column>
        <el-table-column label="赛事 / 组别" min-width="200">
          <template #default="{ row }">
            <div class="stack">
              <strong>{{ row.eventId ? '赛事' : '—' }}</strong>
              <small>{{ row.groupName || '组别未设置' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="cityName" label="市州" width="100" />
        <el-table-column label="公示时间" width="160">
          <template #default="{ row }">
            <span class="muted">{{ dayjs(row.publishedAt).format('YYYY-MM-DD HH:mm') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><StatusTag :status="row.active" kind="publication" /></template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="right">
          <template #default="{ row }">
            <el-button v-if="row.active" link type="danger" :icon="Close" @click="cancel(row)">撤销</el-button>
            <span v-else class="muted">已撤销</span>
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

    <el-dialog v-model="dialogVisible" title="新增公示" width="580px">
      <el-form :model="form" label-position="top">
        <el-form-item label="公示对象类型">
          <el-radio-group v-model="form.targetType" @change="candidates = []; selectedTarget = null">
            <el-radio-button v-for="item in typeOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="搜索公示对象">
          <div class="search-row">
            <el-input
              v-model="searchKeyword"
              :placeholder="form.targetType === 'ENROLLMENT' ? '输入球队名称' : '输入姓名'"
              :prefix-icon="Search"
              @keyup.enter="doSearch"
            />
            <el-button :loading="searching" @click="doSearch">搜索</el-button>
          </div>
        </el-form-item>

        <div v-if="selectedTarget" class="selected-target">
          <span class="selected-target__avatar">{{ selectedTarget.name.slice(0, 1) }}</span>
          <div>
            <strong>{{ selectedTarget.name }}</strong>
            <small>{{ selectedTarget.sub }}</small>
          </div>
          <el-button link type="primary" @click="selectedTarget = null">重新选择</el-button>
        </div>

        <div v-else-if="candidates.length" class="candidate-list">
          <button
            v-for="item in candidates"
            :key="item.id"
            type="button"
            class="candidate"
            @click="selectedTarget = item"
          >
            <span class="candidate__avatar">{{ item.name.slice(0, 1) }}</span>
            <span class="candidate__info">
              <strong>{{ item.name }}</strong>
              <small>{{ item.sub }}</small>
            </span>
          </button>
        </div>
        <el-empty v-else-if="searchKeyword && !searching" description="未找到符合条件的对象" :image-size="60" />

        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="公示信息将展示在门户"
          description="仅展示姓名、球队、组别与市州等必要信息，不包含证件号与联系方式。"
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="create">发布公示</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.target-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}

.target-cell__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.target-cell strong {
  display: block;
  font-size: 12.5px;
}

.target-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.stack strong {
  display: block;
  font-size: 11.5px;
  font-weight: 500;
}

.stack small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.search-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.search-row .el-input {
  flex: 1;
}

.selected-target {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid var(--brand-100);
  border-radius: 10px;
  background: var(--brand-50);
}

.selected-target__avatar,
.candidate__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-700);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.selected-target div {
  flex: 1;
}

.selected-target strong,
.candidate__info strong {
  display: block;
  font-size: 12px;
}

.selected-target small,
.candidate__info small {
  display: block;
  margin-top: 1px;
  font-size: 9.5px;
  color: var(--ink-500);
}

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.candidate {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.candidate:hover {
  border-color: var(--brand-500);
}
</style>
