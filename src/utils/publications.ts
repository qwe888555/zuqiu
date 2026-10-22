import type { PublicCard } from '../api/types'

export type NoticeType = 'ENROLLMENT' | 'PERSON'

export interface NoticeGroup {
  key: string
  groupName: string
  type: NoticeType
  typeLabel: string
  title: string
  items: PublicCard[]
  cities: string[]
}

export type GroupCategoryKey = 'PRIMARY' | 'MIDDLE' | 'OTHER'

export const GROUP_TABS: { label: string; value: '' | GroupCategoryKey }[] = [
  { label: '全部组别', value: '' },
  { label: '小学组', value: 'PRIMARY' },
  { label: '初中组', value: 'MIDDLE' },
]

/** 公开接口只返回组别名称，前端按名称归到学段，不额外假设后端枚举。 */
export function groupCategoryOf(groupName?: string): GroupCategoryKey {
  if (!groupName) return 'OTHER'
  if (groupName.includes('小学')) return 'PRIMARY'
  if (groupName.includes('初中')) return 'MIDDLE'
  return 'OTHER'
}

export function groupCategoryLabel(groupName?: string): string {
  const key = groupCategoryOf(groupName)
  if (key === 'OTHER') return '其他组别'
  return GROUP_TABS.find((tab) => tab.value === key)?.label || '其他组别'
}

export function publicationNoticeKey(notice: Pick<NoticeGroup, 'type' | 'groupName'>): string {
  return `${notice.type}|${notice.groupName}`
}

/**
 * 公开接口以人员/球队为粒度返回，没有“公示批次”和“发布日期”字段。
 * 页面按“公示类型 + 组别”归集成公示事项，不虚构批次、年份和截止日期。
 */
export function groupPublications(items: PublicCard[]): NoticeGroup[] {
  const map = new Map<string, PublicCard[]>()
  items.forEach((item) => {
    const type: NoticeType = item.targetType === 'ENROLLMENT' ? 'ENROLLMENT' : 'PERSON'
    const groupName = item.groupName || '未标注组别'
    const key = `${type}|${groupName}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)?.push(item)
  })

  return Array.from(map.entries())
    .map(([key, groupItems]) => {
      const type: NoticeType = key.startsWith('ENROLLMENT') ? 'ENROLLMENT' : 'PERSON'
      const groupName = key.split('|')[1] || '未标注组别'
      const typeLabel = type === 'ENROLLMENT' ? '参赛资格公示' : '人员名单公示'
      const cities = [...new Set(groupItems.map((item) => item.cityName).filter(Boolean) as string[])]
      return {
        key,
        groupName,
        type,
        typeLabel,
        title: `${groupName}${typeLabel}`,
        items: groupItems,
        cities,
      }
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'ENROLLMENT' ? -1 : 1
      return a.groupName.localeCompare(b.groupName, 'zh-Hans-CN')
    })
}

export function publicationSubtitle(item: PublicCard): string {
  if (item.targetType === 'ENROLLMENT') {
    return [item.cityName, item.groupName].filter(Boolean).join(' · ') || '参赛球队'
  }
  return [item.teamName, item.cityName].filter(Boolean).join(' · ') || '—'
}

export function publicationCountUnit(type: NoticeType): string {
  return type === 'ENROLLMENT' ? '支球队' : '人'
}
