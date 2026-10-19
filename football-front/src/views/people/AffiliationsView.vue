<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Refresh } from '@element-plus/icons-vue'
import { meApi, teamApi } from '../../api'
import type { MyAffiliation, Team } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const loading = ref(false)
const rows = ref<MyAffiliation[]>([])
const total = ref(0)
const teams = ref<Team[]>([])
const dialogVisible = ref(false)
const saving = ref(false)

const form = reactive({
  teamId: '',
  relation: '运动员',
  startDate: '',
  current: true,
})

const relations = ['运动员', '教练员', '领队', '队医', '工作人员']

async function load() {
  loading.value = true
  try {
    const res = await meApi.affiliations({ page: 1, pageSize: 100 })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadTeams() {
  try {
    const res = await teamApi.list({ page: 1, pageSize: 200 })
    teams.value = res.items
  } catch {
    teams.value = []
  }
}

function openCreate() {
  form.teamId = teams.value[0]?.id || ''
  form.relation = '运动员'
  form.startDate = dayjs().format('YYYY-MM-DD')
  form.current = true
  dialogVisible.value = true
}

async function create() {
  if (!form.teamId) return ElMessage.warning('请选择所属球队')
  saving.value = true
  try {
    await meApi.addAffiliation({
      teamId: form.teamId,
      relation: form.relation,
      startDate: form.startDate,
      current: form.current,
    })
    ElMessage.success('归属记录已提交，等待核验')
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function endAffiliation(row: MyAffiliation) {
  try {
    await ElMessageBox.confirm(`确认结束在「${row.teamName}」的${row.relation}归属？`, '结束归属', {
      confirmButtonText: '确认结束',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await meApi.updateAffiliation(row.id, {
      current: false,
      endDate: dayjs().format('YYYY-MM-DD'),
    })
    ElMessage.success('归属已结束')
    await load()
  } catch {
    // 取消
  }
}

async function removeAffiliation(row: MyAffiliation) {
  try {
    await ElMessageBox.confirm('确认删除该归属记录？删除后不可恢复。', '删除记录', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await meApi.removeAffiliation(row.id)
    ElMessage.success('记录已删除')
    await load()
  } catch {
    // 取消
  }
}

onMounted(() => {
  load()
  loadTeams()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="所属队伍"
      eyebrow="TEAM AFFILIATIONS"
      description="维护与球队的历史归属关系。当前归属将用于报名资格审查，历史记录用于教练员与运动员履历。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增归属</el-button>
      </template>
    </PageHeader>

    <el-alert
      class="affiliation-alert"
      type="info"
      :closable="false"
      show-icon
      title="归属关系需经球队或管理员核验"
      description="同一人员可同时隶属于多支球队（如校队与市州代表队）。核验通过后，归属关系会体现在报名名单与遴选档案中。"
    />

    <section class="page-card">
      <div class="section-title">归属记录 <small>共 {{ total }} 条</small></div>
      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="球队" min-width="220">
          <template #default="{ row }">
            <div class="team-cell">
              <span class="team-cell__badge">{{ row.teamName.slice(0, 1) }}</span>
              <strong>{{ row.teamName }}</strong>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="relation" label="身份" width="110" />
        <el-table-column label="归属时间" width="220">
          <template #default="{ row }">
            <span class="muted">
              {{ row.startDate || '未登记' }} 至 {{ row.current ? '至今' : row.endDate || '未登记' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="当前" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.current" type="success" size="small" effect="plain">当前</el-tag>
            <span v-else class="muted">历史</span>
          </template>
        </el-table-column>
        <el-table-column label="核验状态" width="110">
          <template #default="{ row }"><StatusTag :status="row.verifyStatus" kind="review" /></template>
        </el-table-column>
        <el-table-column label="操作" width="170" align="right">
          <template #default="{ row }">
            <el-button v-if="row.current" link type="primary" @click="endAffiliation(row)">结束归属</el-button>
            <el-button link type="danger" :icon="Delete" @click="removeAffiliation(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" description="暂无归属记录" :image-size="80" />
    </section>

    <el-dialog v-model="dialogVisible" title="新增球队归属" width="520px">
      <el-form :model="form" label-position="top">
        <el-form-item label="所属球队" required>
          <el-select v-model="form.teamId" filterable placeholder="选择球队" style="width: 100%">
            <el-option v-for="team in teams" :key="team.id" :label="team.name" :value="team.id" />
          </el-select>
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="队内身份">
            <el-select v-model="form.relation" style="width: 100%">
              <el-option v-for="relation in relations" :key="relation" :label="relation" :value="relation" />
            </el-select>
          </el-form-item>
          <el-form-item label="加入日期">
            <el-date-picker
              v-model="form.startDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
        </div>
        <el-checkbox v-model="form.current">当前仍在该球队</el-checkbox>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="create">提交归属</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.affiliation-alert {
  margin-bottom: 2px;
}

.team-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.team-cell__badge {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.team-cell strong {
  font-size: 12.5px;
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
