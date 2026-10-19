<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  Download,
  OfficeBuilding,
  Plus,
  Refresh,
  Search,
  Trophy,
  User,
  View,
} from '@element-plus/icons-vue'
import { fileApi, materialApi, orgApi, teamApi } from '../../api'
import type { GroupCategory, Match, Material, Organization, Team, TeamCoach, TeamMember } from '../../api/types'
import { CATEGORY_GROUP_LABELS } from '../../config/labels'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const router = useRouter()

const categoryLabels = CATEGORY_GROUP_LABELS

const rows = ref<Team[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(12)
const loading = ref(false)
const cities = ref<Organization[]>([])
const schools = ref<Organization[]>([])
const filters = reactive({ cityOrgId: '', category: '' as '' | GroupCategory, keyword: '' })

const createVisible = ref(false)
const creating = ref(false)
const createForm = reactive({
  name: '',
  orgId: '',
  cityOrgId: '',
  category: 'MIDDLE' as GroupCategory,
  coachName: '',
  intro: '',
})

const drawerVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<Team | null>(null)
const members = ref<TeamMember[]>([])
const coaches = ref<TeamCoach[]>([])
const recentMatches = ref<Match[]>([])
const materials = ref<Material[]>([])
const materialsLoading = ref(false)
const reviewingMaterialId = ref('')
const activeTab = ref('roster')

const citiesCovered = computed(
  () => new Set(rows.value.map((team) => team.cityName).filter(Boolean)).size,
)
const playerCount = computed(() =>
  rows.value.reduce((sum, team) => sum + (team.memberCount || 0), 0),
)
const approvedCount = computed(() => rows.value.filter((team) => team.status === 'APPROVED').length)

async function loadCities() {
  try {
    const res = await orgApi.list({ page: 1, pageSize: 100, orgType: 'CITY' })
    cities.value = res.items
  } catch {
    cities.value = []
  }
}

async function loadSchools() {
  try {
    const res = await orgApi.list({ page: 1, pageSize: 500 })
    schools.value = res.items.filter(
      (org) => org.enabled && (org.orgType === 'SCHOOL' || org.orgType === 'UNIVERSITY'),
    )
  } catch {
    schools.value = []
  }
}

function openCreate() {
  createForm.name = ''
  createForm.orgId = ''
  createForm.cityOrgId = filters.cityOrgId || ''
  createForm.category = 'MIDDLE'
  createForm.coachName = ''
  createForm.intro = ''
  createVisible.value = true
}

async function createTeam() {
  if (!createForm.name.trim()) return ElMessage.warning('请填写球队名称')
  if (!createForm.orgId) return ElMessage.warning('请选择所属学校')
  creating.value = true
  try {
    await teamApi.create({ ...createForm })
    ElMessage.success('球队已创建')
    createVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    creating.value = false
  }
}

async function removeTeam(team: Team) {
  try {
    await ElMessageBox.confirm(
      `确认删除球队「${team.name}」？存在报名或比赛记录时将无法删除。`,
      '删除球队',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    await teamApi.remove(team.id, team.version)
    ElMessage.success('球队已删除')
    drawerVisible.value = false
    await load()
  } catch {
    // 取消
  }
}

async function load() {
  loading.value = true
  try {
    const res = await teamApi.list({
      page: page.value,
      pageSize: pageSize.value,
      cityOrgId: filters.cityOrgId || undefined,
      category: filters.category || undefined,
      keyword: filters.keyword.trim() || undefined,
    })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function resetFilters() {
  filters.cityOrgId = ''
  filters.category = ''
  filters.keyword = ''
  page.value = 1
  load()
}

function changePage(value: number) {
  page.value = value
  load()
}

function categoryLabel(category?: GroupCategory) {
  return category ? categoryLabels[category] : '—'
}

function formatDate(value?: string) {
  return value ? dayjs(value).format('YYYY-MM-DD') : '—'
}

function matchScore(match: Match) {
  if (match.homeScore === undefined || match.awayScore === undefined) return 'VS'
  return `${match.homeScore} : ${match.awayScore}`
}

async function openDetail(team: Team) {
  drawerVisible.value = true
  activeTab.value = 'roster'
  detailLoading.value = true
  detail.value = team
  members.value = []
  coaches.value = []
  recentMatches.value = []
  materials.value = []
  try {
    const [teamDetail, memberRes, coachRes, matchRes] = await Promise.all([
      teamApi.get(team.id),
      teamApi.members(team.id, { page: 1, pageSize: 100 }),
      teamApi.coaches(team.id, { page: 1, pageSize: 100 }),
      teamApi.matches(team.id, { page: 1, pageSize: 6 }),
    ])
    detail.value = teamDetail
    members.value = memberRes.items
    coaches.value = coachRes.items
    recentMatches.value = matchRes.items
  } catch {
    // 拦截器提示
  } finally {
    detailLoading.value = false
  }
  await loadMaterials(team.id)
}

async function loadMaterials(teamId: string) {
  materialsLoading.value = true
  try {
    const res = await materialApi.list({
      page: 1,
      pageSize: 100,
      ownerType: 'TEAM',
      ownerId: teamId,
    })
    materials.value = res.items
  } catch {
    materials.value = []
  } finally {
    materialsLoading.value = false
  }
}

async function reviewMaterial(material: Material, decision: 'APPROVE' | 'REJECT') {
  let reason = ''
  if (decision === 'REJECT') {
    try {
      const { value } = await ElMessageBox.prompt('请填写驳回原因，球队将收到通知并可重新上传。', '驳回材料', {
        confirmButtonText: '确认驳回',
        cancelButtonText: '取消',
        inputPlaceholder: '例如：训练计划缺少教练签字',
        inputValidator: (val) => (val && val.trim().length >= 4 ? true : '请至少填写 4 个字符'),
      })
      reason = value || ''
    } catch {
      return
    }
  }
  reviewingMaterialId.value = material.id
  try {
    await materialApi.review(material.id, {
      decision,
      reason: reason || undefined,
      version: material.version,
    })
    ElMessage.success(decision === 'APPROVE' ? '材料已通过' : '材料已驳回')
    if (detail.value) await loadMaterials(detail.value.id)
  } catch {
    // 拦截器提示
  } finally {
    reviewingMaterialId.value = ''
  }
}

async function downloadMaterial(material: Material) {
  const fileId = material.fileIds?.[0]
  if (!fileId) return ElMessage.warning('该材料暂无可下载文件，请球队重新上传')
  try {
    const downloaded = await fileApi.download(fileId, material.fileName || '球队材料')
    ElMessage.success(downloaded ? '文件已开始下载' : '演示环境已模拟下载，接入后端后将下载真实文件')
  } catch {
    // 拦截器提示
  }
}

function goMatches() {
  drawerVisible.value = false
  router.push('/console/matches')
}

onMounted(async () => {
  await Promise.all([loadCities(), loadSchools(), load()])
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="参赛队伍"
      eyebrow="TOURNAMENT TEAMS"
      description="管理员跨市州查看全省参赛队伍，按市州与组别筛选，进入球队可查看球员、教练与近期赛程。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" plain :icon="Plus" @click="openCreate">新建球队</el-button>
        <el-button type="primary" :icon="Trophy" @click="goMatches">前往赛事编排</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="参赛队伍" :value="total" hint="全省已建档球队" :icon="Trophy" tone="green" />
      <StatCard label="覆盖市州" :value="citiesCovered" hint="当前页统计" :icon="OfficeBuilding" tone="blue" />
      <StatCard label="在册球员" :value="playerCount" hint="当前页球员合计" :icon="User" tone="lime" />
      <StatCard label="已认证" :value="approvedCount" hint="当前页已通过队伍" :icon="User" tone="amber" />
    </div>

    <FilterBar>
      <el-select
        v-model="filters.cityOrgId"
        placeholder="全部市州"
        clearable
        style="width: 170px"
        @change="search"
      >
        <el-option v-for="city in cities" :key="city.id" :label="city.name" :value="city.id" />
      </el-select>
      <el-select
        v-model="filters.category"
        placeholder="全部组别"
        clearable
        style="width: 150px"
        @change="search"
      >
        <el-option label="小学组" value="PRIMARY" />
        <el-option label="初中组" value="MIDDLE" />
        <el-option label="大学组" value="UNIVERSITY" />
      </el-select>
      <el-input
        v-model="filters.keyword"
        placeholder="搜索球队或学校名称"
        clearable
        style="width: 260px"
        :prefix-icon="Search"
        @keyup.enter="search"
        @clear="search"
      />
      <el-button type="primary" :icon="Search" @click="search">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </FilterBar>

    <section class="page-card table-card">
      <el-table v-loading="loading" :data="rows" row-key="id" style="width: 100%">
        <el-table-column label="球队" min-width="260">
          <template #default="{ row }">
            <div class="team-cell">
              <span class="team-mark">{{ row.name.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.name }}</strong>
                <small>{{ row.schoolName || row.shortName || '—' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="cityName" label="市州" width="110" />
        <el-table-column label="组别" width="100">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" round>{{ categoryLabel(row.category) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="coachName" label="主教练" width="110">
          <template #default="{ row }">{{ row.coachName || '—' }}</template>
        </el-table-column>
        <el-table-column label="球员" width="80" align="center">
          <template #default="{ row }">{{ row.memberCount ?? 0 }} 人</template>
        </el-table-column>
        <el-table-column label="认证状态" width="110">
          <template #default="{ row }">
            <StatusTag :status="row.status" kind="review" />
          </template>
        </el-table-column>
        <el-table-column label="建档日期" width="120">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="View" @click="openDetail(row)">查看</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-state">
            <el-icon :size="26"><Trophy /></el-icon>
            <p>当前筛选条件下没有参赛队伍</p>
          </div>
        </template>
      </el-table>

      <div class="pagination-row">
        <span class="pagination-hint">共 {{ total }} 支队伍</span>
        <PaginationBar
          :page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="changePage"
        />
      </div>
    </section>

    <el-drawer v-model="drawerVisible" size="720px" :with-header="false">
      <div v-loading="detailLoading" class="team-drawer">
        <header class="drawer-head">
          <span class="drawer-mark">{{ detail?.name?.slice(0, 1) || '球' }}</span>
          <div class="drawer-title">
            <span class="eyebrow">TEAM PROFILE</span>
            <h2>{{ detail?.name || '球队详情' }}</h2>
            <p>
              {{ detail?.cityName || '—' }} · {{ categoryLabel(detail?.category) }} ·
              {{ detail?.schoolName || '—' }}
            </p>
          </div>
          <StatusTag :status="detail?.status" kind="review" size="large" />
        </header>

        <div class="drawer-stats">
          <div><span>主教练</span><strong>{{ detail?.coachName || '—' }}</strong></div>
          <div><span>在册球员</span><strong>{{ members.length }} 人</strong></div>
          <div><span>教练团队</span><strong>{{ coaches.length }} 人</strong></div>
          <div><span>建档日期</span><strong>{{ formatDate(detail?.createdAt) }}</strong></div>
        </div>

        <p v-if="detail?.intro" class="team-intro">{{ detail.intro }}</p>

        <el-tabs v-model="activeTab">
          <el-tab-pane label="球员名单" name="roster">
            <el-table :data="members" size="small" max-height="340">
              <el-table-column label="#" width="54" align="center">
                <template #default="{ row }">
                  <span class="jersey">{{ row.jerseyNumber ?? '—' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="athleteName" label="姓名" min-width="110" />
              <el-table-column prop="position" label="位置" width="80">
                <template #default="{ row }">{{ row.position || '—' }}</template>
              </el-table-column>
              <el-table-column prop="maskedIdNumber" label="证件号" min-width="130">
                <template #default="{ row }">{{ row.maskedIdNumber || '—' }}</template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <StatusTag :status="row.status" kind="review" />
                </template>
              </el-table-column>
              <template #empty><div class="drawer-empty">暂无球员</div></template>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="教练团队" name="coaches">
            <el-table :data="coaches" size="small" max-height="340">
              <el-table-column prop="coachName" label="姓名" min-width="110" />
              <el-table-column prop="coachCategory" label="职务" width="110">
                <template #default="{ row }">{{ row.coachCategory || '教练员' }}</template>
              </el-table-column>
              <el-table-column prop="maskedPhone" label="联系电话" min-width="130">
                <template #default="{ row }">{{ row.maskedPhone || '—' }}</template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <StatusTag :status="row.status" kind="review" />
                </template>
              </el-table-column>
              <template #empty><div class="drawer-empty">暂无教练</div></template>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="近期赛程" name="matches">
            <div v-if="recentMatches.length" class="match-list">
              <div v-for="match in recentMatches" :key="match.id" class="match-row">
                <div class="match-date">
                  <strong>{{ dayjs(match.kickoffAt).format('MM-DD') }}</strong>
                  <small>{{ dayjs(match.kickoffAt).format('HH:mm') }}</small>
                </div>
                <div class="match-teams">
                  <span>{{ match.homeTeamName }}</span>
                  <strong>{{ matchScore(match) }}</strong>
                  <span>{{ match.awayTeamName }}</span>
                </div>
                <StatusTag :status="match.status" kind="match" />
              </div>
            </div>
            <div v-else class="drawer-empty">暂无比赛安排</div>
          </el-tab-pane>

          <el-tab-pane name="materials">
            <template #label>
              球队材料
              <el-badge
                v-if="materials.filter((m) => m.reviewStatus === 'PENDING').length"
                :value="materials.filter((m) => m.reviewStatus === 'PENDING').length"
                type="warning"
                class="tab-badge"
              />
            </template>
            <el-table v-loading="materialsLoading" :data="materials" size="small" max-height="340">
              <el-table-column prop="materialLabel" label="类型" width="90" />
              <el-table-column label="材料标题" min-width="160">
                <template #default="{ row }">
                  <strong class="material-title">{{ row.title }}</strong>
                  <small v-if="row.fileName" class="material-file">{{ row.fileName }}</small>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <StatusTag :status="row.reviewStatus" kind="review" />
                </template>
              </el-table-column>
              <el-table-column label="提交时间" width="110">
                <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="150" align="right">
                <template #default="{ row }">
                  <el-button
                    v-if="row.fileName"
                    link
                    type="primary"
                    :icon="Download"
                    @click="downloadMaterial(row)"
                  >
                    下载
                  </el-button>
                  <template v-if="row.reviewStatus === 'PENDING'">
                    <el-button
                      link
                      type="success"
                      :loading="reviewingMaterialId === row.id"
                      @click="reviewMaterial(row, 'APPROVE')"
                    >
                      通过
                    </el-button>
                    <el-button
                      link
                      type="danger"
                      :loading="reviewingMaterialId === row.id"
                      @click="reviewMaterial(row, 'REJECT')"
                    >
                      驳回
                    </el-button>
                  </template>
                </template>
              </el-table-column>
              <template #empty>
                <div class="drawer-empty">
                  暂无球队材料。队徽、队旗、合影在球队档案中维护，训练计划与荣誉可在此审核。
                </div>
              </template>
            </el-table>
          </el-tab-pane>
        </el-tabs>

        <div class="drawer-actions">
          <el-button type="danger" plain :icon="Delete" @click="detail && removeTeam(detail)">删除球队</el-button>
          <el-button @click="drawerVisible = false">关闭</el-button>
          <el-button type="primary" :icon="Trophy" @click="goMatches">查看全部赛程</el-button>
        </div>
      </div>
    </el-drawer>

    <el-dialog v-model="createVisible" title="新建球队" width="560px">
      <el-form :model="createForm" label-position="top">
        <el-form-item label="球队名称" required>
          <el-input v-model="createForm.name" placeholder="如：成都七中初中男子足球队" />
        </el-form-item>
        <div class="create-grid">
          <el-form-item label="所属学校" required>
            <el-select v-model="createForm.orgId" filterable placeholder="选择学校" style="width: 100%">
              <el-option v-for="org in schools" :key="org.id" :label="org.name" :value="org.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="所属市州">
            <el-select v-model="createForm.cityOrgId" clearable filterable placeholder="选择市州" style="width: 100%">
              <el-option v-for="city in cities" :key="city.id" :label="city.name" :value="city.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="参赛组别" required>
            <el-select v-model="createForm.category" style="width: 100%">
              <el-option label="小学组" value="PRIMARY" />
              <el-option label="初中组" value="MIDDLE" />
              <el-option label="大学组" value="UNIVERSITY" />
            </el-select>
          </el-form-item>
          <el-form-item label="主教练">
            <el-input v-model="createForm.coachName" placeholder="主教练姓名" />
          </el-form-item>
        </div>
        <el-form-item label="球队简介">
          <el-input v-model="createForm.intro" type="textarea" :rows="3" placeholder="选填" />
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
.table-card {
  padding: 6px 18px 14px;
}

.team-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.team-mark,
.drawer-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--brand-700), var(--brand-500));
  color: var(--lime);
  font-size: 13px;
  font-weight: 700;
}

.team-cell strong {
  display: block;
  font-size: 12px;
}

.team-cell small {
  display: block;
  margin-top: 1px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.pagination-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 4px 2px;
}

.pagination-hint {
  font-size: 10.5px;
  color: var(--ink-300);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 34px 0;
  color: var(--ink-300);
  font-size: 11px;
}

.team-drawer {
  min-height: 300px;
}

.drawer-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.drawer-mark {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  font-size: 20px;
}

.drawer-title {
  flex: 1;
  min-width: 0;
}

.eyebrow {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--brand-600);
}

.drawer-title h2 {
  margin-top: 3px;
  font-size: 20px;
}

.drawer-title p {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.drawer-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.drawer-stats > div {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--paper);
}

.drawer-stats span {
  display: block;
  font-size: 9px;
  color: var(--ink-300);
}

.drawer-stats strong {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  font-weight: 600;
}

.team-intro {
  margin-top: 14px;
  padding: 11px 13px;
  border-left: 3px solid var(--brand-500);
  border-radius: 0 9px 9px 0;
  background: var(--brand-50);
  font-size: 10.5px;
  line-height: 1.8;
  color: var(--ink-500);
}

.jersey {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 22px;
  padding: 0 5px;
  border-radius: 6px;
  background: var(--paper);
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  color: var(--brand-700);
}

.drawer-empty {
  padding: 26px 0;
  text-align: center;
  font-size: 10.5px;
  color: var(--ink-300);
}

.tab-badge {
  margin-left: 4px;
  transform: translateY(-1px);
}

.material-title {
  display: block;
  font-size: 11.5px;
  font-weight: 500;
}

.material-file {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: var(--ink-300);
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.match-date {
  width: 46px;
  flex-shrink: 0;
  text-align: center;
}

.match-date strong {
  display: block;
  font-family: var(--font-display);
  font-size: 12px;
}

.match-date small {
  font-size: 9px;
  color: var(--ink-300);
}

.match-teams {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
}

.match-teams span:last-child {
  text-align: right;
}

.match-teams strong {
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--paper);
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--brand-700);
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px dashed var(--line);
}

.create-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

@media (max-width: 720px) {
  .drawer-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .create-grid {
    grid-template-columns: 1fr;
  }
}
</style>
