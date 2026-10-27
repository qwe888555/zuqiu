/**
 * 为已结束的演示比赛补录真实进球事件，生成射手榜数据。
 *
 * 用法：
 *   TOKEN=$(cat /tmp/zuqiu_token) node .seed/seed-goals.mjs
 *
 * 每个进球的比分都与比赛已发布的赛果一致：
 *   小学女子组 4:0、1:0；初中男子组 3:1、1:2；高中男子组 2:2；初中女子组 1:1。
 * 脚本可重复执行，已存在的同场同分钟同球员进球会跳过。
 */
import crypto from 'node:crypto'

const BASE = process.env.API_BASE || 'http://w96dfae3.natappfree.cc/api/v1'
const TOKEN = process.env.TOKEN || ''
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

/** 一场比赛内，每名球员每个分钟最多一个进球。 */
const PLANS = [
  // 小学女子组：示例第一中学 4:0 示例第二中学
  { matchId: 'mat_demo_gu12_r1', teamId: '19', athleteId: '492', athleteName: '许静怡', minute: 8 },
  { matchId: 'mat_demo_gu12_r1', teamId: '19', athleteId: '477', athleteName: '徐欣怡', minute: 17 },
  { matchId: 'mat_demo_gu12_r1', teamId: '19', athleteId: '492', athleteName: '许静怡', minute: 52 },
  { matchId: 'mat_demo_gu12_r1', teamId: '19', athleteId: '492', athleteName: '许静怡', minute: 70 },
  // 小学女子组：示例第二中学 1:0 示例第一中学
  { matchId: 'mat_demo_gu12_r2', teamId: '20', athleteId: '518', athleteName: '李诗涵', minute: 35 },

  // 初中男子组：示例第一中学 3:1 示例第二中学
  { matchId: 'mat_demo_u15_r1', teamId: '17', athleteId: '425', athleteName: '吴昊天', minute: 12 },
  { matchId: 'mat_demo_u15_r1', teamId: '18', athleteId: '463', athleteName: '丁思远', minute: 38 },
  { matchId: 'mat_demo_u15_r1', teamId: '17', athleteId: '425', athleteName: '吴昊天', minute: 55 },
  { matchId: 'mat_demo_u15_r1', teamId: '17', athleteId: '440', athleteName: '宋梓涵', minute: 72 },

  // 高中男子组：示例第一中学 2:2 示例第二中学（共用 U15 年龄段演示名单）
  { matchId: 'mat_demo_u18_r1', teamId: '17', athleteId: '437', athleteName: '郑伟磊', minute: 20 },
  { matchId: 'mat_demo_u18_r1', teamId: '18', athleteId: '460', athleteName: '苏梓涵', minute: 30 },
  { matchId: 'mat_demo_u18_r1', teamId: '17', athleteId: '422', athleteName: '杨俊杰', minute: 63 },
  { matchId: 'mat_demo_u18_r1', teamId: '18', athleteId: '466', athleteName: '姚嘉豪', minute: 77 },

  // 初中女子组：示例第一中学 1:1 示例第二中学
  { matchId: 'mat_demo_gu15_r1', teamId: '19', athleteId: '474', athleteName: '赵慧敏', minute: 44 },
  { matchId: 'mat_demo_gu15_r1', teamId: '20', athleteId: '503', athleteName: '潘若彤', minute: 58 },

  // 初中男子组半决赛：示例第二中学 1:2 示例第一中学
  { matchId: 'mat_demo_u15_r2', teamId: '18', athleteId: '451', athleteName: '董一诺', minute: 23 },
  { matchId: 'mat_demo_u15_r2', teamId: '17', athleteId: '425', athleteName: '吴昊天', minute: 41 },
  { matchId: 'mat_demo_u15_r2', teamId: '17', athleteId: '440', athleteName: '宋梓涵', minute: 78 },
]

const matchIds = [...new Set(PLANS.map((plan) => plan.matchId))]
const versions = new Map()
const existing = new Set()

for (const matchId of matchIds) {
  const list = assertOk(
    await api('GET', `/matches/${matchId}/events?page=1&pageSize=100`),
    `读取比赛事件/${matchId}`,
  )
  const items = list.items || []
  for (const event of items) {
    existing.add(
      `${matchId}|${event.eventType}|${event.teamId}|${event.minute}|${event.scorerAthleteId || ''}`,
    )
  }
  const detail = assertOk(await api('GET', `/matches/${matchId}`), `读取比赛/${matchId}`)
  versions.set(matchId, detail.version)
  log(`比赛 ${matchId} version=${detail.version}，已有事件 ${items.length} 条`)
}

let created = 0
for (const plan of PLANS) {
  const key = `${plan.matchId}|GOAL|${plan.teamId}|${plan.minute}|${plan.athleteId}`
  if (existing.has(key)) {
    log(`跳过 ${plan.matchId} ${plan.athleteName} ${plan.minute}'（已存在）`)
    continue
  }

  let version = versions.get(plan.matchId) ?? 0
  let result = await api('POST', `/matches/${plan.matchId}/events`, {
    idempotencyKey: crypto.randomUUID(),
    body: {
      eventType: 'GOAL',
      minute: plan.minute,
      teamId: plan.teamId,
      matchVersion: version,
      scorerAthleteId: plan.athleteId,
      note: `${plan.athleteName} 进球`,
    },
  })

  if (result.status === 400 && /版本|version/i.test(result.message || '')) {
    const detail = assertOk(await api('GET', `/matches/${plan.matchId}`), `重读比赛/${plan.matchId}`)
    version = detail.version
    versions.set(plan.matchId, version)
    log(`版本已更新为 ${version}，重试 ${plan.athleteName} ${plan.minute}'`)
    result = await api('POST', `/matches/${plan.matchId}/events`, {
      idempotencyKey: crypto.randomUUID(),
      body: {
        eventType: 'GOAL',
        minute: plan.minute,
        teamId: plan.teamId,
        matchVersion: version,
        scorerAthleteId: plan.athleteId,
        note: `${plan.athleteName} 进球`,
      },
    })
  }

  if (result.status >= 400 || result.code !== 'OK') {
    log(`创建进球失败 ${plan.matchId} ${plan.athleteName} ${plan.minute}'：${result.code} ${result.message}`)
    continue
  }

  versions.set(plan.matchId, version + 1)
  existing.add(key)
  created += 1
  log(`已录入 ${plan.matchId} ${plan.athleteName} ${plan.minute}'`)
}

log(`本次新增 ${created} 个进球事件`)

for (const category of ['PRIMARY', 'MIDDLE']) {
  const data = assertOk(
    await api('GET', `/public/statistics/goals?eventId=event_01&category=${category}&page=1&pageSize=100`),
    `读取射手榜/${category}`,
  )
  const rows = data.items || []
  log(`射手榜 ${category}：${rows.length} 人，累计 ${rows.reduce((sum, row) => sum + row.goals, 0)} 球`)
  for (const row of rows.slice(0, 5)) {
    log(`  ${row.rank}. ${row.athleteName}（${row.teamName}）${row.goals} 球`)
  }
}
