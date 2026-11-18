import dayjs from 'dayjs'
import { ref } from 'vue'
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

/**
 * 展示层时钟：比赛状态要随时间自己往前走，不能只等接口刷新。
 * 每分钟推进一次，凡是调用 matchDisplayStatus 的计算属性与模板都会跟着重算。
 */
export const portalClock = ref(Date.now())
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    portalClock.value = Date.now()
  }, 60_000)
}

/** 从开球到结束的合理时长（含中场与补时）：开球超过这个时长还没确认赛果，就按已结束展示。 */
export const MATCH_LIVE_WINDOW_MINUTES = 150
/** 状态仍写着“进行中”但开球已超过该时长，视为赛况没更新，不再占用“进行中”。 */
export const MATCH_STALE_LIVE_MINUTES = 360

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

/**
 * 展示状态 = 记录的赛况 + 开球时间推算。
 *
 * 只按接口里的 status 展示会让过期数据一直停在“未开赛/进行中”：
 * 开球时间已过的场次，短窗口内按“进行中”，超过常规时长按“已结束”。
 * 已取消、已结束（组委会确认）保持不变，不会被时间改写。
 */
export function matchDisplayStatus(match: PublicMatch): MatchDisplayStatus {
  const recorded = match.status
  if (recorded === 'FINISHED' || recorded === 'CANCELLED') return recorded
  if (!match.kickoffAt) return recorded
  const kickoff = dayjs(match.kickoffAt)
  if (!kickoff.isValid()) return recorded

  const elapsed = dayjs(portalClock.value).diff(kickoff, 'minute')
  // 记录台手动置为“进行中”时以人工状态为准：提前开赛或改期后未同步开球时间，
  // 门户都应显示进行中，而不是按开球时间倒推成“未开赛”。
  if (recorded === 'LIVE') {
    if (elapsed < 0) return 'LIVE'
    return elapsed > MATCH_STALE_LIVE_MINUTES ? 'FINISHED' : 'LIVE'
  }
  if (elapsed < 0) return 'SCHEDULED'
  return elapsed <= MATCH_LIVE_WINDOW_MINUTES ? 'LIVE' : 'FINISHED'
}

/**
 * 已到结束时间但组委会还没确认赛果：比分不能拿 0:0 冒充结果，
 * 页面按“待确认”展示，等后台录入并发布赛果后自动变成真实比分。
 */
export function matchResultPending(match: PublicMatch): boolean {
  return matchDisplayStatus(match) === 'FINISHED' && match.status !== 'FINISHED'
}

/** 单侧比分：未开赛/赛果待确认给占位符，不拿 0 冒充真实比分。 */
export function matchSideScore(match: PublicMatch, side: 'home' | 'away'): string {
  const display = matchDisplayStatus(match)
  if (display === 'SCHEDULED' || display === 'CANCELLED') return '–'
  if (matchResultPending(match)) return '–'
  return String(side === 'home' ? match.homeScore : match.awayScore)
}

/** 中间比分文案：进行中与已确认赛果给 "a : b"，其余给文字占位。 */
export function matchScoreLabel(match: PublicMatch): string {
  const display = matchDisplayStatus(match)
  if (display === 'SCHEDULED') return 'VS'
  if (display === 'CANCELLED') return '—'
  if (matchResultPending(match)) return '待确认'
  return `${match.homeScore} : ${match.awayScore}`
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
