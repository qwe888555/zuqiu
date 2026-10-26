import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import {
  eventGroups,
  events,
  persons,
  publications,
  selectionRules,
  selectionScores,
  teamMembers,
  teams,
} from './data'

/**
 * 成员6 遴选评分与报名公示（/api/selection）的本地 Mock。
 * 严格按《成员6-遴选评分与报名公示接口文档》的信封与字段口径返回：
 * { code: 0, message: 'ok', data }，分页 data 为 { records, total, page, size }。
 */

interface Ctx {
  params: Record<string, string>
  query: Record<string, unknown>
  body: Record<string, any>
}

type Handler = (ctx: Ctx) => unknown

class MockHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const BASE = '/api/selection'
let seq = 0

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function nextId(prefix: string): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}${seq}`
}

function str(value: unknown): string {
  return value == null ? '' : String(value)
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const GROUP_LABEL: Record<string, string> = { MIDDLE: '中学组', PRIMARY: '小学组' }
const ROUND_LABEL: Record<string, string> = { INITIAL: '初选', FINAL: '复选' }
const PUBLICITY_LABEL: Record<string, string> = { ATHLETE: '运动员', COACH: '教练员', TEAM: '球队' }

/* ---------------------------------------------------------------------------
 * 演示数据：由既有 mock 主数据派生为成员6 文档口径
 * ------------------------------------------------------------------------- */

interface MockTemplateItem {
  id: string
  dimension_code: string
  dimension_name: string
  weight: number
  max_score: number
  sort_no: number
}

interface MockTemplate {
  id: string
  name: string
  group_type: string
  round: string
  status: number
  created_by: number
  created_at: string
  updated_at: string
  items: MockTemplateItem[]
}

function groupTypeOf(groupId?: string): string {
  const group = eventGroups.find((item) => item.id === groupId)
  return group?.category === 'PRIMARY' ? 'PRIMARY' : 'MIDDLE'
}

function templateIdOf(ruleId: string, round: string): string {
  return `tpl_${ruleId}_${round.toLowerCase()}`
}

const templates: MockTemplate[] = []

selectionRules.forEach((rule) => {
  const groupType = groupTypeOf(rule.groupId)
  ;['INITIAL', 'FINAL'].forEach((round) => {
    templates.push({
      id: templateIdOf(rule.id, round),
      name: `${rule.groupName}${ROUND_LABEL[round]}评分模板`,
      group_type: groupType,
      round,
      status: 1,
      created_by: 1,
      created_at: '2026-10-15 09:00:00',
      updated_at: '2026-10-15 09:00:00',
      items: rule.dimensions.map((dim, index) => ({
        id: `${templateIdOf(rule.id, round)}_${dim.key}`,
        dimension_code: dim.key.toUpperCase(),
        dimension_name: dim.label,
        weight: Math.round(dim.weight * 100),
        max_score: dim.maxScore,
        sort_no: index + 1,
      })),
    })
  })
})

interface MockScore {
  id: string
  event_id: string
  group_type: string
  round: string
  template_id: string
  candidate_id: string
  candidate_name: string
  team_name: string
  position: string
  total_score: number
  version: number
  created_by: number
  created_at: string
  updated_at: string
  items: Array<MockTemplateItem & { score: number }>
}

function buildScoreItems(template: MockTemplate, source: Array<{ value: number }>): MockScore['items'] {
  return template.items.map((item, index) => ({
    ...item,
    score: source[index]?.value ?? 0,
  }))
}

function computeTotal(items: Array<{ weight: number; max_score: number; score: number }>): number {
  const weightSum = items.reduce((sum, item) => sum + item.weight, 0)
  if (!weightSum) return 0
  const weighted = items.reduce((sum, item) => sum + (item.score / item.max_score) * 100 * item.weight, 0)
  return Math.round((weighted / weightSum) * 100) / 100
}

const scores: MockScore[] = selectionScores.map((scoreData) => {
  const rule = selectionRules.find((item) => item.id === scoreData.ruleId)!
  const template = templates.find((item) => item.id === templateIdOf(rule.id, 'INITIAL'))!
  const items = buildScoreItems(template, scoreData.dimensionScores)
  const member = teamMembers.find((item) => item.athleteId === scoreData.athleteId)
  return {
    id: `sc_${scoreData.id}`,
    event_id: rule.eventId,
    group_type: groupTypeOf(rule.groupId),
    round: 'INITIAL',
    template_id: template.id,
    candidate_id: scoreData.athleteId,
    candidate_name: scoreData.athleteName,
    team_name: scoreData.teamName || '',
    position: member?.position || '',
    total_score: computeTotal(items),
    version: 1,
    created_by: 1,
    created_at: '2026-10-16 10:00:00',
    updated_at: '2026-10-16 10:00:00',
    items,
  }
})

interface MockResultItem {
  rank_no: number
  candidate_id: string
  candidate_name: string
  team_name: string
  position: string
  initial_score: number
  final_score: number
  composite_score: number
  detail: Record<string, unknown>
}

interface MockResultBatch {
  id: string
  event_id: string
  group_type: string
  result_round: string
  quota: number
  initial_weight: number
  final_weight: number
  formula_snapshot: string
  version_no: number
  active: boolean
  stale: boolean
  generated_by: number
  generated_at: string
  items: MockResultItem[]
}

const resultBatches: MockResultBatch[] = []

interface MockPublicity {
  id: string
  event_id: string
  group_type: string
  city: string
  publicity_type: string
  name: string
  team_name: string
  school_name: string
  id_card_masked: string
  fields: Record<string, unknown>
  status: string
  published_at: string
  source_id: string
  published_by: number
  cancelled_by: number
  cancelled_at: string | null
  cancel_reason: string
  created_at: string
  updated_at: string
}

function publicityTypeOf(targetType: string): string {
  if (targetType === 'ATHLETE') return 'ATHLETE'
  if (targetType === 'COACH') return 'COACH'
  return 'TEAM'
}

function groupTypeOfGroupName(groupName?: string): string {
  const group = eventGroups.find((item) => item.name === groupName)
  return group?.category === 'PRIMARY' ? 'PRIMARY' : 'MIDDLE'
}

function eventIdOfPublication(eventId?: string, groupName?: string): string {
  if (eventId) return eventId
  const group = eventGroups.find((item) => item.name === groupName)
  return group?.eventId || events[0]?.id || ''
}

const publicityRecords: MockPublicity[] = publications.map((item) => {
  const groupType = groupTypeOfGroupName(item.groupName)
  return {
    id: `pub6_${item.id}`,
    event_id: eventIdOfPublication(item.eventId, item.groupName),
    group_type: groupType,
    city: item.cityName || '',
    publicity_type: publicityTypeOf(item.targetType),
    name: item.targetName || '',
    team_name: item.teamName || '',
    school_name: '',
    id_card_masked: '51******0011',
    fields: {
      name: item.targetName,
      team_name: item.teamName,
      school_name: '',
      group_type: groupType,
    },
    status: item.active ? 'PUBLISHED' : 'CANCELLED',
    published_at: (item.publishedAt || '').slice(0, 19).replace('T', ' '),
    source_id: item.targetId,
    published_by: 1,
    cancelled_by: item.active ? 0 : 1,
    cancelled_at: item.cancelledAt ? item.cancelledAt.slice(0, 19).replace('T', ' ') : null,
    cancel_reason: '',
    created_at: (item.publishedAt || '').slice(0, 19).replace('T', ' '),
    updated_at: (item.cancelledAt || item.publishedAt || '').slice(0, 19).replace('T', ' '),
  }
})

/* ---------------------------------------------------------------------------
 * 序列化
 * ------------------------------------------------------------------------- */

function templateOut(item: MockTemplate) {
  return {
    ...item,
    group_type_label: GROUP_LABEL[item.group_type],
    round_label: ROUND_LABEL[item.round],
  }
}

function scoreOut(item: MockScore, rankNo?: number) {
  return {
    ...item,
    group_type_label: GROUP_LABEL[item.group_type],
    round_label: ROUND_LABEL[item.round],
    ...(rankNo ? { rank_no: rankNo } : {}),
  }
}

function batchOut(item: MockResultBatch, withItems = true) {
  return {
    ...item,
    group_type_label: GROUP_LABEL[item.group_type],
    result_round_label: ROUND_LABEL[item.result_round],
    items: withItems ? item.items : [],
    ...(withItems ? {} : { item_count: item.items.length }),
  }
}

function publicityOut(item: MockPublicity) {
  return {
    ...item,
    group_type_label: GROUP_LABEL[item.group_type],
    publicity_type_label: PUBLICITY_LABEL[item.publicity_type],
    status_label: item.status === 'PUBLISHED' ? '已公示' : '已取消',
  }
}

function pageOf<T>(items: T[], query: Record<string, unknown>) {
  const page = Math.max(1, num(query.page, 1))
  const size = Math.min(100, Math.max(1, num(query.size, 10)))
  const start = (page - 1) * size
  return { records: items.slice(start, start + size), total: items.length, page, size }
}

/* ---------------------------------------------------------------------------
 * 路由
 * ------------------------------------------------------------------------- */

const routes: Array<{ method: string; pattern: RegExp; keys: string[]; handler: Handler }> = []

function on(method: string, path: string, handler: Handler) {
  const keys: string[] = []
  const pattern = new RegExp(
    '^' +
      path.replace(/:([A-Za-z0-9_]+)/g, (_m, key: string) => {
        keys.push(key)
        return '([^/]+)'
      }) +
      '$',
  )
  routes.push({ method: method.toUpperCase(), pattern, keys, handler })
}

function matchRoute(method: string, path: string) {
  for (const route of routes) {
    if (route.method !== method) continue
    const matched = route.pattern.exec(path)
    if (!matched) continue
    const params: Record<string, string> = {}
    route.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(matched[index + 1])
    })
    return { route, params }
  }
  return undefined
}

// --- 评分模板 ---------------------------------------------------------------

on('GET', '/templates/', ({ query }) => {
  let items = templates
  if (query.group_type) items = items.filter((item) => item.group_type === query.group_type)
  if (query.round) items = items.filter((item) => item.round === query.round)
  if (query.status !== undefined && query.status !== '') items = items.filter((item) => item.status === num(query.status, 1))
  return pageOf(items.map(templateOut), query)
})

on('POST', '/templates/', ({ body }) => {
  const name = str(body.name).trim()
  const groupType = str(body.group_type ?? body.groupType)
  const round = str(body.round)
  if (!name) throw new MockHttpError(400, '模板名称不能为空')
  if (!GROUP_LABEL[groupType] || !ROUND_LABEL[round]) throw new MockHttpError(400, '组别或轮次非法')
  const items = (body.items ?? []) as Array<Record<string, unknown>>
  if (!items.length || items.length > 20) throw new MockHttpError(400, '评分维度需为 1–20 个')
  const weightSum = items.reduce((sum, item) => sum + num(item.weight), 0)
  if (Math.abs(weightSum - 100) > 0.001) throw new MockHttpError(400, '所有维度权重之和必须等于 100')
  const codes = items.map((item) => str(item.dimension_code ?? item.dimensionCode).toUpperCase())
  if (new Set(codes).size !== codes.length) throw new MockHttpError(400, '同一模板内维度编码不能重复')
  templates.forEach((item) => {
    if (item.group_type === groupType && item.round === round) item.status = 0
  })
  const created: MockTemplate = {
    id: nextId('tpl'),
    name,
    group_type: groupType,
    round,
    status: 1,
    created_by: 1,
    created_at: now(),
    updated_at: now(),
    items: items.map((item, index) => ({
      id: nextId('dim'),
      dimension_code: str(item.dimension_code ?? item.dimensionCode).toUpperCase(),
      dimension_name: str(item.dimension_name ?? item.dimensionName),
      weight: num(item.weight),
      max_score: num(item.max_score ?? item.maxScore, 100),
      sort_no: num(item.sort_no ?? item.sortNo, index + 1),
    })),
  }
  templates.unshift(created)
  return templateOut(created)
})

on('GET', '/templates/:id/', ({ params }) => {
  const item = templates.find((template) => template.id === params.id)
  if (!item) throw new MockHttpError(404, '模板不存在')
  return templateOut(item)
})

on('PUT', '/templates/:id/', ({ params, body }) => {
  const item = templates.find((template) => template.id === params.id)
  if (!item) throw new MockHttpError(404, '模板不存在')
  if (body.name !== undefined) item.name = str(body.name)
  if (body.items) {
    const items = body.items as Array<Record<string, unknown>>
    const weightSum = items.reduce((sum, row) => sum + num(row.weight), 0)
    if (Math.abs(weightSum - 100) > 0.001) throw new MockHttpError(400, '所有维度权重之和必须等于 100')
    item.items = items.map((row, index) => ({
      id: nextId('dim'),
      dimension_code: str(row.dimension_code ?? row.dimensionCode).toUpperCase(),
      dimension_name: str(row.dimension_name ?? row.dimensionName),
      weight: num(row.weight),
      max_score: num(row.max_score ?? row.maxScore, 100),
      sort_no: num(row.sort_no ?? row.sortNo, index + 1),
    }))
  }
  item.updated_at = now()
  return templateOut(item)
})

// --- 评分 -------------------------------------------------------------------

on('GET', '/scores/', ({ query }) => {
  let items = scores.filter(
    (item) =>
      (!query.event_id || item.event_id === query.event_id) &&
      (!query.group_type || item.group_type === query.group_type) &&
      (!query.round || item.round === query.round),
  )
  if (query.keyword) {
    const keyword = str(query.keyword).toLowerCase()
    items = items.filter(
      (item) =>
        item.candidate_name.toLowerCase().includes(keyword) || item.team_name.toLowerCase().includes(keyword),
    )
  }
  items = [...items].sort((a, b) => b.total_score - a.total_score || a.candidate_id.localeCompare(b.candidate_id))
  return pageOf(items.map((item) => scoreOut(item)), query)
})

on('POST', '/scores/', ({ body }) => {
  const eventId = str(body.event_id ?? body.eventId)
  const groupType = str(body.group_type ?? body.groupType)
  const round = str(body.round)
  const template = templates.find((item) => item.id === str(body.template_id ?? body.templateId))
  if (!template) throw new MockHttpError(404, '评分模板不存在')
  if (!template.status) throw new MockHttpError(400, '评分模板已停用')
  if (template.group_type !== groupType || template.round !== round) throw new MockHttpError(400, '模板组别或轮次与请求不一致')
  const candidateId = str(body.candidate_id ?? body.candidateId)
  if (scores.some((item) => item.event_id === eventId && item.round === round && item.candidate_id === candidateId)) {
    throw new MockHttpError(409, '该球员本轮评分已存在')
  }
  const person = persons.find((item) => item.id === candidateId)
  if (!person) throw new MockHttpError(400, '球员档案不存在')
  const member = teamMembers.find((item) => item.athleteId === candidateId)
  const submitted = (body.scores ?? []) as Array<{ dimension_code?: string; dimensionCode?: string; score?: number }>
  const items = template.items.map((item) => {
    const matched = submitted.find((row) => str(row.dimension_code ?? row.dimensionCode).toUpperCase() === item.dimension_code)
    if (!matched) throw new MockHttpError(400, `缺少维度得分：${item.dimension_code}`)
    const score = num(matched.score)
    if (score < 0 || score > item.max_score) throw new MockHttpError(400, '维度得分越界')
    return { ...item, score }
  })
  const created: MockScore = {
    id: nextId('sc'),
    event_id: eventId,
    group_type: groupType,
    round,
    template_id: template.id,
    candidate_id: candidateId,
    candidate_name: person.realName,
    team_name: teams.find((team) => team.id === member?.teamId)?.name || '',
    position: member?.position || '',
    total_score: computeTotal(items),
    version: 1,
    created_by: 1,
    created_at: now(),
    updated_at: now(),
    items,
  }
  scores.push(created)
  markStale(eventId, groupType)
  return scoreOut(created)
})

on('GET', '/scores/summary/', ({ query }) => {
  const items = scores
    .filter(
      (item) =>
        (!query.event_id || item.event_id === query.event_id) &&
        (!query.group_type || item.group_type === query.group_type) &&
        (!query.round || item.round === query.round),
    )
    .sort((a, b) => b.total_score - a.total_score || a.candidate_id.localeCompare(b.candidate_id))
  let lastScore: number | null = null
  let lastRank = 0
  return items.map((item, index) => {
    const rank = lastScore === item.total_score ? lastRank : index + 1
    lastScore = item.total_score
    lastRank = rank
    return scoreOut(item, rank)
  })
})

on('GET', '/scores/:id/', ({ params }) => {
  const item = scores.find((score) => score.id === params.id)
  if (!item) throw new MockHttpError(404, '评分记录不存在')
  return scoreOut(item)
})

on('PUT', '/scores/:id/', ({ params, body }) => {
  const item = scores.find((score) => score.id === params.id)
  if (!item) throw new MockHttpError(404, '评分记录不存在')
  const submitted = (body.scores ?? []) as Array<{ dimension_code?: string; dimensionCode?: string; score?: number }>
  item.items = item.items.map((row) => {
    const matched = submitted.find((entry) => str(entry.dimension_code ?? entry.dimensionCode).toUpperCase() === row.dimension_code)
    if (!matched) throw new MockHttpError(400, `缺少维度得分：${row.dimension_code}`)
    const score = num(matched.score)
    if (score < 0 || score > row.max_score) throw new MockHttpError(400, '维度得分越界')
    return { ...row, score }
  })
  item.total_score = computeTotal(item.items)
  item.version += 1
  item.updated_at = now()
  markStale(item.event_id, item.group_type)
  return scoreOut(item)
})

on('GET', '/scores/export/', () => ({ success: true }))

function markStale(eventId: string, groupType: string) {
  resultBatches
    .filter((batch) => batch.event_id === eventId && batch.group_type === groupType && batch.active)
    .forEach((batch) => {
      batch.stale = true
    })
}

// --- 遴选结果 ---------------------------------------------------------------

on('POST', '/results/generate/', ({ body }) => {
  const eventId = str(body.event_id ?? body.eventId)
  const groupType = str(body.group_type ?? body.groupType)
  const resultRound = str(body.result_round ?? body.resultRound ?? 'FINAL')
  const quota = Math.max(1, num(body.quota, 11))
  const initialWeight = num(body.initial_weight ?? body.initialWeight, 0.4)
  const finalWeight = num(body.final_weight ?? body.finalWeight, 0.6)
  if (initialWeight + finalWeight <= 0) throw new MockHttpError(400, '权重和必须大于 0')

  const roundScores = scores.filter(
    (item) =>
      item.event_id === eventId &&
      item.group_type === groupType &&
      (resultRound === 'INITIAL' ? item.round === 'INITIAL' : item.round === 'FINAL'),
  )
  if (!roundScores.length) throw new MockHttpError(400, '没有可用评分')

  const initialMap = new Map(
    scores
      .filter((item) => item.event_id === eventId && item.group_type === groupType && item.round === 'INITIAL')
      .map((item) => [item.candidate_id, item]),
  )
  const rows = roundScores
    .map((item) => {
      const initial = initialMap.get(item.candidate_id)
      const initialScore = initial?.total_score ?? 0
      const finalScore = item.round === 'FINAL' ? item.total_score : 0
      const composite =
        resultRound === 'INITIAL' || !initialScore
          ? item.total_score
          : Math.round(((initialScore * initialWeight + finalScore * finalWeight) / (initialWeight + finalWeight)) * 100) / 100
      return { item, initialScore, finalScore, composite }
    })
    .sort((a, b) => b.composite - a.composite || a.item.candidate_id.localeCompare(b.item.candidate_id))
    .slice(0, quota)

  const versionNo = resultBatches.filter((batch) => batch.event_id === eventId && batch.group_type === groupType).length + 1
  resultBatches
    .filter((batch) => batch.event_id === eventId && batch.group_type === groupType)
    .forEach((batch) => {
      batch.active = false
    })

  const created: MockResultBatch = {
    id: nextId('res'),
    event_id: eventId,
    group_type: groupType,
    result_round: resultRound,
    quota,
    initial_weight: initialWeight,
    final_weight: finalWeight,
    formula_snapshot: '综合分=(初选总分×初选权重+复选总分×复选权重)/(初选权重+复选权重)',
    version_no: versionNo,
    active: true,
    stale: false,
    generated_by: 1,
    generated_at: now(),
    items: rows.map((row, index) => ({
      rank_no: index + 1,
      candidate_id: row.item.candidate_id,
      candidate_name: row.item.candidate_name,
      team_name: row.item.team_name,
      position: row.item.position,
      initial_score: row.initialScore,
      final_score: row.finalScore,
      composite_score: row.composite,
      detail: {},
    })),
  }
  resultBatches.unshift(created)
  return batchOut(created)
})

on('GET', '/results/latest/', ({ query }) => {
  const item = resultBatches.find(
    (batch) =>
      batch.active &&
      (!query.event_id || batch.event_id === query.event_id) &&
      (!query.group_type || batch.group_type === query.group_type),
  )
  if (!item) throw new MockHttpError(404, '尚未生成遴选结果')
  return batchOut(item)
})

on('GET', '/results/batches/', ({ query }) => {
  const items = resultBatches.filter(
    (batch) =>
      (!query.event_id || batch.event_id === query.event_id) &&
      (!query.group_type || batch.group_type === query.group_type),
  )
  return items.map((batch) => batchOut(batch, false))
})

on('GET', '/results/export/', () => ({ success: true }))

// --- 报名公示 ---------------------------------------------------------------

on('GET', '/publicity/', ({ query }) => {
  let items = publicityRecords.filter((item) => item.status === 'PUBLISHED')
  if (query.event_id) items = items.filter((item) => item.event_id === query.event_id)
  if (query.group_type) items = items.filter((item) => item.group_type === query.group_type)
  if (query.city) items = items.filter((item) => item.city === query.city)
  if (query.publicity_type) items = items.filter((item) => item.publicity_type === query.publicity_type)
  if (query.keyword) {
    const keyword = str(query.keyword)
    items = items.filter((item) => item.name.includes(keyword) || item.team_name.includes(keyword))
  }
  return pageOf(items.map(publicityOut), query)
})

function findSource(sourceId: string) {
  const person = persons.find((item) => item.id === sourceId)
  if (person) {
    const member = teamMembers.find((item) => item.athleteId === sourceId)
    const team = teams.find((item) => item.id === member?.teamId)
    return {
      name: person.realName,
      teamName: team?.name || '',
      schoolName: team?.schoolName || person.schoolName || '',
      city: team?.cityName || '',
      groupType: team?.category === 'PRIMARY' ? 'PRIMARY' : 'MIDDLE',
      kind: person.kinds.includes('COACH') ? 'COACH' : 'ATHLETE',
    }
  }
  const team = teams.find((item) => item.id === sourceId)
  if (team) {
    return {
      name: team.name,
      teamName: team.name,
      schoolName: team.schoolName || '',
      city: team.cityName || '',
      groupType: team.category === 'PRIMARY' ? 'PRIMARY' : 'MIDDLE',
      kind: 'TEAM' as const,
    }
  }
  return null
}

on('POST', '/publicity/', ({ body }) => {
  const eventId = str(body.event_id ?? body.eventId)
  const publicityType = str(body.publicity_type ?? body.publicityType)
  const sourceId = str(body.source_id ?? body.sourceId)
  if (!PUBLICITY_LABEL[publicityType]) throw new MockHttpError(400, '公示类型非法')
  const source = findSource(sourceId)
  if (!source) throw new MockHttpError(404, '报名档案不存在')
  const existing = publicityRecords.find(
    (item) => item.event_id === eventId && item.publicity_type === publicityType && item.source_id === sourceId,
  )
  if (existing && existing.status === 'PUBLISHED') throw new MockHttpError(409, '该报名信息已在公示中')
  const payload: MockPublicity = {
    id: existing?.id || nextId('pub'),
    event_id: eventId,
    group_type: source.groupType,
    city: source.city,
    publicity_type: publicityType,
    name: source.name,
    team_name: source.teamName,
    school_name: source.schoolName,
    id_card_masked: '51******0011',
    fields: {
      name: source.name,
      team_name: source.teamName,
      school_name: source.schoolName,
      group_type: source.groupType,
      ...(publicityType === 'TEAM' ? { coach_name: '' } : {}),
    },
    status: 'PUBLISHED',
    published_at: now(),
    source_id: sourceId,
    published_by: 1,
    cancelled_by: 0,
    cancelled_at: null,
    cancel_reason: '',
    created_at: existing?.created_at || now(),
    updated_at: now(),
  }
  if (existing) Object.assign(existing, payload)
  else publicityRecords.unshift(payload)
  return { ...publicityOut(payload), action: existing ? 'republished' : 'published' }
})

on('GET', '/publicity/cities/', ({ query }) => {
  const cities = publicityRecords
    .filter(
      (item) =>
        item.status === 'PUBLISHED' &&
        (!query.event_id || item.event_id === query.event_id) &&
        (!query.group_type || item.group_type === query.group_type) &&
        (!query.publicity_type || item.publicity_type === query.publicity_type),
    )
    .map((item) => item.city)
    .filter(Boolean)
  return Array.from(new Set(cities))
})

on('POST', '/publicity/batch/', ({ body }) => {
  const eventId = str(body.event_id ?? body.eventId)
  const groupType = str(body.group_type ?? body.groupType)
  const publicityType = str(body.publicity_type ?? body.publicityType)
  const city = str(body.city)
  if (!groupType && !publicityType && !city) throw new MockHttpError(400, '批量公示至少指定一个筛选条件')

  const candidates: Array<{ id: string; kind: string; groupType: string; city: string }> = []
  persons.forEach((person) => {
    const kind = person.kinds.includes('COACH') ? 'COACH' : 'ATHLETE'
    const member = teamMembers.find((item) => item.athleteId === person.id)
    const team = teams.find((item) => item.id === member?.teamId)
    candidates.push({
      id: person.id,
      kind,
      groupType: team?.category === 'PRIMARY' ? 'PRIMARY' : 'MIDDLE',
      city: team?.cityName || '',
    })
  })
  teams.forEach((team) => {
    candidates.push({
      id: team.id,
      kind: 'TEAM',
      groupType: team.category === 'PRIMARY' ? 'PRIMARY' : 'MIDDLE',
      city: team.cityName || '',
    })
  })

  let published = 0
  let skipped = 0
  let failed = 0
  const errors: Array<{ source_id: string; message: string }> = []
  const records: unknown[] = []
  candidates
    .filter(
      (item) =>
        (!publicityType || item.kind === publicityType) &&
        (!groupType || item.groupType === groupType) &&
        (!city || item.city === city),
    )
    .forEach((candidate) => {
      const existing = publicityRecords.find(
        (item) => item.event_id === eventId && item.publicity_type === candidate.kind && item.source_id === candidate.id,
      )
      if (existing && existing.status === 'PUBLISHED') {
        skipped += 1
        return
      }
      const source = findSource(candidate.id)
      if (!source) {
        failed += 1
        errors.push({ source_id: candidate.id, message: '报名档案不存在' })
        return
      }
      const payload: MockPublicity = {
        id: existing?.id || nextId('pub'),
        event_id: eventId,
        group_type: source.groupType,
        city: source.city,
        publicity_type: candidate.kind,
        name: source.name,
        team_name: source.teamName,
        school_name: source.schoolName,
        id_card_masked: '51******0011',
        fields: { name: source.name, team_name: source.teamName, school_name: source.schoolName },
        status: 'PUBLISHED',
        published_at: now(),
        source_id: candidate.id,
        published_by: 1,
        cancelled_by: 0,
        cancelled_at: null,
        cancel_reason: '',
        created_at: existing?.created_at || now(),
        updated_at: now(),
      }
      if (existing) Object.assign(existing, payload)
      else publicityRecords.unshift(payload)
      published += 1
      records.push(publicityOut(payload))
    })
  return { published, skipped, failed, errors, records }
})

on('GET', '/publicity/manage/', ({ query }) => {
  let items = publicityRecords
  if (query.event_id) items = items.filter((item) => item.event_id === query.event_id)
  if (query.group_type) items = items.filter((item) => item.group_type === query.group_type)
  if (query.city) items = items.filter((item) => item.city === query.city)
  if (query.publicity_type) items = items.filter((item) => item.publicity_type === query.publicity_type)
  if (query.status) items = items.filter((item) => item.status === query.status)
  if (query.keyword) {
    const keyword = str(query.keyword)
    items = items.filter((item) => item.name.includes(keyword) || item.team_name.includes(keyword))
  }
  return pageOf(items.map(publicityOut), query)
})

on('GET', '/publicity/manage/:id/', ({ params }) => {
  const item = publicityRecords.find((record) => record.id === params.id)
  if (!item) throw new MockHttpError(404, '公示记录不存在')
  return publicityOut(item)
})

on('GET', '/publicity/:id/', ({ params }) => {
  const item = publicityRecords.find((record) => record.id === params.id && record.status === 'PUBLISHED')
  if (!item) throw new MockHttpError(404, '公示记录不存在或已取消')
  return publicityOut(item)
})

on('POST', '/publicity/:id/cancel/', ({ params, body }) => {
  const item = publicityRecords.find((record) => record.id === params.id)
  if (!item) throw new MockHttpError(404, '公示记录不存在')
  const already = item.status === 'CANCELLED'
  if (!already) {
    item.status = 'CANCELLED'
    item.cancelled_by = 1
    item.cancelled_at = now()
    item.cancel_reason = str(body.reason ?? body.cancel_reason ?? body.cancelReason)
    item.updated_at = now()
  }
  return { ...publicityOut(item), already_cancelled: already }
})

/* ---------------------------------------------------------------------------
 * 适配器入口
 * ------------------------------------------------------------------------- */

function pathOf(config: Record<string, unknown>): string {
  const url = String(config.url || '/')
  const clean = url.startsWith('http') ? new URL(url).pathname : url
  const index = clean.indexOf(BASE)
  const path = index >= 0 ? clean.slice(index + BASE.length) : clean
  return path.split('?')[0]
}

function parseBody(config: Record<string, unknown>): Record<string, any> {
  const data = config.data
  if (!data) return {}
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return {}
    }
  }
  return data as Record<string, any>
}

export const selectionMockAdapter: AxiosAdapter = async (config) => {
  const internal = config as InternalAxiosRequestConfig
  const method = (config.method || 'get').toUpperCase()
  const path = pathOf(config as unknown as Record<string, unknown>)
  const query = ((config.params || {}) as Record<string, unknown>)
  const body = parseBody(config as unknown as Record<string, unknown>)
  const matched = matchRoute(method, path)
  if (!matched) {
    return Promise.reject(makeError(404, `Mock 接口未实现：${method} ${path}`, internal))
  }
  try {
    const result = matched.route.handler({ params: matched.params, query, body })
    return {
      data: { code: 0, message: 'ok', data: result },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: internal,
    } as AxiosResponse
  } catch (error) {
    if (error instanceof MockHttpError) {
      return Promise.reject(makeError(error.status, error.message, internal))
    }
    return Promise.reject(makeError(500, (error as Error).message || 'Mock 处理异常', internal))
  }
}

function makeError(status: number, message: string, config: InternalAxiosRequestConfig) {
  return {
    isAxiosError: true,
    message,
    config,
    response: {
      data: { code: status, message, data: null },
      status,
      statusText: String(status),
      headers: {},
      config,
    },
  }
}
