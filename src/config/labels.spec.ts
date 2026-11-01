import { describe, expect, it } from 'vitest'
import { eventCategoryLabel, eventLevelLabel, eventLevelOf } from './labels'

describe('赛事类别识别', () => {
  it('识别后端标准的三级编码', () => {
    expect(eventLevelOf('PROVINCIAL_LEAGUE')).toBe('PROVINCIAL_LEAGUE')
    expect(eventLevelOf('city_league')).toBe('CITY_LEAGUE')
    expect(eventLevelOf(' SCHOOL_LEAGUE ')).toBe('SCHOOL_LEAGUE')
  })

  it('兼容旧前端与历史别名', () => {
    expect(eventLevelOf('PROVINCE')).toBe('PROVINCIAL_LEAGUE')
    expect(eventLevelOf('CITY')).toBe('CITY_LEAGUE')
    expect(eventLevelOf('SCHOOL')).toBe('SCHOOL_LEAGUE')
    expect(eventLevelOf('SCHOOL_GAMES')).toBe('SCHOOL_LEAGUE')
  })

  it('非层级类别不误判为三级赛事', () => {
    expect(eventLevelOf('CHAMPIONSHIP')).toBe('')
    expect(eventLevelOf('FRIENDLY')).toBe('')
    expect(eventLevelOf('校园足球')).toBe('')
  })

  it('类别标签优先使用后端返回值', () => {
    expect(eventCategoryLabel('SCHOOL_LEAGUE')).toBe('校级联赛')
    expect(eventCategoryLabel('CHAMPIONSHIP')).toBe('锦标赛')
    expect(eventCategoryLabel('UNKNOWN')).toBe('其他')
    expect(eventCategoryLabel('SCHOOL_LEAGUE', '学校级赛事')).toBe('学校级赛事')
    expect(eventCategoryLabel('')).toBe('未分级')
  })

  it('赛事层级标签只对三级赛事生效', () => {
    expect(eventLevelLabel('PROVINCIAL_LEAGUE')).toBe('省级')
    expect(eventLevelLabel('CHAMPIONSHIP')).toBe('锦标赛')
  })
})
