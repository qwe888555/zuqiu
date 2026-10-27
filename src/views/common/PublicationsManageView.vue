﻿﻿﻿<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close, Medal, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { enrollmentApi, eventApi, personApi } from '../../api'
import { pickDefaultEventId } from '../../utils/events'
import { GROUP_TYPE_LABEL, PUBLICITY_TYPE_LABEL, publicityApi } from '../../api/selection'
import type { Enrollment, Event, Person, PublicityRecord, PublicityType, SelectionGroupType } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const loading = ref(false)
const rows = ref<PublicityRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const events = ref<Event[]>([])
const cities = ref<string[]>([])
const filters = reactive({
  eventId: '',
  publicityType: '' as PublicityType | '',
  groupType: '' as SelectionGroupType | '',
  city: '',
  status: '' as 'PUBLISHED' | 'CANCELLED' | '',
  keyword: '',
})

interface Candidate {
  id: string
  name: string
  sub: string
}

const dialogVisible = ref(false)
const saving = ref(false)
const searching = ref(false)
const searchKeyword = ref('')
const candidates = ref<Candidate[]>([])
const selectedTarget = ref<Candidate | null>(null)
const form = reactive({
  eventId: '',
  publicityType: 'ATHLETE' as PublicityType,
  keyword: '',
})

const batchVisible = ref(false)
const batchSaving = ref(false)
const batchForm = reactive({
  groupType: '' as SelectionGroupType | '',
  publicityType: '' as PublicityType | '',
  city: '',
})

const typeOptions = Object.entries(PUBLICITY_TYPE_LABEL) as Array<[PublicityType, string]>
const groupOptions = Object.entries(GROUP_TYPE_LABEL) as Array<[SelectionGroupType, string]>

const activeCount = computed(() => rows.value.filter((row) => row.status === 'PUBLISHED').length)
const athleteCount = computed(() => rows.value.filter((row) => row.publicityType === 'ATHLETE').length)
const coachCount = computed(() => rows.value.filter((row) => row.publicityType === 'COACH').length)

async function load() {
  if (!filters.eventId) {
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const res = await publicityApi.manageList({
      eventId: filters.eventId,
      groupType: filters.groupType || undefined,
      city: filters.city || undefined,
      publicityType: filters.publicityType || undefined,
      status: filters.status || undefined,
      keyword: filters.keyword || undefined,
      page: page.value,
      size: pageSize.value,
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

async function loadEvents() {
  try {
    const res = await eventApi.list({ page: 1, pageSize: 100 })
    events.value = res.items
    if (!filters.eventId) {
      filters.eventId = pickDefaultEventId(events.value)
      form.eventId = filters.eventId
    }
  } catch {
    events.value = []
  }
}

async function loadCities() {
  if (!filters.eventId) {
    cities.value = []
    return
  }
  try {
    cities.value = await publicityApi.cities({ eventId: filters.eventId })
  } catch {
    cities.value = []
  }
}

async function changeEvent() {
  filters.city = ''
  await loadCities()
  search()
}

function resetFilters() {
  filters.publicityType = ''
  filters.groupType = ''
  filters.city = ''
  filters.status = ''
  filters.keyword = ''
  search()
}

function openCreate() {
  form.eventId = filters.eventId || events.value[0]?.id || ''
  form.publicityType = 'ATHLETE'
  selectedTarget.value = null
  candidates.value = []
  searchKeyword.value = ''
  dialogVisible.value = true
}

async function doSearch() {
  if (!searchKeyword.value.trim()) return
  searching.value = true
  try {
    if (form.publicityType === 'TEAM') {
      const res = await enrollmentApi.list({
        page: 1,
        pageSize: 20,
        teamName: searchKeyword.value.trim(),
        status: 'APPROVED',
      })
      candidates.value = (res.items as Enrollment[]).map((item) => ({
        id: item.teamId || item.id,
        name: item.teamName,
        sub: `${item.eventName} · ${item.groupName}`,
      }))
    } else {
      const kind = form.publicityType
      const res = await personApi.search({ keyword: searchKeyword.value.trim() })
      candidates.value = res
        .filter((person: Person) => person.kinds.includes(kind as 'ATHLETE' | 'COACH'))
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
  if (!form.eventId) return ElMessage.warning('请选择赛事')
  if (!selectedTarget.value) return ElMessage.warning('请先搜索并选择公示对象')
  saving.value = true
  try {
    await publicityApi.create({
      eventId: form.eventId,
      publicityType: form.publicityType,
      sourceId: selectedTarget.value.id,
    })
    ElMessage.success('公示已发布')
    dialogVisible.value = false
    await loadCities()
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

function openBatch() {
  batchForm.groupType = ''
  batchForm.publicityType = ''
  batchForm.city = ''
  batchVisible.value = true
}

async function runBatch() {
  if (!filters.eventId) return ElMessage.warning('请先选择赛事')
  if (!batchForm.groupType && !batchForm.publicityType && !batchForm.city) {
    return ElMessage.warning('请至少选择一个筛选条件')
  }
  batchSaving.value = true
  try {
    const res = await publicityApi.batch({
      eventId: filters.eventId,
      groupType: batchForm.groupType || undefined,
      publicityType: batchForm.publicityType || undefined,
      city: batchForm.city || undefined,
    })
    ElMessage.success(`批量公示完成：成功 ${res.published} 条，跳过 ${res.skipped} 条，失败 ${res.failed} 条`)
    batchVisible.value = false
    await loadCities()
    await load()
  } catch {
    // 拦截器提示
  } finally {
    batchSaving.value = false
  }
}

async function cancel(row: PublicityRecord) {
  try {
    const { value } = await ElMessageBox.prompt(
      `确认撤销「${row.name || '该对象'}」的公示？撤销后将不再展示在门户，请填写撤销原因。`,
      '撤销公示',
      {
        confirmButtonText: '确认撤销',
        cancelButtonText: '取消',
        type: 'warning',
        inputType: 'textarea',
        inputPlaceholder: '请填写撤销原因（不少于 4 个字）',
        inputValidator: (input: string) => (input && input.trim().length >= 4) || '撤销原因至少填写 4 个字',
      },
    )
    await publicityApi.cancel(row.id, value.trim())
    ElMessage.success('公示已撤销')
    await load()
  } catch {
    // 取消
  }
}

onMounted(async () => {
  await loadEvents()
  await loadCities()
  await load()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="公示管理"
      description="管理门户公示的运动员、教练员与球队名单。公示仅展示必要信息，撤销后立即从门户下线。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button :icon="Medal" :disabled="!filters.eventId" @click="openBatch">批量公示</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增公示</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="公示记录" :value="total" hint="当前筛选累计" :icon="Medal" tone="green" />
      <StatCard label="公示中" :value="activeCount" hint="当前页可见" :icon="Medal" tone="lime" />
      <StatCard label="运动员" :value="athleteCount" hint="当前页统计" :icon="Medal" tone="blue" />
      <StatCard label="教练员" :value="coachCount" hint="当前页统计" :icon="Medal" tone="amber" />
    </div>

    <section class="page-card">
      <FilterBar :summary="'共 ' + total + ' 条公示'">
        <el-select v-model="filters.eventId" placeholder="选择赛事" filterable style="width: 220px" @change="changeEvent">
          <el-option v-for="item in events" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-select v-model="filters.publicityType" placeholder="全部对象" clearable @change="search">
          <el-option v-for="[value, label] in typeOptions" :key="value" :label="label" :value="value" />
        </el-select>
        <el-select v-model="filters.groupType" placeholder="全部组别" clearable @change="search">
          <el-option v-for="[value, label] in groupOptions" :key="value" :label="label" :value="value" />
        </el-select>
        <el-select v-model="filters.city" placeholder="全部市州" clearable filterable @change="search">
          <el-option v-for="item in cities" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="filters.status" placeholder="全部状态" clearable @change="search">
          <el-option label="公示中" value="PUBLISHED" />
          <el-option label="已撤销" value="CANCELLED" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          placeholder="姓名 / 球队"
          :prefix-icon="Search"
          clearable
          style="width: 170px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button @click="resetFilters">重置</el-button>
      </FilterBar>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="公示对象" min-width="200">
          <template #default="{ row }">
            <div class="target-cell">
              <span class="target-cell__avatar">{{ (row.name || '?').slice(0, 1) }}</span>
              <div>
                <strong>{{ row.name || '—' }}</strong>
                <small>{{ row.publicityTypeLabel }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="球队 / 学校" min-width="200">
          <template #default="{ row }">
            <div class="stack">
              <strong>{{ row.teamName || '—' }}</strong>
              <small>{{ row.schoolName || '学校未登记' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="组别" width="100">
          <template #default="{ row }">{{ row.groupTypeLabel || '—' }}</template>
        </el-table-column>
        <el-table-column label="市州" width="110">
          <template #default="{ row }">{{ row.city || '—' }}</template>
        </el-table-column>
        <el-table-column label="公示时间" width="170">
          <template #default="{ row }"><span class="muted">{{ row.publishedAt || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'PUBLISHED' ? 'success' : 'info'" size="small" effect="plain">
              {{ row.statusLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'PUBLISHED'" link type="danger" :icon="Close" @click="cancel(row)">撤销</el-button>
            <span v-else class="muted">已撤销</span>
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

    <el-dialog v-model="dialogVisible" title="新增公示" width="580px">
      <el-form :model="form" label-position="top">
        <el-form-item label="赛事" required>
          <el-select v-model="form.eventId" style="width: 100%">
            <el-option v-for="item in events" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="公示对象类型">
          <el-radio-group v-model="form.publicityType" @change="candidates = []; selectedTarget = null">
            <el-radio-button v-for="[value, label] in typeOptions" :key="value" :value="value">{{ label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="搜索公示对象">
          <div class="search-row">
            <el-input
              v-model="searchKeyword"
              :placeholder="form.publicityType === 'TEAM' ? '输入球队名称' : '输入姓名'"
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
          <button v-for="item in candidates" :key="item.id" type="button" class="candidate" @click="selectedTarget = item">
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

    <el-dialog v-model="batchVisible" title="批量公示" width="520px">
      <p class="batch-tip">按筛选条件批量发布公示，已公示的对象将自动跳过。至少选择一个条件。</p>
      <el-form :model="batchForm" label-position="top">
        <div class="batch-grid">
          <el-form-item label="组别">
            <el-select v-model="batchForm.groupType" placeholder="全部组别" clearable style="width: 100%">
              <el-option v-for="[value, label] in groupOptions" :key="value" :label="label" :value="value" />
            </el-select>
          </el-form-item>
          <el-form-item label="对象类型">
            <el-select v-model="batchForm.publicityType" placeholder="全部对象" clearable style="width: 100%">
              <el-option v-for="[value, label] in typeOptions" :key="value" :label="label" :value="value" />
            </el-select>
          </el-form-item>
          <el-form-item label="市州">
            <el-select v-model="batchForm.city" placeholder="全部市州" clearable filterable style="width: 100%">
              <el-option v-for="item in cities" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="runBatch">开始批量公示</el-button>
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

.muted {
  font-size: 10px;
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

.batch-tip {
  margin-bottom: 14px;
  font-size: 11px;
  line-height: 1.8;
  color: var(--ink-500);
}

.batch-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}
</style>
