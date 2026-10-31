/** 有界并发：控制同时进行的请求数量，避免统计页一次性压垮后端。 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  const size = Math.max(1, Math.floor(limit) || 1)
  let cursor = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

export interface FetchAllResult<T> {
  items: T[]
  /** 达到 maxPages 上限时仍有下一页，说明结果被截断。 */
  truncated: boolean
}

interface PageLike<T> {
  items: T[]
  total?: number
  page?: number
  pageSize?: number
}

/**
 * 按页拉全：fetcher 接收页码，返回带 items/total 的分页结构。
 * 后端未返回 total 时，以“返回条数少于 pageSize”作为结束条件。
 */
export async function fetchAllPages<T>(
  fetcher: (page: number, pageSize: number) => Promise<PageLike<T>>,
  pageSize = 100,
  maxPages = 50,
): Promise<FetchAllResult<T>> {
  const items: T[] = []
  let truncated = false
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetcher(page, pageSize)
    const rows = result?.items || []
    items.push(...rows)
    const total = typeof result?.total === 'number' ? result.total : undefined
    if (total !== undefined) {
      if (items.length >= total || rows.length === 0) break
    } else if (rows.length < pageSize) {
      break
    }
    if (page === maxPages && (total === undefined || items.length < total)) truncated = true
  }
  return { items, truncated }
}
