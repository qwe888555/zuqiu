import type { OptionItem } from '../api/types'

/**
 * 字典选项归一化。
 *
 * 各域字典接口的历史实现不完全一致：可能是 {value,label} 数组、字典项实体数组
 * （含 id/typeId 等字段），也可能返回 {items|records|list|options} 包装，甚至是
 * 编码到名称的映射对象。只要 value 缺失就会触发 Element Plus 的
 * “ElOption value undefined” 警告，因此统一在这一层拍平并过滤非法项，
 * 页面组件只消费确定的 OptionItem[]。
 */
export function normalizeOptionItems(payload: unknown): OptionItem[] {
  const list = unwrap(payload)
  if (!list) return []

  const result: OptionItem[] = []
  const seen = new Set<string>()

  for (const raw of list) {
    const option = toOption(raw)
    if (!option || seen.has(option.value)) continue
    seen.add(option.value)
    result.push(option)
  }
  return result
}

function unwrap(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  for (const key of ['items', 'records', 'list', 'options', 'data']) {
    if (Array.isArray(record[key])) return record[key] as unknown[]
  }

  // 映射对象：{ YOUTH: '青少年组' } 或 { YOUTH: { label: '青少年组' } }。
  const entries = Object.entries(record)
  if (!entries.length) return null
  return entries.map(([key, value]) =>
    value && typeof value === 'object'
      ? { ...(value as Record<string, unknown>), value: key }
      : { value: key, label: value },
  )
}

function toOption(raw: unknown): OptionItem | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string' || typeof raw === 'number') {
    const value = String(raw)
    return value ? { value, label: value } : null
  }
  if (typeof raw !== 'object') return null

  const item = raw as Record<string, unknown>
  const value = firstString(
    item.value,
    item.code,
    item.dictValue,
    item.dict_value,
    item.itemValue,
    item.item_value,
    item.key,
  )
  if (!value) return null
  const label =
    firstString(item.label, item.name, item.dictLabel, item.dict_label, item.text, item.title) || value
  return { value, label }
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return ''
}
