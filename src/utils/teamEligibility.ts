import type { EventGroup, Team } from '../api/types'

/**
 * 球队可报组别匹配。
 *
 * 后端球队 `category` 存在两种历史口径：
 * - PRIMARY / MIDDLE：直接对应组别学段；
 * - U12 / U15 / U18 / U15_MALE：年龄组编码，需用组别 minAge/maxAge 判断，
 *   不能直接和组别的 PRIMARY/MIDDLE 比较。
 */
export function teamAgeBound(category?: string): number | undefined {
  if (!category) return undefined
  const matched = category.trim().toUpperCase().match(/^U(\d{1,2})(?:_|$)/)
  if (!matched) return undefined
  const age = Number(matched[1])
  return Number.isFinite(age) ? age : undefined
}

export function teamMatchesGroupCategory(
  category: string | undefined,
  group: { category: string; minAge?: number; maxAge?: number },
): boolean {
  if (!category) return true
  const normalized = category.trim().toUpperCase()
  if (normalized === 'PRIMARY' || normalized === 'MIDDLE') {
    return normalized === String(group.category).toUpperCase()
  }
  const age = teamAgeBound(normalized)
  if (age === undefined) return true
  if (typeof group.minAge === 'number' && typeof group.maxAge === 'number') {
    return age >= group.minAge && age <= group.maxAge
  }
  return (age <= 12 ? 'PRIMARY' : 'MIDDLE') === String(group.category).toUpperCase()
}

/** 球队是否满足组别的学段与性别要求；认证状态由调用方另行拦截。 */
export function teamMatchesGroup(
  team: Pick<Team, 'gender'> & { category?: string },
  group: Pick<EventGroup, 'category' | 'gender' | 'minAge' | 'maxAge'>,
): boolean {
  if (!teamMatchesGroupCategory(team.category, group)) return false
  if (group.gender !== 'MIXED' && team.gender && team.gender !== group.gender) return false
  return true
}
