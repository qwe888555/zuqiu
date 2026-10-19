<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Edit, Location, Refresh, User, UserFilled } from '@element-plus/icons-vue'
import { teamApi } from '../../api'
import type { Team } from '../../api/types'
import { useTeamScope } from '../../composables/useTeamScope'
import { usePermission } from '../../composables/usePermission'
import PageHeader from '../../components/common/PageHeader.vue'

const router = useRouter()
const { can } = usePermission()
const { teams, teamId, loading, loadTeams } = useTeamScope()
const team = ref<Team | null>(null)
const detailLoading = ref(false)
const editing = ref(false)
const saving = ref(false)

const form = reactive({
  name: '',
  shortName: '',
  schoolName: '',
  cityName: '',
  coachName: '',
  intro: '',
})

const categoryLabel: Record<string, string> = { PRIMARY: '小学', MIDDLE: '初中', UNIVERSITY: '大学' }
const canEdit = computed(() => can('team.manage'))

async function loadTeam() {
  if (!teamId.value) {
    team.value = null
    return
  }
  detailLoading.value = true
  try {
    team.value = await teamApi.get(teamId.value)
    Object.assign(form, {
      name: team.value.name,
      shortName: team.value.shortName || '',
      schoolName: team.value.schoolName || '',
      cityName: team.value.cityName || '',
      coachName: team.value.coachName || '',
      intro: team.value.intro || '',
    })
    editing.value = false
  } catch {
    team.value = null
  } finally {
    detailLoading.value = false
  }
}

async function changeTeam() {
  await loadTeam()
}

function startEdit() {
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  if (team.value) {
    Object.assign(form, {
      name: team.value.name,
      shortName: team.value.shortName || '',
      schoolName: team.value.schoolName || '',
      cityName: team.value.cityName || '',
      coachName: team.value.coachName || '',
      intro: team.value.intro || '',
    })
  }
}

async function save() {
  if (!team.value) return
  if (!form.name.trim()) return ElMessage.warning('请填写球队名称')
  saving.value = true
  try {
    team.value = await teamApi.update(team.value.id, { ...form })
    ElMessage.success('球队资料已保存')
    editing.value = false
    await loadTeams(team.value.id)
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function refresh() {
  await loadTeams(teamId.value)
  await loadTeam()
}

onMounted(async () => {
  await loadTeams()
  await loadTeam()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="球队资料"
      eyebrow="TEAM PROFILE"
      description="维护球队名称、学校归属与简介。球队资料将在报名审核、门户公示与比赛介绍中展示。"
    >
      <template #actions>
        <el-select
          v-if="teams.length > 1"
          v-model="teamId"
          style="width: 220px"
          @change="changeTeam"
        >
          <el-option v-for="item in teams" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-button :icon="Refresh" @click="refresh">刷新</el-button>
        <el-button v-if="canEdit && !editing" type="primary" :icon="Edit" @click="startEdit">编辑资料</el-button>
      </template>
    </PageHeader>

    <div v-loading="detailLoading || loading" class="profile-grid">
      <section class="page-card profile-main">
        <div class="team-hero">
          <span class="team-hero__badge">{{ team?.name?.slice(0, 1) || '队' }}</span>
          <div class="team-hero__info">
            <div class="team-hero__title">
              <h2>{{ team?.name || '暂无球队' }}</h2>
              <el-tag :type="team?.status === 'APPROVED' ? 'success' : 'warning'" effect="plain" size="small">
                {{ team?.status === 'APPROVED' ? '已认证' : '待认证' }}
              </el-tag>
            </div>
            <p>{{ team?.schoolName || '未绑定学校' }} · {{ categoryLabel[team?.category || ''] || '学段未设置' }}</p>
            <div class="team-hero__meta">
              <span><el-icon><Location /></el-icon>{{ team?.cityName || '未设置市州' }}</span>
              <span><el-icon><User /></el-icon>主教练 {{ team?.coachName || '未设置' }}</span>
              <span><el-icon><UserFilled /></el-icon>{{ team?.memberCount || 0 }} 名球员</span>
            </div>
          </div>
        </div>

        <template v-if="!editing">
          <div class="section-title">球队简介</div>
          <p class="intro-text">{{ team?.intro || '尚未填写球队简介。可介绍球队历史、训练情况与参赛成绩。' }}</p>

          <div class="info-grid">
            <div><span>球队全称</span><strong>{{ team?.name || '—' }}</strong></div>
            <div><span>球队简称</span><strong>{{ team?.shortName || '—' }}</strong></div>
            <div><span>所属学校</span><strong>{{ team?.schoolName || '—' }}</strong></div>
            <div><span>所属市州</span><strong>{{ team?.cityName || '—' }}</strong></div>
            <div><span>学段</span><strong>{{ categoryLabel[team?.category || ''] || '—' }}</strong></div>
            <div><span>主教练</span><strong>{{ team?.coachName || '—' }}</strong></div>
          </div>
        </template>

        <el-form v-else :model="form" label-position="top" class="edit-form">
          <div class="form-grid">
            <el-form-item label="球队全称" required>
              <el-input v-model="form.name" placeholder="球队全称" />
            </el-form-item>
            <el-form-item label="球队简称">
              <el-input v-model="form.shortName" placeholder="用于赛程展示，建议 4-6 字" />
            </el-form-item>
            <el-form-item label="所属学校">
              <el-input v-model="form.schoolName" placeholder="学校全称" />
            </el-form-item>
            <el-form-item label="所属市州">
              <el-input v-model="form.cityName" placeholder="如：成都市" />
            </el-form-item>
            <el-form-item label="主教练">
              <el-input v-model="form.coachName" placeholder="主教练姓名" />
            </el-form-item>
          </div>
          <el-form-item label="球队简介">
            <el-input
              v-model="form.intro"
              type="textarea"
              :rows="5"
              maxlength="500"
              show-word-limit
              placeholder="介绍球队历史、训练情况与参赛成绩"
            />
          </el-form-item>
          <div class="edit-actions">
            <el-button @click="cancelEdit">取消</el-button>
            <el-button type="primary" :loading="saving" @click="save">保存修改</el-button>
          </div>
        </el-form>
      </section>

      <aside class="profile-side">
        <div class="page-card side-card">
          <div class="section-title">球队管理</div>
          <div class="side-links">
            <button type="button" class="side-link" @click="router.push('/console/team/members')">
              <span>球员名单</span>
              <small>{{ team?.memberCount || 0 }} 人</small>
            </button>
            <button type="button" class="side-link" @click="router.push('/console/team/coaches')">
              <span>教练团队</span>
              <small>查看</small>
            </button>
            <button type="button" class="side-link" @click="router.push('/console/team/materials')">
              <span>球队材料</span>
              <small>资质与荣誉</small>
            </button>
          </div>
        </div>

        <div class="page-card side-card side-card--tip">
          <span class="side-card__eyebrow">CHECKLIST</span>
          <h3>资料完善度</h3>
          <ul>
            <li :class="{ done: team?.schoolName }">绑定所属学校</li>
            <li :class="{ done: team?.cityName }">设置所属市州</li>
            <li :class="{ done: team?.coachName }">登记主教练</li>
            <li :class="{ done: team?.intro }">填写球队简介</li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 18px;
}

.profile-main {
  padding: 26px 28px;
}

.team-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line);
}

.team-hero__badge {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  border-radius: 18px;
  background: linear-gradient(145deg, var(--brand-700), var(--brand-900));
  color: var(--lime);
  font-size: 26px;
  font-weight: 700;
}

.team-hero__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.team-hero__title h2 {
  font-size: 22px;
}

.team-hero__info p {
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--ink-500);
}

.team-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 10px;
}

.team-hero__meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.intro-text {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--ink-700);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.info-grid > div {
  padding: 13px 15px;
  border-radius: 11px;
  background: var(--paper);
}

.info-grid span {
  display: block;
  font-size: 9.5px;
  color: var(--ink-300);
}

.info-grid strong {
  display: block;
  margin-top: 4px;
  font-size: 12.5px;
  font-weight: 500;
}

.profile-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.side-card {
  padding: 20px;
}

.side-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.side-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  font-size: 12px;
  color: var(--ink-900);
  text-align: left;
  cursor: pointer;
  transition: 0.15s;
}

.side-link:hover {
  border-color: var(--brand-500);
  background: var(--brand-50);
}

.side-link small {
  font-size: 9.5px;
  color: var(--ink-300);
}

.side-card--tip {
  background: var(--lime-soft);
  border-color: #dcefb9;
}

.side-card__eyebrow {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #5b7310;
}

.side-card--tip h3 {
  margin-top: 7px;
  font-size: 14px;
}

.side-card--tip ul {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.side-card--tip li {
  position: relative;
  padding-left: 17px;
  font-size: 10.5px;
  line-height: 2;
  color: #6b7a45;
}

.side-card--tip li::before {
  content: '○';
  position: absolute;
  left: 0;
}

.side-card--tip li.done {
  color: #3f5520;
}

.side-card--tip li.done::before {
  content: '●';
  color: var(--brand-700);
}

.edit-form {
  margin-top: 22px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
}

@media (max-width: 980px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .info-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .team-hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .info-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
