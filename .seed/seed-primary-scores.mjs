/**
 * 为小学组补充真实遴选评分数据，避免管理端「评分录入」默认打开时为空。
 *
 * 用法：
 *   TOKEN=$(cat .admin_token) node .seed/seed-primary-scores.mjs
 *
 * 评分候选人取自已通过审核的小学女子组报名名单（enr_demo_girls_u12）。
 * 脚本可重复执行：已存在的模板/评分会跳过。
 */
import crypto from 'node:crypto'

const BASE = process.env.API_BASE || 'http://w96dfae3.natappfree.cc/api/v1'
const TOKEN = process.env.TOKEN || ''
const EVENT_ID = 'event_01'
const GAP = Number(process.env.GAP || 9000)

if (!TOKEN) {
  console.error('缺少管理员令牌：请通过 TOKEN 环境变量传入')
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let lastRequestAt = 0

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args)
}

async function waitGap() {
  const wait = lastRequestAt + GAP - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
}

async function api(method, url, { body, idempotencyKey, retries = 6 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    await waitGap()
    const headers = { Authorization: `Bearer ${TOKEN}` }
    const init = { method, headers }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
    let res
    let text
    try {
      res = await fetch(BASE + url, init)
      text = await res.text()
    } catch (error) {
      log(`网络异常(${attempt}/${retries})：${error.message}`)
      await sleep(15000)
      continue
    }
    if (/Too much connections|Too many connections/i.test(text) || res.status === 429) {
      log(`隧道限流(${attempt}/${retries})，等待 65 秒`)
      await sleep(65000)
      continue
    }
    if ([502, 503, 504].includes(res.status)) {
      log(`网关 ${res.status}(${attempt}/${retries})，等待 20 秒`)
      await sleep(20000)
      continue
    }
    let json
    try {
      json = JSON.parse(text)
    } catch {
      log(`响应不是 JSON(${attempt}/${retries})：${text.slice(0, 120)}`)
      await sleep(15000)
      continue
    }
    return { ...json, status: res.status }
  }
  throw new Error(`请求失败：${method} ${url}`)
}

function assertOk(result, label) {
  if (result.status >= 400 || result.code !== 'OK') {
    throw new Error(`${label} 失败：HTTP ${result.status} ${result.code} ${result.message}`)
  }
  return result.data
}

const TEMPLATES = [
  {
    key: 'initial',
    name: '小学组初选评分模板',
    groupType: 'PRIMARY',
    round: 'INITIAL',
    items: [
      { dimension_code: 'TECH', dimension_name: '技术能力', weight: 30, max_score: 100 },
      { dimension_code: 'MATCH', dimension_name: '比赛表现', weight: 30, max_score: 100 },
      { dimension_code: 'PHYSICAL', dimension_name: '身体素质', weight: 20, max_score: 100 },
      { dimension_code: 'TACTIC', dimension_name: '战术意识', weight: 20, max_score: 100 },
    ],
  },
  {
    key: 'final',
    name: '小学组复选评分模板',
    groupType: 'PRIMARY',
    round: 'FINAL',
    items: [
      { dimension_code: 'TECH', dimension_name: '技术能力', weight: 25, max_score: 100 },
      { dimension_code: 'TACTIC', dimension_name: '战术意识', weight: 25, max_score: 100 },
      { dimension_code: 'FITNESS', dimension_name: '体能状态', weight: 25, max_score: 100 },
      { dimension_code: 'MENTAL', dimension_name: '心理素质', weight: 25, max_score: 100 },
    ],
  },
]

const CANDIDATES = [
  { id: '477', name: '徐欣怡', initial: 92, final: 90 },
  { id: '474', name: '赵慧敏', initial: 89, final: 88 },
  { id: '480', name: '朱若曦', initial: 87, final: 86 },
  { id: '479', name: '马梦琪', initial: 85, final: 84 },
  { id: '476', name: '周一诺', initial: 82, final: 81 },
]

const templates = {}

for (const def of TEMPLATES) {
  const list = assertOk(
    await api(
      'GET',
      `/selection/templates/?group_type=${def.groupType}&round=${def.round}&status=1&page=1&size=20`,
    ),
    `读取评分模板/${def.name}`,
  )
  const items = Array.isArray(list) ? list : list.items || []
  const found = items.find((row) => row.name === def.name)
  if (found) {
    templates[def.key] = found
    log(`已存在评分模板 ${def.name}: ${found.id}`)
    continue
  }
  const created = assertOk(
    await api('POST', '/selection/templates/', {
      idempotencyKey: crypto.randomUUID(),
      body: {
        name: def.name,
        group_type: def.groupType,
        round: def.round,
        items: def.items,
      },
    }),
    `创建评分模板/${def.name}`,
  )
  templates[def.key] = created
  log(`已创建评分模板 ${def.name}: ${created.id}`)
}

for (const def of TEMPLATES) {
  const template = templates[def.key]
  const dims = (template.items || template.dimensions || []).map((item) => ({
    code: item.dimension_code || item.code,
  }))
  if (!dims.length) throw new Error(`评分模板 ${def.name} 缺少维度`)

  const list = assertOk(
    await api(
      'GET',
      `/selection/scores/?event_id=${EVENT_ID}&group_type=${def.groupType}&round=${def.round}&page=1&size=100`,
    ),
    `读取评分/${def.round}`,
  )
  const existing = Array.isArray(list) ? list : list.items || list.records || []

  for (const candidate of CANDIDATES) {
    if (existing.some((row) => String(row.candidate_id) === candidate.id)) {
      log(`已存在评分 ${def.round}/${candidate.name}`)
      continue
    }
    const base = def.round === 'INITIAL' ? candidate.initial : candidate.final
    const scores = dims.map((dim, index) => ({
      dimension_code: dim.code,
      score: Math.max(0, Math.min(100, base + (index % 2 === 0 ? 2 : -2))),
    }))
    const result = await api('POST', '/selection/scores/', {
      idempotencyKey: crypto.randomUUID(),
      body: {
        event_id: EVENT_ID,
        group_type: def.groupType,
        round: def.round,
        template_id: template.id,
        candidate_id: candidate.id,
        scores,
      },
    })
    if (result.status >= 400 || result.code !== 'OK') {
      log(`评分 ${def.round}/${candidate.name} 失败：${result.code} ${result.message}`)
      continue
    }
    existing.push(result.data)
    log(`已录入评分 ${def.round}/${candidate.name}`)
  }
}

for (const def of TEMPLATES) {
  const list = assertOk(
    await api(
      'GET',
      `/selection/scores/?event_id=${EVENT_ID}&group_type=${def.groupType}&round=${def.round}&page=1&size=100`,
    ),
    `复核评分/${def.round}`,
  )
  const items = Array.isArray(list) ? list : list.items || []
  log(
    `复核 PRIMARY ${def.round}：${items.length} 条，平均 ${Math.round(items.reduce((sum, row) => sum + Number(row.total_score || 0), 0) / (items.length || 1))} 分`,
  )
}
