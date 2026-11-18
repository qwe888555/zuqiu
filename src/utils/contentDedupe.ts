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

/**
 * 进球人名去重：摘要里"进球球员：A，B，A，C"这类名单，
 * 同一人梅开二度只保留一次；仅处理进球名单句，其余文案原样保留。
 */
function dedupeScorerNames(summary: string): string {
  return summary.replace(
    /(进球球员[:：])([^。]*)/g,
    (_m, prefix: string, list: string) => {
      const names = list.split(/[，,、]/).map((s) => s.trim()).filter(Boolean)
      const seen = new Set<string>()
      const unique = names.filter((n) => {
        const key = norm(n)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      return prefix + unique.join('，')
    },
  )
}

/** 摘要去重：剥离以 title 为前缀的重复部分；剩余若是"（赛事名）"一类括号壳则视为空。 */
export function dedupeSummary(title: string | undefined, summary?: string | null): string {
  const raw = (summary || '').trim()
  const t = (title || '').trim()
  if (!raw) return ''
  if (!t) return dedupeScorerNames(raw)
  if (norm(raw) === norm(t)) return ''
  if (!norm(raw).startsWith(norm(t))) return dedupeScorerNames(raw)
  const rest = raw.slice(titleEndIndex(raw, t)).replace(/^[\s，。；、,.!！?？:：;；—\-_·…（）()]+/, '')
  if (/^[（(][\s\S]*[)）]$/.test(rest.trim())) return ''
  return dedupeScorerNames(rest)
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
  return dedupeScorerNames(kept.trim())
}

/** 赛果类内容标题：后端自动推送的「赛果：A 3:1 B」与前端快讯「赛果快讯｜A 3:1 B（组别）」。 */
export function isResultContentTitle(title: string | null | undefined): boolean {
  return /^\s*(?:赛果快讯\s*[|｜]|赛果\s*[:：])/.test(title || '')
}

/**
 * 同一场比赛的赛果内容键：去掉「赛果/赛果快讯」前缀与结尾的组别括号，
 * 只留"A 3:1 B"这类比赛要素，使两个来源的标题能对齐为同一场。
 */
function resultContentKey(title: string): string {
  const core = title
    .replace(/^\s*赛果快讯\s*[|｜]\s*/, '')
    .replace(/^\s*赛果\s*[:：]\s*/, '')
    .replace(/[（(][^）)]*[)）]\s*$/, '')
  return norm(core)
}

/**
 * 赛果内容去重：后端在发布赛果时自动推送一条「赛果：A 3:1 B」（无封面），
 * 前端随后又生成一条带比分海报的「赛果快讯｜…」。门户只保留一条：
 * 优先带封面的（海报版），封面相同则优先 NEWS 快讯，其余按首次出现位置保留。
 */
/**
 * 赛果类标题的卡片结论句：把「赛果快讯｜A 1:0 B（组别）」这类复述比分的标题，
 * 在卡片展示层转换为新闻标题「A 小胜/大胜/战平/不敌 B」，比分只由海报承载。
 * 仅作用于展示层，源数据与详情页标题保持原样；无法解析时原样返回。
 */
export function resultCardTitle(title: string | null | undefined): string {
  const raw = (title || '').trim()
  if (!isResultContentTitle(raw)) return raw
  const core = raw
    .replace(/^\s*赛果快讯\s*[|｜]\s*/, '')
    .replace(/^\s*赛果\s*[:：]\s*/, '')
    .replace(/[（(][^）)]*[)）]\s*$/, '')
    .trim()
  const matched = core.match(/^(.+?)\s+(\d{1,3}):(\d{1,3})\s+(.+)$/)
  if (!matched) return raw
  const home = matched[1].trim()
  const away = matched[4].trim()
  const homeScore = Number(matched[2])
  const awayScore = Number(matched[3])
  if (homeScore > awayScore) {
    return `${home}${homeScore - awayScore >= 3 ? '大胜' : '小胜'}${away}`
  }
  if (homeScore === awayScore) return `${home}战平${away}`
  return `${home}不敌${away}`
}

export function dedupeResultContent<T extends { title: string; contentType?: string }>(
  items: readonly T[],
  hasCover: (item: T) => boolean,
): T[] {
  const keys = items.map((item) =>
    isResultContentTitle(item.title) ? resultContentKey(item.title) : '',
  )
  const winners = new Map<string, number>()
  keys.forEach((key, index) => {
    if (!key) return
    const current = winners.get(key)
    if (current === undefined) {
      winners.set(key, index)
      return
    }
    const score = (i: number) => (hasCover(items[i]) ? 2 : 0) + (items[i].contentType === 'NEWS' ? 1 : 0)
    if (score(index) > score(current)) winners.set(key, index)
  })
  return items.filter((_, index) => {
    const key = keys[index]
    return !key || winners.get(key) === index
  })
}
