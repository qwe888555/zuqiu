/**
 * 上传一张真实生成的轮播图并创建门户 CAROUSEL 资源。
 * 只调用公开文件/门户接口；图片在内存中生成，不落临时文件。
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

const BASE = process.env.API_BASE || 'http://w96dfae3.natappfree.cc/api/v1'
const TOKEN =
  process.env.TOKEN ||
  (fs.existsSync('/tmp/zuqiu_token') ? fs.readFileSync('/tmp/zuqiu_token', 'utf8').trim() : '')
const STATE_PATH = '.seed/state.json'
const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : {}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuffer, data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function makePng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const t = x / width
      const band = Math.floor((x + y) / 120) % 2
      const base = band ? [13, 74, 52] : [16, 94, 64]
      const glow = Math.max(0, 1 - Math.abs(y / height - 0.5) * 1.6)
      const offset = row + 1 + x * 3
      raw[offset] = Math.round(base[0] + (199 - base[0]) * t * 0.65 + glow * 12)
      raw[offset + 1] = Math.round(base[1] + (243 - base[1]) * t * 0.55 + glow * 10)
      raw[offset + 2] = Math.round(base[2] + (107 - base[2]) * t * 0.25 + glow * 8)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function upload(form) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}` },
        body: form,
      })
      const text = await response.text()
      if (/Too much connections/i.test(text)) {
        console.log('隧道限流，等待 65 秒')
        await sleep(65000)
        continue
      }
      return { status: response.status, ...JSON.parse(text) }
    } catch (error) {
      console.log(`上传异常(${attempt})：${error.message}`)
      await sleep(30000)
    }
  }
  throw new Error('上传失败')
}

async function post(url, body) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(BASE + url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const text = await response.text()
      if (/Too much connections/i.test(text)) {
        console.log('隧道限流，等待 65 秒')
        await sleep(65000)
        continue
      }
      return { status: response.status, ...JSON.parse(text) }
    } catch (error) {
      console.log(`请求异常(${attempt})：${error.message}`)
      await sleep(30000)
    }
  }
  throw new Error('请求失败')
}

const news = state.contents?.news
if (!news) {
  console.error('缺少已发布新闻内容，无法创建轮播')
  process.exit(1)
}
if (!state.resources) state.resources = {}
if (state.resources.carousel) {
  console.log('轮播已存在，跳过')
  process.exit(0)
}

const png = makePng(1200, 480)
console.log(`生成图片 ${(png.length / 1024).toFixed(1)} KiB`)
const form = new FormData()
form.append('ownerType', 'RESOURCE')
form.append('category', 'CMS_IMAGE')
form.append('file', new Blob([png], { type: 'image/png' }), 'league-2026.png')
const uploaded = await upload(form)
if (uploaded.status >= 400 || uploaded.code !== 'OK') {
  console.error('上传失败', uploaded.status, uploaded.code, uploaded.message)
  process.exit(1)
}
const fileId = uploaded.data.id
console.log('已上传图片', fileId)
await sleep(9000)
const created = await post('/portal-resources', {
  resourceType: 'CAROUSEL',
  title: '2026年四川省青少年校园足球联赛',
  imageFileId: fileId,
  targetContentId: news.id,
  sortOrder: 0,
  enabled: true,
})
if (created.status >= 400 || created.code !== 'OK') {
  console.error('创建轮播失败', created.status, created.code, created.message)
  process.exit(1)
}
state.resources.carousel = created.data
fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
console.log('已创建轮播资源', created.data.id)
