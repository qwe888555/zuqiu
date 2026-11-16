import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contentApi } from '../api'
import type { Content, MatchEvent } from '../api/types'
import type { StatsMatch } from './statsAggregation'
import { buildMatchDigest, publishMatchDigest } from './matchDigest'

vi.mock('../api', () => ({
  contentApi: {
    list: vi.fn(),
    create: vi.fn(),
    publish: vi.fn(),
  },
}))

const match: StatsMatch = {
  id: 'mat_1',
  eventId: 'event_01',
  groupId: 'group_u15',
  groupName: '初中男子组',
  homeTeamId: 't1',
  awayTeamId: 't2',
  homeTeamName: '成都七中',
  awayTeamName: '德阳中学',
  kickoffAt: '2026-11-16T10:00:00Z',
  status: 'FINISHED',
  homeScore: 2,
  awayScore: 1,
}

const events: MatchEvent[] = [
  {
    id: 'ev_1',
    matchId: 'mat_1',
    eventType: 'GOAL',
    minute: 12,
    teamId: 't1',
    scorerAthleteId: 'a1',
    scorerName: '张三',
    version: 0,
  },
  {
    id: 'ev_2',
    matchId: 'mat_1',
    eventType: 'GOAL',
    minute: 55,
    teamId: 't2',
    scorerAthleteId: 'a2',
    scorerName: '李四',
    ownGoal: true,
    version: 0,
  },
  {
    id: 'ev_3',
    matchId: 'mat_1',
    eventType: 'PENALTY',
    minute: 70,
    teamId: 't2',
    athleteId: 'a3',
    athleteName: '王五',
    penaltyType: 'RED_CARD',
    reason: '严重犯规',
    version: 0,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildMatchDigest', () => {
  it('汇总比分、进球时间线与红黄牌', () => {
    const draft = buildMatchDigest(match, events)
    expect(draft.title).toContain('成都七中 2:1 德阳中学')
    expect(draft.summary).toContain('进球球员：张三')
    expect(draft.bodyHtml).toContain('12 分钟 张三')
    expect(draft.bodyHtml).toContain('[乌龙球]')
    expect(draft.bodyHtml).toContain('70 分钟 红牌 王五')
    expect(draft.bodyHtml).toContain('严重犯规')
  })
})

describe('publishMatchDigest', () => {
  it('无同名快讯时创建并发布', async () => {
    vi.mocked(contentApi.list).mockResolvedValue({ items: [], total: 0 } as never)
    vi.mocked(contentApi.create).mockResolvedValue({ id: 'cnt_1', version: 0 } as Content)
    vi.mocked(contentApi.publish).mockResolvedValue({ id: 'cnt_1', version: 1 } as Content)

    const result = await publishMatchDigest(match, events)

    expect(result).toEqual({ created: true, content: { id: 'cnt_1', version: 1 } })
    expect(contentApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'event_01', contentType: 'NEWS' }),
      { silentError: true },
    )
    expect(contentApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: 'NEWS',
        eventId: 'event_01',
        groupId: 'group_u15',
      }),
      { silentError: true },
    )
    expect(contentApi.publish).toHaveBeenCalledWith('cnt_1', 0, { silentError: true })
  })

  it('已存在同名快讯时不重复创建', async () => {
    const title = buildMatchDigest(match, events).title
    vi.mocked(contentApi.list).mockResolvedValue({
      items: [{ id: 'cnt_old', contentType: 'NEWS', title }],
      total: 1,
    } as never)

    const result = await publishMatchDigest(match, events)

    expect(result).toEqual({ created: false })
    expect(contentApi.create).not.toHaveBeenCalled()
  })
})
