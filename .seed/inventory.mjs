const BASE = 'http://w96dfae3.natappfree.cc/api/v1'
const TOKEN = process.env.TOKEN
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const paths = [
  '/organizations?page=1&pageSize=3',
  '/accounts?page=1&pageSize=3',
  '/teams?page=1&pageSize=3',
  '/people?page=1&pageSize=3',
  '/dictionary-items?page=1&pageSize=3',
  '/events?page=1&pageSize=3',
  '/matches?page=1&pageSize=3',
  '/contents?page=1&pageSize=3',
  '/portal-resources?page=1&pageSize=3',
  '/enrollments?page=1&pageSize=3',
  '/base-data/schools?page=1&pageSize=3',
  '/base-data/dict-types?page=1&pageSize=3',
  '/audit-logs?page=1&pageSize=2',
]
for (const p of paths) {
  try {
    const res = await fetch(BASE + p, { headers: { Authorization: `Bearer ${TOKEN}` } })
    const text = await res.text()
    let out
    try {
      const j = JSON.parse(text)
      const d = j.data
      out = `${j.code} total=${d && d.total !== undefined ? d.total : Array.isArray(d) ? 'array:' + d.length : String(d).slice(0, 80)}`
    } catch { out = text.slice(0, 100) }
    console.log(`${res.status} ${p} -> ${out}`)
  } catch (e) { console.log(`ERR ${p} -> ${e.message}`) }
  await sleep(3000)
}
