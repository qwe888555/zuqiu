// 将演示教练账号绑定到真实的教练档案（仅数据操作，不改后端代码）
import fs from 'node:fs'
const BASE = process.env.API_BASE || 'http://w96dfae3.natappfree.cc/api/v1'
const admin = (process.env.TOKEN || fs.readFileSync('/tmp/zuqiu_token', 'utf8')).trim()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token || admin}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}
const list = await call('/accounts?keyword=coach&page=1&pageSize=20')
const acc = (list.json.data?.items || []).find((a) => a.id === 'acc_coach')
if (!acc) throw new Error('acc_coach not found')
console.log('account before:', acc.id, 'personId=', acc.personId || '(empty)', 'version=', acc.version)
await wait(9000)
const payload = {
  username: acc.username,
  displayName: acc.displayName,
  roles: acc.roles,
  orgId: acc.orgId,
  teamIds: acc.teamIds || [],
  personId: '493',
  enabled: acc.enabled,
  version: acc.version,
}
const upd = await call('/accounts/acc_coach', { method: 'PUT', body: payload })
console.log('bind result:', upd.status, upd.json.code, upd.json.message, JSON.stringify(upd.json.data))
await wait(9000)
const login = await call('/auth/login', {
  method: 'POST',
  token: '',
  body: { username: 'coach', password: 'Foot@2026' },
})
const coachToken = login.json.data?.accessToken || login.json.data?.token
console.log('coach login:', login.status, login.json.code, 'token?', Boolean(coachToken))
if (coachToken) {
  await wait(9000)
  const profile = await call('/me/profile', { token: coachToken })
  console.log('profile:', profile.status, profile.json.code, JSON.stringify(profile.json.data).slice(0, 300))
  await wait(9000)
  const teams = await call('/me/teams', { token: coachToken })
  console.log('teams:', teams.status, teams.json.code, JSON.stringify(teams.json.data).slice(0, 500))
}
