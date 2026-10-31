import { describe, expect, it } from 'vitest'
import type { MatchEvent, StatRow } from '../api/types'
import {
  buildPlayerStats,
  buildSchoolStatRows,
  buildStandings,
  eventOverlapsRange,
  mergeStatRows,
  normalizeTeamName,
  summarizeCoverage,
  type MatchWithEvents,
  type StatsMatch,
} from './statsAggregation'

function match(partial: Partial<StatsMatch> & Pick<StatsMatch, 'id'>): StatsMatch {
  return {
    status: 'FINISHED',
    homeTeamId: 'home',
    awayTeamId: 'away',
    homeTeamName: '主队',
    awayTeamName: '客队',
    ...partial,
  }
}

function goal(partial: Partial<MatchEvent> & Pick<MatchEvent, 'id' | 'matchId'>): MatchEvent {
  return {
    eventType: 'GOAL',
    version: 1,
    ...partial,
  } as MatchEvent
}

function card(
  partial: Partial<MatchEvent> & Pick<MatchEvent, 'id' | 'matchId'>,
): MatchEvent {
  return {
    eventType: 'PENALTY',
    version: 1,
    ...partial,
  } as MatchEvent
}

describe('buildStandings', () => {
  it('按胜平负计分并排序', () => {
    const rows = buildStandings([
      match({ id: 'm1', homeTeamId: 'a', homeTeamName: '甲队', awayTeamId: 'b', awayTeamName: '乙队', homeScore: 2, awayScore: 0 }),
      match({ id: 'm2', homeTeamId: 'c', homeTeamName: '丙队', awayTeamId: 'd', awayTeamName: '丁队', homeScore: 3, awayScore: 0 }),
      match({ id: 'm3', homeTeamId: 'a', homeTeamName: '甲队', awayTeamId: 'c', awayTeamName: '丙队', homeScore: 1, awayScore: 0 }),
    ])
    expect(rows.map((row) => row.teamName)).toEqual(['甲队', '丙队', '乙队', '丁队'])
    expect(rows[0]).toMatchObject({ points: 6, played: 2, won: 2, gf: 3, ga: 0, gd: 3 })
  })

  it('同分同净胜球同进球数并列名次', () => {
    const rows = buildStandings([
      match({ id: 'm1', homeTeamId: 'a', homeTeamName: '甲队', awayTeamId: 'b', awayTeamName: '乙队', homeScore: 2, awayScore: 0 }),
      match({ id: 'm2', homeTeamId: 'b', homeTeamName: '乙队', awayTeamId: 'a', awayTeamName: '甲队', homeScore: 2, awayScore: 0 }),
    ])
    expect(rows.map((row) => row.rank)).toEqual([1, 1])
    expect(rows.every((row) => row.points === 3 && row.gd === 0 && row.gf === 2)).toBe(true)
  })

  it('忽略未结束或比分缺失的比赛', () => {
    const rows = buildStandings([
      match({ id: 'm1', status: 'LIVE', homeScore: 3, awayScore: 0 }),
      match({ id: 'm2', status: 'FINISHED', homeScore: undefined, awayScore: 1 }),
    ])
    expect(rows).toEqual([])
  })
})

describe('buildPlayerStats', () => {
  const finished = match({
    id: 'm1',
    homeTeamId: 'a',
    homeTeamName: '甲队',
    awayTeamId: 'b',
    awayTeamName: '乙队',
    homeScore: 3,
    awayScore: 1,
    kickoffAt: '2026-10-01T10:00:00+08:00',
  })

  it('乌龙球不计个人进球，红黄牌计入对应球员', () => {
    const details: MatchWithEvents[] = [
      {
        match: finished,
        events: [
          goal({ id: 'e1', matchId: 'm1', teamId: 'a', scorerAthleteId: 'p1', scorerName: '张三' }),
          goal({ id: 'e2', matchId: 'm1', teamId: 'a', scorerAthleteId: 'p1', scorerName: '张三' }),
          goal({ id: 'e3', matchId: 'm1', teamId: 'b', scorerAthleteId: 'p2', scorerName: '李四', ownGoal: true }),
          card({ id: 'e4', matchId: 'm1', teamId: 'a', athleteId: 'p2', athleteName: '李四', penaltyType: 'YELLOW_CARD', reason: '战术犯规' }),
          card({ id: 'e5', matchId: 'm1', teamId: 'b', athleteId: 'p1', athleteName: '张三', penaltyType: 'RED_CARD', reason: '严重犯规' }),
        ],
      },
    ]
    const rows = buildPlayerStats(details)
    const zhang = rows.find((row) => row.athleteId === 'p1')
    const li = rows.find((row) => row.athleteId === 'p2')
    expect(zhang).toMatchObject({ goals: 2, yellowCards: 0, redCards: 1 })
    expect(li).toMatchObject({ goals: 0, yellowCards: 1, redCards: 0 })
    expect(zhang?.traces.map((trace) => trace.kind)).toEqual(
      expect.arrayContaining(['GOAL', 'RED_CARD']),
    )
    expect(zhang?.traces.find((trace) => trace.kind === 'GOAL')).toMatchObject({
      matchId: 'm1',
      scoreText: '3:1',
      opponentName: '乙队',
    })
  })

  it('缺少运动员 ID 时按球队与姓名归并并标记', () => {
    const details: MatchWithEvents[] = [
      {
        match: finished,
        events: [
          goal({ id: 'e1', matchId: 'm1', teamId: 'a', teamName: '甲队', scorerName: '王五' }),
        ],
      },
    ]
    const rows = buildPlayerStats(details)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ athleteName: '王五', goals: 1, byNameMatch: true })
  })

  it('事件不可用的场次不参与统计', () => {
    const rows = buildPlayerStats([{ match: finished }])
    expect(rows).toEqual([])
    expect(summarizeCoverage([{ match: finished }]).text).toBe('已扫描 1 场，缺失事件 1 场')
  })
})

describe('mergeStatRows', () => {
  it('按 key 跨赛事累加', () => {
    const make = (key: string, teamCount: number): StatRow => ({
      key,
      label: key,
      teamCount,
      athleteCount: teamCount * 10,
      pendingCount: 1,
      approvedCount: 2,
      rejectedCount: 0,
    })
    const merged = mergeStatRows([
      [make('成都市', 2), make('绵阳市', 1)],
      [make('成都市', 3)],
    ])
    expect(merged).toHaveLength(2)
    expect(merged.find((row) => row.key === '成都市')).toMatchObject({
      teamCount: 5,
      athleteCount: 50,
      pendingCount: 2,
      approvedCount: 4,
    })
  })
})

describe('buildSchoolStatRows', () => {
  it('按学校聚合中小学球队，排除草稿和撤回', () => {
    const rows = buildSchoolStatRows([
      { teamId: 't1', teamName: '一中男队', groupId: 'g1', schoolOrgId: 's1', schoolName: '一中', status: 'APPROVED', playerCount: 18 },
      { teamId: 't2', teamName: '一中女队', groupId: 'g1', schoolOrgId: 's1', schoolName: '一中', status: 'PENDING_CITY_REVIEW', playerCount: 16 },
      { teamId: 't3', teamName: '二中男队', groupId: 'g1', schoolOrgId: 's2', schoolName: '二中', status: 'REJECTED', playerCount: 20 },
      { teamId: 't4', teamName: '三中男队', groupId: 'g1', schoolOrgId: 's3', schoolName: '三中', status: 'DRAFT', playerCount: 12 },
      { teamId: 't5', teamName: '四中男队', groupId: 'g1', schoolOrgId: 's4', schoolName: '四中', status: 'WITHDRAWN', playerCount: 14 },
    ])
    expect(rows.map((row) => row.label)).toEqual(['一中', '二中'])
    expect(rows[0]).toMatchObject({
      teamCount: 2,
      athleteCount: 34,
      pendingCount: 1,
      approvedCount: 1,
    })
    expect(rows[1]).toMatchObject({ teamCount: 1, athleteCount: 20, rejectedCount: 1 })
  })

  it('同一球队同一组别只取最新一次提交', () => {
    const rows = buildSchoolStatRows([
      { teamId: 't1', teamName: '一中男队', groupId: 'g1', schoolOrgId: 's1', schoolName: '一中', status: 'REJECTED', submissionNo: 1, createdAt: '2026-10-01', playerCount: 18 },
      { teamId: 't1', teamName: '一中男队', groupId: 'g1', schoolOrgId: 's1', schoolName: '一中', status: 'APPROVED', submissionNo: 2, createdAt: '2026-10-05', playerCount: 18 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ teamCount: 1, athleteCount: 18, approvedCount: 1, rejectedCount: 0 })
  })

  it('同一球队的组织 ID 与数字 ID、不同队名写法只算一支', () => {
    const rows = buildSchoolStatRows([
      { teamId: 'org_team_01', teamName: '示例第一中学男子足球队', groupId: 'g1', schoolName: '示例第一中学', status: 'APPROVED' },
      { teamId: '17', teamName: '示例第一中学男子队', groupId: 'g2', schoolName: '示例第一中学', status: 'APPROVED' },
      { teamId: '18', teamName: '示例第一中学女子足球队', groupId: 'g3', schoolName: '示例第一中学', status: 'APPROVED' },
    ])
    expect(rows[0]).toMatchObject({ teamCount: 2, approvedCount: 3 })
  })

  it('列表未返回人数时标记不可用，不把未知当 0', () => {
    const rows = buildSchoolStatRows([
      { teamId: 't1', teamName: '一中男队', groupId: 'g1', schoolName: '一中', status: 'APPROVED' },
    ])
    expect(rows[0].athleteCount).toBe(0)
    expect(rows[0].athleteCountUnavailable).toBe(true)
  })
})

describe('normalizeTeamName', () => {
  it('保留男女队信息，避免同校男女队互相匹配', () => {
    expect(normalizeTeamName('示例第二中学女子足球队')).toBe('示例第二中学女子')
    expect(normalizeTeamName('示例第二中学男子足球队')).toBe('示例第二中学男子')
    expect(normalizeTeamName('示例第二中学女子足球队')).not.toBe(
      normalizeTeamName('示例第二中学男子足球队'),
    )
  })

  it('兼容男队/女队简称并忽略括号备注', () => {
    expect(normalizeTeamName('示例第二中学（初中部）女队')).toBe('示例第二中学女子')
    expect(normalizeTeamName('示例第二中学女子足球队')).toBe(
      normalizeTeamName('示例第二中学女队'),
    )
    expect(normalizeTeamName('示例第一中学男子足球队')).toBe(
      normalizeTeamName('示例第一中学男子队'),
    )
  })
})

describe('eventOverlapsRange', () => {
  const event = {
    registrationOpensAt: '2026-09-01T09:00:00+08:00',
    registrationClosesAt: '2026-11-15T18:00:00+08:00',
  }

  it('报名期与查询范围相交时纳入', () => {
    expect(eventOverlapsRange(event, '2026-01-01', '2026-09-10')).toBe(true)
  })

  it('完全早于查询范围时不纳入', () => {
    expect(eventOverlapsRange(event, '2027-01-01', '2027-12-31')).toBe(false)
  })

  it('缺少报名期时保守纳入', () => {
    expect(eventOverlapsRange({}, '2026-01-01', '2026-12-31')).toBe(true)
  })
})
