import dayjs from 'dayjs'
import type { PublicEvent, PublicMatch } from '../api/types'

export const FOLLOW_TEAM_KEY = 'football.portal.follow-team'

/** 门户赛事默认顺序：进行中 > 报名截止 > 报名中 > 已结束，同状态按赛季倒序。 */
export function sortPublicEvents(list: PublicEvent[]): PublicEvent[] {
  const priority: Record<PublicEvent['status'], number> = {
    RUNNING: 0,
    REGISTRATION_CLOSED: 1,
    REGISTRATION_OPEN: 2,
    FINISHED: 3,
    DRAFT: 4,
  }
  return [...list].sort(
    (a, b) =>
      (priority[a.status] ?? 9) - (priority[b.status] ?? 9) ||
      String(b.season).localeCompare(String(a.season)),
  )
}

export type MatchDisplayStatus = PublicMatch['status']

export interface MatchSection {
  key: MatchDisplayStatus
  label: string
  tone: 'live' | 'upcoming' | 'finished'
}

export const MATCH_SECTIONS: MatchSection[] = [
  { key: 'LIVE', label: '正在进行', tone: 'live' },
  { key: 'SCHEDULED', label: '即将开始', tone: 'upcoming' },
  { key: 'FINISHED', label: '最近结束', tone: 'finished' },
  { key: 'CANCELLED', label: '已取消', tone: 'finished' },
]

export function matchDisplayStatus(match: PublicMatch): MatchDisplayStatus {
  return match.status
}

export function matchStatusOrder(status: MatchDisplayStatus): number {
  switch (status) {
    case 'LIVE':
      return 0
    case 'SCHEDULED':
      return 1
    case 'FINISHED':
      return 2
    default:
      return 3
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
