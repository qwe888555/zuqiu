import type { Organization, RoleCode } from '../api/types'

/**
 * 与后端 `common.scopes.ROLE_POLICY` 对齐的账号角色策略。
 * 建号（可授予）与改号（可管理目标）共用：能建的角色必须能管。
 */
export const ACCOUNT_ROLE_POLICY: Record<RoleCode, readonly RoleCode[]> = {
  ADMIN: [
    'ADMIN',
    'PROVINCE_REVIEWER',
    'CITY',
    'UNIVERSITY',
    'TEAM',
    'MATCH_RECORDER',
    'ATHLETE',
    'COACH',
  ],
  PROVINCE_REVIEWER: ['CITY', 'UNIVERSITY', 'TEAM', 'MATCH_RECORDER', 'ATHLETE', 'COACH'],
  CITY: ['UNIVERSITY', 'TEAM', 'MATCH_RECORDER', 'ATHLETE', 'COACH'],
  UNIVERSITY: ['TEAM', 'ATHLETE', 'COACH'],
  TEAM: [],
  ATHLETE: [],
  COACH: [],
  MATCH_RECORDER: [],
}

/** 当前登录账号可授予、可管理的角色并集（多角色取并集）。 */
export function accountPolicyRoles(roles: readonly RoleCode[]): Set<RoleCode> {
  const allowed = new Set<RoleCode>()
  for (const role of roles) {
    for (const target of ACCOUNT_ROLE_POLICY[role] || []) allowed.add(target)
  }
  return allowed
}

/**
 * 与后端 `ROLE_ORG_TYPES` 对齐：角色只能绑定指定类型的组织节点。
 * 未列出的角色（ATHLETE/COACH/MATCH_RECORDER/ADMIN）不限制组织类型。
 */
export const ROLE_ORG_TYPES: Partial<
  Record<RoleCode, readonly Organization['orgType'][]>
> = {
  TEAM: ['TEAM'],
  UNIVERSITY: ['UNIVERSITY', 'SCHOOL'],
  CITY: ['CITY'],
  PROVINCE_REVIEWER: ['PROVINCE'],
}

/**
 * 从当前账号自身角色推断其固定组织节点类型。
 * 多角色取交集；无法确定时返回空集合，只允许不限制组织类型的角色。
 */
export function accountOrgTypes(
  roles: readonly RoleCode[],
): Set<Organization['orgType']> {
  let inferred: Set<Organization['orgType']> | null = null
  for (const role of roles) {
    const types = ROLE_ORG_TYPES[role]
    if (!types?.length) continue
    const current = new Set<Organization['orgType']>(types)
    if (!inferred) {
      inferred = current
      continue
    }
    for (const type of inferred) {
      if (!current.has(type)) inferred.delete(type)
    }
    if (!inferred.size) break
  }
  return inferred || new Set()
}

/** 角色能否绑定到指定的组织节点类型。 */
export function roleFitsOrg(
  role: RoleCode,
  orgTypes: ReadonlySet<Organization['orgType']>,
): boolean {
  const required = ROLE_ORG_TYPES[role]
  if (!required?.length) return true
  return required.some((type) => orgTypes.has(type))
}

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
