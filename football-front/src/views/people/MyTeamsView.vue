<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Location, Refresh, User, UserFilled } from '@element-plus/icons-vue'
import { meApi } from '../../api'
import type { Team } from '../../api/types'
import { categoryLabel } from '../../config/labels'
import PageHeader from '../../components/common/PageHeader.vue'

const router = useRouter()
const loading = ref(false)
const teams = ref<Team[]>([])

async function load() {
  loading.value = true
  try {
    teams.value = await meApi.teams()
  } catch {
    teams.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="我的球队"
      description="查看当前账号关联的球队。球队资料、球员名单由球队管理员维护，如有出入可通过所属队伍记录反馈。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
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
          <el-button link type="primary" @click="router.push('/console/affiliations')">查看归属</el-button>
        </div>
      </article>
      <el-empty v-if="!loading && !teams.length" description="当前账号暂未关联球队" :image-size="90" />
    </div>

    <section class="page-card tip-card">
      <div>
        <strong>找不到所属球队？</strong>
        <p>请先在「所属队伍」中添加归属记录并等待核验，或联系球队管理员将你加入球队名单。</p>
      </div>
      <el-button plain @click="router.push('/console/affiliations')">前往所属队伍</el-button>
    </section>
  </div>
</template>

<style scoped>
.team-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
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

.tip-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 18px;
  padding: 18px 22px;
}

.tip-card strong {
  font-size: 13px;
}

.tip-card p {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--ink-500);
}

@media (max-width: 640px) {
  .tip-card {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
