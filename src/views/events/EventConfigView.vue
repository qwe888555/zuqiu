<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Plus, Refresh, Setting, Delete } from '@element-plus/icons-vue'
import { eventApi } from '../../api'
import type { Event, EventGroup, GroupCategory } from '../../api/types'
import { CATEGORY_LABELS, EVENT_LEVELS, eventLevelLabel } from '../../config/labels'
import { httpStatusOf } from '../../utils/httpError'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const router = useRouter()
const loading = ref(false)
const rows = ref<Event[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const levelFilter = ref('')
const changingStatusId = ref('')

const eventVisible = ref(false)
const editingId = ref<string | null>(null)
const editingVersion = ref(0)
const editingStatus = ref('')
const savingEvent = ref(false)
const eventForm = reactive({
  name: '',
  season: '',
  eventCategory: '',
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
const editingGroupVersion = ref(0)
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
      // 成员5 赛事列表的查询参数是 name，没有 keyword。
      name: keyword.value || undefined,
      eventCategory: levelFilter.value || undefined,
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
  editingVersion.value = 0
  editingStatus.value = ''
  Object.assign(eventForm, {
    name: '',
    season: `${new Date().getFullYear()} 赛季`,
    eventCategory: '',
    registrationOpensAt: '',
    registrationClosesAt: '',
    status: 'DRAFT',
    description: '',
  })
  eventVisible.value = true
}

function openEdit(row: Event) {
  editingId.value = row.id
  editingVersion.value = row.version
  editingStatus.value = row.status
  Object.assign(eventForm, {
    name: row.name,
    season: row.season,
    eventCategory: row.eventCategory || '',
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
  // 成员5 的创建/修改接口要求报名开放期必填。
  if (!eventForm.registrationOpensAt) return ElMessage.warning('请选择报名开始时间')
  if (!eventForm.registrationClosesAt) return ElMessage.warning('请选择报名截止时间')
  if (editingId.value && eventForm.status === 'REGISTRATION_OPEN' && editingStatus.value !== 'REGISTRATION_OPEN') {
    if (dayjs(eventForm.registrationClosesAt).isBefore(dayjs())) {
      return ElMessage.warning('报名截止时间已过，无法开放报名')
    }
    try {
      const groups = await eventApi.groups(editingId.value)
      if (!groups.items.length) {
        return ElMessage.warning('该赛事尚未配置组别，请先关闭弹窗并完成组别配置')
      }
    } catch {
      return
    }
  }
  savingEvent.value = true
  try {
    if (editingId.value) {
      await eventApi.update(editingId.value, {
        ...eventForm,
        eventCategory: eventForm.eventCategory.trim(),
        version: editingVersion.value,
      })
      ElMessage.success('赛事已更新')
    } else {
      await eventApi.create({
        ...eventForm,
        eventCategory: eventForm.eventCategory.trim(),
      })
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

type StatusAction = {
  label: string
  status: string
  type: 'success' | 'warning' | 'primary'
  confirm: string
}

function statusActionOf(row: Event): StatusAction | null {
  if (row.status === 'DRAFT') {
    return {
      label: '发布并开放报名',
      status: 'REGISTRATION_OPEN',
      type: 'success',
      confirm: `确认发布「${row.name}」并开放球队报名？发布后门户报名页将展示该赛事。`,
    }
  }
  if (row.status === 'REGISTRATION_OPEN') {
    return {
      label: '关闭报名',
      status: 'REGISTRATION_CLOSED',
      type: 'warning',
      confirm: `确认关闭「${row.name}」的报名？关闭后学校端与门户将不再接收新报名。`,
    }
  }
  if (row.status === 'REGISTRATION_CLOSED') {
    return {
      label: '重新开放报名',
      status: 'REGISTRATION_OPEN',
      type: 'primary',
      confirm: `确认重新开放「${row.name}」的报名？请确认报名截止时间尚未过期。`,
    }
  }
  return null
}

function baseEventPayload(row: Event) {
  return {
    name: row.name,
    season: row.season,
    eventCategory: row.eventCategory || '',
    registrationOpensAt: row.registrationOpensAt,
    registrationClosesAt: row.registrationClosesAt,
    description: row.description || '',
  }
}

async function changeStatus(row: Event, action: StatusAction) {
  if (action.status === 'REGISTRATION_OPEN') {
    if (!row.registrationOpensAt || !row.registrationClosesAt) {
      ElMessage.warning('请先在编辑弹窗中填写完整的报名开放期')
      return
    }
    if (dayjs(row.registrationClosesAt).isBefore(dayjs())) {
      ElMessage.warning('报名截止时间已过，请先编辑调整报名开放期')
      return
    }
  }
  try {
    await ElMessageBox.confirm(action.confirm, action.label, {
      confirmButtonText: action.label,
      cancelButtonText: '取消',
      type: action.status === 'REGISTRATION_OPEN' ? 'success' : 'warning',
    })
  } catch {
    return
  }

  changingStatusId.value = row.id
  try {
    if (action.status === 'REGISTRATION_OPEN') {
      // 发布/重新开放前必须至少有一个组别，否则学校端无法选择组别报名。
      const groups = await eventApi.groups(row.id)
      if (!groups.items.length) {
        ElMessage.warning('该赛事尚未配置组别，请先在「组别配置」中新增组别')
        return
      }
    }
    await eventApi.update(row.id, {
      ...baseEventPayload(row),
      status: action.status,
      version: row.version,
    })
    ElMessage.success(
      action.status === 'REGISTRATION_OPEN' ? '赛事已发布，报名入口已开放' : '赛事报名已关闭',
    )
    await load()
  } catch (error) {
    if (httpStatusOf(error) === 409) {
      ElMessage.warning('赛事状态已变化，请刷新后重试')
      await load()
    }
  } finally {
    changingStatusId.value = ''
  }
}

function openRegistration(row: Event) {
  router.push({ name: 'portal-registration', query: { eventId: row.id } })
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
  editingGroupVersion.value = 0
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
  editingGroupVersion.value = group.version
  Object.assign(groupForm, {
    name: group.name,
    category: group.category,
    gender: group.gender,
    quota: group.quota ?? 16,
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
      await eventApi.updateGroup(currentEvent.value.id, editingGroupId.value, {
        ...groupForm,
        version: editingGroupVersion.value,
      })
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
        <el-select
          v-model="levelFilter"
          placeholder="全部级别"
          clearable
          style="width: 150px"
          @change="search"
        >
          <el-option
            v-for="level in EVENT_LEVELS"
            :key="level.value"
            :label="level.label"
            :value="level.value"
          />
        </el-select>
        <el-button type="primary" plain @click="search">查询</el-button>
      </FilterBar>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="赛事" min-width="260">
          <template #default="{ row }">
            <div class="event-cell">
              <span class="event-cell__mark">{{ row.name.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.name }}</strong>
                <small>
                  {{ row.season }} ·
                  <el-tag size="small" effect="plain">{{ eventLevelLabel(row.eventCategory) }}</el-tag>
                </small>
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
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.status" kind="event" /></template>
        </el-table-column>
        <el-table-column label="操作" width="400" fixed="right" align="right" class-name="col-actions">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button link type="primary" :icon="Setting" @click="openGroups(row)">组别配置</el-button>
              <el-button
                v-if="statusActionOf(row)"
                link
                :type="statusActionOf(row)!.type"
                :loading="changingStatusId === row.id"
                @click="changeStatus(row, statusActionOf(row)!)"
              >
                {{ statusActionOf(row)!.label }}
              </el-button>
              <el-button link type="primary" @click="openRegistration(row)">报名页</el-button>
              <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" :icon="Delete" @click="removeEvent(row)">删除</el-button>
            </div>
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
            <div><dt>组别总名额</dt><dd>{{ (group.quota ?? 0) > 0 ? group.quota : '不限' }}</dd></div>
            <div>
              <dt>已报名</dt>
              <dd>{{ group.teamCount ?? group.totalUsed ?? '—' }}<template v-if="group.teamCount != null || group.totalUsed != null"> 队</template></dd>
            </div>
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
          <el-form-item label="赛事层级">
            <el-select
              v-model="eventForm.eventCategory"
              filterable
              allow-create
              default-first-option
              placeholder="请选择省级 / 市级 / 学校级"
              style="width: 100%"
            >
              <el-option
                v-for="level in EVENT_LEVELS"
                :key="level.value"
                :label="level.label"
                :value="level.value"
              />
            </el-select>
            <span class="field-hint">层级用于门户报名页与统计筛选；历史自定义编码可保留。</span>
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
              <el-option label="中学" value="MIDDLE" />
            </el-select>
          </el-form-item>
          <el-form-item label="性别">
            <el-select v-model="groupForm.gender" style="width: 100%">
              <el-option label="男子" value="MALE" />
              <el-option label="女子" value="FEMALE" />
              <el-option label="混合" value="MIXED" />
            </el-select>
          </el-form-item>
          <el-form-item label="组别总名额（队）">
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

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  white-space: nowrap;
}

.row-actions :deep(.el-button) {
  margin-left: 0;
  padding: 0;
  font-size: 12.5px;
  font-weight: 500;
}

:deep(.col-actions .cell) {
  overflow: visible;
  white-space: nowrap;
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

.field-hint {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--ink-300);
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
