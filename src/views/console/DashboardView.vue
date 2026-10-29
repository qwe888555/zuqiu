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
import { enrollmentApi, eventApi, matchApi, meApi, materialApi } from '../../api'
import type { Enrollment, Event, Match, Material, Team } from '../../api/types'
import { categoryLabel } from '../../config/labels'
import { pickDefaultEventId } from '../../utils/events'
import { httpStatusOf } from '../../utils/httpError'
import { canEnroll, workspaceLabelForRoles } from '../../utils/roles'
import StatCard from '../../components/common/StatCard.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const auth = useAuthStore()
const app = useAppStore()
const router = useRouter()

const loading = ref(false)
const counts = ref({ all: 0, pendingCity: 0, pendingProvince: 0, approved: 0, rejected: 0 })
const upcomingMatchTotal = ref(0)
const recentEnrollments = ref<Enrollment[]>([])
const recentMatches = ref<Match[]>([])
const materials = ref<Material[]>([])
const myTeams = ref<{ id: string; name: string }[]>([])
const schoolTeams = ref<Team[]>([])
const seasonEvent = ref<Event | null>(null)
/** 材料数据范围（A′）未开放时后端返回 403，页面只做只读占位，不弹错误。 */
const materialsRestricted = ref(false)
/** 账号尚未绑定人员档案时 /me/teams 返回业务 404。 */
const teamsUnavailable = ref(false)

const isSchool = computed(() => auth.roles.includes('UNIVERSITY'))
const isTeam = computed(() => auth.roles.includes('TEAM'))
// 学校是唯一报送主体；球队端仅查看报名进度。
const isSubmitter = computed(() => canEnroll(auth.roles))
const isReviewer = computed(() => auth.hasRole(['CITY', 'PROVINCE_REVIEWER', 'ADMIN']))
// 管理员虽然可访问全部页面，但工作台应按管理员身份展示，不能误入运动员视图。
const isPlayer = computed(() => auth.roles.includes('ATHLETE') || auth.roles.includes('COACH'))
const isRecorder = computed(() => auth.roles.includes('MATCH_RECORDER'))
const isAdmin = computed(() => auth.roles.includes('ADMIN'))
const workspaceLabel = computed(() => workspaceLabelForRoles(auth.roles))
/** /me 不返回 team/school 组织名时，按角色从已加载的球队数据回填，避免误显示为组委会。 */
const organizationText = computed(() => {
  if (auth.user?.orgName) return auth.user.orgName
  if (isTeam.value || isSchool.value) {
    return schoolTeams.value[0]?.schoolName || schoolTeams.value[0]?.name || '所属球队'
  }
  if (isPlayer.value) return myTeams.value[0]?.name || '—'
  return '省级联赛组委会'
})
const schoolMemberTotal = computed(() =>
  schoolTeams.value.reduce((sum, team) => sum + (team.memberCount || 0), 0),
)
const recorderMatchStats = computed(() => {
  const stats = { live: 0, scheduled: 0, finished: 0 }
  recentMatches.value.forEach((match) => {
    if (match.status === 'LIVE') stats.live += 1
    else if (match.status === 'SCHEDULED') stats.scheduled += 1
    else if (match.status === 'FINISHED') stats.finished += 1
  })
  return stats
})

/**
 * 「待审核」对不同角色含义不同：
 * 审核方看到的是自己当前要处理的阶段；参赛方看到的是已提交、等待上级处理的报名。
 */
const pendingCount = computed(() => {
  if (isAdmin.value) return counts.value.pendingCity + counts.value.pendingProvince
  if (auth.roles.includes('CITY')) return counts.value.pendingCity
  if (auth.roles.includes('PROVINCE_REVIEWER')) return counts.value.pendingProvince
  return counts.value.pendingCity + counts.value.pendingProvince
})

const pendingHint = computed(() => {
  if (isAdmin.value) return '市州 / 省级待办'
  if (auth.roles.includes('CITY')) return '待本市初审'
  if (auth.roles.includes('PROVINCE_REVIEWER')) return '待省级终审'
  return '等待市州 / 省级审核'
})

const approvedHint = computed(() => {
  if (isAdmin.value) return '已完成终审'
  if (auth.roles.includes('PROVINCE_REVIEWER')) return '已完成终审'
  if (auth.roles.includes('CITY')) return '省级终审通过'
  return '已完成终审'
})

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
  if (auth.roles.includes('CITY')) return '审核本市学校报名，完成初审、统计与导出，不代学校填报。'
  if (auth.roles.includes('MATCH_RECORDER')) return '负责比赛现场记录、比分与图文直播。'
  if (isPlayer.value) return '维护个人履历材料，关注公示与所属球队动态。'
  if (isSchool.value) return '以学校为报送主体，统筹本校及分校区球队、名额与材料报送。'
  if (isTeam.value) return '维护所属球队资料、名单与材料；报名由学校端统一提交，可查看本队进度。'
  return '查看报名进度，维护球队资料与名单。'
})

const today = dayjs().format('YYYY年MM月DD日')

const EVENT_STATUS_TEXT: Record<Event['status'], string> = {
  DRAFT: '筹备中',
  REGISTRATION_OPEN: '报名中',
  REGISTRATION_CLOSED: '报名截止',
  RUNNING: '进行中',
  FINISHED: '已结束',
}

const PHASE_LABEL: Record<NonNullable<Event['currentPhase']>, string> = {
  NOT_STARTED: '筹备阶段',
  REGISTRATION: '报名阶段',
  COMPETITION: '比赛阶段',
  FINISHED: '已结束',
}

const seasonTitle = computed(() => {
  if (!seasonEvent.value) return '暂无赛事信息'
  return `${seasonEvent.value.season} 赛季 · ${EVENT_STATUS_TEXT[seasonEvent.value.status]}`
})

/** 赛季进度百分比：优先取后端计算值，兜底报名窗口占比。 */
const seasonProgress = computed(() => {
  if (!seasonEvent.value) return 0
  const p = seasonEvent.value.progressPercent
  if (typeof p === 'number' && Number.isFinite(p)) return Math.max(0, Math.min(100, Math.round(p)))
  const start = dayjs(seasonEvent.value.registrationOpensAt).valueOf()
  const end = dayjs(seasonEvent.value.registrationClosesAt).valueOf()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  const percent = ((Date.now() - start) / (end - start)) * 100
  return Math.max(0, Math.min(100, Math.round(percent)))
})

const phaseLabel = computed(() => {
  const phase = seasonEvent.value?.currentPhase
  return phase ? PHASE_LABEL[phase] : '—'
})

const phaseRange = computed(() => {
  const ev = seasonEvent.value
  if (!ev || !ev.phaseStartedAt || !ev.phaseEndsAt) return '—'
  const start = dayjs(ev.phaseStartedAt)
  const end = dayjs(ev.phaseEndsAt)
  if (!start.isValid() || !end.isValid()) return '—'
  return `${start.format('MM.DD')} - ${end.format('MM.DD')}`
})

const registrationRange = computed(() => {
  if (!seasonEvent.value) return '—'
  const start = dayjs(seasonEvent.value.registrationOpensAt)
  const end = dayjs(seasonEvent.value.registrationClosesAt)
  if (!start.isValid() || !end.isValid()) return '—'
  return `${start.format('MM.DD')} - ${end.format('MM.DD')}`
})

const quickActions = computed(() => {
  if (isPlayer.value) {
    return [
      { label: '完善个人资料', desc: '身份与学籍信息', path: '/console/profile', icon: User },
      { label: '上传履历材料', desc: '证书、获奖与经历', path: '/console/materials', icon: Collection },
      { label: '我的球队', desc: '查看归属与球队资料', path: '/console/my-teams', icon: Tickets },
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
  if (isSchool.value) {
    return [
      { label: '本校球队', desc: '含分校区，共享学校名额', path: '/console/school/teams', icon: Trophy },
      { label: '新建报名', desc: '以学校名义报送球队', path: '/console/enrollments/create', icon: Plus },
      { label: '本校报名', desc: '查看本校报名进度', path: '/console/enrollments', icon: Tickets },
      { label: '球队材料', desc: '按球队维护材料', path: '/console/team/profile?tab=materials', icon: Collection },
    ]
  }
  if (isTeam.value) {
    return [
      { label: '报名进度', desc: '查看本队报名与审核结果', path: '/console/enrollments', icon: Tickets },
      { label: '球队资料', desc: '维护球队与校区信息', path: '/console/team/profile', icon: Trophy },
      { label: '球员名单', desc: '维护参赛球员', path: '/console/team/members', icon: User },
      { label: '球队材料', desc: '上传盖章文件', path: '/console/team/profile?tab=materials', icon: Collection },
    ]
  }
  if (isReviewer.value) {
    const actions = [
      { label: '审核工作台', desc: '处理待审报名', path: '/console/review', icon: Stamp },
      { label: '报名统计', desc: '按市州与组别分析', path: '/console/enrollment-stats', icon: DataAnalysis },
      isAdmin.value
        ? { label: '遴选档案', desc: '检索运动员档案', path: '/console/selection/dossiers', icon: Collection }
        : auth.hasRole(['CITY'])
          ? { label: '报名单', desc: '本市报名与审核进度', path: '/console/enrollments', icon: Tickets }
          : { label: '参赛队伍', desc: '全省球队与赛程', path: '/console/teams-overview', icon: Trophy },
    ]
    if (isAdmin.value) {
      actions.push({ label: '权限矩阵', desc: '角色、菜单与数据范围', path: '/console/admin/permissions', icon: Key })
    }
    return actions
  }
  return [
    { label: '报名进度', desc: '查看权限范围内报名', path: '/console/enrollments', icon: Tickets },
    { label: '球员名单', desc: '维护参赛球员', path: '/console/team/members', icon: User },
    { label: '球队材料', desc: '上传盖章文件', path: '/console/team/profile?tab=materials', icon: Collection },
  ]
})

const statCards = computed(() => {
  if (isRecorder.value && !isAdmin.value) {
    return [
      { label: '近期比赛', value: recentMatches.value.length, hint: '最近更新的场次', icon: Calendar, tone: 'green' as const },
      { label: '进行中', value: recorderMatchStats.value.live, hint: '需要现场记录', icon: Trophy, tone: 'amber' as const },
      { label: '未开赛', value: recorderMatchStats.value.scheduled, hint: '待开赛场次', icon: Calendar, tone: 'blue' as const },
      { label: '未读消息', value: app.unreadCount, hint: '赛务通知', icon: Bell, tone: 'lime' as const },
    ]
  }
  if (isPlayer.value) {
    return [
      {
        label: '履历材料',
        value: materials.value.length,
        hint: materialsRestricted.value ? '暂由管理员维护' : '已归档材料总数',
        icon: Collection,
        tone: 'green' as const,
      },
      {
        label: '所属队伍',
        value: myTeams.value.length,
        hint: teamsUnavailable.value ? '账号未绑定人员档案' : '当前关联球队',
        icon: Tickets,
        tone: 'lime' as const,
      },
      { label: '未读消息', value: app.unreadCount, hint: '来自组委会的通知', icon: Bell, tone: 'amber' as const },
      { label: '账号角色', value: auth.roles.includes('COACH') ? '教练员' : '运动员', hint: organizationText.value, icon: User, tone: 'blue' as const },
    ]
  }
  if (isSchool.value) {
    return [
      { label: '本校球队', value: schoolTeams.value.length, hint: '学校端统一管理', icon: Trophy, tone: 'green' as const },
      { label: '在册球员', value: schoolMemberTotal.value, hint: '各队球员合计', icon: User, tone: 'lime' as const },
      { label: '报名单', value: counts.value.all, hint: '本校全部报名', icon: Tickets, tone: 'blue' as const },
      { label: '审核中', value: pendingCount.value, hint: pendingHint.value, icon: Stamp, tone: 'amber' as const },
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
      label: isReviewer.value ? '待处理审核' : '审核中',
      value: pendingCount.value,
      hint: pendingHint.value,
      icon: Stamp,
      tone: 'amber' as const,
    },
    {
      label: isReviewer.value ? '审核通过' : '已通过',
      value: counts.value.approved,
      hint: approvedHint.value,
      icon: Trophy,
      tone: 'lime' as const,
    },
    {
      label: '近期比赛',
      value: upcomingMatchTotal.value,
      hint: '已排期待开赛',
      icon: Calendar,
      tone: 'blue' as const,
    },
  ]
})

async function load() {
  loading.value = true
  try {
    // 赛季卡片只依赖全角色可用的 /available-events；接口异常时保留空态，不影响其他区块。
    const [seasonRes] = await Promise.allSettled([
      eventApi.available({ page: 1, pageSize: 50 }),
    ])
    if (seasonRes.status === 'fulfilled') {
      const pickedId = pickDefaultEventId(seasonRes.value.items)
      seasonEvent.value =
        seasonRes.value.items.find((event) => event.id === pickedId) || null
    } else {
      seasonEvent.value = null
    }

    if (isPlayer.value) {
      // 运动员/教练个人数据都是可选依赖：任一接口不可用不应阻断仪表盘，
      // 也不应把后端的数据范围限制（403）或未绑定档案（404）弹成错误提示。
      const [materialRes, teamsRes] = await Promise.allSettled([
        materialApi.list({ page: 1, pageSize: 6 }, { silentError: true }),
        meApi.teams({ silentError: true }),
      ])
      if (materialRes.status === 'fulfilled') {
        materials.value = materialRes.value.items
        materialsRestricted.value = false
      } else {
        materials.value = []
        materialsRestricted.value = httpStatusOf(materialRes.reason) === 403
      }
      if (teamsRes.status === 'fulfilled') {
        myTeams.value = teamsRes.value
        teamsUnavailable.value = false
      } else {
        myTeams.value = []
        teamsUnavailable.value = httpStatusOf(teamsRes.reason) === 404
      }
    } else {
      if (isSchool.value || isTeam.value) {
        try {
          // /me/teams 仅对已绑定档案的运动员/教练开放；学校端失败时按空态展示，
          // 不把后端的角色限制弹成错误提示。
          schoolTeams.value = await meApi.teams({ silentError: true })
        } catch {
          schoolTeams.value = []
        }
      }
      // 报名与比赛是不同权限点：记录员无报名权限时不能让整页数据一起失败。
      const [recentRes, pcRes, pvRes, approvedRes, rejectedRes, matchesRes] =
        await Promise.allSettled([
          enrollmentApi.list({ page: 1, pageSize: 5 }, { silentError: true }),
          enrollmentApi.list(
            { page: 1, pageSize: 1, status: 'PENDING_CITY_REVIEW' },
            { silentError: true },
          ),
          enrollmentApi.list(
            { page: 1, pageSize: 1, status: 'PENDING_PROVINCE_REVIEW' },
            { silentError: true },
          ),
          enrollmentApi.list({ page: 1, pageSize: 1, status: 'APPROVED' }, { silentError: true }),
          enrollmentApi.list({ page: 1, pageSize: 1, status: 'REJECTED' }, { silentError: true }),
          matchApi.list({ page: 1, pageSize: 5, status: isRecorder.value ? undefined : 'SCHEDULED' }),
        ])
      const recent =
        recentRes.status === 'fulfilled' ? recentRes.value : { items: [] as Enrollment[], total: 0 }
      const matches =
        matchesRes.status === 'fulfilled' ? matchesRes.value : { items: [] as Match[], total: 0 }
      recentEnrollments.value = recent.items
      counts.value = {
        all: recent.total,
        pendingCity: pcRes.status === 'fulfilled' ? pcRes.value.total : 0,
        pendingProvince: pvRes.status === 'fulfilled' ? pvRes.value.total : 0,
        approved: approvedRes.status === 'fulfilled' ? approvedRes.value.total : 0,
        rejected: rejectedRes.status === 'fulfilled' ? rejectedRes.value.total : 0,
      }

      if ((isSchool.value || isTeam.value) && !isReviewer.value) {
        // 学校端 / 球队端只应看到本校或本队的赛程，不能把全省赛程当成“我的比赛”。
        // /teams/{id}/matches 尚未实现，改用已交付的 /matches?teamId 过滤。
        const teamMatchPages = await Promise.allSettled(
          schoolTeams.value.map((team) =>
            matchApi.list({ teamId: team.id, page: 1, pageSize: 100 }),
          ),
        )
        const upcoming = teamMatchPages
          .flatMap((page) => (page.status === 'fulfilled' ? page.value.items : []))
          .filter((match) => match.status === 'SCHEDULED')
          .filter((match, index, all) => all.findIndex((item) => item.id === match.id) === index)
          .sort((left, right) => dayjs(left.kickoffAt).valueOf() - dayjs(right.kickoffAt).valueOf())
        upcomingMatchTotal.value = upcoming.length
        recentMatches.value = upcoming.slice(0, 5)
      } else {
        upcomingMatchTotal.value = matches.total
        recentMatches.value = matches.items
      }
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
        <span class="welcome-card__eyebrow">
          2026 赛季 · {{ workspaceLabel }}
        </span>
        <h1>{{ greeting }}，{{ auth.displayName }}</h1>
        <p>{{ roleText }}</p>
        <div class="welcome-card__meta">
          <span><el-icon><Calendar /></el-icon>{{ today }}</span>
          <span class="dot" />
          <span>{{ organizationText }}</span>
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
            {{ isPlayer ? '最近材料' : isRecorder ? '近期比赛' : isSchool ? '本校球队' : '最近报名' }}
            <small>
              {{ isPlayer ? '按更新时间排序' : isSchool ? '按学段与认证状态' : '按状态与时间排序' }}
            </small>
          </div>
          <el-button
            text
            type="primary"
            @click="
              go(
                isPlayer
                  ? '/console/materials'
                  : isRecorder
                    ? '/console/matches'
                    : isSchool
                      ? '/console/school/teams'
                      : '/console/enrollments',
              )
            "
          >
            查看全部
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </div>

        <template v-if="isSchool">
          <div v-if="schoolTeams.length" class="mini-list">
            <div
              v-for="team in schoolTeams"
              :key="team.id"
              class="mini-row mini-row--link"
              @click="go(`/console/team/profile?teamId=${team.id}`)"
            >
              <span class="mini-row__icon"><el-icon><Trophy /></el-icon></span>
              <div class="mini-row__body">
                <strong>{{ team.name }}</strong>
                <small>
                  {{ team.campusName || '本部' }} · {{ categoryLabel(team.category) }} ·
                  {{ team.memberCount || 0 }} 名球员 · {{ team.coachName || '未设置教练' }}
                </small>
              </div>
              <el-tag :type="team.status === 'APPROVED' ? 'success' : 'warning'" effect="plain" size="small">
                {{ team.status === 'APPROVED' ? '已认证' : '待认证' }}
              </el-tag>
              <el-icon class="mini-row__arrow"><ArrowRight /></el-icon>
            </div>
          </div>
          <el-empty v-else description="本校还没有球队" :image-size="80">
            <el-button type="primary" plain @click="go('/console/school/teams')">前往创建球队</el-button>
          </el-empty>
        </template>

        <template v-else-if="isPlayer">
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
          <el-empty
            v-else
            :description="materialsRestricted ? '履历材料的数据范围暂未向教练/运动员开放' : '还没有上传履历材料'"
            :image-size="80"
          >
            <el-button v-if="!materialsRestricted" type="primary" plain @click="go('/console/materials')">
              上传第一份材料
            </el-button>
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
                <strong>{{ match.homeTeamName || '未关联球队' }} vs {{ match.awayTeamName || '未关联球队' }}</strong>
                <small>{{ match.groupName }} · {{ dayjs(match.kickoffAt).format('MM-DD HH:mm') }} · {{ match.venue }}</small>
              </div>
              <StatusTag :status="match.status" kind="match" />
            </div>
          </div>
          <el-empty v-else description="近期没有比赛安排" :image-size="80" />
        </template>

        <template v-else>
          <div v-if="recentEnrollments.length" class="mini-list">
            <div
              v-for="row in recentEnrollments"
              :key="row.id"
              class="mini-row mini-row--link"
              @click="go(`/console/enrollments/${row.id}`)"
            >
              <span class="mini-row__icon">{{ row.teamName.slice(0, 1) }}</span>
              <div class="mini-row__body">
                <strong>{{ row.teamName }}</strong>
                <small>
                  {{ row.schoolName || '—' }} · {{ row.campusName || '本部' }} · {{ row.groupName }} ·
                  更新 {{ dayjs(row.updatedAt).format('MM-DD HH:mm') }}
                </small>
              </div>
              <StatusTag :status="row.status" kind="enrollment" />
              <el-icon class="mini-row__arrow"><ArrowRight /></el-icon>
            </div>
          </div>
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
          <span class="season-card__eyebrow">{{ seasonEvent?.name || '当前赛事' }}</span>
          <h3>{{ seasonTitle }}</h3>
          <template v-if="seasonEvent">
            <div class="season-progress">
              <div class="season-progress__bar">
                <span :style="{ width: `${seasonProgress}%` }" />
              </div>
              <div class="season-progress__meta">
                <span>{{ phaseLabel }}</span>
                <strong class="num">{{ seasonProgress }}%</strong>
              </div>
            </div>
            <ul>
              <li><span>报名时间</span><strong>{{ registrationRange }}</strong></li>
              <li><span>阶段周期</span><strong>{{ phaseRange }}</strong></li>
              <li>
                <span>当前状态</span>
                <StatusTag :status="seasonEvent.status" kind="event" />
              </li>
            </ul>
          </template>
          <el-empty v-else description="暂无赛事信息" :image-size="64" />
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
  overflow: hidden;
  font-size: 10px;
  color: var(--ink-300);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.mini-row__arrow {
  flex-shrink: 0;
  color: var(--ink-300);
  font-size: 12px;
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
