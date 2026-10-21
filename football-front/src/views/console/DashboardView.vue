<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import {
  ArrowRight,
  Bell,
  Calendar,
  Collection,
  DataAnalysis,
  Key,
  Plus,
  Stamp,
  Tickets,
  Trophy,
  User,
  VideoCamera,
} from '@element-plus/icons-vue'
import { useAuthStore } from '../../stores/auth'
import { useAppStore } from '../../stores/app'
import { enrollmentApi, matchApi, meApi, materialApi } from '../../api'
import type { Enrollment, Match, Material, MyAffiliation } from '../../api/types'
import StatCard from '../../components/common/StatCard.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const auth = useAuthStore()
const app = useAppStore()
const router = useRouter()

const loading = ref(false)
const counts = ref({ all: 0, pending: 0, approved: 0, rejected: 0 })
const recentEnrollments = ref<Enrollment[]>([])
const recentMatches = ref<Match[]>([])
const materials = ref<Material[]>([])
const affiliations = ref<MyAffiliation[]>([])
const myTeams = ref<{ id: string; name: string }[]>([])

const isSubmitter = computed(() => auth.hasRole(['TEAM', 'UNIVERSITY', 'CITY']))
const isReviewer = computed(() => auth.hasRole(['CITY', 'PROVINCE_REVIEWER', 'ADMIN']))
const isPlayer = computed(() => auth.hasRole(['ATHLETE', 'COACH']))
const isRecorder = computed(() => auth.hasRole(['MATCH_RECORDER']))
const isAdmin = computed(() => auth.roles.includes('ADMIN'))

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const roleText = computed(() => {
  if (isAdmin.value) return '统筹赛事报名、比赛、遴选与门户运营。'
  if (auth.roles.includes('PROVINCE_REVIEWER')) return '处理省级终审、赛事配置、成绩发布与内容运营。'
  if (auth.roles.includes('CITY')) return '管理本市参赛队伍，完成报名初审与统计。'
  if (auth.roles.includes('MATCH_RECORDER')) return '负责比赛现场记录、比分与图文直播。'
  if (isPlayer.value) return '维护个人履历材料，关注公示与所属球队动态。'
  return '完成球队报名、名单维护与材料报送。'
})

const today = dayjs().format('YYYY年MM月DD日')

const quickActions = computed(() => {
  if (isPlayer.value) {
    return [
      { label: '完善个人资料', desc: '身份与学籍信息', path: '/console/profile', icon: User },
      { label: '上传履历材料', desc: '证书、获奖与经历', path: '/console/materials', icon: Collection },
      { label: '查看所属队伍', desc: '球队与教练信息', path: '/console/affiliations', icon: Tickets },
      { label: '我的公示', desc: '公示记录与状态', path: '/console/my-publications', icon: Trophy },
    ]
  }
  if (isRecorder.value && !isAdmin.value) {
    return [
      { label: '比赛管理', desc: '查看今日赛程', path: '/console/matches', icon: Trophy },
      { label: '身份核验', desc: '球员身份复核', path: '/console/identity', icon: VideoCamera },
      { label: '我的消息', desc: '赛务通知', path: '/console/messages', icon: Bell },
    ]
  }
  if (isReviewer.value) {
    const actions = [
      { label: '审核工作台', desc: '处理待审报名', path: '/console/review', icon: Stamp },
      { label: '报名统计', desc: '按市州与组别分析', path: '/console/enrollment-stats', icon: DataAnalysis },
      isAdmin.value
        ? { label: '遴选档案', desc: '检索运动员档案', path: '/console/selection/dossiers', icon: Collection }
        : { label: '参赛队伍', desc: '全省球队与赛程', path: '/console/teams-overview', icon: Trophy },
    ]
    if (isAdmin.value) {
      actions.push({ label: '权限矩阵', desc: '角色、菜单与数据范围', path: '/console/admin/permissions', icon: Key })
    }
    return actions
  }
  return [
    { label: '新建报名', desc: '选择赛事与组别', path: '/console/enrollments/create', icon: Plus },
    { label: '球员名单', desc: '维护参赛球员', path: '/console/team/members', icon: User },
    { label: '球队材料', desc: '上传盖章文件', path: '/console/team/materials', icon: Tickets },
  ]
})

const statCards = computed(() => {
  if (isPlayer.value) {
    return [
      { label: '履历材料', value: materials.value.length, hint: '已归档材料总数', icon: Collection, tone: 'green' as const },
      { label: '所属队伍', value: affiliations.value.length || myTeams.value.length, hint: '当前关联球队', icon: Tickets, tone: 'lime' as const },
      { label: '未读消息', value: app.unreadCount, hint: '来自组委会的通知', icon: Bell, tone: 'amber' as const },
      { label: '账号角色', value: auth.roles.includes('COACH') ? '教练员' : '运动员', hint: auth.user?.orgName || '—', icon: User, tone: 'blue' as const },
    ]
  }
  return [
    {
      label: isReviewer.value ? '报名总数' : '我的报名',
      value: counts.value.all,
      hint: '当前赛事范围内',
      icon: Tickets,
      tone: 'green' as const,
    },
    {
      label: '待处理审核',
      value: counts.value.pending,
      hint: '需尽快处理的报名',
      icon: Stamp,
      tone: 'amber' as const,
    },
    {
      label: '审核通过',
      value: counts.value.approved,
      hint: '已完成终审',
      icon: Trophy,
      tone: 'lime' as const,
    },
    {
      label: '近期比赛',
      value: recentMatches.value.length,
      hint: '进行中与即将开始',
      icon: Calendar,
      tone: 'blue' as const,
    },
  ]
})

async function load() {
  loading.value = true
  try {
    if (isPlayer.value) {
      const [materialRes, affRes, teams] = await Promise.all([
        materialApi.list({ page: 1, pageSize: 6 }),
        meApi.affiliations({ page: 1, pageSize: 6 }),
        meApi.teams(),
      ])
      materials.value = materialRes.items
      affiliations.value = affRes.items
      myTeams.value = teams
    } else {
      const calls: Promise<unknown>[] = [
        enrollmentApi.list({ page: 1, pageSize: 5 }),
        enrollmentApi.list({ page: 1, pageSize: 1, status: 'PENDING_CITY_REVIEW' }),
        enrollmentApi.list({ page: 1, pageSize: 1, status: 'PENDING_PROVINCE_REVIEW' }),
        enrollmentApi.list({ page: 1, pageSize: 1, status: 'APPROVED' }),
        enrollmentApi.list({ page: 1, pageSize: 1, status: 'REJECTED' }),
        matchApi.list({ page: 1, pageSize: 5, status: isRecorder.value ? undefined : 'SCHEDULED' }),
      ]
      const [recent, pc, pv, approved, rejected, matches] = (await Promise.all(calls)) as [
        { items: Enrollment[]; total: number },
        { total: number },
        { total: number },
        { total: number },
        { total: number },
        { items: Match[] },
      ]
      recentEnrollments.value = recent.items
      counts.value = {
        all: recent.total,
        pending: pc.total + pv.total,
        approved: approved.total,
        rejected: rejected.total,
      }
      recentMatches.value = matches.items
    }
  } catch {
    // 仪表盘加载失败时保留空态
  } finally {
    loading.value = false
  }
}

function go(path: string) {
  router.push(path)
}

onMounted(load)
</script>

<template>
  <div class="page dashboard" v-loading="loading">
    <section class="welcome-card">
      <div class="welcome-card__body">
        <span class="welcome-card__eyebrow">2026 赛季 · {{ auth.roles.includes('ADMIN') ? '管理中心' : '工作台' }}</span>
        <h1>{{ greeting }}，{{ auth.displayName }}</h1>
        <p>{{ roleText }}</p>
        <div class="welcome-card__meta">
          <span><el-icon><Calendar /></el-icon>{{ today }}</span>
          <span class="dot" />
          <span>{{ auth.user?.orgName || '省级联赛组委会' }}</span>
        </div>
      </div>
      <button v-if="app.unreadCount" type="button" class="welcome-card__notice" @click="go('/console/messages')">
        <span class="notice-count num">{{ app.unreadCount }}</span>
        <span class="notice-text">
          条未读消息
          <small>查看组委会通知与审核结果</small>
        </span>
        <el-icon><ArrowRight /></el-icon>
      </button>
    </section>

    <div class="stat-grid">
      <StatCard
        v-for="card in statCards"
        :key="card.label"
        :label="card.label"
        :value="card.value"
        :hint="card.hint"
        :icon="card.icon"
        :tone="card.tone"
      />
    </div>

    <div class="grid-sidebar">
      <section class="page-card">
        <div class="page-toolbar">
          <div class="section-title">
            {{ isPlayer ? '最近材料' : isRecorder ? '近期比赛' : '最近报名' }}
            <small>{{ isPlayer ? '按更新时间排序' : '按状态与时间排序' }}</small>
          </div>
          <el-button
            text
            type="primary"
            @click="go(isPlayer ? '/console/materials' : isRecorder ? '/console/matches' : '/console/enrollments')"
          >
            查看全部
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>

        <template v-if="isPlayer">
          <div v-if="materials.length" class="mini-list">
            <div v-for="item in materials" :key="item.id" class="mini-row">
              <span class="mini-row__icon"><el-icon><Collection /></el-icon></span>
              <div class="mini-row__body">
                <strong>{{ item.title }}</strong>
                <small>{{ item.materialLabel }} · {{ dayjs(item.createdAt).format('MM-DD HH:mm') }}</small>
              </div>
              <StatusTag :status="item.reviewStatus" kind="review" />
            </div>
          </div>
          <el-empty v-else description="还没有上传履历材料" :image-size="80">
            <el-button type="primary" plain @click="go('/console/materials')">上传第一份材料</el-button>
          </el-empty>
        </template>

        <template v-else-if="isRecorder && !isAdmin">
          <div v-if="recentMatches.length" class="mini-list">
            <div
              v-for="match in recentMatches"
              :key="match.id"
              class="mini-row mini-row--link"
              @click="go(`/console/matches/${match.id}/console`)"
            >
              <span class="mini-row__icon"><el-icon><Trophy /></el-icon></span>
              <div class="mini-row__body">
                <strong>{{ match.homeTeamName }} vs {{ match.awayTeamName }}</strong>
                <small>{{ match.groupName }} · {{ dayjs(match.kickoffAt).format('MM-DD HH:mm') }} · {{ match.venue }}</small>
              </div>
              <StatusTag :status="match.status" kind="match" />
            </div>
          </div>
          <el-empty v-else description="近期没有比赛安排" :image-size="80" />
        </template>

        <template v-else>
          <el-table v-if="recentEnrollments.length" :data="recentEnrollments" style="width: 100%">
            <el-table-column prop="teamName" label="参赛球队" min-width="180">
              <template #default="{ row }">
                <div class="team-cell">
                  <span class="team-cell__avatar">{{ row.teamName.slice(0, 1) }}</span>
                  <div>
                    <strong>{{ row.teamName }}</strong>
                    <small>{{ row.groupName }}</small>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="cityName" label="市州" width="100" />
            <el-table-column label="状态" width="130">
              <template #default="{ row }">
                <StatusTag :status="row.status" kind="enrollment" />
              </template>
            </el-table-column>
            <el-table-column label="更新时间" width="150">
              <template #default="{ row }">
                <span class="muted">{{ dayjs(row.updatedAt).format('MM-DD HH:mm') }}</span>
              </template>
            </el-table-column>
            <el-table-column label="" width="80" align="right">
              <template #default="{ row }">
                <el-button text type="primary" @click="go(`/console/enrollments/${row.id}`)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂时没有报名记录" :image-size="80">
            <el-button v-if="isSubmitter" type="primary" plain @click="go('/console/enrollments/create')">
              新建报名
            </el-button>
          </el-empty>
        </template>
      </section>

      <aside class="side-column">
        <section class="page-card quick-card">
          <div class="section-title">快捷入口</div>
          <div class="quick-grid">
            <button
              v-for="action in quickActions"
              :key="action.path"
              type="button"
              class="quick-item"
              @click="go(action.path)"
            >
              <span class="quick-item__icon">
                <el-icon><component :is="action.icon" /></el-icon>
              </span>
              <span class="quick-item__body">
                <strong>{{ action.label }}</strong>
                <small>{{ action.desc }}</small>
              </span>
              <el-icon class="quick-item__arrow"><ArrowRight /></el-icon>
            </button>
          </div>
        </section>

        <section class="page-card season-card">
          <span class="season-card__eyebrow">赛季进度</span>
          <h3>2026 赛季进行中</h3>
          <div class="season-progress">
            <div class="season-progress__bar"><span style="width: 62%" /></div>
            <div class="season-progress__meta">
              <span>报名与小组赛阶段</span>
              <strong class="num">62%</strong>
            </div>
          </div>
          <ul>
            <li><span>报名窗口</span><strong>10.08 - 10.25</strong></li>
            <li><span>市州初审</span><strong>10.10 - 10.27</strong></li>
            <li><span>省级终审</span><strong>10.20 - 10.30</strong></li>
          </ul>
          <button type="button" class="season-link" @click="go('/console/messages')">
            查看组委会通知
            <el-icon><ArrowRight /></el-icon>
          </button>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  gap: 16px;
}

.welcome-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 24px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--brand-700);
  border-radius: var(--radius-lg);
  background: #fff;
}

.welcome-card__body {
  min-width: 0;
  max-width: 660px;
}

.welcome-card__eyebrow {
  font-size: 11px;
  color: var(--ink-500);
}

.welcome-card h1 {
  margin-top: 6px;
  font-size: 23px;
  font-weight: 700;
  color: var(--ink-900);
}

.welcome-card p {
  margin-top: 7px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.welcome-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 12px;
  font-size: 11px;
  color: var(--ink-300);
}

.welcome-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.welcome-card__meta .dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--line-strong);
}

.welcome-card__notice {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: #fff;
  color: var(--ink-700);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.welcome-card__notice:hover {
  border-color: var(--brand-500);
  background: var(--brand-50);
}

.welcome-card__notice .el-icon {
  color: var(--ink-300);
}

.notice-count {
  display: grid;
  place-items: center;
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--brand-700);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.notice-text {
  font-size: 11.5px;
  line-height: 1.45;
}

.notice-text small {
  display: block;
  margin-top: 1px;
  font-size: 10px;
  color: var(--ink-300);
}

.team-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.team-cell__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.team-cell strong {
  display: block;
  font-size: 12.5px;
}

.team-cell small {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--ink-300);
}

.mini-list {
  display: flex;
  flex-direction: column;
}

.mini-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}

.mini-row:last-child {
  border-bottom: none;
}

.mini-row--link {
  cursor: pointer;
  border-radius: 6px;
  padding-left: 6px;
  padding-right: 6px;
  margin: 0 -6px;
}

.mini-row--link:hover {
  background: var(--brand-50);
}

.mini-row__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.mini-row__body {
  flex: 1;
  min-width: 0;
}

.mini-row__body strong {
  display: block;
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-row__body small {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: var(--ink-300);
}

.side-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.quick-card .section-title {
  margin-bottom: 12px;
}

.quick-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quick-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.quick-item:hover {
  background: var(--brand-50);
}

.quick-item__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.quick-item:hover .quick-item__icon {
  background: var(--brand-700);
  color: #fff;
}

.quick-item__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.quick-item__body strong {
  font-size: 12px;
  color: var(--ink-900);
}

.quick-item__body small {
  font-size: 10px;
  color: var(--ink-300);
}

.quick-item__arrow {
  color: var(--ink-300);
  font-size: 12px;
}

.season-card {
  background: #fff;
}

.season-card__eyebrow {
  font-size: 10.5px;
  color: var(--ink-500);
}

.season-card h3 {
  margin-top: 4px;
  font-size: 16px;
}

.season-progress {
  margin-top: 16px;
}

.season-progress__bar {
  height: 6px;
  border-radius: 999px;
  background: var(--brand-100);
  overflow: hidden;
}

.season-progress__bar span {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--brand-700);
}

.season-progress__meta {
  display: flex;
  justify-content: space-between;
  margin-top: 7px;
  font-size: 10px;
  color: var(--ink-500);
}

.season-progress__meta strong {
  color: var(--brand-700);
}

.season-card ul {
  list-style: none;
  margin: 15px 0 0;
  padding: 0;
}

.season-card li {
  display: flex;
  justify-content: space-between;
  padding: 7px 0;
  border-bottom: 1px dashed var(--line);
  font-size: 10.5px;
  color: var(--ink-500);
}

.season-card li strong {
  color: var(--ink-700);
  font-weight: 600;
}

.season-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: 14px;
  padding: 9px 11px;
  border: none;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

@media (max-width: 760px) {
  .welcome-card {
    align-items: flex-start;
    flex-direction: column;
    padding: 18px;
  }

  .welcome-card h1 {
    font-size: 20px;
  }

  .welcome-card__notice {
    width: 100%;
  }
}
</style>
