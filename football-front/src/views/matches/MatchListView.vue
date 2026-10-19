<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Monitor, Plus, Refresh, Search, VideoCamera } from '@element-plus/icons-vue'
import { eventApi, matchApi, teamApi } from '../../api'
import type { Event, EventGroup, Match, Team } from '../../api/types'
import { usePermission } from '../../composables/usePermission'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const router = useRouter()
const { can } = usePermission()
const loading = ref(false)
const rows = ref<Match[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const events = ref<Event[]>([])
const teams = ref<Team[]>([])
const groups = ref<EventGroup[]>([])
const createVisible = ref(false)
const creating = ref(false)

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
})

async function load() {
  loading.value = true
  try {
    const res = await matchApi.list({
      page: page.value,
      pageSize: pageSize.value,
      eventId: filters.eventId || undefined,
      status: filters.status || undefined,
      keyword: filters.keyword || undefined,
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
  try {
    const [eventRes, teamRes] = await Promise.all([
      eventApi.list({ page: 1, pageSize: 50 }),
      teamApi.list({ page: 1, pageSize: 100 }),
    ])
    events.value = eventRes.items
    teams.value = teamRes.items
  } catch {
    events.value = []
    teams.value = []
  }
}

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

function openCreate() {
  form.eventId = filters.eventId || events.value[0]?.id || ''
  form.groupId = ''
  form.homeTeamId = ''
  form.awayTeamId = ''
  form.kickoffAt = ''
  form.venue = ''
  form.stage = ''
  createVisible.value = true
  loadGroups()
}

async function create() {
  if (!form.eventId || !form.groupId) return ElMessage.warning('请选择赛事与组别')
  if (!form.homeTeamId || !form.awayTeamId) return ElMessage.warning('请选择对阵双方')
  if (form.homeTeamId === form.awayTeamId) return ElMessage.warning('对阵双方不能相同')
  if (!form.kickoffAt) return ElMessage.warning('请选择开赛时间')
  creating.value = true
  try {
    await matchApi.create({ ...form })
    ElMessage.success('比赛已创建')
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
      await matchApi.unpublish(row.id)
      ElMessage.success('已取消发布')
    } else {
      await matchApi.publish(row.id)
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
    await matchApi.remove(row.id)
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
      title="比赛管理"
      eyebrow="MATCH OPERATIONS"
      description="查看赛程与赛果。记录员进入记录台提交进球、判罚、换人事件，并维护图文直播。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="canManage" type="primary" :icon="Plus" @click="openCreate">新建比赛</el-button>
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
          placeholder="搜索球队"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" plain @click="search">查询</el-button>
        <span class="filter-bar__spacer" />
        <span class="muted">共 {{ total }} 场比赛</span>
      </div>

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
        <el-table-column label="操作" width="260" fixed="right">
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
            <el-button link type="primary" @click="router.push(`/matches/${row.id}`)">门户预览</el-button>
            <el-button v-if="canPublish" link :type="row.published ? 'warning' : 'success'" @click="togglePublish(row)">
              {{ row.published ? '取消发布' : '发布' }}
            </el-button>
            <el-button v-if="canManage" link type="danger" @click="removeMatch(row)">删除</el-button>
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

    <section v-if="canManage" class="broadcast-banner">
      <span class="broadcast-banner__icon"><el-icon :size="20"><VideoCamera /></el-icon></span>
      <div>
        <strong>比赛记录台</strong>
        <p>点击比赛行的「记录台」进入移动端记录界面，可提交进球、红黄牌、换人事件与图文直播。</p>
      </div>
      <el-button type="primary" plain size="small" @click="router.push('/console/identity')">身份核验</el-button>
    </section>

    <el-dialog v-model="createVisible" title="新建比赛" width="600px">
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
              <el-option v-for="team in teams" :key="team.id" :label="team.name" :value="team.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="客队">
            <el-select v-model="form.awayTeamId" placeholder="选择客队" filterable style="width: 100%">
              <el-option v-for="team in teams" :key="team.id" :label="team.name" :value="team.id" />
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
        </div>
        <el-form-item label="比赛场地">
          <el-input v-model="form.venue" placeholder="如：成都市青羊区体育中心 1 号场" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="create">创建比赛</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
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
  padding: 18px 22px;
  border-radius: 16px;
  background: linear-gradient(135deg, #075c40, #064a35);
  color: #fff;
}

.broadcast-banner__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(200, 241, 105, 0.14);
  color: var(--lime);
}

.broadcast-banner div {
  flex: 1;
}

.broadcast-banner strong {
  font-size: 13.5px;
}

.broadcast-banner p {
  margin-top: 3px;
  font-size: 10.5px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.5);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
