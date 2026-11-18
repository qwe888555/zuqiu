import type { PublicityRecord, PublicityType, SelectionGroupType } from '../api/types'
import { GROUP_TYPE_LABEL } from '../api/selection'

export type NoticeType = 'ENROLLMENT' | 'PERSON'

/** 公示事项标题必须体现对象身份，避免“运动员/教练员”同组时标题完全一样。 */
export const NOTICE_TYPE_LABEL: Record<PublicityType, string> = {
  ATHLETE: '运动员名单公示',
  COACH: '教练员名单公示',
  TEAM: '参赛资格公示',
}

const NOTICE_TYPE_ORDER: Record<PublicityType, number> = {
  TEAM: 0,
  ATHLETE: 1,
  COACH: 2,
}

export interface NoticeGroup {
  key: string
  eventId: string
  groupType: SelectionGroupType
  groupName: string
  type: NoticeType
  publicityType: PublicityType
  typeLabel: string
  title: string
  items: PublicityRecord[]
  cities: string[]
}

export type GroupCategoryKey = 'PRIMARY' | 'MIDDLE' | 'HIGH'

export const GROUP_TABS: { label: string; value: '' | GroupCategoryKey }[] = [
  { label: '全部组别', value: '' },
  { label: '小学组', value: 'PRIMARY' },
  { label: '初中组', value: 'MIDDLE' },
  { label: '高中组', value: 'HIGH' },
]

export function groupCategoryOf(groupType?: SelectionGroupType): GroupCategoryKey {
  return groupType || 'MIDDLE'
}

export function groupCategoryLabel(groupType?: SelectionGroupType): string {
  return groupType ? GROUP_TYPE_LABEL[groupType] : '未标注组别'
}

export function publicityNoticeKey(item: Pick<PublicityRecord, 'eventId' | 'publicityType' | 'groupType'>): string {
  return `${item.eventId}|${item.publicityType}|${item.groupType || 'MIDDLE'}`
}

/**
 * 公示接口以人员/球队为粒度返回，页面按「赛事 + 公示类型 + 组别」归集为公示事项，
 * 不虚构批次与生效日期，公示时间取后端 published_at。
 */
export function groupPublications(items: PublicityRecord[]): NoticeGroup[] {
  const map = new Map<string, PublicityRecord[]>()
  items.forEach((item) => {
    const key = publicityNoticeKey(item)
    if (!map.has(key)) map.set(key, [])
    map.get(key)?.push(item)
  })

  return Array.from(map.entries())
    .map(([key, groupItems]) => {
      const first = groupItems[0]
      const type: NoticeType = first.publicityType === 'TEAM' ? 'ENROLLMENT' : 'PERSON'
      const groupName = groupCategoryLabel(first.groupType)
      const publicityType = first.publicityType
      const typeLabel = NOTICE_TYPE_LABEL[publicityType]
      const cities = [...new Set(groupItems.map((item) => item.city).filter(Boolean) as string[])]
      return {
        key,
        eventId: first.eventId,
        groupType: first.groupType || 'MIDDLE',
        groupName,
        type,
        publicityType,
        typeLabel,
        title: `${groupName}${typeLabel}`,
        items: groupItems,
        cities,
      }
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'ENROLLMENT' ? -1 : 1
      const groupOrder = a.groupName.localeCompare(b.groupName, 'zh-Hans-CN')
      if (groupOrder !== 0) return groupOrder
      return NOTICE_TYPE_ORDER[a.publicityType] - NOTICE_TYPE_ORDER[b.publicityType]
    })
}

export function publicationSubtitle(item: PublicityRecord): string {
  if (item.publicityType === 'TEAM') {
    return [item.city, item.schoolName].filter(Boolean).join(' · ') || '参赛球队'
  }
  return [item.teamName, item.city].filter(Boolean).join(' · ') || '—'
}

export function publicationCountUnit(type: NoticeType): string {
  return type === 'ENROLLMENT' ? '支球队' : '人'
}
