import { describe, expect, it, beforeEach } from 'vitest'
import type { PublicMatch } from '../api/types'
import {
  matchDisplayStatus,
  matchResultPending,
  matchScoreLabel,
  matchSideScore,
  portalClock,
} from './portal'

/** 固定“当前时间”，让开球时间推算的断言稳定可复现。 */
const NOW = new Date('2026-11-16T12:00:00+08:00')

function minutesAgo(minutes: number) {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString()
}

function makeMatch(overrides: Partial<PublicMatch>): PublicMatch {
  return {
    id: 'm1',
    eventId: 'e1',
    groupId: 'g1',
    kickoffAt: minutesAgo(0),
    status: 'SCHEDULED',
    homeScore: 0,
    awayScore: 0,
    ...overrides,
  }
}

beforeEach(() => {
  portalClock.value = NOW.getTime()
})

describe('matchDisplayStatus', () => {
  it('开球时间未到保持未开赛', () => {
    const match = makeMatch({ kickoffAt: minutesAgo(-120) })
    expect(matchDisplayStatus(match)).toBe('SCHEDULED')
  })

  it('已过开球时间且未超常规时长按进行中展示', () => {
    const match = makeMatch({ kickoffAt: minutesAgo(30) })
    expect(matchDisplayStatus(match)).toBe('LIVE')
  })

  it('过期未开赛的比赛自动归为已结束', () => {
    const match = makeMatch({ kickoffAt: minutesAgo(60 * 24 * 8) })
    expect(matchDisplayStatus(match)).toBe('FINISHED')
  })

  it('长时间未收尾的进行中比赛不再占用进行中', () => {
    expect(matchDisplayStatus(makeMatch({ status: 'LIVE', kickoffAt: minutesAgo(45) }))).toBe('LIVE')
    expect(matchDisplayStatus(makeMatch({ status: 'LIVE', kickoffAt: minutesAgo(60 * 8) }))).toBe(
      'FINISHED',
    )
  })

  it('记录台手动开赛优先于开球时间：提前开赛也显示进行中', () => {
    expect(matchDisplayStatus(makeMatch({ status: 'LIVE', kickoffAt: minutesAgo(-120) }))).toBe(
      'LIVE',
    )
  })

  it('已确认赛果与已取消不被时间改写', () => {
    expect(
      matchDisplayStatus(makeMatch({ status: 'FINISHED', kickoffAt: minutesAgo(60 * 24) })),
    ).toBe('FINISHED')
    expect(
      matchDisplayStatus(makeMatch({ status: 'CANCELLED', kickoffAt: minutesAgo(60 * 24) })),
    ).toBe('CANCELLED')
  })
})

describe('赛果待确认', () => {
  it('时间到了但没确认赛果时不给假比分', () => {
    const match = makeMatch({ kickoffAt: minutesAgo(60 * 24 * 3), homeScore: 0, awayScore: 0 })
    expect(matchResultPending(match)).toBe(true)
    expect(matchScoreLabel(match)).toBe('待确认')
    expect(matchSideScore(match, 'home')).toBe('–')
  })

  it('组委会确认赛果后展示真实比分', () => {
    const match = makeMatch({
      status: 'FINISHED',
      kickoffAt: minutesAgo(60 * 24),
      homeScore: 3,
      awayScore: 1,
    })
    expect(matchResultPending(match)).toBe(false)
    expect(matchScoreLabel(match)).toBe('3 : 1')
  })

  it('未开赛给 VS 占位', () => {
    expect(matchScoreLabel(makeMatch({ kickoffAt: minutesAgo(-60) }))).toBe('VS')
  })
})
