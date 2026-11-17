/**
 * 模板快讯的展示层去重。
 *
 * 后端自动推送赛果时把标题同时写进 title / summary / bodyHtml（如
 * summary="{title}（{赛事名}）"，正文第二段又是 "<p><strong>{title}</strong></p>"），
 * 详情页自上而下会出现三遍相同句子，列表卡片的"标题+摘要"也是两遍重复。
 *
 * 这两个函数只作用于展示层：剥离与 title 完全一致的重复前缀/段落，
 * 不改动源数据；非模板内容（不以前缀形式重复）会原样返回。
 */

const PUNCT = /[\s，。；、,.!！?？:：;；—\-_·…（）()【】\[\]"'“”‘’]/g

/** 去标点去空格，用于判断两段文字是否实质相同或互为前缀。 */
function norm(text: string): string {
  return text.replace(PUNCT, '')
}

/**
 * 在原文中定位 title 归一化序列的结束位置（跳过标题内部的标点差异），
 * 返回原文字符索引；无法逐字匹配时回退到 title 的字面长度。
 */
function titleEndIndex(raw: string, title: string): number {
  const tn = norm(title)
  let ti = 0
  for (let i = 0; i < raw.length && ti < tn.length; i += 1) {
    if (PUNCT.test(raw[i])) continue
    if (raw[i] === tn[ti]) ti += 1
    else break
  }
  if (ti < tn.length) return Math.min(title.length, raw.length)
  // 返回与已匹配字符对应的原文位置。
  let index = 0
  let matched = 0
  for (let i = 0; i < raw.length && matched < ti; i += 1) {
    index = i + 1
    if (!PUNCT.test(raw[i])) matched += 1
  }
  return index
}

/** 摘要去重：剥离以 title 为前缀的重复部分；剩余若是"（赛事名）"一类括号壳则视为空。 */
export function dedupeSummary(title: string | undefined, summary?: string | null): string {
  const raw = (summary || '').trim()
  const t = (title || '').trim()
  if (!raw) return ''
  if (!t) return raw
  if (norm(raw) === norm(t)) return ''
  if (!norm(raw).startsWith(norm(t))) return raw
  const rest = raw.slice(titleEndIndex(raw, t)).replace(/^[\s，。；、,.!！?？:：;；—\-_·…（）()]+/, '')
  if (/^[（(][\s\S]*[)）]$/.test(rest.trim())) return ''
  return rest
}

/**
 * 正文去重：删除整体与 title 完全一致（归一化）的纯标题段落，
 * 例如 "<p><strong>{title}</strong></p>"；段内还带其他正文的保留。
 */
export function dedupeBodyHtml(title: string | undefined, bodyHtml?: string | null): string {
  if (!bodyHtml) return bodyHtml || ''
  const t = (title || '').trim()
  if (!t) return bodyHtml
  return bodyHtml.replace(/<p[^>]*>[\s\S]*?<\/p>/gi, (segment) => {
    const text = segment.replace(/<[^>]*>/g, '').trim()
    if (text && norm(text) === norm(t)) return ''
    return segment
  })
}

/**
 * 卡片摘要：按句剥离与标题内容重复的句子（如赛果快讯摘要首句
 * "A 3:1 B"，标题与封面图已完整承载），仅保留增量信息（进球球员等）。
 * 与 dedupeSummary 的区别：dedupeSummary 只处理"摘要以标题为前缀"的情况，
 * 本函数逐句比对，摘要句子只要出现在标题归一化文本中即剔除。
 * 若剔除后无剩余内容，返回空串，调用方应隐藏摘要在卡片上的展示行。
 */
export function dedupeCardSummary(title: string | undefined, summary?: string | null): string {
  const raw = (summary || '').trim()
  const t = norm(title || '')
  if (!raw) return ''
  if (!t) return raw
  const kept = raw
    .split(/(?<=。)/)
    .map((s) => s.trim())
    .filter((s) => s && !t.includes(norm(s)))
    .join('')
  return kept.trim()
}
