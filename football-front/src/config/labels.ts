import type { GroupCategory, RoleCode, SubjectType } from '../api/types'

/** 各端完整名称：用于登录页、账号管理等需要说明角色归属的场景 */
export const ROLE_LABELS: Record<RoleCode, string> = {
  TEAM: '中小学球队端',
  UNIVERSITY: '高校端',
  CITY: '市州审核端',
  PROVINCE_REVIEWER: '省级审核端',
  ATHLETE: '运动员',
  COACH: '教练员',
  ADMIN: '管理员',
  MATCH_RECORDER: '赛事记录员',
}

/** 控制台内的简称：用于顶栏身份、权限矩阵等空间有限的场景 */
export const ROLE_MENU_LABELS: Record<RoleCode, string> = {
  TEAM: '学校球队',
  UNIVERSITY: '高校',
  CITY: '市州管理员',
  PROVINCE_REVIEWER: '省级审核员',
  ATHLETE: '运动员',
  COACH: '教练员',
  ADMIN: '系统管理员',
  MATCH_RECORDER: '比赛记录员',
}

export const CATEGORY_LABELS: Record<GroupCategory, string> = {
  PRIMARY: '小学',
  MIDDLE: '初中',
  UNIVERSITY: '大学',
}

export const CATEGORY_GROUP_LABELS: Record<GroupCategory, string> = {
  PRIMARY: '小学组',
  MIDDLE: '初中组',
  UNIVERSITY: '大学组',
}

export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  SCHOOL_TEAM: '学校球队',
  UNIVERSITY: '高校',
  CITY: '市州代报',
}

export function roleLabel(role: RoleCode | string): string {
  return ROLE_LABELS[role as RoleCode] || role
}

export function categoryLabel(category?: GroupCategory | string, suffix = ''): string {
  if (!category) return '—'
  return `${CATEGORY_LABELS[category as GroupCategory] || category}${suffix}`
}

export function subjectTypeLabel(type?: SubjectType | string): string {
  if (!type) return '—'
  return SUBJECT_TYPE_LABELS[type as SubjectType] || type
}
