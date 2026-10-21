<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Plus, Refresh, Setting, Delete } from '@element-plus/icons-vue'
import { eventApi } from '../../api'
import type { Event, EventGroup, GroupCategory } from '../../api/types'
import { CATEGORY_LABELS } from '../../config/labels'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const loading = ref(false)
const rows = ref<Event[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')

const eventVisible = ref(false)
const editingId = ref<string | null>(null)
const savingEvent = ref(false)
const eventForm = reactive({
  name: '',
  season: '',
  registrationOpensAt: '',
  registrationClosesAt: '',
  status: 'DRAFT',
  description: '',
})

const drawerVisible = ref(false)
const groupLoading = ref(false)
const currentEvent = ref<Event | null>(null)
const groups = ref<EventGroup[]>([])
const groupVisible = ref(false)
const editingGroupId = ref<string | null>(null)
const groupForm = reactive({
  name: '',
  category: 'PRIMARY' as GroupCategory,
  gender: 'MALE',
  quota: 16,
  minAge: 6,
  maxAge: 12,
  maxPlayers: 18,
  requiredMaterialTypes: ['STAMPED_FORM', 'STUDENT_STATUS'] as string[],
})

const categoryLabel = CATEGORY_LABELS
const genderLabel: Record<string, string> = { MALE: '男子', FEMALE: '女子', MIXED: '混合' }

async function load() {
  loading.value = true
  try {
    const res = await eventApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
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
  editingId.value = null
  Object.assign(eventForm, {
    name: '',
    season: `${new Date().getFullYear()} 赛季`,
    registrationOpensAt: '',
    registrationClosesAt: '',
    status: 'DRAFT',
    description: '',
  })
  eventVisible.value = true
}

function openEdit(row: Event) {
  editingId.value = row.id
  Object.assign(eventForm, {
    name: row.name,
    season: row.season,
    registrationOpensAt: row.registrationOpensAt,
    registrationClosesAt: row.registrationClosesAt,
    status: row.status,
    description: row.description || '',
  })
  eventVisible.value = true
}

async function saveEvent() {
  if (!eventForm.name.trim()) return ElMessage.warning('请填写赛事名称')
  if (!eventForm.season.trim()) return ElMessage.warning('请填写赛季')
  savingEvent.value = true
  try {
    if (editingId.value) {
      await eventApi.update(editingId.value, { ...eventForm })
      ElMessage.success('赛事已更新')
    } else {
      await eventApi.create({ ...eventForm })
      ElMessage.success('赛事已创建')
    }
    eventVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    savingEvent.value = false
  }
}

async function removeEvent(row: Event) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.name}」？请先确认该赛事下没有报名与比赛。`, '删除赛事', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await eventApi.remove(row.id, row.version)
    ElMessage.success('赛事已删除')
    await load()
  } catch {
    // 取消
  }
}

async function openGroups(row: Event) {
  currentEvent.value = row
  drawerVisible.value = true
  await loadGroups()
}

async function loadGroups() {
  if (!currentEvent.value) return
  groupLoading.value = true
  try {
    const res = await eventApi.groups(currentEvent.value.id)
    groups.value = res.items
  } catch {
    groups.value = []
  } finally {
    groupLoading.value = false
  }
}

function openGroupCreate() {
  editingGroupId.value = null
  Object.assign(groupForm, {
    name: '',
    category: 'PRIMARY',
    gender: 'MALE',
    quota: 16,
    minAge: 6,
    maxAge: 12,
    maxPlayers: 18,
    requiredMaterialTypes: ['STAMPED_FORM', 'STUDENT_STATUS'],
  })
  groupVisible.value = true
}

function openGroupEdit(group: EventGroup) {
  editingGroupId.value = group.id
  Object.assign(groupForm, {
    name: group.name,
    category: group.category,
    gender: group.gender,
    quota: group.quota || 16,
    minAge: group.minAge || 0,
    maxAge: group.maxAge || 60,
    maxPlayers: group.maxPlayers,
    requiredMaterialTypes: [...group.requiredMaterialTypes],
  })
  groupVisible.value = true
}

async function saveGroup() {
  if (!currentEvent.value) return
  if (!groupForm.name.trim()) return ElMessage.warning('请填写组别名称')
  try {
    if (editingGroupId.value) {
      await eventApi.updateGroup(currentEvent.value.id, editingGroupId.value, { ...groupForm })
      ElMessage.success('组别已更新')
    } else {
      await eventApi.createGroup(currentEvent.value.id, { ...groupForm })
      ElMessage.success('组别已创建')
    }
    groupVisible.value = false
    await loadGroups()
    await load()
  } catch {
    // 拦截器提示
  }
}

async function removeGroup(group: EventGroup) {
  if (!currentEvent.value) return
  try {
    await ElMessageBox.confirm(`确认删除组别「${group.name}」？`, '删除组别', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await eventApi.removeGroup(currentEvent.value.id, group.id, group.version)
    ElMessage.success('组别已删除')
    await loadGroups()
  } catch {
    // 取消
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="赛事配置"
      description="维护赛事赛季、报名开放期与年龄组别。组别的年龄区间、人数上限与必备材料将直接影响报名预检。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建赛事</el-button>
      </template>
    </PageHeader>

    <section class="page-card">
      <FilterBar :summary="'共 ' + total + ' 项赛事'">
        <el-input
          v-model="keyword"
          placeholder="搜索赛事名称"
          clearable
          style="width: 240px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" plain @click="search">查询</el-button>
      </FilterBar>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="赛事" min-width="260">
          <template #default="{ row }">
            <div class="event-cell">
              <span class="event-cell__mark">{{ row.name.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.name }}</strong>
                <small>{{ row.season }} · {{ row.eventCategory || '省级联赛' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="报名开放期" min-width="220">
          <template #default="{ row }">
            <div class="stack">
              <strong>{{ dayjs(row.registrationOpensAt).format('YYYY-MM-DD HH:mm') }}</strong>
              <small>至 {{ dayjs(row.registrationClosesAt).format('YYYY-MM-DD HH:mm') }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="组别 / 队伍" width="130" align="center">
          <template #default="{ row }">
            <span class="num">{{ row.groupCount || 0 }}</span>
            <span class="muted"> / {{ row.teamCount || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.status" kind="event" /></template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Setting" @click="openGroups(row)">组别配置</el-button>
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" :icon="Delete" @click="removeEvent(row)">删除</el-button>
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

    <el-drawer v-model="drawerVisible" size="760px" :with-header="false">
      <div class="drawer-head">
        <div>
          <span class="drawer-head__eyebrow">组别配置</span>
          <h2>{{ currentEvent?.name }}</h2>
          <p>{{ currentEvent?.season }} · 共 {{ groups.length }} 个组别</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="openGroupCreate">新增组别</el-button>
      </div>

      <div v-loading="groupLoading" class="group-list">
        <div v-for="group in groups" :key="group.id" class="group-card">
          <div class="group-card__head">
            <div>
              <strong>{{ group.name }}</strong>
              <span class="group-card__tags">
                <el-tag size="small" effect="plain">{{ categoryLabel[group.category] }}</el-tag>
                <el-tag size="small" effect="plain" type="info">{{ genderLabel[group.gender] }}</el-tag>
              </span>
            </div>
            <div class="group-card__actions">
              <el-button link type="primary" :icon="Edit" @click="openGroupEdit(group)">编辑</el-button>
              <el-button link type="danger" :icon="Delete" @click="removeGroup(group)">删除</el-button>
            </div>
          </div>
          <dl class="group-card__meta">
            <div><dt>年龄要求</dt><dd>{{ group.minAge }}-{{ group.maxAge }} 岁</dd></div>
            <div><dt>每队人数</dt><dd>最多 {{ group.maxPlayers }} 人</dd></div>
            <div><dt>名额</dt><dd>{{ group.quota || '不限' }}</dd></div>
            <div><dt>已报名</dt><dd>{{ group.teamCount || 0 }} 队</dd></div>
            <div class="full">
              <dt>必备材料</dt>
              <dd>
                <el-tag
                  v-for="type in group.requiredMaterialTypes"
                  :key="type"
                  size="small"
                  effect="plain"
                  type="success"
                  class="material-tag"
                >
                  {{ type === 'STAMPED_FORM' ? '盖章报名表' : '学籍证明' }}
                </el-tag>
              </dd>
            </div>
          </dl>
        </div>
        <el-empty v-if="!groupLoading && !groups.length" description="尚未配置组别" :image-size="80" />
      </div>
    </el-drawer>

    <el-dialog v-model="eventVisible" :title="editingId ? '编辑赛事' : '新建赛事'" width="620px">
      <el-form :model="eventForm" label-position="top">
        <div class="form-grid">
          <el-form-item label="赛事名称" required>
            <el-input v-model="eventForm.name" placeholder="如：2026 年四川省中小学校园足球联赛" />
          </el-form-item>
          <el-form-item label="赛季" required>
            <el-input v-model="eventForm.season" placeholder="如：2026 春季" />
          </el-form-item>
          <el-form-item label="报名开始时间">
            <el-date-picker
              v-model="eventForm.registrationOpensAt"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm:ss+08:00"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="报名截止时间">
            <el-date-picker
              v-model="eventForm.registrationClosesAt"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm:ss+08:00"
              style="width: 100%"
            />
          </el-form-item>
        </div>
        <el-form-item label="赛事状态">
          <el-select v-model="eventForm.status" style="width: 100%">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="报名开放" value="REGISTRATION_OPEN" />
            <el-option label="报名截止" value="REGISTRATION_CLOSED" />
            <el-option label="比赛进行中" value="RUNNING" />
            <el-option label="已结束" value="FINISHED" />
          </el-select>
        </el-form-item>
        <el-form-item label="赛事说明">
          <el-input v-model="eventForm.description" type="textarea" :rows="3" placeholder="赛事规程摘要（选填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="eventVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingEvent" @click="saveEvent">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="groupVisible" :title="editingGroupId ? '编辑组别' : '新增组别'" width="620px">
      <el-form :model="groupForm" label-position="top">
        <div class="form-grid">
          <el-form-item label="组别名称" required>
            <el-input v-model="groupForm.name" placeholder="如：小学男子甲组" />
          </el-form-item>
          <el-form-item label="学段">
            <el-select v-model="groupForm.category" style="width: 100%">
              <el-option label="小学" value="PRIMARY" />
              <el-option label="初中" value="MIDDLE" />
              <el-option label="大学" value="UNIVERSITY" />
            </el-select>
          </el-form-item>
          <el-form-item label="性别">
            <el-select v-model="groupForm.gender" style="width: 100%">
              <el-option label="男子" value="MALE" />
              <el-option label="女子" value="FEMALE" />
              <el-option label="混合" value="MIXED" />
            </el-select>
          </el-form-item>
          <el-form-item label="参赛名额（队）">
            <el-input-number v-model="groupForm.quota" :min="0" :max="200" style="width: 100%" />
          </el-form-item>
          <el-form-item label="最小年龄">
            <el-input-number v-model="groupForm.minAge" :min="0" :max="60" style="width: 100%" />
          </el-form-item>
          <el-form-item label="最大年龄">
            <el-input-number v-model="groupForm.maxAge" :min="0" :max="60" style="width: 100%" />
          </el-form-item>
          <el-form-item label="每队最多球员">
            <el-input-number v-model="groupForm.maxPlayers" :min="5" :max="40" style="width: 100%" />
          </el-form-item>
        </div>
        <el-form-item label="必备材料">
          <el-checkbox-group v-model="groupForm.requiredMaterialTypes">
            <el-checkbox value="STAMPED_FORM">盖章报名表</el-checkbox>
            <el-checkbox value="STUDENT_STATUS">学籍证明</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupVisible = false">取消</el-button>
        <el-button type="primary" @click="saveGroup">保存组别</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.event-cell {
  display: flex;
  align-items: center;
  gap: 11px;
}

.event-cell__mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 13px;
  font-weight: 700;
}

.event-cell strong,
.stack strong {
  display: block;
  font-size: 12.5px;
}

.event-cell small,
.stack small {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--ink-300);
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

.group-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 0;
}

.group-card {
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}

.group-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.group-card__head strong {
  font-size: 14px;
}

.group-card__tags {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
  vertical-align: middle;
}

.group-card__actions {
  display: flex;
  gap: 2px;
}

.group-card__meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 14px 0 0;
}

.group-card__meta > div {
  padding: 9px 11px;
  border-radius: 9px;
  background: var(--paper);
}

.group-card__meta .full {
  grid-column: 1 / -1;
}

.group-card__meta dt {
  font-size: 9.5px;
  color: var(--ink-300);
}

.group-card__meta dd {
  margin: 3px 0 0;
  font-size: 11.5px;
  font-weight: 500;
}

.material-tag {
  margin-right: 5px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

@media (max-width: 760px) {
  .group-card__meta {
    grid-template-columns: 1fr 1fr;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
