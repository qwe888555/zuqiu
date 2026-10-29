import type { CoachCategory, GroupCategory, RoleCode, SubjectType } from '../api/types'

/** 各端完整名称：用于登录页、账号管理等需要说明角色归属的场景 */
export const ROLE_LABELS: Record<RoleCode, string> = {
  TEAM: '球队端',
  // 接口沿用 UNIVERSITY 编码；前端统一按“学校端”展示。
  UNIVERSITY: '学校端',
  CITY: '市州审核端',
  PROVINCE_REVIEWER: '省级审核端',
  ATHLETE: '运动员',
  COACH: '教练员',
  ADMIN: '管理员',
  MATCH_RECORDER: '赛事记录员',
}

/** 控制台内的简称：用于顶栏身份、权限矩阵等空间有限的场景 */
export const ROLE_MENU_LABELS: Record<RoleCode, string> = {
  TEAM: '球队管理员',
  UNIVERSITY: '学校管理员',
  CITY: '市州管理员',
  PROVINCE_REVIEWER: '省级审核员',
  ATHLETE: '运动员',
  COACH: '教练员',
  ADMIN: '系统管理员',
  MATCH_RECORDER: '比赛记录员',
}

export const CATEGORY_LABELS: Record<GroupCategory, string> = {
  PRIMARY: '小学',
  MIDDLE: '中学',
}

export const CATEGORY_GROUP_LABELS: Record<GroupCategory, string> = {
  PRIMARY: '小学组',
  MIDDLE: '中学组',
}

/** 成员5 对阵接口的裁判岗位枚举。 */
export const REFEREE_ROLE_LABELS: Record<string, string> = {
  REFEREE: '主裁判',
  ASSISTANT: '助理裁判',
  FOURTH_OFFICIAL: '第四官员',
  OTHER: '比赛监督',
}

export function refereeRoleLabel(role?: string): string {
  return role ? REFEREE_ROLE_LABELS[role] || role : '裁判'
}

/** 报名审核记录动作（报名与审核文档 2.1）。 */
export const REVIEW_ACTION_LABELS: Record<string, string> = {
  SUBMIT: '提交报名',
  APPROVE: '审核通过',
  REJECT: '审核驳回',
  RETURN_FOR_CORRECTION: '退回补正',
  WITHDRAW: '撤回',
}

export function reviewActionLabel(action?: string): string {
  return action ? REVIEW_ACTION_LABELS[action] || action : '提交报名'
}

export const EDUCATION_LABELS: Record<string, string> = {
  PRIMARY: '小学',
  JUNIOR: '初中',
  SENIOR: '高中',
  UNIVERSITY: '大学',
}

export function educationLabel(education?: string): string {
  if (!education) return '未填写'
  return EDUCATION_LABELS[education] || education
}

/** 后端 position 字典值：GK/DF/MF/FW。 */
export const POSITION_LABELS: Record<string, string> = {
  GK: '守门员',
  DF: '后卫',
  MF: '中场',
  FW: '前锋',
}

export function positionLabel(position?: string): string {
  if (!position) return '—'
  return POSITION_LABELS[position] || position
}

export const COACH_CATEGORY_LABELS: Record<CoachCategory, string> = {
  HEAD_COACH: '主教练',
  ASSISTANT_COACH: '助理教练',
  MANAGER: '领队',
  OTHER: '其他',
}

export function coachCategoryLabel(category?: CoachCategory | string): string {
  if (!category) return '教练员'
  return COACH_CATEGORY_LABELS[category as CoachCategory] || category
}

export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  SCHOOL_TEAM: '学校报送',
  CITY: '历史市州代报',
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
