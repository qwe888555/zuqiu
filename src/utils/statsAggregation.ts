import type { MatchEvent, StatRow } from '../api/types'

/** 统计用的最小比赛结构，兼容内部 Match 与公开 PublicMatch。 */
export interface StatsMatch {
  id: string
  eventId?: string
  groupId?: string
  groupName?: string
  homeTeamId?: string
  awayTeamId?: string
  homeTeamName?: string
  awayTeamName?: string
  kickoffAt?: string
  status: string
  homeScore?: number
  awayScore?: number
  published?: boolean
  resultPublished?: boolean
}

export interface StandingRow {
  rank: number
  teamId: string
  teamName: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  points: number
}

/**
 * 归一战队名用于公开赛程匹配。公开接口不返回主客队 ID，只能按名称比对；
 * 必须保留“男子/女子”信息，否则同一学校的男女队会被误认为同一支球队。
 */
export function normalizeTeamName(name?: string): string {
  return (name || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/女子队/g, '女子')
    .replace(/男子队/g, '男子')
    .replace(/女队/g, '女子')
    .replace(/男队/g, '男子')
    .replace(/足球队/g, '')
    .trim()
}

function hasScore(match: StatsMatch): boolean {
  return typeof match.homeScore === 'number' && typeof match.awayScore === 'number'
}

/**
 * 按已结束且比分完整的比赛推算积分榜。
 * 仅用于展示“按赛果推算”的名次，不等同于组委会官方奖项；
 * 淘汰赛不适用积分排序，调用方需自行说明。
 */
export function buildStandings(matches: readonly StatsMatch[]): StandingRow[] {
  const table = new Map<string, Omit<StandingRow, 'rank'>>()
  const ensure = (teamId: string, teamName: string) => {
    const key = teamId || teamName
    let row = table.get(key)
    if (!row) {
      row = {
        teamId,
        teamName: teamName || teamId || '未知球队',
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
      }
      table.set(key, row)
    }
    return row
  }

  for (const match of matches) {
    if (match.status !== 'FINISHED' || !hasScore(match)) continue
    const homeId = match.homeTeamId || match.homeTeamName || ''
    const awayId = match.awayTeamId || match.awayTeamName || ''
    if (!homeId || !awayId) continue

    const home = ensure(homeId, match.homeTeamName || homeId)
    const away = ensure(awayId, match.awayTeamName || awayId)
    const hs = match.homeScore as number
    const as = match.awayScore as number

    home.played += 1
    away.played += 1
    home.gf += hs
    home.ga += as
    away.gf += as
    away.ga += hs

    if (hs > as) {
      home.won += 1
      home.points += 3
      away.lost += 1
    } else if (hs < as) {
      away.won += 1
      away.points += 3
      home.lost += 1
    } else {
      home.drawn += 1
      away.drawn += 1
      home.points += 1
      away.points += 1
    }
  }

  const rows = [...table.values()].map((row) => ({ ...row, gd: row.gf - row.ga }))
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.teamName.localeCompare(b.teamName, 'zh-Hans-CN'),
  )

  let rank = 0
  let previous: StandingRow | null = null
  return rows.map((row, index) => {
    if (!previous || previous.points !== row.points || previous.gd !== row.gd || previous.gf !== row.gf) {
      rank = index + 1
    }
    const result: StandingRow = { ...row, rank }
    previous = result
    return result
  })
}

export type PlayerTraceKind = 'GOAL' | 'YELLOW_CARD' | 'RED_CARD'

export interface PlayerTrace {
  matchId: string
  eventId?: string
  matchLabel: string
  opponentName?: string
  kickoffAt?: string
  minute?: number
  stoppageMinute?: number
  kind: PlayerTraceKind
  ownGoal?: boolean
  scoreText?: string
  note?: string
}

export interface PlayerStatRow {
  key: string
  athleteId?: string
  athleteName: string
  teamId?: string
  teamName?: string
  /** 事件未提供运动员 ID 时，按“球队 + 姓名”归并，页面需提示匹配口径。 */
  byNameMatch: boolean
  goals: number
  yellowCards: number
  redCards: number
  traces: PlayerTrace[]
}

export interface MatchWithEvents {
  match: StatsMatch
  /** undefined 表示明细不可用（接口失败或未提供），空数组表示确认没有事件。 */
  events?: MatchEvent[]
}

function scoreText(match: StatsMatch): string | undefined {
  if (typeof match.homeScore !== 'number' || typeof match.awayScore !== 'number') return undefined
  return `${match.homeScore}:${match.awayScore}`
}

function teamNameById(match: StatsMatch, teamId?: string): string | undefined {
  if (!teamId) return undefined
  if (teamId === match.homeTeamId) return match.homeTeamName
  if (teamId === match.awayTeamId) return match.awayTeamName
  return undefined
}

/**
 * 汇总球员进球与红黄牌，并保留逐场明细。
 * 乌龙球不计入个人进球；点球事件中的黄/红牌计入对应牌数。
 */
export function buildPlayerStats(details: readonly MatchWithEvents[]): PlayerStatRow[] {
  const players = new Map<string, PlayerStatRow>()

  const resolve = (
    athleteId: string | undefined,
    athleteName: string | undefined,
    teamId: string | undefined,
    teamName: string | undefined,
  ) => {
    const name = (athleteName || '').trim()
    if (!name && !athleteId) return null
    const byName = !athleteId
    const key = athleteId ? `id:${athleteId}` : `name:${teamId || teamName || ''}:${name}`
    let row = players.get(key)
    if (!row) {
      row = {
        key,
        athleteId: athleteId || undefined,
        athleteName: name || athleteId || '未知球员',
        teamId,
        teamName,
        byNameMatch: byName,
        goals: 0,
        yellowCards: 0,
        redCards: 0,
        traces: [],
      }
      players.set(key, row)
    } else if (!row.teamName && teamName) {
      row.teamName = teamName
    }
    return row
  }

  for (const { match, events } of details) {
    if (!events) continue
    for (const event of events) {
      const isGoal = event.eventType === 'GOAL'
      const cardType = event.eventType === 'PENALTY' ? event.penaltyType : undefined

      if (isGoal) {
        if (event.ownGoal) continue
        const row = resolve(
          event.scorerAthleteId,
          event.scorerName,
          event.teamId,
          event.teamName || teamNameById(match, event.teamId),
        )
        if (!row) continue
        row.goals += 1
        const opponent = row.teamName
          ? row.teamName === match.homeTeamName
            ? match.awayTeamName
            : row.teamName === match.awayTeamName
              ? match.homeTeamName
              : undefined
          : undefined
        row.traces.push({
          matchId: match.id,
          eventId: event.id,
          matchLabel: `${match.homeTeamName || '主队'} vs ${match.awayTeamName || '客队'}`,
          opponentName: opponent,
          kickoffAt: match.kickoffAt,
          minute: event.minute,
          stoppageMinute: event.stoppageMinute,
          kind: 'GOAL',
          ownGoal: false,
          scoreText: scoreText(match),
          note: event.note,
        })
        continue
      }

      if (cardType !== 'YELLOW_CARD' && cardType !== 'RED_CARD') continue
      const row = resolve(
        event.athleteId,
        event.athleteName,
        event.teamId,
        event.teamName || teamNameById(match, event.teamId),
      )
      if (!row) continue
      const kind: PlayerTraceKind = cardType === 'RED_CARD' ? 'RED_CARD' : 'YELLOW_CARD'
      if (kind === 'RED_CARD') row.redCards += 1
      else row.yellowCards += 1
      row.traces.push({
        matchId: match.id,
        eventId: event.id,
        matchLabel: `${match.homeTeamName || '主队'} vs ${match.awayTeamName || '客队'}`,
        opponentName:
          row.teamName === match.homeTeamName
            ? match.awayTeamName
            : row.teamName === match.awayTeamName
              ? match.homeTeamName
              : undefined,
        kickoffAt: match.kickoffAt,
        minute: event.minute,
        stoppageMinute: event.stoppageMinute,
        kind,
        scoreText: scoreText(match),
        note: event.reason || event.note,
      })
    }
  }

  return [...players.values()].map((row) => ({
    ...row,
    traces: row.traces.sort((a, b) => {
      const timeA = a.kickoffAt ? Date.parse(a.kickoffAt) : 0
      const timeB = b.kickoffAt ? Date.parse(b.kickoffAt) : 0
      return timeB - timeA || (a.minute || 0) - (b.minute || 0)
    }),
  }))
}

/** 跨赛事合并报名统计，避免“全部赛事”模式下同名城市/学校出现多行。 */
export function mergeStatRows(rowsByEvent: readonly (readonly StatRow[])[]): StatRow[] {
  const merged = new Map<string, StatRow>()
  for (const rows of rowsByEvent) {
    for (const row of rows) {
      const key = row.key || row.label
      const current = merged.get(key)
      if (!current) {
        merged.set(key, {
          ...row,
          key,
          teamCount: row.teamCount || 0,
          athleteCount: row.athleteCount || 0,
          pendingCount: row.pendingCount || 0,
          approvedCount: row.approvedCount || 0,
          rejectedCount: row.rejectedCount || 0,
        })
        continue
      }
      current.teamCount += row.teamCount || 0
      current.athleteCount += row.athleteCount || 0
      current.pendingCount = (current.pendingCount || 0) + (row.pendingCount || 0)
      current.approvedCount = (current.approvedCount || 0) + (row.approvedCount || 0)
      current.rejectedCount = (current.rejectedCount || 0) + (row.rejectedCount || 0)
      if (row.athleteCountUnavailable) current.athleteCountUnavailable = true
    }
  }
  return [...merged.values()]
}

/** 学校维度兜底所需的最小报名单字段。 */
export interface SchoolEnrollmentLike {
  teamId?: string
  teamName?: string
  groupId?: string
  schoolOrgId?: string
  schoolName?: string
  status?: string
  submissionNo?: number
  createdAt?: string
  playerCount?: number
}

const SCHOOL_STAT_EXCLUDED = new Set(['DRAFT', 'WITHDRAWN'])
const SCHOOL_STAT_PENDING = new Set(['PENDING_CITY_REVIEW', 'PENDING_PROVINCE_REVIEW'])

function isNewerSubmission(candidate: SchoolEnrollmentLike, current: SchoolEnrollmentLike): boolean {
  const candidateNo = candidate.submissionNo || 0
  const currentNo = current.submissionNo || 0
  if (candidateNo !== currentNo) return candidateNo > currentNo
  return (candidate.createdAt || '') > (current.createdAt || '')
}

/**
 * 按报名单的学校聚合报名分布。
 *
 * 后端 enrollment-statistics 的 UNIVERSITY 维度只保留 subject_type=UNIVERSITY，
 * 中小学 SCHOOL_TEAM 会被过滤掉，且按球队而非学校分组；此函数用报名列表兜底，
 * 口径与统计接口保持一致：排除草稿/撤回，按 (球队, 组别) 取最新一次报名。
 * 列表接口不返回人数时，athleteCountUnavailable 置 true，页面显示“—”而不是 0。
 */
export function buildSchoolStatRows(enrollments: readonly SchoolEnrollmentLike[]): StatRow[] {
  const latest = new Map<string, SchoolEnrollmentLike>()
  for (const item of enrollments) {
    const teamId = (item.teamId || '').trim()
    if (!teamId || SCHOOL_STAT_EXCLUDED.has(item.status || '')) continue
    const key = `${teamId}:${item.groupId || ''}`
    const current = latest.get(key)
    if (!current || isNewerSubmission(item, current)) latest.set(key, item)
  }

  const grouped = new Map<string, { row: StatRow; teams: Set<string> }>()
  for (const item of latest.values()) {
    const schoolName = (item.schoolName || item.teamName || '').trim()
    const key = (item.schoolOrgId || '').trim() || `school:${schoolName || item.teamId}`
    let entry = grouped.get(key)
    if (!entry) {
      entry = {
        row: {
          key,
          label: schoolName || '未填写学校',
          teamCount: 0,
          athleteCount: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
        },
        teams: new Set<string>(),
      }
      grouped.set(key, entry)
    }

    const row = entry.row
    // 同一支球队在历史数据里可能同时存在组织 ID 与数字 ID，队名也可能写“男子足球队”或“男子队”；
    // 按归一化队名去重，避免同校同一队被算成多支。
    entry.teams.add(normalizeTeamName(item.teamName) || (item.teamId as string))
    if (typeof item.playerCount === 'number') row.athleteCount += item.playerCount
    else row.athleteCountUnavailable = true

    if (SCHOOL_STAT_PENDING.has(item.status || '')) {
      row.pendingCount = (row.pendingCount || 0) + 1
    } else if (item.status === 'APPROVED') {
      row.approvedCount = (row.approvedCount || 0) + 1
    } else if (item.status === 'REJECTED') {
      row.rejectedCount = (row.rejectedCount || 0) + 1
    }
  }

  return [...grouped.values()]
    .map(({ row, teams }) => ({ ...row, teamCount: teams.size }))
    .sort(
      (a, b) =>
        b.teamCount - a.teamCount || a.label.localeCompare(b.label, 'zh-Hans-CN'),
    )
}

interface EventPeriodLike {
  registrationOpensAt?: string
  registrationClosesAt?: string
}

/** 赛事报名期与统计日期范围是否有交集；缺失报名期时视为无法判断，默认纳入。 */
export function eventOverlapsRange(
  event: EventPeriodLike,
  start?: string | Date | null,
  end?: string | Date | null,
): boolean {
  const startTime = start ? new Date(start).getTime() : Number.NEGATIVE_INFINITY
  const endTime = end ? new Date(end).getTime() : Number.POSITIVE_INFINITY
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return true
  const eventStart = event.registrationOpensAt
    ? new Date(event.registrationOpensAt).getTime()
    : Number.NEGATIVE_INFINITY
  const eventEnd = event.registrationClosesAt
    ? new Date(event.registrationClosesAt).getTime()
    : Number.POSITIVE_INFINITY
  if (Number.isNaN(eventStart) || Number.isNaN(eventEnd)) return true
  return eventStart <= endTime && eventEnd >= startTime
}

export interface CoverageSummary {
  scanned: number
  missing: number
  truncated: boolean
  text: string
}

/** 汇总逐场明细覆盖情况，页面用于说明统计口径。 */
export function summarizeCoverage(
  details: readonly MatchWithEvents[],
  truncated = false,
): CoverageSummary {
  const scanned = details.length
  const missing = details.filter((item) => item.events === undefined).length
  const parts = [`已扫描 ${scanned} 场`]
  if (missing > 0) parts.push(`缺失事件 ${missing} 场`)
  if (truncated) parts.push('场次较多，仅统计部分比赛')
  return { scanned, missing, truncated, text: parts.join('，') }
}
