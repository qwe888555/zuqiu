<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { personApi, teamApi } from '../../api'
import { isNotFound } from '../../api/http'
import type { CoachCategory, Person, TeamCoach } from '../../api/types'
import { useTeamScope } from '../../composables/useTeamScope'
import { COACH_CATEGORY_LABELS, coachCategoryLabel } from '../../config/labels'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import StatCard from '../../components/common/StatCard.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const { teams, teamId, loadTeams } = useTeamScope()
const loading = ref(false)
const rows = ref<TeamCoach[]>([])
const total = ref(0)
const dialogVisible = ref(false)
const searchKeyword = ref('')
const candidates = ref<Person[]>([])
const searching = ref(false)
const selected = ref<Person | null>(null)
const coachCategory = ref<CoachCategory>('HEAD_COACH')
const effectiveFrom = ref(new Date().toISOString().slice(0, 10))
const filters = reactive({ category: '' as '' | CoachCategory, reviewStatus: '' })
/** 当前部署缺少 /teams/{id}/coaches 时按「接口未开放」降级，而不是提示数据为空。 */
const unavailable = ref(false)

const categories = (Object.keys(COACH_CATEGORY_LABELS) as CoachCategory[]).map((value) => ({
  value,
  label: COACH_CATEGORY_LABELS[value],
}))

const approvedCount = computed(() => rows.value.filter((c) => c.reviewStatus === 'APPROVED').length)
const pendingCount = computed(() => rows.value.filter((c) => c.reviewStatus === 'PENDING').length)

async function load() {
  if (!teamId.value) return
  loading.value = true
  try {
    const res = await teamApi.coaches(
      teamId.value,
      {
        page: 1,
        pageSize: 50,
        category: filters.category || undefined,
        reviewStatus: filters.reviewStatus || undefined,
      },
      { silentError: true },
    )
    unavailable.value = false
    rows.value = res.items
    total.value = res.total
  } catch (error) {
    rows.value = []
    total.value = 0
    unavailable.value = isNotFound(error)
  } finally {
    loading.value = false
  }
}

async function changeTeam() {
  await load()
}

function resetFilters() {
  filters.category = ''
  filters.reviewStatus = ''
  load()
}

function openAdd() {
  if (unavailable.value) return
  dialogVisible.value = true
  searchKeyword.value = ''
  candidates.value = []
  selected.value = null
  coachCategory.value = 'HEAD_COACH'
  effectiveFrom.value = new Date().toISOString().slice(0, 10)
}

async function searchPeople() {
  if (!searchKeyword.value.trim()) return
  searching.value = true
  try {
    const res = await personApi.search({ keyword: searchKeyword.value.trim() })
    const existing = new Set(rows.value.map((row) => row.coachId))
    candidates.value = res.filter((person) => person.kinds.includes('COACH') && !existing.has(person.id))
  } catch {
    candidates.value = []
  } finally {
    searching.value = false
  }
}

async function addCoach() {
  if (!teamId.value) return
  if (!selected.value) return ElMessage.warning('请先搜索并选择教练')
  try {
    await teamApi.addCoach(teamId.value, {
      coachId: selected.value.id,
      category: coachCategory.value,
      effectiveFrom: effectiveFrom.value,
    })
    ElMessage.success('教练已加入球队')
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  }
}

async function removeCoach(coach: TeamCoach) {
  if (!teamId.value) return
  try {
    await ElMessageBox.confirm(`确认移除教练「${coach.coachName}」？`, '移除教练', {
      confirmButtonText: '移除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await teamApi.removeCoach(teamId.value, coach.id, coach.version)
    ElMessage.success('已移除')
    await load()
  } catch {
    // 取消
  }
}

onMounted(async () => {
  await loadTeams()
  await load()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="教练团队"
      description="维护主教练、助理教练与保障人员。教练资质需通过人员档案材料审核后方可关联球队。"
    >
      <template #actions>
        <el-select
          v-if="teams.length > 1"
          v-model="teamId"
          style="width: 210px"
          @change="changeTeam"
        >
          <el-option v-for="item in teams" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="!unavailable" type="primary" :icon="Plus" @click="openAdd">
          添加教练
        </el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="教练人数" :value="total" hint="包含保障人员" :icon="Plus" tone="green" />
      <StatCard label="资质已通过" :value="approvedCount" hint="可随队参赛" :icon="Plus" tone="lime" />
      <StatCard label="待审核" :value="pendingCount" hint="需补充资质材料" :icon="Plus" tone="amber" />
    </div>

    <section class="page-card">
      <FilterBar>
        <el-select
          v-model="filters.category"
          placeholder="全部职务"
          clearable
          style="width: 150px"
          @change="load"
        >
          <el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select
          v-model="filters.reviewStatus"
          placeholder="全部审核状态"
          clearable
          style="width: 160px"
          @change="load"
        >
          <el-option label="待审核" value="PENDING" />
          <el-option label="已通过" value="APPROVED" />
          <el-option label="已驳回" value="REJECTED" />
        </el-select>
        <el-button text @click="resetFilters">重置</el-button>
      </FilterBar>
      <el-alert
        v-if="unavailable"
        class="coach-unavailable"
        type="info"
        :closable="false"
        show-icon
        title="教练团队接口暂未开放"
        description="当前部署尚未提供球队教练接口，暂时只能查看占位信息；接口上线后本页会自动恢复。"
      />
      <div class="section-title">教练与保障人员</div>
      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="姓名" min-width="180">
          <template #default="{ row }">
            <div class="coach-cell">
              <span class="coach-cell__avatar">{{ row.coachName.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.coachName }}</strong>
                <small>{{ row.maskedPhone || '联系方式未登记' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="职务" width="130">
          <template #default="{ row }">{{ coachCategoryLabel(row.category) }}</template>
        </el-table-column>
        <el-table-column label="资质状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.reviewStatus" kind="review" /></template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="right">
          <template #default="{ row }">
            <el-button link type="danger" :icon="Delete" @click="removeCoach(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!loading && !rows.length"
        :description="unavailable ? '教练接口暂未开放' : '暂无教练，请添加'"
        :image-size="80"
      />
    </section>

    <el-dialog v-model="dialogVisible" title="添加教练" width="560px">
      <el-form label-position="top">
        <el-form-item label="搜索教练">
          <div class="search-row">
            <el-input
              v-model="searchKeyword"
              placeholder="输入姓名或证件号后四位"
              :prefix-icon="Search"
              @keyup.enter="searchPeople"
            />
            <el-button :loading="searching" @click="searchPeople">搜索</el-button>
          </div>
        </el-form-item>
        <div v-if="candidates.length" class="candidate-list">
          <button
            v-for="person in candidates"
            :key="person.id"
            type="button"
            class="candidate"
            :class="{ 'is-selected': selected?.id === person.id }"
            @click="selected = person"
          >
            <span class="candidate__avatar">{{ person.realName.slice(0, 1) }}</span>
            <span class="candidate__info">
              <strong>{{ person.realName }}</strong>
              <small>{{ person.coachCategory || '教练员' }} · {{ person.maskedPhone || '手机号未登记' }}</small>
            </span>
            <span v-if="selected?.id === person.id" class="candidate__check">已选择</span>
          </button>
        </div>
        <el-empty v-else-if="searchKeyword && !searching" description="未找到匹配教练档案" :image-size="60" />
        <div class="form-grid">
          <el-form-item label="球队职务" required>
            <el-select v-model="coachCategory" style="width: 100%">
              <el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="任职起始日期" required>
            <el-date-picker
              v-model="effectiveFrom"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="addCoach">加入球队</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.coach-unavailable {
  margin: 12px 0;
}

.coach-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.coach-cell__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.coach-cell strong {
  display: block;
  font-size: 12.5px;
}

.coach-cell small {
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

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.candidate {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.candidate.is-selected {
  border-color: var(--brand-700);
  background: var(--brand-50);
}

.candidate__avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--brand-100);
  color: var(--brand-800);
  font-size: 11px;
  font-weight: 700;
}

.candidate__info {
  flex: 1;
}

.candidate__info strong {
  display: block;
  font-size: 12px;
}

.candidate__info small {
  display: block;
  margin-top: 1px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.candidate__check {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--brand-700);
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
