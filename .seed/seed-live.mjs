// 为已结束的比赛补齐图文直播条目（真实写入后端，不使用 mock）
import fs from 'node:fs'
const BASE = process.env.API_BASE || 'http://w96dfae3.natappfree.cc/api/v1'
const TOKEN = (process.env.TOKEN || '').trim()
if (!TOKEN) throw new Error('缺少 TOKEN 环境变量')
const MATCH_ID = 'mat_demo_u15_r2'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.message || ''}`)
  return json.data
}

const existing = await call(`/matches/${MATCH_ID}/live-posts?page=1&pageSize=50`)
console.log('existing live posts:', existing.total)
if (existing.total > 0) {
  console.log('已有直播内容，跳过')
  process.exit(0)
}

const posts = [
  { minute: 0, text: '比赛开始！示例第二中学男子足球队（主队）对阵示例第一中学男子足球队（客队），双方首发登场。' },
  { minute: 12, text: '主队右路传中造成门前混战，客队后卫抢先将球解围出底线。' },
  { minute: 23, text: '进球！主队 7 号中场抢断后直塞，前锋单刀推射破门，主队 1:0 领先。' },
  { minute: 31, text: '客队连续获得两次角球，主队门将高接低挡力保球门不失。' },
  { minute: 38, text: '进球！客队 10 号禁区外远射直挂死角，比分改写为 1:1。' },
  { minute: 45, text: '上半场结束，双方 1:1 进入中场休息。' },
  { minute: 58, text: '进球！客队快速反击，9 号抢点头球破门，客队 2:1 反超。' },
  { minute: 66, text: '主队换人调整，加强前场压迫，比赛节奏明显加快。' },
  { minute: 78, text: '主队前场任意球击中横梁，错失扳平良机。' },
  { minute: 90, text: '全场结束，示例第一中学男子足球队客场 2:1 取胜。感谢关注本场图文直播。' },
]

let created = 0
for (const post of posts) {
  if (created > 0) await wait(9000)
  const row = await call(`/matches/${MATCH_ID}/live-posts`, {
    method: 'POST',
    body: { text: post.text, minute: post.minute },
  })
  created += 1
  console.log(`+ ${post.minute}' ${row.id}`)
}

const feed = await call(`/public/matches/${MATCH_ID}/live-feed?afterRevision=0`)
console.log('feed revision:', feed.feedRevision, 'items:', feed.items.length)
