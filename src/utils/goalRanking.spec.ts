import { describe, expect, it } from 'vitest'
import type { GoalRankingRow } from '../api/types'
import { goalGapToPrevious, rankGoalRows } from './goalRanking'

function row(id: string, name: string, goals: number, rank = 0): GoalRankingRow {
  return {
    rank,
    athleteId: id,
    athleteName: name,
    teamId: `team-${id}`,
    teamName: `球队 ${id}`,
    goals,
  }
}

describe('rankGoalRows', () => {
  it('按组内进球数重排，同分并列且后续名次顺延', () => {
    const ranked = rankGoalRows([
      row('a', '甲', 1, 4),
      row('b', '乙', 3, 9),
      row('c', '丙', 1, 7),
      row('d', '丁', 2, 5),
    ])

    expect(ranked.map((item) => [item.athleteName, item.goals, item.rank])).toEqual([
      ['乙', 3, 1],
      ['丁', 2, 2],
      ['丙', 1, 3],
      ['甲', 1, 3],
    ])
  })

  it('同分球员按姓名稳定排序，避免刷新后顺序跳动', () => {
    expect(rankGoalRows([row('a', '乙', 2), row('b', '甲', 2)]).map((item) => item.athleteName)).toEqual([
      '甲',
      '乙',
    ])
  })
})

describe('goalGapToPrevious', () => {
  const rows = rankGoalRows([
    row('a', '甲', 3),
    row('b', '乙', 1),
    row('c', '丙', 1),
  ])

  it('榜首没有上一名，返回 null', () => {
    expect(goalGapToPrevious(rows, 0)).toBeNull()
  })

  it('领先或并列时返回真实球差', () => {
    expect(goalGapToPrevious(rows, 1)).toBe(2)
    expect(goalGapToPrevious(rows, 2)).toBe(0)
  })
})
