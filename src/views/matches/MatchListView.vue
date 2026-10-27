<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Monitor, Plus, Refresh, Search, VideoCamera } from '@element-plus/icons-vue'
import { eventApi, matchApi, teamApi } from '../../api'
import type { Event, EventGroup, Match, Team } from '../../api/types'
import { usePermission } from '../../composables/usePermission'
import { useAuthStore } from '../../stores/auth'
import { MOCK_ENABLED } from '../../api/http'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const router = useRouter()
const auth = useAuthStore()
const { can } = usePermission()
const loading = ref(false)
const rows = ref<Match[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const events = ref<Event[]>([])
const teams = ref<Team[]>([])
/** 球队数据范围一期仅 ADMIN；非管理员不再请求，避免必然 403 的全局错误提示。 */
const teamsUnavailable = ref(false)
/** 编辑已有对阵时用行上的队名回显，球队下拉不可用时也不会只剩 ID。 */
const editingTeams = ref<{ id: string; name: string }[]>([])
const groups = ref<EventGroup[]>([])
const createVisible = ref(false)
const creating = ref(false)
const editingId = ref('')
const editingVersion = ref(0)

const filters = reactive({ eventId: '', status: '', keyword: '' })

const canManage = computed(() => can('match.manage'))
const canRecord = computed(() => can('match.record'))
const canPublish = computed(() => can('match.publish'))

const statusOptions = [
  { value: 'SCHEDULED', label: '未开赛' },
  { value: 'LIVE', label: '进行中' },
  { value: 'FINISHED', label: '已结束' },
  { value: 'CANCELLED', label: '已取消' },
]

const form = reactive({
  eventId: '',
  groupId: '',
  homeTeamId: '',
  awayTeamId: '',
  kickoffAt: '',
  venue: '',
  stage: '',
  status: 'SCHEDULED',
  referees: [] as { name: string; role: string; level?: string }[],
})

// 后端只接受岗位枚举，展示名在 labels 中映射。
const refereeRoles = [
  { value: 'REFEREE', label: '主裁判' },
  { value: 'ASSISTANT', label: '助理裁判' },
  { value: 'FOURTH_OFFICIAL', label: '第四官员' },
  { value: 'OTHER', label: '比赛监督' },
]

async function load() {
  loading.value = true
  try {
    const res = await matchApi.list({
      page: page.value,
      pageSize: pageSize.value,
      eventId: filters.eventId || undefined,
      status: filters.status || undefined,
      // 成员5 对阵列表支持 teamName 模糊筛选，没有 keyword 参数。
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

async function loadBase() {
  // 赛事只读对所有业务角色开放；球队列表一期仍受 ADMIN 数据范围限制。
  // 两者必须独立降级，且非管理员不再发必然 403 的球队请求。
  try {
    const res = await eventApi.list({ page: 1, pageSize: 50 })
    events.value = res.items
  } catch {
    events.value = []
  }

  teamsUnavailable.value = !MOCK_ENABLED && !auth.isAdmin
  if (teamsUnavailable.value) {
    teams.value = []
    return
  }
  try {
    const res = await teamApi.list({ page: 1, pageSize: 100 })
    teams.value = res.items
  } catch {
    teams.value = []
    teamsUnavailable.value = true
  }
}

const teamOptions = computed(() => (teamsUnavailable.value ? editingTeams.value : teams.value))

async function loadGroups() {
  groups.value = []
  form.groupId = ''
  if (!form.eventId) return
  try {
    const res = await eventApi.groups(form.eventId)
    groups.value = res.items
  } catch {
    groups.value = []
  }
}

function search() {
  page.value = 1
  load()
}

function resetForm() {
  form.eventId = filters.eventId || events.value[0]?.id || ''
  form.groupId = ''
  form.homeTeamId = ''
  form.awayTeamId = ''
  form.kickoffAt = ''
  form.venue = ''
  form.stage = ''
  form.status = 'SCHEDULED'
  form.referees = []
  editingId.value = ''
  editingVersion.value = 0
  editingTeams.value = []
}

function openCreate() {
  resetForm()
  createVisible.value = true
  loadGroups()
}

async function openEdit(row: Match) {
  editingId.value = row.id
  editingVersion.value = row.version
  editingTeams.value = [
    { id: row.homeTeamId, name: row.homeTeamName },
    { id: row.awayTeamId, name: row.awayTeamName },
  ]
  form.eventId = row.eventId
  form.homeTeamId = row.homeTeamId
  form.awayTeamId = row.awayTeamId
  form.kickoffAt = dayjs(row.kickoffAt).format('YYYY-MM-DDTHH:mm:ssZ')
  form.venue = row.venue || ''
  form.stage = row.stage || ''
  form.status = row.status
  form.referees = (row.referees || []).map((referee) => ({ ...referee }))
  createVisible.value = true
  await loadGroups()
  form.groupId = row.groupId
}

function addReferee() {
  form.referees.push({ name: '', role: 'REFEREE', level: '' })
}

async function saveMatch() {
  if (!form.eventId || !form.groupId) return ElMessage.warning('请选择赛事与组别')
  if (!form.homeTeamId || !form.awayTeamId) return ElMessage.warning('请选择对阵双方')
  if (form.homeTeamId === form.awayTeamId) return ElMessage.warning('对阵双方不能相同')
  if (!form.kickoffAt) return ElMessage.warning('请选择开赛时间')
  creating.value = true
  const payload = {
    ...form,
    referees: form.referees.filter((referee) => referee.name.trim()),
  }
  try {
    if (editingId.value) {
      await matchApi.update(editingId.value, { ...payload, version: editingVersion.value })
      ElMessage.success('比赛信息已更新')
    } else {
      await matchApi.create(payload)
      ElMessage.success('比赛已创建')
    }
    createVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    creating.value = false
  }
}

async function togglePublish(row: Match) {
  try {
    if (row.published) {
      const { value } = await ElMessageBox.prompt(
        '下线后该对阵将从门户移除，请填写下线原因（会写入审计日志）。',
        '下线对阵',
        {
          confirmButtonText: '确认下线',
          cancelButtonText: '取消',
          type: 'warning',
          inputType: 'textarea',
          inputPlaceholder: '例如：开球时间调整，重新编排',
          inputValidator: (val) => (val && val.trim().length >= 2 ? true : '请填写下线原因'),
        },
      )
      await matchApi.unpublish(row.id, row.version, value.trim())
      ElMessage.success('已下线该对阵')
    } else {
      await matchApi.publish(row.id, row.version)
      ElMessage.success('比赛已发布至门户')
    }
    await load()
  } catch {
    // 拦截器提示
  }
}

async function removeMatch(row: Match) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.homeTeamName} vs ${row.awayTeamName}」？该操作不可恢复。`, '删除比赛', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await matchApi.remove(row.id, row.version)
    ElMessage.success('比赛已删除')
    await load()
  } catch {
    // 取消
  }
}

onMounted(() => {
  load()
  loadBase()
})
</script>

<template>
  <div class="page">
    <PageHeader
      :title="canManage ? '比赛管理' : '赛程与比分'"
      :description="
        canManage
          ? '查看赛程与赛果。记录员进入记录台提交进球、判罚、换人事件，并维护图文直播。'
          : '查看本赛季赛程、对阵与已发布赛果；比赛记录由赛事记录员现场完成。'
      "
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="canManage" type="primary" :icon="Plus" @click="openCreate">新建比赛</el-button>
      </template>
    </PageHeader>

    <section class="page-card">
      <FilterBar :summary="'共 ' + total + ' 场比赛'">
        <el-select v-model="filters.eventId" placeholder="全部赛事" clearable @change="search">
          <el-option v-for="event in events" :key="event.id" :label="event.name" :value="event.id" />
        </el-select>
        <el-select v-model="filters.status" placeholder="全部状态" clearable @change="search">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          placeholder="搜索球队"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" plain @click="search">查询</el-button>
      </FilterBar>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="对阵" min-width="260">
          <template #default="{ row }">
            <div class="match-cell">
              <div class="match-cell__teams">
                <strong>{{ row.homeTeamName }}</strong>
                <span class="match-cell__score num">
                  {{ row.status === 'SCHEDULED' ? 'VS' : `${row.homeScore ?? 0} : ${row.awayScore ?? 0}` }}
                </span>
                <strong>{{ row.awayTeamName }}</strong>
              </div>
              <small>{{ row.groupName }} · {{ row.stage || '小组赛' }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="开赛时间" width="150">
          <template #default="{ row }">
            <div class="stack">
              <strong>{{ dayjs(row.kickoffAt).format('MM-DD HH:mm') }}</strong>
              <small>{{ dayjs(row.kickoffAt).format('YYYY') }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="venue" label="比赛场地" min-width="160" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><StatusTag :status="row.status" kind="match" /></template>
        </el-table-column>
        <el-table-column label="门户" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.published" type="success" size="small" effect="plain">已发布</el-tag>
            <span v-else class="muted">未发布</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canRecord"
              link
              type="primary"
              :icon="Monitor"
              @click="router.push(`/console/matches/${row.id}/console`)"
            >
              记录台
            </el-button>
            <el-button v-if="canManage" link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button
              link
              type="primary"
              @click="router.push({ name: 'portal-match-detail', params: { id: row.id }, query: { preview: '1' } })"
            >
              门户预览
            </el-button>
            <el-button v-if="canPublish" link :type="row.published ? 'warning' : 'success'" @click="togglePublish(row)">
              {{ row.published ? '取消发布' : '发布' }}
            </el-button>
            <el-button v-if="canManage" link type="danger" @click="removeMatch(row)">删除</el-button>
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

    <section v-if="canManage" class="broadcast-banner">
      <span class="broadcast-banner__icon"><el-icon :size="20"><VideoCamera /></el-icon></span>
      <div>
        <strong>比赛记录台</strong>
        <p>点击比赛行的「记录台」进入移动端记录界面，可提交进球、红黄牌、换人事件与图文直播。</p>
      </div>
      <el-button type="primary" plain size="small" @click="router.push('/console/identity')">身份核验</el-button>
    </section>

    <el-dialog v-model="createVisible" :title="editingId ? '编辑比赛' : '新建比赛'" width="640px">
      <el-alert
        v-if="teamsUnavailable"
        class="team-scope-alert"
        type="info"
        :closable="false"
        show-icon
        title="球队下拉不可用"
        description="球队档案查询当前仅管理员可用。新建对阵需要先由管理员维护球队档案；编辑已有对阵时仍可保留原有对阵双方。"
      />
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="赛事">
            <el-select v-model="form.eventId" placeholder="选择赛事" style="width: 100%" @change="loadGroups">
              <el-option v-for="event in events" :key="event.id" :label="event.name" :value="event.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="组别">
            <el-select v-model="form.groupId" placeholder="选择组别" style="width: 100%">
              <el-option v-for="group in groups" :key="group.id" :label="group.name" :value="group.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="主队">
            <el-select v-model="form.homeTeamId" placeholder="选择主队" filterable style="width: 100%">
              <el-option v-for="team in teamOptions" :key="team.id" :label="team.name" :value="team.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="客队">
            <el-select v-model="form.awayTeamId" placeholder="选择客队" filterable style="width: 100%">
              <el-option v-for="team in teamOptions" :key="team.id" :label="team.name" :value="team.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="开赛时间">
            <el-date-picker
              v-model="form.kickoffAt"
              type="datetime"
              placeholder="选择日期时间"
              value-format="YYYY-MM-DDTHH:mm:ss+08:00"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="阶段">
            <el-input v-model="form.stage" placeholder="如：小组赛第 2 轮" />
          </el-form-item>
          <el-form-item v-if="editingId" label="比赛状态">
            <el-select v-model="form.status" style="width: 100%">
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="比赛场地">
          <el-input v-model="form.venue" placeholder="如：成都市青羊区体育中心 1 号场" />
        </el-form-item>
        <el-form-item label="裁判信息">
          <div class="referee-list">
            <div v-for="(referee, index) in form.referees" :key="index" class="referee-row">
              <el-input v-model="referee.name" placeholder="姓名" />
              <el-select v-model="referee.role" style="width: 130px">
                <el-option
                  v-for="role in refereeRoles"
                  :key="role.value"
                  :label="role.label"
                  :value="role.value"
                />
              </el-select>
              <el-input v-model="referee.level" placeholder="等级（选填）" style="width: 130px" />
              <el-button link type="danger" :icon="Delete" @click="form.referees.splice(index, 1)" />
            </div>
            <el-button size="small" plain :icon="Plus" @click="addReferee">添加裁判</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="saveMatch">
          {{ editingId ? '保存修改' : '创建比赛' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.team-scope-alert {
  margin-bottom: 14px;
}

.match-cell__teams {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
}

.match-cell__teams strong {
  font-size: 12.5px;
  font-weight: 500;
}

.match-cell__teams strong:last-child {
  text-align: right;
}

.match-cell__score {
  padding: 1px 7px;
  border-radius: 5px;
  background: var(--brand-50);
  color: var(--brand-800);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.match-cell small {
  display: block;
  margin-top: 4px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.stack strong {
  display: block;
  font-size: 12px;
  font-weight: 500;
}

.stack small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.broadcast-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: #fff;
  color: var(--ink-900);
}

.broadcast-banner__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.broadcast-banner div {
  flex: 1;
}

.broadcast-banner strong {
  font-size: 13px;
}

.broadcast-banner p {
  margin-top: 3px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.referee-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.referee-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.referee-row .el-input:first-child {
  flex: 1;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
