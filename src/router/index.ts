import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import { homeForRoles } from '../utils/roles'
import type { RoleCode } from '../api/types'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    roles?: RoleCode[]
    requiresAuth?: boolean
    guestOnly?: boolean
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../layouts/PortalLayout.vue'),
    children: [
      { path: '', name: 'portal-home', component: () => import('../views/portal/HomeView.vue'), meta: { title: '首页' } },
      { path: 'news', name: 'news', component: () => import('../views/portal/NewsListView.vue'), meta: { title: '赛事资讯' } },
      { path: 'news/:id', name: 'news-detail', component: () => import('../views/portal/ContentDetailView.vue'), meta: { title: '新闻详情' } },
      { path: 'policies', name: 'policies', component: () => import('../views/portal/PolicyListView.vue'), meta: { title: '政策公告' } },
      { path: 'policies/:id', name: 'policy-detail', component: () => import('../views/portal/ContentDetailView.vue'), meta: { title: '政策详情' } },
      { path: 'matches', name: 'portal-matches', component: () => import('../views/portal/PortalMatchesView.vue'), meta: { title: '赛程与比分' } },
      { path: 'matches/:id', name: 'portal-match-detail', component: () => import('../views/portal/PublicMatchDetailView.vue'), meta: { title: '比赛详情' } },
      { path: 'rankings', name: 'rankings', component: () => import('../views/portal/RankingsView.vue'), meta: { title: '射手榜' } },
      { path: 'publications', name: 'portal-publications', component: () => import('../views/portal/PublicationsView.vue'), meta: { title: '公示查询' } },
      {
        path: 'publications/:id',
        name: 'portal-publication-detail',
        component: () => import('../views/portal/PublicationDetailView.vue'),
        meta: { title: '公示详情' },
      },
    ],
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/auth/LoginView.vue'),
    meta: { title: '登录', guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/auth/RegisterView.vue'),
    meta: { title: '账号注册', guestOnly: true },
  },
  {
    path: '/console',
    component: () => import('../layouts/ConsoleLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/console/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/console/DashboardView.vue'), meta: { title: '工作台' } },
      {
        path: 'school/teams',
        name: 'school-teams',
        component: () => import('../views/school/SchoolTeamsView.vue'),
        meta: { title: '本校球队', roles: ['UNIVERSITY'] },
      },
      {
        path: 'forbidden',
        name: 'forbidden',
        component: () => import('../views/console/ForbiddenView.vue'),
        meta: { title: '无权访问' },
      },
      {
        path: 'enrollments',
        name: 'enrollments',
        component: () => import('../views/enrollment/EnrollmentListView.vue'),
        meta: { title: '报名单', roles: ['TEAM', 'UNIVERSITY', 'CITY', 'ADMIN'] },
      },
      {
        path: 'enrollments/create',
        name: 'enrollment-create',
        component: () => import('../views/enrollment/EnrollmentWizardView.vue'),
        // 学校是唯一报送主体；schoolOnly 在守卫中优先于 ADMIN 的全角色放行。
        meta: { title: '新建报名', roles: ['UNIVERSITY'], schoolOnly: true },
      },
      {
        path: 'enrollments/:id',
        name: 'enrollment-detail',
        component: () => import('../views/enrollment/EnrollmentDetailView.vue'),
        meta: { title: '报名详情', roles: ['TEAM', 'UNIVERSITY', 'CITY', 'PROVINCE_REVIEWER', 'ADMIN'] },
      },
      {
        path: 'enrollment-stats',
        name: 'enrollment-stats',
        component: () => import('../views/stats/EnrollmentStatsView.vue'),
        meta: { title: '报名统计', roles: ['CITY', 'PROVINCE_REVIEWER', 'ADMIN'] },
      },
      {
        path: 'review',
        name: 'review',
        component: () => import('../views/review/ReviewWorkbenchView.vue'),
        meta: { title: '审核工作台', roles: ['CITY', 'PROVINCE_REVIEWER', 'ADMIN'] },
      },
      {
        path: 'matches',
        name: 'matches',
        component: () => import('../views/matches/MatchListView.vue'),
        meta: {
          title: '比赛管理',
          roles: ['ADMIN', 'PROVINCE_REVIEWER', 'MATCH_RECORDER', 'TEAM', 'UNIVERSITY', 'CITY'],
        },
      },
      {
        path: 'matches/:id/console',
        name: 'match-console',
        component: () => import('../views/matches/MatchConsoleView.vue'),
        meta: { title: '比赛记录台', roles: ['ADMIN', 'PROVINCE_REVIEWER', 'MATCH_RECORDER'] },
      },
      {
        path: 'events',
        name: 'events',
        component: () => import('../views/events/EventConfigView.vue'),
        meta: { title: '赛事与组别', roles: ['ADMIN', 'PROVINCE_REVIEWER'] },
      },
      {
        path: 'team/profile',
        name: 'team-profile',
        component: () => import('../views/team/TeamProfileView.vue'),
        meta: { title: '球队资料', roles: ['TEAM', 'UNIVERSITY'] },
      },
      {
        path: 'team/members',
        name: 'team-members',
        component: () => import('../views/team/TeamMembersView.vue'),
        meta: { title: '球员名单', roles: ['TEAM', 'UNIVERSITY'] },
      },
      {
        path: 'team/coaches',
        name: 'team-coaches',
        component: () => import('../views/team/TeamCoachesView.vue'),
        meta: { title: '教练团队', roles: ['TEAM', 'UNIVERSITY'] },
      },
      {
        path: 'team/materials',
        redirect: '/console/team/profile?tab=materials',
        meta: { title: '球队资料', roles: ['TEAM', 'UNIVERSITY'] },
      },
      {
        path: 'profile',
        name: 'my-profile',
        component: () => import('../views/people/MyProfileView.vue'),
        meta: { title: '个人资料', roles: ['ATHLETE', 'COACH'] },
      },
      {
        path: 'materials',
        name: 'my-materials',
        component: () => import('../views/people/MaterialsView.vue'),
        meta: { title: '履历材料', roles: ['ATHLETE', 'COACH'] },
      },
      {
        path: 'affiliations',
        redirect: '/console/my-teams',
      },
      {
        path: 'my-teams',
        name: 'my-teams',
        component: () => import('../views/people/MyTeamsView.vue'),
        meta: { title: '我的球队', roles: ['ATHLETE', 'COACH'] },
      },
      {
        path: 'my-publications',
        name: 'my-publications',
        component: () => import('../views/people/MyPublicationsView.vue'),
        meta: { title: '我的公示', roles: ['ATHLETE', 'COACH'] },
      },
      {
        path: 'selection/dossiers',
        name: 'selection-dossiers',
        component: () => import('../views/selection/DossierView.vue'),
        meta: { title: '遴选档案', roles: ['ADMIN'] },
      },
      {
        path: 'selection/rules',
        name: 'selection-rules',
        component: () => import('../views/selection/RulesView.vue'),
        meta: { title: '评分规则', roles: ['ADMIN'] },
      },
      {
        path: 'selection/scoring',
        name: 'selection-scoring',
        component: () => import('../views/selection/ScoringView.vue'),
        meta: { title: '评分录入', roles: ['ADMIN'] },
      },
      {
        path: 'selection/summary',
        name: 'selection-summary',
        component: () => import('../views/selection/SummaryView.vue'),
        meta: { title: '排名汇总', roles: ['ADMIN'] },
      },
      {
        path: 'selection/results',
        name: 'selection-results',
        component: () => import('../views/selection/ResultsView.vue'),
        meta: { title: '正式结果', roles: ['ADMIN'] },
      },
      {
        path: 'cms/contents',
        name: 'cms-contents',
        component: () => import('../views/cms/ContentManageView.vue'),
        meta: { title: '内容管理', roles: ['ADMIN', 'PROVINCE_REVIEWER'] },
      },
      {
        path: 'cms/resources',
        name: 'cms-resources',
        component: () => import('../views/cms/ResourceManageView.vue'),
        meta: { title: '门户资源', roles: ['ADMIN', 'PROVINCE_REVIEWER'] },
      },
      {
        path: 'publications',
        name: 'publications-manage',
        component: () => import('../views/common/PublicationsManageView.vue'),
        meta: { title: '公示管理', roles: ['ADMIN', 'PROVINCE_REVIEWER'] },
      },
      {
        path: 'identity',
        name: 'identity-review',
        component: () => import('../views/common/IdentityReviewView.vue'),
        meta: { title: '身份核验', roles: ['ADMIN', 'PROVINCE_REVIEWER', 'MATCH_RECORDER'] },
      },
      {
        path: 'admin/people',
        name: 'admin-people',
        component: () => import('../views/admin/PeopleManageView.vue'),
        meta: { title: '人员管理', roles: ['ADMIN', 'PROVINCE_REVIEWER'] },
      },
      {
        path: 'admin/subjects',
        name: 'admin-subjects',
        component: () => import('../views/admin/SubjectsView.vue'),
        meta: { title: '参赛主体', roles: ['ADMIN'] },
      },
      {
        path: 'admin/accounts',
        name: 'admin-accounts',
        component: () => import('../views/admin/AccountsView.vue'),
        meta: { title: '参赛账号', roles: ['ADMIN', 'PROVINCE_REVIEWER'] },
      },
      {
        path: 'admin/organizations',
        name: 'admin-organizations',
        component: () => import('../views/admin/OrganizationsView.vue'),
        meta: { title: '组织结构', roles: ['ADMIN'] },
      },
      {
        path: 'admin/dictionaries',
        name: 'admin-dictionaries',
        component: () => import('../views/admin/DictionariesView.vue'),
        meta: { title: '数据字典', roles: ['ADMIN'] },
      },
      {
        path: 'admin/logs',
        name: 'admin-logs',
        component: () => import('../views/admin/LogsView.vue'),
        meta: { title: '操作日志', roles: ['ADMIN', 'PROVINCE_REVIEWER'] },
      },
      {
        path: 'admin/permissions',
        name: 'admin-permissions',
        component: () => import('../views/admin/PermissionsView.vue'),
        meta: { title: '权限矩阵', roles: ['ADMIN'] },
      },
      {
        path: 'teams-overview',
        name: 'teams-overview',
        component: () => import('../views/admin/TeamsView.vue'),
        meta: { title: '参赛队伍', roles: ['ADMIN', 'PROVINCE_REVIEWER'] },
      },
      {
        path: 'messages',
        name: 'messages',
        component: () => import('../views/common/MessagesView.vue'),
        meta: { title: '我的消息' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  document.title = to.meta.title ? `${to.meta.title} · 省级中小学足球联赛` : '省级中小学足球联赛'

  if (to.meta.guestOnly && auth.token) {
    // 已登录用户仍可主动打开登录页切换身份；其余情况直接回到所属角色的工作台。
    if (to.query.switch === '1') return true
    if (!auth.user) {
      try {
        await auth.fetchMe()
      } catch {
        auth.clear()
        return true
      }
    }
    return homeForRoles(auth.roles)
  }
  if (!to.meta.requiresAuth) return true

  if (!auth.token) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (!auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      auth.clear()
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }
  if (to.meta.schoolOnly && !auth.roles.includes('UNIVERSITY')) {
    ElMessage.warning('报名由学校端统一提交，请使用学校账号')
    return { name: 'forbidden', query: { from: to.fullPath } }
  }
  if (to.meta.roles && !auth.hasRole(to.meta.roles)) {
    ElMessage.warning('当前角色没有访问该页面的权限')
    return { name: 'forbidden', query: { from: to.fullPath } }
  }
  return true
})

export default router
