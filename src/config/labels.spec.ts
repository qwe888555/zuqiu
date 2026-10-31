import { describe, expect, it } from 'vitest'
import { eventLevelLabel, eventLevelOf } from './labels'

describe('赛事层级识别', () => {
  it('识别前端约定的三级编码', () => {
    expect(eventLevelOf('PROVINCE')).toBe('PROVINCE')
    expect(eventLevelOf('city')).toBe('CITY')
    expect(eventLevelOf(' SCHOOL ')).toBe('SCHOOL')
  })

  it('历史类别不按前缀猜测层级', () => {
    // SCHOOL_LEAGUE 是省级校园足球联赛的类别，不是学校级赛事。
    expect(eventLevelOf('SCHOOL_LEAGUE')).toBe('')
    expect(eventLevelOf('CHAMPIONSHIP')).toBe('')
    expect(eventLevelOf('校园足球')).toBe('')
  })

  it('未分级时保留原类别展示', () => {
    expect(eventLevelLabel('SCHOOL_LEAGUE')).toBe('SCHOOL_LEAGUE')
    expect(eventLevelLabel('')).toBe('未分级')
  })
})
