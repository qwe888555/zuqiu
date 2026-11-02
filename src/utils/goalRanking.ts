import type { GoalRankingRow } from '../api/types'

export interface RankedGoalRow extends GoalRankingRow {
  /** 组内名次；同进球并列，后续名次顺延（1、1、3）。 */
  rank: number
}

/**
 * 公开接口的 rank 可能按跨组别生成，切到单一组别后会出现空号。
 * 首页和完整榜单必须使用同一套组内重排规则，避免两处名次不一致。
 */
export function rankGoalRows(rows: GoalRankingRow[]): RankedGoalRow[] {
  const sorted = [...rows].sort(
    (a, b) => b.goals - a.goals || a.athleteName.localeCompare(b.athleteName, 'zh-Hans-CN'),
  )
  let lastGoals: number | null = null
  let lastRank = 0
  return sorted.map((row, index) => {
    const rank = row.goals === lastGoals ? lastRank : index + 1
    lastGoals = row.goals
    lastRank = rank
    return { ...row, rank }
  })
}

/** 与上一名的进球差；榜首返回 null，同分返回 0。 */
export function goalGapToPrevious(rows: RankedGoalRow[], index: number): number | null {
  if (index <= 0) return null
  return Math.max(0, rows[index - 1].goals - rows[index].goals)
}
