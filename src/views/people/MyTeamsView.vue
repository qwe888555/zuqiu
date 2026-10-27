<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Location, Plus, Refresh, User, UserFilled } from '@element-plus/icons-vue'
import { meApi, teamApi } from '../../api'
import { MOCK_ENABLED } from '../../api/http'
import type { MyAffiliation, Team } from '../../api/types'
import { categoryLabel } from '../../config/labels'
import { httpStatusOf } from '../../utils/httpError'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const loading = ref(false)
const teams = ref<Team[]>([])
const affiliations = ref<MyAffiliation[]>([])
const affiliationTotal = ref(0)
const allTeams = ref<Team[]>([])
const dialogVisible = ref(false)
const saving = ref(false)
/** 账号未绑定人员档案时 /me/teams 返回业务 404。 */
const teamsUnavailable = ref(false)

const pageDescription = computed(() =>
  MOCK_ENABLED
    ? '查看当前账号关联的球队，并维护归属关系。归属记录用于报名资格审查与履历档案。'
    : '查看当前账号已核验的现役球队。历史归属记录的查询与维护功能将在后续版本开放。',
)

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
    const [teamResult] = await Promise.allSettled([meApi.teams({ silentError: true })])
    if (teamResult.status === 'fulfilled') {
      teams.value = teamResult.value
      teamsUnavailable.value = false
    } else {
      teams.value = []
      teamsUnavailable.value = httpStatusOf(teamResult.reason) === 404
    }

    // 归属记录接口当前后端尚未提供，线上模式不再发起必然 404 的请求；
    // 演示 mock 模式仍保留完整的归属维护能力。
    if (MOCK_ENABLED) {
      try {
        const affiliationRes = await meApi.affiliations(
          { page: 1, pageSize: 100 },
          { silentError: true },
        )
        affiliations.value = affiliationRes.items
        affiliationTotal.value = affiliationRes.total
      } catch {
        affiliations.value = []
        affiliationTotal.value = 0
      }
    } else {
      affiliations.value = []
      affiliationTotal.value = 0
    }
  } finally {
    loading.value = false
  }
}

async function loadAllTeams() {
  try {
    const res = await teamApi.list({ page: 1, pageSize: 200 })
    allTeams.value = res.items
  } catch {
    allTeams.value = []
  }
}

function openCreate() {
  form.teamId = allTeams.value[0]?.id || ''
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
  if (MOCK_ENABLED) loadAllTeams()
})
</script>

<template>
  <div class="page">
    <PageHeader title="我的球队" :description="pageDescription">
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="MOCK_ENABLED" type="primary" :icon="Plus" @click="openCreate">新增归属</el-button>
      </template>
    </PageHeader>

    <div v-loading="loading" class="team-grid">
      <article v-for="team in teams" :key="team.id" class="team-card">
        <div class="team-card__hero">
          <span class="team-card__badge">{{ team.name.slice(0, 1) }}</span>
          <el-tag :type="team.status === 'APPROVED' ? 'success' : 'warning'" size="small" effect="plain">
            {{ team.status === 'APPROVED' ? '已认证' : '待认证' }}
          </el-tag>
        </div>
        <h3>{{ team.name }}</h3>
        <p>{{ team.schoolName || '学校未登记' }}</p>
        <div class="team-card__meta">
          <span><el-icon><Location /></el-icon>{{ team.cityName || '市州未设置' }}</span>
          <span><el-icon><User /></el-icon>{{ team.category ? categoryLabel(team.category) : '学段未设置' }}</span>
          <span><el-icon><UserFilled /></el-icon>{{ team.memberCount || 0 }} 名球员</span>
        </div>
        <div v-if="team.intro" class="team-card__intro">{{ team.intro }}</div>
        <div class="team-card__foot">
          <span class="muted">主教练 {{ team.coachName || '未设置' }}</span>
        </div>
      </article>
      <el-empty
        v-if="!loading && !teams.length"
        :description="
          teamsUnavailable
            ? '当前账号未绑定人员档案，请联系管理员'
            : MOCK_ENABLED
              ? '当前账号暂未关联球队，可在下方新增归属'
              : '当前账号暂未关联球队'
        "
        :image-size="90"
      />
    </div>

    <el-alert
      v-if="MOCK_ENABLED"
      class="affiliation-alert"
      type="info"
      :closable="false"
      show-icon
      title="归属关系需经球队或管理员核验"
      description="同一人员可同时隶属于多支球队（如校队与市州代表队）。核验通过后，归属关系会体现在报名名单与遴选档案中。"
    />
    <el-alert
      v-else
      class="affiliation-alert"
      type="info"
      :closable="false"
      show-icon
      title="归属记录暂未开放"
      description="当前版本仅展示已核验的现役球队；历史归属记录的查询与维护将在后续版本开放。"
    />

    <section v-if="MOCK_ENABLED" class="page-card">
      <div class="section-title">归属记录 <small>共 {{ affiliationTotal }} 条</small></div>
      <el-table v-loading="loading" :data="affiliations" style="width: 100%">
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
      <el-empty v-if="!loading && !affiliations.length" description="暂无归属记录" :image-size="80" />
    </section>

    <el-dialog v-model="dialogVisible" title="新增球队归属" width="520px">
      <el-form :model="form" label-position="top">
        <el-form-item label="所属球队" required>
          <el-select v-model="form.teamId" filterable placeholder="选择球队" style="width: 100%">
            <el-option v-for="team in allTeams" :key="team.id" :label="team.name" :value="team.id" />
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
.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.team-card {
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: #fff;
}

.team-card__hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.team-card__badge {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  background: var(--brand-700);
  color: #fff;
  font-size: 19px;
  font-weight: 700;
}

.team-card h3 {
  margin-top: 14px;
  font-size: 16px;
}

.team-card > p {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.team-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
  padding: 11px 12px;
  border-radius: 9px;
  background: var(--paper);
}

.team-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--ink-500);
}

.team-card__intro {
  margin-top: 12px;
  font-size: 10.5px;
  line-height: 1.8;
  color: var(--ink-500);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.team-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.team-card__foot .muted {
  font-size: 10px;
}

.affiliation-alert {
  margin-bottom: 14px;
}

.section-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13.5px;
  font-weight: 600;
}

.section-title small {
  font-size: 10px;
  font-weight: 400;
  color: var(--ink-300);
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
