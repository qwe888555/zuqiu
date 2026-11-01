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

/**
 * 赛事类别与后端 EVENT_CATEGORIES 保持一致（2026-11 标准枚举）。
 * 省/市/校三级是赛事层级，CHAMPIONSHIP/FRIENDLY/OTHER 是其他类别；
 * 后端写入前会把旧编码归一化，前端筛选必须发送标准编码，否则精确筛选会落空。
 */
export const EVENT_CATEGORIES = [
  { value: 'PROVINCIAL_LEAGUE', label: '省级联赛' },
  { value: 'CITY_LEAGUE', label: '市级联赛' },
  { value: 'SCHOOL_LEAGUE', label: '校级联赛' },
  { value: 'CHAMPIONSHIP', label: '锦标赛' },
  { value: 'FRIENDLY', label: '友谊赛' },
  { value: 'OTHER', label: '其他' },
] as const

export const EVENT_LEVELS = [
  { value: 'PROVINCIAL_LEAGUE', label: '省级' },
  { value: 'CITY_LEAGUE', label: '市级' },
  { value: 'SCHOOL_LEAGUE', label: '学校级' },
] as const

export type EventLevel = (typeof EVENT_LEVELS)[number]['value']
export type EventCategory = (typeof EVENT_CATEGORIES)[number]['value']

/** 兼容旧前端与历史自由文本，后端 EVENT_CATEGORY_ALIASES 同口径。 */
const EVENT_CATEGORY_ALIASES: Record<string, EventCategory> = {
  PROVINCE: 'PROVINCIAL_LEAGUE',
  PROVINCIAL: 'PROVINCIAL_LEAGUE',
  PROVINCIAL_LEAGUE: 'PROVINCIAL_LEAGUE',
  CITY: 'CITY_LEAGUE',
  CITY_LEAGUE: 'CITY_LEAGUE',
  CITY_TOURNAMENT: 'CITY_LEAGUE',
  SCHOOL: 'SCHOOL_LEAGUE',
  SCHOOL_LEAGUE: 'SCHOOL_LEAGUE',
  SCHOOL_GAMES: 'SCHOOL_LEAGUE',
  CHAMPIONSHIP: 'CHAMPIONSHIP',
  CHAMPIONSHIPS: 'CHAMPIONSHIP',
  TOURNAMENT: 'CHAMPIONSHIP',
  FRIENDLY: 'FRIENDLY',
}

export function normalizeEventCategory(category?: string): EventCategory | '' {
  const value = (category || '').trim().toUpperCase()
  if (!value) return ''
  return EVENT_CATEGORY_ALIASES[value] || 'OTHER'
}

export function eventLevelOf(category?: string): EventLevel | '' {
  const value = normalizeEventCategory(category)
  return EVENT_LEVELS.some((level) => level.value === value) ? (value as EventLevel) : ''
}

/** 后端已返回 eventCategoryLabel 时优先使用，避免前端字典落后于后端。 */
export function eventCategoryLabel(category?: string, serverLabel?: string): string {
  if (serverLabel?.trim()) return serverLabel.trim()
  const value = normalizeEventCategory(category)
  if (!value) return '未分级'
  return EVENT_CATEGORIES.find((item) => item.value === value)?.label || category?.trim() || '未分级'
}

export function eventLevelLabel(category?: string, serverLabel?: string): string {
  const level = eventLevelOf(category)
  if (level) return EVENT_LEVELS.find((item) => item.value === level)?.label || level
  return eventCategoryLabel(category, serverLabel)
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
  UNIVERSITY: '高校报送',
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
