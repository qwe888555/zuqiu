import type { Component } from 'vue'
import {
  Collection,
  DataAnalysis,
  Document,
  EditPen,
  FolderOpened,
  Grid,
  Key,
  List,
  Lock,
  Management,
  Medal,
  Message,
  Notebook,
  Odometer,
  OfficeBuilding,
  Picture,
  Setting,
  Stamp,
  Tickets,
  TrendCharts,
  Trophy,
  User,
  UserFilled,
  VideoCamera,
} from '@element-plus/icons-vue'
import type { RoleCode } from '../api/types'
import { workspaceLabelForRoles } from '../utils/roles'

export interface MenuEntry {
  key: string
  title: string
  path: string
  icon: Component
  roles: RoleCode[]
  badge?: string
}

export interface MenuSection {
  key: string
  title: string
  roles?: RoleCode[]
  items: MenuEntry[]
}

const ALL: RoleCode[] = [
  'TEAM',
  'UNIVERSITY',
  'CITY',
  'PROVINCE_REVIEWER',
  'ATHLETE',
  'COACH',
  'ADMIN',
  'MATCH_RECORDER',
]

const SUBMITTERS: RoleCode[] = ['TEAM', 'UNIVERSITY', 'CITY']
const REVIEWERS: RoleCode[] = ['CITY', 'PROVINCE_REVIEWER', 'ADMIN']
const PLAYERS: RoleCode[] = ['ATHLETE', 'COACH']

export const MENU_SECTIONS: MenuSection[] = [
  {
    key: 'overview',
    title: '总览',
    items: [
      { key: 'dashboard', title: '工作台', path: '/console/dashboard', icon: Odometer, roles: ALL },
    ],
  },
  {
    key: 'enrollment',
    title: '报名管理',
    items: [
      {
        key: 'enrollments',
        title: '报名单',
        path: '/console/enrollments',
        icon: Tickets,
        roles: SUBMITTERS,
      },
      {
        key: 'enrollment-stats',
        title: '报名统计',
        path: '/console/enrollment-stats',
        icon: DataAnalysis,
        roles: ['CITY', 'PROVINCE_REVIEWER', 'ADMIN'],
      },
      {
        key: 'review',
        title: '审核工作台',
        path: '/console/review',
        icon: Stamp,
        roles: REVIEWERS,
        badge: '审核',
      },
    ],
  },
  {
    key: 'competition',
    title: '赛事与比赛',
    items: [
      {
        key: 'matches',
        title: '比赛管理',
        path: '/console/matches',
        icon: Trophy,
        roles: ['ADMIN', 'PROVINCE_REVIEWER', 'MATCH_RECORDER', 'TEAM', 'UNIVERSITY', 'CITY'],
      },
      {
        key: 'events',
        title: '赛事与组别',
        path: '/console/events',
        icon: Trophy,
        roles: ['ADMIN', 'PROVINCE_REVIEWER'],
      },
    ],
  },
  {
    key: 'identity',
    title: '赛务核验',
    items: [
      {
        key: 'identity',
        title: '身份核验',
        path: '/console/identity',
        icon: VideoCamera,
        roles: ['ADMIN', 'PROVINCE_REVIEWER', 'MATCH_RECORDER'],
      },
    ],
  },
  {
    key: 'school',
    title: '学校管理',
    roles: ['UNIVERSITY'],
    items: [
      {
        key: 'school-teams',
        title: '本校球队',
        path: '/console/school/teams',
        icon: OfficeBuilding,
        roles: ['UNIVERSITY'],
      },
    ],
  },
  {
    key: 'team',
    title: '球队管理',
    items: [
      {
        key: 'teams-overview',
        title: '参赛队伍',
        path: '/console/teams-overview',
        icon: Trophy,
        roles: ['ADMIN', 'PROVINCE_REVIEWER'],
      },
      {
        key: 'team-profile',
        title: '球队资料',
        path: '/console/team/profile',
        icon: UserFilled,
        roles: ['TEAM', 'UNIVERSITY'],
      },
      {
        key: 'team-members',
        title: '球员名单',
        path: '/console/team/members',
        icon: User,
        roles: ['TEAM', 'UNIVERSITY'],
      },
      {
        key: 'team-coaches',
        title: '教练团队',
        path: '/console/team/coaches',
        icon: Management,
        roles: ['TEAM', 'UNIVERSITY'],
      },
    ],
  },
  {
    key: 'personal',
    title: '个人中心',
    items: [
      {
        key: 'profile',
        title: '个人资料',
        path: '/console/profile',
        icon: User,
        roles: PLAYERS,
      },
      {
        key: 'materials',
        title: '履历材料',
        path: '/console/materials',
        icon: Collection,
        roles: PLAYERS,
      },
      {
        key: 'my-teams',
        title: '我的球队',
        path: '/console/my-teams',
        icon: UserFilled,
        roles: PLAYERS,
      },
      {
        key: 'my-publications',
        title: '我的公示',
        path: '/console/my-publications',
        icon: Medal,
        roles: PLAYERS,
      },
    ],
  },
  {
    key: 'selection',
    title: '遴选管理',
    items: [
      {
        key: 'dossiers',
        title: '遴选档案',
        path: '/console/selection/dossiers',
        icon: FolderOpened,
        roles: ['ADMIN'],
      },
      {
        key: 'rules',
        title: '评分规则',
        path: '/console/selection/rules',
        icon: Setting,
        roles: ['ADMIN'],
      },
      {
        key: 'scoring',
        title: '评分录入',
        path: '/console/selection/scoring',
        icon: EditPen,
        roles: ['ADMIN'],
      },
      {
        key: 'summary',
        title: '排名汇总',
        path: '/console/selection/summary',
        icon: TrendCharts,
        roles: ['ADMIN'],
      },
      {
        key: 'results',
        title: '正式结果',
        path: '/console/selection/results',
        icon: Medal,
        roles: ['ADMIN'],
      },
    ],
  },
  {
    key: 'portal-ops',
    title: '门户运营',
    items: [
      {
        key: 'contents',
        title: '内容管理',
        path: '/console/cms/contents',
        icon: Document,
        roles: ['ADMIN', 'PROVINCE_REVIEWER'],
      },
      {
        key: 'resources',
        title: '门户资源',
        path: '/console/cms/resources',
        icon: Picture,
        roles: ['ADMIN', 'PROVINCE_REVIEWER'],
      },
      {
        key: 'publications',
        title: '公示管理',
        path: '/console/publications',
        icon: Medal,
        roles: ['ADMIN', 'PROVINCE_REVIEWER'],
      },
    ],
  },
  {
    key: 'system',
    title: '系统管理',
    items: [
      {
        key: 'people',
        title: '人员管理',
        path: '/console/admin/people',
        icon: User,
        roles: ['ADMIN', 'PROVINCE_REVIEWER'],
      },
      {
        key: 'subjects',
        title: '参赛主体',
        path: '/console/admin/subjects',
        icon: Grid,
        roles: ['ADMIN'],
      },
      {
        key: 'accounts',
        title: '参赛账号',
        path: '/console/admin/accounts',
        icon: Key,
        roles: ['ADMIN', 'PROVINCE_REVIEWER'],
      },
      {
        key: 'permissions',
        title: '权限矩阵',
        path: '/console/admin/permissions',
        icon: Lock,
        roles: ['ADMIN'],
      },
      {
        key: 'organizations',
        title: '组织结构',
        path: '/console/admin/organizations',
        icon: OfficeBuilding,
        roles: ['ADMIN'],
      },
      {
        key: 'dictionaries',
        title: '数据字典',
        path: '/console/admin/dictionaries',
        icon: Notebook,
        roles: ['ADMIN'],
      },
      {
        key: 'logs',
        title: '操作日志',
        path: '/console/admin/logs',
        icon: List,
        roles: ['ADMIN', 'PROVINCE_REVIEWER'],
      },
    ],
  },
  {
    key: 'message',
    title: '消息中心',
    items: [
      { key: 'messages', title: '我的消息', path: '/console/messages', icon: Message, roles: ALL },
    ],
  },
]

/** 菜单严格按 roles 过滤：管理员也只能看到自己 roles 明确包含的菜单，避免出现"管理员的我的球队"这类身份错位。 */
const MATCH_MANAGERS: RoleCode[] = ['ADMIN', 'PROVINCE_REVIEWER', 'MATCH_RECORDER']

export function visibleSections(roles: RoleCode[]): MenuSection[] {
  const workspaceLabel = workspaceLabelForRoles(roles)
  const canManageMatch = MATCH_MANAGERS.some((role) => roles.includes(role))
  return MENU_SECTIONS.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => item.roles.some((r) => roles.includes(r)))
      .map((item) => {
        if (item.key === 'dashboard') return { ...item, title: workspaceLabel }
        if (item.key === 'enrollments') {
          if (roles.includes('UNIVERSITY')) return { ...item, title: '本校报名' }
          if (roles.includes('TEAM')) return { ...item, title: '报名进度' }
          if (roles.includes('CITY')) return { ...item, title: '本市报名' }
        }
        // 参赛方只有查看权限，菜单名称不应让人误以为可以编排比赛。
        if (item.key === 'matches' && !canManageMatch) return { ...item, title: '赛程与比分' }
        return item
      }),
  })).filter((section) => section.items.length > 0)
}

export function menuEntriesFor(roles: RoleCode[]): MenuEntry[] {
  return visibleSections(roles).flatMap((s) => s.items)
}

export { ROLE_MENU_LABELS } from './labels'
