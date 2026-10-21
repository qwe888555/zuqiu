import dayjs from 'dayjs'
import type { PublicMatch } from '../api/types'

export const FOLLOW_TEAM_KEY = 'football.portal.follow-team'

/** 足球比赛从开球到确认赛果通常不超过 4 小时，超过后不再按“进行中”展示。 */
export const MATCH_STALE_MINUTES = 240

export type MatchDisplayStatus = PublicMatch['status'] | 'STALE'

export interface MatchSection {
  key: MatchDisplayStatus
  label: string
  tone: 'live' | 'upcoming' | 'stale' | 'finished'
}

export const MATCH_SECTIONS: MatchSection[] = [
  { key: 'LIVE', label: '正在进行', tone: 'live' },
  { key: 'SCHEDULED', label: '即将开始', tone: 'upcoming' },
  { key: 'STALE', label: '赛况待更新', tone: 'stale' },
  { key: 'FINISHED', label: '最近结束', tone: 'finished' },
  { key: 'CANCELLED', label: '已取消', tone: 'finished' },
]

export function isMatchStale(
  match: Pick<PublicMatch, 'status' | 'kickoffAt'>,
  now = dayjs(),
): boolean {
  if (!match.kickoffAt) return false
  if (match.status !== 'LIVE' && match.status !== 'SCHEDULED') return false
  return now.diff(dayjs(match.kickoffAt), 'minute') > MATCH_STALE_MINUTES
}

/**
 * 公开接口没有返回“赛况最后更新时间”，因此只能依据开球时间做保守判断。
 * 超时仍为 LIVE、或开球时间已过仍为 SCHEDULED 的场次改为“赛况待更新”，
 * 避免页面把旧数据当作实时比分或“即将开始”。
 */
export function matchDisplayStatus(match: Pick<PublicMatch, 'status' | 'kickoffAt'>): MatchDisplayStatus {
  return isMatchStale(match) ? 'STALE' : match.status
}

export function matchStatusOrder(status: MatchDisplayStatus): number {
  switch (status) {
    case 'LIVE':
      return 0
    case 'SCHEDULED':
      return 1
    case 'STALE':
      return 2
    case 'FINISHED':
      return 3
    default:
      return 4
  }
}

export function sortPublicMatches(list: PublicMatch[]): PublicMatch[] {
  return [...list].sort((a, b) => {
    const statusA = matchDisplayStatus(a)
    const statusB = matchDisplayStatus(b)
    const orderA = matchStatusOrder(statusA)
    const orderB = matchStatusOrder(statusB)
    if (orderA !== orderB) return orderA - orderB
    const timeA = a.kickoffAt ? dayjs(a.kickoffAt).valueOf() : Number.MAX_SAFE_INTEGER
    const timeB = b.kickoffAt ? dayjs(b.kickoffAt).valueOf() : Number.MAX_SAFE_INTEGER
    // 即将开始按时间升序；已结束的场次把最近一场放在最前。
    return statusA === 'FINISHED' || statusA === 'CANCELLED' ? timeB - timeA : timeA - timeB
  })
}

export function readFollowedTeam(): string {
  try {
    return localStorage.getItem(FOLLOW_TEAM_KEY) || ''
  } catch {
    return ''
  }
}

export function saveFollowedTeam(teamName: string) {
  try {
    if (teamName) localStorage.setItem(FOLLOW_TEAM_KEY, teamName)
    else localStorage.removeItem(FOLLOW_TEAM_KEY)
  } catch {
    // 本地存储不可用时仅保留当前会话
  }
}

export function policyKind(title: string): string {
  if (/报名|材料/.test(title)) return '报名指南'
  if (/资格|学籍|审查/.test(title)) return '资格要求'
  if (/安全|医疗|应急|保障/.test(title)) return '赛事保障'
  if (/规程|竞赛|赛制/.test(title)) return '竞赛规程'
  return '政策文件'
}

export function formatBeijing(value?: string, template = 'MM月DD日 HH:mm'): string {
  return value ? dayjs(value).format(template) : '待定'
}
