<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ArrowRight, CircleCheck, Clock, Plus, Refresh, Trophy, User } from '@element-plus/icons-vue'
import { enrollmentApi, meApi, teamApi } from '../../api'
import type { Enrollment, GroupCategory, Team } from '../../api/types'
import { useAuthStore } from '../../stores/auth'
import { CATEGORY_GROUP_LABELS } from '../../config/labels'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const loadError = ref('')
const teams = ref<Team[]>([])
const enrollments = ref<Enrollment[]>([])
const createVisible = ref(false)
const creating = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  name: '',
  category: 'MIDDLE' as GroupCategory,
  gender: 'MALE' as 'MALE' | 'FEMALE' | 'MIXED',
  campusName: '',
  intro: '',
})

const rules: FormRules = {
  name: [{ required: true, message: '请输入球队名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择参赛组别', trigger: 'change' }],
  gender: [{ required: true, message: '请选择球队性别', trigger: 'change' }],
}

const isSchoolAccount = computed(() => auth.roles.includes('UNIVERSITY'))
const genderOptions = [
  { value: 'MALE', label: '男子' },
  { value: 'FEMALE', label: '女子' },
  { value: 'MIXED', label: '混合' },
]

const categoryOptions = Object.entries(CATEGORY_GROUP_LABELS).map(([value, label]) => ({
  value: value as GroupCategory,
  label,
}))

const memberTotal = computed(() =>
  teams.value.reduce((sum, team) => sum + (team.memberCount || 0), 0),
)
const approvedCount = computed(() => teams.value.filter((team) => team.status === 'APPROVED').length)
const pendingCount = computed(() => teams.value.filter((team) => team.status !== 'APPROVED').length)

/** 每支球队只展示最近更新的一条报名，避免学校端在多支球队之间反复切换查询。 */
const latestEnrollment = computed(() => {
  const map = new Map<string, Enrollment>()
  for (const item of enrollments.value) {
    const prev = map.get(item.teamId)
    if (!prev || (item.updatedAt || '') > (prev.updatedAt || '')) map.set(item.teamId, item)
  }
  return map
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [teamRes, enrollmentRes] = await Promise.allSettled([
      meApi.teams(),
      enrollmentApi.list({ page: 1, pageSize: 200 }),
    ])
    if (teamRes.status === 'fulfilled') {
      teams.value = teamRes.value
    } else {
      // 球队是页面主体；失败时保留上次成功的数据并给出可重试的错误态。
      loadError.value = '本校球队加载失败，请检查网络后重试'
    }
    // 报名只是「最新报名」列的补充信息，失败不应连带清空球队列表。
    if (enrollmentRes.status === 'fulfilled') {
      enrollments.value = enrollmentRes.value.items
    } else {
      enrollments.value = []
    }
  } finally {
    loading.value = false
  }
}

function openCreate() {
  if (!isSchoolAccount.value) return ElMessage.warning('仅学校账号可新建本校球队')
  form.name = ''
  form.category = 'MIDDLE'
  form.gender = 'MALE'
  form.campusName = ''
  form.intro = ''
  createVisible.value = true
}

async function createTeam() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  if (!auth.user?.orgId) return ElMessage.warning('当前账号未绑定学校，无法创建球队')
  creating.value = true
  try {
    const created = await teamApi.create({
      name: form.name.trim(),
      schoolOrgId: auth.user.orgId,
      groupCategory: form.category,
      gender: form.gender,
      campusName: form.campusName.trim() || undefined,
      intro: form.intro || undefined,
    })
    ElMessage.success('球队已创建，可继续完善名单与材料')
    createVisible.value = false
    await load()
    router.push(`/console/team/profile?teamId=${created.id}`)
  } catch {
    // 拦截器提示
  } finally {
    creating.value = false
  }
}

function groupLabel(category?: GroupCategory | string) {
  return category ? CATEGORY_GROUP_LABELS[category as GroupCategory] || category : '—'
}

function goTeam(team: Team) {
  router.push(`/console/team/profile?teamId=${team.id}`)
}

function goMembers(team: Team) {
  router.push(`/console/team/members?teamId=${team.id}`)
}

function goMaterials(team: Team) {
  router.push(`/console/team/profile?tab=materials&teamId=${team.id}`)
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="本校球队"
      description="学校是报名报送主体，统一管理本校及分校区球队；所有校区共用学校名额。球队端账号只能维护所属球队。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="isSchoolAccount" type="primary" :icon="Plus" @click="openCreate">新建球队</el-button>
      </template>
    </PageHeader>

    <section class="school-scope page-card">
      <div class="school-scope__body">
        <span class="school-scope__eyebrow">学校端 · 数据范围</span>
        <h2>{{ auth.user?.orgName || teams[0]?.schoolName || '本校' }}</h2>
        <p>
          仅可查看和维护本校球队、球员、报名与材料。分校/校区作为球队属性管理，与本校共享同一学校名额；切换球队后，球员名单、教练团队和球队材料会同步切换。
        </p>
      </div>
      <div class="school-scope__meta">
        <span>本校球队<strong class="num">{{ teams.length }}</strong></span>
        <span>在册球员<strong class="num">{{ memberTotal }}</strong></span>
      </div>
    </section>

    <div class="stat-grid">
      <StatCard label="球队总数" :value="teams.length" hint="本校各学段球队" :icon="Trophy" tone="green" />
      <StatCard label="在册球员" :value="memberTotal" hint="各队球员合计" :icon="User" tone="lime" />
      <StatCard label="已认证" :value="approvedCount" hint="资料完整的球队" :icon="CircleCheck" tone="blue" />
      <StatCard label="待认证" :value="pendingCount" hint="需补充资料的球队" :icon="Clock" tone="amber" />
    </div>

    <el-alert
      v-if="loadError && teams.length"
      class="load-error"
      type="warning"
      show-icon
      :closable="false"
      :title="loadError"
    >
      <el-button link type="primary" :icon="Refresh" @click="load">重试</el-button>
    </el-alert>

    <section v-loading="loading" class="page-card page-card--flush">
      <el-table :data="teams" style="width: 100%">
        <el-table-column label="球队" min-width="240">
          <template #default="{ row }">
            <button type="button" class="team-cell" @click="goTeam(row)">
              <span class="team-cell__avatar">{{ row.name.slice(0, 1) }}</span>
              <span class="team-cell__body">
                <strong>{{ row.name }}</strong>
                <small>{{ row.campusName || '本部' }} · {{ row.gender === 'FEMALE' ? '女子' : row.gender === 'MIXED' ? '混合' : '男子' }} · {{ row.cityName || '未设置市州' }}</small>
              </span>
              <el-icon class="team-cell__arrow"><ArrowRight /></el-icon>
            </button>
          </template>
        </el-table-column>

        <el-table-column label="校区 / 分校" width="130">
          <template #default="{ row }">
            <span>{{ row.campusName || '本部' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="学段 / 组别" width="120">
          <template #default="{ row }">
            <span>{{ groupLabel(row.category) }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="coachName" label="主教练" width="120">
          <template #default="{ row }">
            <span>{{ row.coachName || '未设置' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="球员" width="80" align="center">
          <template #default="{ row }">
            <span class="num">{{ row.memberCount || 0 }}</span>
          </template>
        </el-table-column>

        <el-table-column label="认证状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'APPROVED' ? 'success' : 'warning'" effect="plain" size="small">
              {{ row.status === 'APPROVED' ? '已认证' : '待认证' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="最新报名" width="130">
          <template #default="{ row }">
            <StatusTag
              v-if="latestEnrollment.get(row.id)"
              :status="latestEnrollment.get(row.id)!.status"
              kind="enrollment"
            />
            <span v-else class="muted">未报名</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="212" fixed="right" align="right" class-name="col-actions">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button link type="primary" @click="goTeam(row)">球队资料</el-button>
              <el-button link type="primary" @click="goMembers(row)">球员名单</el-button>
              <el-button link type="primary" @click="goMaterials(row)">球队材料</el-button>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty v-if="loadError" :description="loadError" :image-size="90">
            <el-button type="primary" plain :icon="Refresh" @click="load">重新加载</el-button>
          </el-empty>
          <el-empty v-else description="本校还没有球队" :image-size="90">
            <el-button v-if="isSchoolAccount" type="primary" plain :icon="Plus" @click="openCreate">创建第一支球队</el-button>
          </el-empty>
        </template>
      </el-table>
    </section>

    <el-dialog v-model="createVisible" title="新建球队" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="球队归属当前学校"
          :description="
            auth.user?.orgName ||
            teams[0]?.schoolName ||
            (auth.user?.orgId ? '本校' : '当前账号未绑定学校')
          "
        />
        <el-form-item label="球队名称" prop="name">
          <el-input v-model="form.name" placeholder="如：成都七中初中男子足球队" />
        </el-form-item>
        <el-form-item label="参赛组别" prop="category">
          <el-select v-model="form.category" style="width: 100%">
            <el-option
              v-for="item in categoryOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="球队性别" prop="gender">
          <el-select v-model="form.gender" style="width: 100%">
            <el-option v-for="item in genderOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="校区 / 分校（选填）">
          <el-input v-model="form.campusName" placeholder="如：水井坊校区；不填视为本部" maxlength="30" />
        </el-form-item>
        <el-form-item label="球队简介">
          <el-input
            v-model="form.intro"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="可介绍球队历史、训练情况与参赛成绩（选填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createTeam">创建球队</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.load-error {
  margin-bottom: 12px;
}

.school-scope {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  background: linear-gradient(110deg, #fff 0%, var(--brand-50) 100%);
}

.school-scope__body {
  min-width: 0;
}

.school-scope__eyebrow {
  font-size: 11px;
  font-weight: 600;
  color: var(--brand-700);
}

.school-scope h2 {
  margin-top: 5px;
  font-size: 20px;
  color: var(--ink-900);
}

.school-scope p {
  max-width: 720px;
  margin-top: 6px;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ink-500);
}

.school-scope__meta {
  display: flex;
  flex-shrink: 0;
  gap: 26px;
}

.school-scope__meta span {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--ink-500);
}

.school-scope__meta strong {
  font-size: 24px;
  line-height: 1;
  color: var(--brand-800);
}

.team-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.team-cell__avatar {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 14px;
  font-weight: 700;
}

.team-cell__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 3px;
}

.team-cell__body strong {
  overflow: hidden;
  font-size: 13px;
  color: var(--ink-900);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.team-cell__body small {
  overflow: hidden;
  font-size: 10.5px;
  color: var(--ink-500);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.team-cell__arrow {
  flex-shrink: 0;
  color: var(--ink-300);
  font-size: 12px;
}

.team-cell:hover .team-cell__body strong {
  color: var(--brand-700);
}

/* 操作列：三个入口固定单行右对齐，避免链接换行后错位 */
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

@media (max-width: 900px) {
  .school-scope {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }

  .school-scope__meta {
    gap: 32px;
  }
}
</style>
