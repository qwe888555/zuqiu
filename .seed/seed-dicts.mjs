/**
 * 填充「字典管理」页面：基础数据字典类型 + 字典项。
 * 只调用 /base-data 接口，重复执行按 code/value 去重。
 */
import fs from 'node:fs'

const BASE = process.env.API_BASE || 'http://w96dfae3.natappfree.cc/api/v1'
const TOKEN =
  process.env.TOKEN ||
  (fs.existsSync('/tmp/zuqiu_token') ? fs.readFileSync('/tmp/zuqiu_token', 'utf8').trim() : '')
const GAP = Number(process.env.GAP || 9000)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let last = 0

async function api(method, url, body) {
  for (let attempt = 1; attempt <= 7; attempt += 1) {
    const wait = last + GAP - Date.now()
    if (wait > 0) await sleep(wait)
    last = Date.now()
    try {
      const response = await fetch(BASE + url, {
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const text = await response.text()
      if (/Too much connections/i.test(text) || response.status === 429) {
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
  throw new Error(`失败：${method} ${url}`)
}

function itemsOf(result) {
  if (result.status >= 400 || result.code !== 'OK') return []
  const data = result.data
  return Array.isArray(data) ? data : data.items || []
}

const TYPES = [
  { code: 'position', name: '场上位置', remark: '球队名单中的运动员位置' },
  { code: 'coach_category', name: '教练类别', remark: '教练员等级类别' },
  { code: 'gender', name: '性别', remark: '人员性别选项' },
  { code: 'education', name: '学历', remark: '人员学历选项' },
]

const ITEMS = [
  { typeCode: 'position', value: 'GK', label: '守门员', sortOrder: 1 },
  { typeCode: 'position', value: 'DF', label: '后卫', sortOrder: 2 },
  { typeCode: 'position', value: 'MF', label: '中场', sortOrder: 3 },
  { typeCode: 'position', value: 'FW', label: '前锋', sortOrder: 4 },
  { typeCode: 'coach_category', value: 'A', label: 'A 级教练', sortOrder: 1 },
  { typeCode: 'coach_category', value: 'B', label: 'B 级教练', sortOrder: 2 },
  { typeCode: 'coach_category', value: 'C', label: 'C 级教练', sortOrder: 3 },
  { typeCode: 'gender', value: 'MALE', label: '男', sortOrder: 1 },
  { typeCode: 'gender', value: 'FEMALE', label: '女', sortOrder: 2 },
  { typeCode: 'gender', value: 'UNSPECIFIED', label: '未指定', sortOrder: 3 },
  { typeCode: 'education', value: 'PRIMARY', label: '小学', sortOrder: 1 },
  { typeCode: 'education', value: 'JUNIOR', label: '初中', sortOrder: 2 },
  { typeCode: 'education', value: 'SENIOR', label: '高中', sortOrder: 3 },
  { typeCode: 'education', value: 'UNIVERSITY', label: '大学', sortOrder: 4 },
]

const existingTypes = itemsOf(await api('GET', '/base-data/dict-types?page=1&pageSize=100'))
const typeCodes = new Set(existingTypes.map((row) => row.code))
for (const type of TYPES) {
  if (typeCodes.has(type.code)) {
    console.log('已存在 字典类型', type.code)
    continue
  }
  const result = await api('POST', '/base-data/dict-types', type)
  if (result.status >= 400 || result.code !== 'OK') {
    console.log('创建字典类型失败', type.code, result.code, result.message)
    continue
  }
  console.log('已创建 字典类型', type.code)
}

const existingItems = itemsOf(await api('GET', '/base-data/dict-items?page=1&pageSize=100'))
const itemKeys = new Set(existingItems.map((row) => `${row.typeCode}:${row.value}`))
for (const item of ITEMS) {
  const key = `${item.typeCode}:${item.value}`
  if (itemKeys.has(key)) {
    console.log('已存在 字典项', item.typeCode, item.value)
    continue
  }
  const result = await api('POST', '/base-data/dict-items', {
    ...item,
    isActive: true,
  })
  if (result.status >= 400 || result.code !== 'OK') {
    console.log('创建字典项失败', key, result.code, result.message)
    continue
  }
  console.log('已创建 字典项', item.typeCode, item.value)
}
console.log('完成')
