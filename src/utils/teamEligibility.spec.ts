import { describe, expect, it } from 'vitest'
import { teamAgeBound, teamMatchesGroup, teamMatchesGroupCategory } from './teamEligibility'

describe('teamEligibility', () => {
  it('识别 U 系列年龄编码', () => {
    expect(teamAgeBound('U15')).toBe(15)
    expect(teamAgeBound('u15_male')).toBe(15)
    expect(teamAgeBound('U18_FEMALE')).toBe(18)
    expect(teamAgeBound('MIDDLE')).toBeUndefined()
  })

  it('U15 球队可报 13-15 岁组，不可报 16-18 岁组', () => {
    expect(
      teamMatchesGroupCategory('U15', { category: 'MIDDLE', minAge: 13, maxAge: 15 }),
    ).toBe(true)
    expect(
      teamMatchesGroupCategory('U15', { category: 'MIDDLE', minAge: 16, maxAge: 18 }),
    ).toBe(false)
    expect(
      teamMatchesGroupCategory('U12', { category: 'PRIMARY', minAge: 10, maxAge: 12 }),
    ).toBe(true)
  })

  it('PRIMARY/MIDDLE 学段仍按组别学段匹配', () => {
    expect(teamMatchesGroupCategory('PRIMARY', { category: 'PRIMARY' })).toBe(true)
    expect(teamMatchesGroupCategory('MIDDLE', { category: 'PRIMARY' })).toBe(false)
  })

  it('组别限制性别时过滤不一致的球队', () => {
    const group = { category: 'MIDDLE' as const, gender: 'FEMALE' as const, minAge: 13, maxAge: 15 }
    expect(teamMatchesGroup({ category: 'U15', gender: 'FEMALE' }, group)).toBe(true)
    expect(teamMatchesGroup({ category: 'U15', gender: 'MALE' }, group)).toBe(false)
  })
})
