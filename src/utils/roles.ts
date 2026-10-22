import type { RoleCode } from '../api/types'

/**
 * 每个角色进入控制台后的默认落点。
 * 学校端与球队端共用工作台，但工作台内容按角色渲染，数据和操作范围不同。
 */
export const ROLE_HOME: Record<RoleCode, string> = {
  TEAM: '/console/dashboard',
  UNIVERSITY: '/console/dashboard',
  CITY: '/console/review',
  PROVINCE_REVIEWER: '/console/review',
  ATHLETE: '/console/dashboard',
  COACH: '/console/dashboard',
  MATCH_RECORDER: '/console/matches',
  ADMIN: '/console/dashboard',
}

/** 多角色账号按职责优先级选择落点，避免被低权限角色带到不合适的页面。 */
const HOME_PRIORITY: RoleCode[] = [
  'ADMIN',
  'PROVINCE_REVIEWER',
  'CITY',
  'UNIVERSITY',
  'TEAM',
  'MATCH_RECORDER',
  'ATHLETE',
  'COACH',
]

export const ROLE_WORKSPACE_LABEL: Record<RoleCode, string> = {
  TEAM: '球队工作台',
  UNIVERSITY: '学校工作台',
  CITY: '市州审核台',
  PROVINCE_REVIEWER: '省级工作台',
  ATHLETE: '运动员中心',
  COACH: '教练员中心',
  MATCH_RECORDER: '比赛记录台',
  ADMIN: '管理中心',
}

export function homeForRoles(roles: readonly RoleCode[]): string {
  const role = HOME_PRIORITY.find((item) => roles.includes(item))
  return role ? ROLE_HOME[role] : '/console/dashboard'
}

export function workspaceLabelForRoles(roles: readonly RoleCode[]): string {
  const role = HOME_PRIORITY.find((item) => roles.includes(item))
  return role ? ROLE_WORKSPACE_LABEL[role] : '工作台'
}

/**
 * 可以新建/提交报名的角色：学校是唯一报送主体。
 * 球队只读查看本队进度，市州只初审，管理员只做配置与审核。
 * 必须与 `/console/enrollments/create` 的路由角色保持一致。
 */
export function canEnroll(roles: readonly RoleCode[]): boolean {
  return roles.includes('UNIVERSITY')
}

/** 可以进入报名列表/详情页的角色；查看范围由后端数据权限决定。 */
export function canOpenEnrollment(roles: readonly RoleCode[]): boolean {
  return roles.some((role) => ['TEAM', 'UNIVERSITY', 'CITY', 'PROVINCE_REVIEWER', 'ADMIN'].includes(role))
}
