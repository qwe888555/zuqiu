import { describe, expect, it } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { mockAdapter } from './adapter'
import type { Event, GoalRankingRow, PageResult } from '../api/types'

async function get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const response = await mockAdapter({
    method: 'get',
    url: `/api/v1${path}`,
    params,
  } as unknown as InternalAxiosRequestConfig)
  return (response.data as { data: T }).data
}

describe('mock 赛事与射手榜查询', () => {
  it('/events 支持 name 与 eventCategory，并兼容 keyword', async () => {
    const byLevel = await get<PageResult<Event>>('/events', { eventCategory: 'SCHOOL' })
    expect(byLevel.items).toHaveLength(1)
    expect(byLevel.items[0].id).toBe('event_school_2026')

    const byName = await get<PageResult<Event>>('/events', { name: '青羊区' })
    expect(byName.items.map((event) => event.id)).toEqual(['event_school_2026'])

    const legacy = await get<PageResult<Event>>('/events', { keyword: '小学组' })
    expect(legacy.items.length).toBeGreaterThan(0)
  })

  it('射手榜按比赛事件动态聚合，支持 eventId 与 category', async () => {
    const school = await get<PageResult<GoalRankingRow>>('/public/statistics/goals', {
      eventId: 'event_school_2026',
    })
    expect(school.items.reduce((sum, row) => sum + row.goals, 0)).toBe(4)
    expect(school.items.find((row) => row.athleteName === '张子轩')).toMatchObject({
      athleteName: '张子轩',
      goals: 2,
    })

    const middle = await get<PageResult<GoalRankingRow>>('/public/statistics/goals', {
      eventId: 'event_middle_2026',
      category: 'MIDDLE',
    })
    expect(middle.items.length).toBeGreaterThan(0)
    expect(middle.items.every((row) => ['team_cd_qz', 'team_my_ns', 'team_dy_wz'].includes(row.teamId))).toBe(true)
  })

  it('未发布比赛不计入公开射手榜', async () => {
    const primary = await get<PageResult<GoalRankingRow>>('/public/statistics/goals', {
      eventId: 'event_primary_2026',
    })
    // match_003 未发布；公开榜单只统计 match_001（3 球）与 match_002（2 球）。
    expect(primary.items.reduce((sum, row) => sum + row.goals, 0)).toBe(5)
  })
})
