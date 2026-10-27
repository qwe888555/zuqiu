import type { Event } from '../api/types'

/**
 * 事件列表按创建时间倒序返回时，最新的往往还是草稿或刚开放报名、尚无数据。
 * 默认选中「进行中 → 报名截止 → 报名中 → 已结束 → 草稿」中优先级最高的赛事，
 * 让统计、评分、公示等页面优先展示已有业务数据的赛事。
 */
const STATUS_PRIORITY: Record<Event['status'], number> = {
  RUNNING: 0,
  REGISTRATION_CLOSED: 1,
  REGISTRATION_OPEN: 2,
  FINISHED: 3,
  DRAFT: 4,
}

export function pickDefaultEventId(events: Pick<Event, 'id' | 'status'>[]): string {
  let picked = ''
  let pickedPriority = Number.POSITIVE_INFINITY
  for (const event of events) {
    const priority = STATUS_PRIORITY[event.status] ?? Number.POSITIVE_INFINITY
    if (priority < pickedPriority) {
      picked = event.id
      pickedPriority = priority
    }
  }
  return picked
}
