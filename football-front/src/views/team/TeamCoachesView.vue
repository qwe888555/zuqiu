<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { personApi, teamApi } from '../../api'
import type { Person, TeamCoach } from '../../api/types'
import { useTeamScope } from '../../composables/useTeamScope'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import StatCard from '../../components/common/StatCard.vue'

const { teams, teamId, loadTeams } = useTeamScope()
const loading = ref(false)
const rows = ref<TeamCoach[]>([])
const total = ref(0)
const dialogVisible = ref(false)
const searchKeyword = ref('')
const candidates = ref<Person[]>([])
const searching = ref(false)
const selected = ref<Person | null>(null)
const coachCategory = ref('主教练')

const categories = ['主教练', '助理教练', '守门员教练', '体能教练', '队医']

const approvedCount = computed(() => rows.value.filter((c) => c.status === 'APPROVED').length)
const pendingCount = computed(() => rows.value.filter((c) => c.status === 'PENDING').length)

async function load() {
  if (!teamId.value) return
  loading.value = true
  try {
    const res = await teamApi.coaches(teamId.value, { page: 1, pageSize: 50 })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function changeTeam() {
  await load()
}

function openAdd() {
  dialogVisible.value = true
  searchKeyword.value = ''
  candidates.value = []
  selected.value = null
  coachCategory.value = '主教练'
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
      coachCategory: coachCategory.value,
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
    await teamApi.removeCoach(teamId.value, coach.id)
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
      eyebrow="COACHING STAFF"
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
        <el-button type="primary" :icon="Plus" @click="openAdd">添加教练</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="教练人数" :value="total" hint="包含保障人员" :icon="Plus" tone="green" />
      <StatCard label="资质已通过" :value="approvedCount" hint="可随队参赛" :icon="Plus" tone="lime" />
      <StatCard label="待审核" :value="pendingCount" hint="需补充资质材料" :icon="Plus" tone="amber" />
    </div>

    <section class="page-card">
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
        <el-table-column prop="coachCategory" label="职务" width="130" />
        <el-table-column label="资质状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.status" kind="review" /></template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="right">
          <template #default="{ row }">
            <el-button link type="danger" :icon="Delete" @click="removeCoach(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" description="暂无教练，请添加" :image-size="80" />
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
        <el-form-item label="球队职务">
          <el-select v-model="coachCategory" style="width: 100%">
            <el-option v-for="item in categories" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="addCoach">加入球队</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
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
</style>
