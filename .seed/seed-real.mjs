/**
 * 真实后端演示数据种子（只调用公开 API，不使用前端 Mock）。
 *
 * 用法：
 *   TOKEN=$(cat /tmp/zuqiu_token) node .seed/seed-real.mjs base
 *   node .seed/seed-real.mjs all
 *
 * 可用阶段：base / event / teams / people / enroll / matches / contents / all
 * 状态写入 .seed/state.json，重复执行会跳过已创建的记录。
 * 隧道对连接数敏感，默认每次请求间隔 8 秒，触发限流后等待 65 秒重试。
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.API_BASE || 'http://w96dfae3.natappfree.cc/api/v1'
const STATE_PATH = path.resolve('.seed/state.json')
const GAP = Number(process.env.GAP || 8000)
const ADMIN_TOKEN =
  process.env.TOKEN ||
  (fs.existsSync('/tmp/zuqiu_token') ? fs.readFileSync('/tmp/zuqiu_token', 'utf8').trim() : '')

if (!ADMIN_TOKEN) {
  console.error('缺少管理员令牌：TOKEN 或 /tmp/zuqiu_token')
  process.exit(1)
}

let state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : {}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args)
}

function saveState() {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

function ensureBucket(name) {
  if (!state[name] || typeof state[name] !== 'object') state[name] = {}
  return state[name]
}

let lastRequestAt = 0
async function waitGap() {
  const wait = lastRequestAt + GAP - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
}

async function api(method, url, { body, token = ADMIN_TOKEN, retries = 7 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    await waitGap()
    const headers = { Authorization: `Bearer ${token}` }
    const init = { method, headers }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    let res
    let text
    try {
      res = await fetch(BASE + url, init)
      text = await res.text()
    } catch (error) {
      log(`网络异常(${attempt}/${retries}): ${error.message}`)
      await sleep(30000)
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
      log(`响应不是 JSON(${attempt}/${retries}): ${text.slice(0, 120)}`)
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

async function listOf(url) {
  const sep = url.includes('?') ? '&' : '?'
  const result = await api('GET', `${url}${sep}page=1&pageSize=100`)
  const data = assertOk(result, `GET ${url}`)
  return Array.isArray(data) ? data : data.items || []
}

async function ensure(key, label, listUrl, predicate, createUrl, body) {
  const bucket = ensureBucket(key.split('.')[0])
  const prop = key.split('.')[1] || key
  if (bucket[prop]) {
    log(`已存在 ${label}: ${bucket[prop].id}`)
    return bucket[prop]
  }
  const existing = (await listOf(listUrl)).find(predicate)
  if (existing) {
    bucket[prop] = existing
    saveState()
    log(`已存在 ${label}: ${existing.id}`)
    return existing
  }
  const result = await api('POST', createUrl, { body })
  const created = assertOk(result, label)
  bucket[prop] = created
  saveState()
  log(`已创建 ${label}: ${created.id}`)
  return created
}

// ---------------------------------------------------------------- 基础数据

async function phaseBase() {
  ensureBucket('regions')
  ensureBucket('schools')
  const regions = state.regions
  const province = await ensure(
    'regions.province',
    '区划/四川省',
    '/base-data/regions',
    (row) => row.code === '510000',
    '/base-data/regions',
    { name: '四川省', code: '510000', level: 1, sortOrder: 1, isActive: true },
  )
  const chengdu = await ensure(
    'regions.chengdu',
    '区划/成都市',
    '/base-data/regions',
    (row) => row.code === '510100',
    '/base-data/regions',
    {
      name: '成都市',
      code: '510100',
      level: 2,
      parentId: province.id,
      sortOrder: 1,
      isActive: true,
    },
  )
  const mianyang = await ensure(
    'regions.mianyang',
    '区划/绵阳市',
    '/base-data/regions',
    (row) => row.code === '510700',
    '/base-data/regions',
    {
      name: '绵阳市',
      code: '510700',
      level: 2,
      parentId: province.id,
      sortOrder: 2,
      isActive: true,
    },
  )
  const jinjiang = await ensure(
    'regions.jinjiang',
    '区划/锦江区',
    '/base-data/regions',
    (row) => row.code === '510104',
    '/base-data/regions',
    {
      name: '锦江区',
      code: '510104',
      level: 3,
      parentId: chengdu.id,
      sortOrder: 1,
      isActive: true,
    },
  )
  const fucheng = await ensure(
    'regions.fucheng',
    '区划/涪城区',
    '/base-data/regions',
    (row) => row.code === '510703',
    '/base-data/regions',
    {
      name: '涪城区',
      code: '510703',
      level: 3,
      parentId: mianyang.id,
      sortOrder: 1,
      isActive: true,
    },
  )
  // 触发保存（ensure 已保存，这里仅确保引用被保留）
  regions.province = province
  regions.chengdu = chengdu
  regions.mianyang = mianyang
  regions.jinjiang = jinjiang
  regions.fucheng = fucheng
  saveState()

  await ensure(
    'schools.SCH001',
    '学校/示例第一中学',
    '/base-data/schools',
    (row) => row.code === 'SCH001',
    '/base-data/schools',
    {
      name: '示例第一中学',
      code: 'SCH001',
      schoolType: 'MIDDLE',
      regionId: jinjiang.id,
      address: '四川省成都市锦江区学道街 01 号',
      isActive: true,
    },
  )
  await ensure(
    'schools.SCH002',
    '学校/示例第二中学',
    '/base-data/schools',
    (row) => row.code === 'SCH002',
    '/base-data/schools',
    {
      name: '示例第二中学',
      code: 'SCH002',
      schoolType: 'MIDDLE',
      regionId: fucheng.id,
      address: '四川省绵阳市涪城区临园路 02 号',
      isActive: true,
    },
  )
  await ensure(
    'schools.UNI001',
    '学校/示例大学',
    '/base-data/schools',
    (row) => row.code === 'UNI001',
    '/base-data/schools',
    {
      name: '示例大学',
      code: 'UNI001',
      // 后端学校类型枚举无 UNIVERSITY，使用 COMPLETE 以通过基础数据校验。
      schoolType: 'COMPLETE',
      regionId: jinjiang.id,
      address: '四川省成都市锦江区大学路 01 号',
      isActive: true,
    },
  )
}

// ---------------------------------------------------------------- 赛事与组别

const GROUP_DEFS = [
  {
    name: '小学男子组（U12）',
    category: 'PRIMARY',
    gender: 'MALE',
    quota: 24,
    minAge: 10,
    maxAge: 12,
    maxPlayers: 18,
  },
  {
    name: '小学女子组（U12）',
    category: 'PRIMARY',
    gender: 'FEMALE',
    quota: 24,
    minAge: 10,
    maxAge: 12,
    maxPlayers: 18,
  },
  {
    name: '初中男子组（U15）',
    category: 'MIDDLE',
    gender: 'MALE',
    quota: 20,
    minAge: 13,
    maxAge: 15,
    maxPlayers: 20,
  },
  {
    name: '初中女子组（U15）',
    category: 'MIDDLE',
    gender: 'FEMALE',
    quota: 20,
    minAge: 13,
    maxAge: 15,
    maxPlayers: 20,
  },
  {
    name: '高中男子组（U18）',
    category: 'MIDDLE',
    gender: 'MALE',
    quota: 16,
    minAge: 16,
    maxAge: 18,
    maxPlayers: 22,
  },
  {
    name: '高中女子组（U18）',
    category: 'MIDDLE',
    gender: 'FEMALE',
    quota: 16,
    minAge: 16,
    maxAge: 18,
    maxPlayers: 22,
  },
]

const EVENT_NAME = '2026年四川省青少年校园足球联赛'

async function phaseEvent() {
  ensureBucket('groups')
  const event = await ensure(
    'groups.event',
    `赛事/${EVENT_NAME}`,
    '/events',
    (row) => row.name === EVENT_NAME,
    '/events',
    {
      name: EVENT_NAME,
      season: '2026',
      eventCategory: '校园足球',
      registrationOpensAt: '2026-09-01T00:00:00+08:00',
      registrationClosesAt: '2026-12-31T23:59:59+08:00',
      status: 'REGISTRATION_OPEN',
      description:
        '由四川省教育厅主办的全省青少年校园足球联赛，设小学、初中、高中三个学段男女组别，覆盖全省 21 个市州。',
    },
  )
  const groups = await listOf(`/events/${event.id}/groups`)
  for (const def of GROUP_DEFS) {
    const found = groups.find((row) => row.name === def.name)
    if (found) {
      state.groups[def.name] = found
      saveState()
      log(`已存在 组别/${def.name}: ${found.id}`)
      continue
    }
    const result = await api('POST', `/events/${event.id}/groups`, {
      body: {
        ...def,
        requiredMaterialTypes: ['STAMPED_FORM', 'STUDENT_STATUS'],
      },
    })
    const created = assertOk(result, `组别/${def.name}`)
    state.groups[def.name] = created
    saveState()
    log(`已创建 组别/${def.name}: ${created.id}`)
  }
}

// ---------------------------------------------------------------- 球队

const TEAM_DEFS = [
  {
    name: '示例第一中学男子足球队',
    groupCategory: 'MIDDLE',
    schoolOrgId: 'org_school_01',
    gender: 'MALE',
    intro: '示例第一中学男子足球队，长期开展校园足球训练。',
  },
  {
    name: '示例第一中学女子足球队',
    groupCategory: 'MIDDLE',
    schoolOrgId: 'org_school_01',
    gender: 'FEMALE',
    intro: '示例第一中学女子足球队，参加市级校园足球联赛。',
  },
  {
    name: '示例第二中学男子足球队',
    groupCategory: 'MIDDLE',
    schoolOrgId: 'org_school_02',
    gender: 'MALE',
    intro: '示例第二中学男子足球队，队员以初中年级为主。',
  },
  {
    name: '示例第二中学女子足球队',
    groupCategory: 'MIDDLE',
    schoolOrgId: 'org_school_02',
    gender: 'FEMALE',
    intro: '示例第二中学女子足球队，注重基础技术与团队配合。',
  },
]

async function phaseTeams() {
  ensureBucket('teams')
  for (const def of TEAM_DEFS) {
    await ensure(
      `teams.${def.name}`,
      `球队/${def.name}`,
      '/teams',
      (row) => row.name === def.name,
      '/teams',
      def,
    )
  }
}

// ---------------------------------------------------------------- 人员与球队成员

function idCard(area, birth, sequence) {
  const base = `${area}${birth.replaceAll('-', '')}${sequence}`
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const codes = '10X98765432'
  const sum = base.split('').reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0)
  return base + codes[sum % 11]
}

const PEOPLE_DEFS = [
  {
    team: '示例第一中学男子足球队',
    realName: '张子轩',
    gender: 'MALE',
    birthDate: '2011-03-12',
    idNumber: idCard('510104', '2011-03-12', '001'),
    phone: '13900000001',
    jerseyNumber: 1,
    position: 'GK',
  },
  {
    team: '示例第一中学男子足球队',
    realName: '李浩然',
    gender: 'MALE',
    birthDate: '2011-05-20',
    idNumber: idCard('510104', '2011-05-20', '003'),
    phone: '13900000002',
    jerseyNumber: 4,
    position: 'DF',
  },
  {
    team: '示例第一中学男子足球队',
    realName: '王梓涵',
    gender: 'MALE',
    birthDate: '2011-07-08',
    idNumber: idCard('510104', '2011-07-08', '005'),
    phone: '13900000003',
    jerseyNumber: 6,
    position: 'MF',
  },
  {
    team: '示例第一中学男子足球队',
    realName: '刘博文',
    gender: 'MALE',
    birthDate: '2011-09-16',
    idNumber: idCard('510104', '2011-09-16', '007'),
    phone: '13900000004',
    jerseyNumber: 9,
    position: 'FW',
  },
  {
    team: '示例第一中学男子足球队',
    realName: '陈宇航',
    gender: 'MALE',
    birthDate: '2011-11-02',
    idNumber: idCard('510104', '2011-11-02', '009'),
    phone: '13900000005',
    jerseyNumber: 10,
    position: 'FW',
  },
  {
    team: '示例第一中学女子足球队',
    realName: '杨雨桐',
    gender: 'FEMALE',
    birthDate: '2011-02-18',
    idNumber: idCard('510104', '2011-02-18', '002'),
    phone: '13900000006',
    jerseyNumber: 1,
    position: 'GK',
  },
  {
    team: '示例第一中学女子足球队',
    realName: '赵欣怡',
    gender: 'FEMALE',
    birthDate: '2011-04-25',
    idNumber: idCard('510104', '2011-04-25', '004'),
    phone: '13900000007',
    jerseyNumber: 5,
    position: 'DF',
  },
  {
    team: '示例第一中学女子足球队',
    realName: '黄思琪',
    gender: 'FEMALE',
    birthDate: '2011-06-30',
    idNumber: idCard('510104', '2011-06-30', '006'),
    phone: '13900000008',
    jerseyNumber: 8,
    position: 'MF',
  },
  {
    team: '示例第一中学女子足球队',
    realName: '周佳宁',
    gender: 'FEMALE',
    birthDate: '2011-08-14',
    idNumber: idCard('510104', '2011-08-14', '008'),
    phone: '13900000009',
    jerseyNumber: 7,
    position: 'MF',
  },
  {
    team: '示例第一中学女子足球队',
    realName: '吴梦瑶',
    gender: 'FEMALE',
    birthDate: '2011-10-06',
    idNumber: idCard('510104', '2011-10-06', '010'),
    phone: '13900000010',
    jerseyNumber: 11,
    position: 'FW',
  },
  {
    team: '示例第一中学男子足球队',
    realName: '郑国强',
    gender: 'MALE',
    birthDate: '1985-04-09',
    idNumber: idCard('510104', '1985-04-09', '011'),
    phone: '13900000011',
    kinds: ['COACH'],
    coachCategory: 'A',
    education: 'UNIVERSITY',
  },
  {
    team: '示例第一中学女子足球队',
    realName: '孙丽娟',
    gender: 'FEMALE',
    birthDate: '1988-08-21',
    idNumber: idCard('510104', '1988-08-21', '012'),
    phone: '13900000012',
    kinds: ['COACH'],
    coachCategory: 'B',
    education: 'UNIVERSITY',
  },
]

async function phasePeople() {
  ensureBucket('people')
  ensureBucket('members')
  for (const def of PEOPLE_DEFS) {
    const person = await ensure(
      `people.${def.realName}`,
      `人员/${def.realName}`,
      '/people',
      (row) => row.realName === def.realName,
      '/people',
      {
        kinds: def.kinds || ['ATHLETE'],
        realName: def.realName,
        idNumber: def.idNumber,
        phone: def.phone,
        gender: def.gender,
        birthDate: def.birthDate,
        schoolOrgId: def.team.includes('第一中学') ? 'org_school_01' : 'org_school_02',
        ...(def.coachCategory ? { coachCategory: def.coachCategory } : {}),
        ...(def.education ? { education: def.education } : {}),
      },
    )
    if (def.kinds) continue
    const team = state.teams[def.team]
    if (!team) throw new Error(`缺少球队：${def.team}`)
    const memberKey = `${def.team}|${def.realName}`
    if (state.members[memberKey]) {
      log(`已存在 成员/${def.realName}: ${state.members[memberKey].id}`)
      continue
    }
    const result = await api('POST', `/teams/${team.id}/members`, {
      body: {
        athleteId: person.id,
        jerseyNumber: def.jerseyNumber,
        position: def.position,
      },
    })
    // 成员接口成功时返回成员对象；若后端重复添加返回 409，则查询名单补齐
    if (result.status >= 400 || result.code !== 'OK') {
      const members = await listOf(`/teams/${team.id}/members`)
      const found = members.find((row) => row.athleteId === person.id || row.personId === person.id)
      if (found) {
        state.members[memberKey] = found
        saveState()
        log(`已存在 成员/${def.realName}: ${found.id}`)
        continue
      }
      throw new Error(`成员/${def.realName} 失败：${result.code} ${result.message}`)
    }
    state.members[memberKey] = result.data
    saveState()
    log(`已创建 成员/${def.realName}: ${result.data?.id}`)
  }
}

// ---------------------------------------------------------------- 报名与名单

async function login(username, password) {
  const result = await api('POST', '/auth/login', { body: { username, password }, token: '' })
  const data = assertOk(result, `登录/${username}`)
  return { token: data.accessToken || data.token, account: data.account || data.user || data }
}

async function phaseEnroll() {
  ensureBucket('enrollments')
  const school01 = await login('school01', process.env.SCHOOL_PASSWORD || 'Foot@2026')
  const school02 = await login('school02', process.env.SCHOOL_PASSWORD || 'Foot@2026')
  const event = state.groups.event
  const plans = [
    {
      key: '男-U15',
      account: school01,
      teamId: 'org_team_01',
      groupName: '初中男子组（U15）',
      contactName: '张老师',
      contactPhone: '13900001001',
      roster: PEOPLE_DEFS.filter(
        (p) => p.team === '示例第一中学男子足球队' && !p.kinds,
      ),
    },
    {
      key: '女-U15',
      account: school02,
      teamId: 'org_team_02',
      groupName: '初中女子组（U15）',
      contactName: '李老师',
      contactPhone: '13900001002',
      roster: PEOPLE_DEFS.filter(
        (p) => p.team === '示例第一中学女子足球队' && !p.kinds,
      ),
    },
  ]
  const results = []
  for (const plan of plans) {
    const group = state.groups[plan.groupName]
    if (!group) throw new Error(`缺少组别：${plan.groupName}`)
    let enrollment = state.enrollments[plan.key]
    if (!enrollment) {
      const result = await api('POST', '/enrollments', {
        token: plan.account.token,
        body: {
          eventId: event.id,
          groupId: group.id,
          teamId: plan.teamId,
          subjectType: 'SCHOOL_TEAM',
          contactName: plan.contactName,
          contactPhone: plan.contactPhone,
          remarks: '2026 年省级联赛报名，名单已完成校内公示。',
        },
      })
      enrollment = assertOk(result, `报名/${plan.key}`)
      state.enrollments[plan.key] = enrollment
      saveState()
      log(`已创建 报名/${plan.key}: ${enrollment.id}`)
    } else {
      log(`已存在 报名/${plan.key}: ${enrollment.id}`)
    }
    ensureBucket('rosters')
    let roster = state.rosters[plan.key] || []
    for (const person of plan.roster) {
      if (roster.some((row) => row.athleteId === person.id || row.athleteId === person.id)) continue
      const result = await api('POST', `/enrollments/${enrollment.id}/players`, {
        token: plan.account.token,
        body: {
          athleteId: person.id,
          jerseyNumber: person.jerseyNumber,
          position: person.position,
          studentStatusFileIds: [],
        },
      })
      if (result.status >= 400 || result.code !== 'OK') {
        log(`名单/${person.realName} 失败（${result.code}: ${result.message}），继续`)
        continue
      }
      roster.push(result.data)
      state.rosters[plan.key] = roster
      saveState()
      log(`已添加 名单/${person.realName}`)
    }
    results.push({ plan, enrollment })
  }
  // 提交两份报名，形成待审数据
  for (const { plan, enrollment } of results) {
    const detail = assertOk(
      await api('GET', `/enrollments/${enrollment.id}`, { token: plan.account.token }),
      `报名详情/${plan.key}`,
    )
    if (!['DRAFT'].includes(detail.status)) {
      log(`报名/${plan.key} 当前状态 ${detail.status}，跳过提交`)
      continue
    }
    const result = await api('POST', `/enrollments/${enrollment.id}/submit`, {
      token: plan.account.token,
      body: { version: detail.version },
    })
    if (result.status >= 400 || result.code !== 'OK') {
      log(`提交/${plan.key} 失败：${result.code} ${result.message}`)
      continue
    }
    state.enrollments[plan.key] = result.data
    saveState()
    log(`已提交 报名/${plan.key} -> ${result.data.status}`)
  }
}

// ---------------------------------------------------------------- 比赛

async function phaseMatches() {
  ensureBucket('matches')
  const event = state.groups.event
  const boys = state.groups['初中男子组（U15）']
  const girls = state.groups['初中女子组（U15）']
  const team1 = state.teams['示例第一中学男子足球队']
  const team2 = state.teams['示例第一中学女子足球队']
  const team3 = state.teams['示例第二中学男子足球队']
  const team4 = state.teams['示例第二中学女子足球队']
  if (!event || !boys || !girls || !team1 || !team2 || !team3 || !team4) {
    throw new Error('缺少赛事/组别/球队，无法创建比赛')
  }

  const match1 = await ensure(
    'matches.男足决赛',
    '比赛/男足决赛',
    '/matches',
    (row) => row.stage === '决赛' && row.homeTeamId === team1.id,
    '/matches',
    {
      eventId: event.id,
      groupId: boys.id,
      homeTeamId: team1.id,
      awayTeamId: team3.id,
      kickoffAt: '2026-10-20T15:00:00+08:00',
      venue: '成都市锦江区体育中心',
      stage: '决赛',
      status: 'FINISHED',
      referees: [
        { name: '马俊', role: 'REFEREE', level: '国家级' },
        { name: '高翔', role: 'ASSISTANT', level: '一级' },
      ],
    },
  )
  const match2 = await ensure(
    'matches.女足小组赛',
    '比赛/女足小组赛',
    '/matches',
    (row) => row.stage === '小组赛 A组' && row.homeTeamId === team2.id,
    '/matches',
    {
      eventId: event.id,
      groupId: girls.id,
      homeTeamId: team2.id,
      awayTeamId: team4.id,
      kickoffAt: '2026-11-05T10:00:00+08:00',
      venue: '绵阳市涪城区体育公园',
      stage: '小组赛 A组',
      status: 'SCHEDULED',
      referees: [{ name: '罗涛', role: 'REFEREE', level: '一级' }],
    },
  )

  // 男足决赛：已结束并发布，补 3 个进球事件
  let detail = assertOk(await api('GET', `/matches/${match1.id}`), '比赛详情/男足决赛')
  ensureBucket('matchEvents')
  const goals = [
    { minute: 18, teamId: team1.id, scorer: '张子轩' },
    { minute: 34, teamId: team3.id, scorer: '张力' },
    { minute: 67, teamId: team1.id, scorer: '刘博文' },
  ]
  for (const goal of goals) {
    const key = `${match1.id}|${goal.minute}`
    if (state.matchEvents[key]) continue
    const person = state.people[goal.scorer]
    if (!person) {
      log(`跳过进球事件：缺少球员 ${goal.scorer}`)
      continue
    }
    const result = await api('POST', `/matches/${match1.id}/events`, {
      body: {
        eventType: 'GOAL',
        minute: goal.minute,
        teamId: goal.teamId,
        matchVersion: detail.version,
        scorerAthleteId: person.id,
        note: `${goal.scorer} 进球`,
      },
    })
    if (result.status >= 400 || result.code !== 'OK') {
      log(`进球事件失败：${result.code} ${result.message}`)
      continue
    }
    state.matchEvents[key] = result.data
    saveState()
    log(`已创建 进球事件 ${goal.minute}'`)
    detail = assertOk(await api('GET', `/matches/${match1.id}`), '比赛详情/男足决赛')
  }

  // 写入赛果并发布
  if (!detail.resultPublished) {
    const result = await api('PUT', `/matches/${match1.id}/result`, {
      body: {
        version: detail.version,
        resultType: 'NORMAL',
        manualHomeScore: detail.homeScore,
        manualAwayScore: detail.awayScore,
        reason: '',
      },
    })
    if (result.status < 400 && result.code === 'OK') {
      detail = result.data
      log(`已写入赛果 ${detail.homeScore}:${detail.awayScore}`)
    } else if (!String(result.message || '').includes('已有')) {
      log(`写入赛果失败：${result.code} ${result.message}`)
    }
  }
  if (!detail.resultPublished) {
    const result = await api('POST', `/matches/${match1.id}/result/publish`, {
      body: { version: detail.version },
    })
    if (result.status < 400 && result.code === 'OK') {
      log('已发布男足决赛赛果')
    } else {
      log(`发布赛果失败：${result.code} ${result.message}`)
    }
  }

  // 两场比赛都发布对阵
  for (const [label, match] of [
    ['男足决赛', match1],
    ['女足小组赛', match2],
  ]) {
    const latest = assertOk(await api('GET', `/matches/${match.id}`), `比赛详情/${label}`)
    if (latest.published) {
      log(`比赛/${label} 已发布`)
      continue
    }
    const result = await api('POST', `/matches/${match.id}/publish`, {
      body: { version: latest.version },
    })
    if (result.status < 400 && result.code === 'OK') {
      log(`已发布 比赛/${label}`)
    } else {
      log(`发布 比赛/${label} 失败：${result.code} ${result.message}`)
    }
  }
}

// ---------------------------------------------------------------- 内容与门户资源

async function phaseContents() {
  ensureBucket('contents')
  const event = state.groups.event
  const defs = [
    {
      key: 'news',
      contentType: 'NEWS',
      title: '2026年四川省青少年校园足球联赛报名启动',
      summary: '全省中小学与高校球队即日起可通过平台完成赛事报名。',
      bodyHtml:
        '<p>2026年四川省青少年校园足球联赛报名工作正式启动。请各参赛学校在规定时间内完成球队注册、运动员名单填报与材料上传。</p><p>报名截止时间为 2026 年 12 月 31 日，逾期不再受理。</p>',
      eventId: event?.id || '',
      pinned: true,
    },
    {
      key: 'policy',
      contentType: 'POLICY',
      title: '四川省青少年校园足球竞赛管理办法（2026年修订）',
      summary: '明确参赛资格、赛风赛纪与申诉流程。',
      bodyHtml:
        '<p>为规范全省青少年校园足球竞赛组织工作，现将《四川省青少年校园足球竞赛管理办法（2026年修订）》予以公布。</p><p>各参赛单位应严格遵守报名资格与赛风赛纪要求。</p>',
      policyDocumentNo: '川教体〔2026〕12号',
      policyEffectiveFrom: '2026-09-01',
      policyEffectiveTo: '2027-08-31',
    },
    {
      key: 'highlight',
      contentType: 'HIGHLIGHT',
      title: '决赛集锦：示例第一中学 2:1 示例第二中学',
      summary: '比赛第 67 分钟绝杀，示例第一中学夺得初中男子组冠军。',
      bodyHtml:
        '<p>在 2026 年 10 月 20 日进行的初中男子组决赛中，示例第一中学以 2:1 战胜示例第二中学。</p><p>双方在雨战中奉献了精彩的攻防转换，现场观众超过 800 人。</p>',
      eventId: event?.id || '',
    },
  ]
  for (const def of defs) {
    let content = state.contents[def.key]
    if (!content) {
      const result = await api('POST', '/contents', {
        body: {
          contentType: def.contentType,
          title: def.title,
          summary: def.summary,
          bodyHtml: def.bodyHtml,
          eventId: def.eventId || '',
          pinned: Boolean(def.pinned),
          policyDocumentNo: def.policyDocumentNo || '',
          policyEffectiveFrom: def.policyEffectiveFrom || null,
          policyEffectiveTo: def.policyEffectiveTo || null,
        },
      })
      content = assertOk(result, `内容/${def.title}`)
      state.contents[def.key] = content
      saveState()
      log(`已创建 内容/${def.title}`)
    } else {
      log(`已存在 内容/${def.title}`)
    }
    if (content.status === 'PUBLISHED') continue
    const publish = await api('POST', `/contents/${content.id}/publish`, {
      body: { version: content.version },
    })
    if (publish.status < 400 && publish.code === 'OK') {
      state.contents[def.key] = publish.data
      saveState()
      log(`已发布 内容/${def.title}`)
    } else {
      log(`发布内容失败：${publish.code} ${publish.message}`)
    }
  }

  ensureBucket('resources')
  const resources = [
    { key: 'partner1', resourceType: 'PARTNER', title: '四川省校园足球协会', targetUrl: 'https://www.scjy.gov.cn/', sortOrder: 1, enabled: true },
    { key: 'partner2', resourceType: 'PARTNER', title: '四川省学生体育艺术协会', sortOrder: 2, enabled: true },
  ]
  for (const def of resources) {
    if (state.resources[def.key]) {
      log(`已存在 门户资源/${def.title}`)
      continue
    }
    const { key: _key, ...payload } = def
    const result = await api('POST', '/portal-resources', { body: payload })
    if (result.status >= 400 || result.code !== 'OK') {
      log(`门户资源/${def.title} 失败：${result.code} ${result.message}`)
      continue
    }
    state.resources[def.key] = result.data
    saveState()
    log(`已创建 门户资源/${def.title}`)
  }
}

// ---------------------------------------------------------------- 遴选评分与公示

const TEMPLATE_DEFS = [
  {
    key: 'middle-initial',
    name: '初中组初选评分模板',
    group_type: 'MIDDLE',
    round: 'INITIAL',
    items: [
      { dimension_code: 'TECH', dimension_name: '技术能力', weight: 30, max_score: 100 },
      { dimension_code: 'MATCH', dimension_name: '比赛表现', weight: 30, max_score: 100 },
      { dimension_code: 'PHYSICAL', dimension_name: '身体素质', weight: 20, max_score: 100 },
      { dimension_code: 'TACTIC', dimension_name: '战术意识', weight: 20, max_score: 100 },
    ],
  },
  {
    key: 'middle-final',
    name: '初中组复选评分模板',
    group_type: 'MIDDLE',
    round: 'FINAL',
    items: [
      { dimension_code: 'TECH', dimension_name: '技术能力', weight: 25, max_score: 100 },
      { dimension_code: 'TACTIC', dimension_name: '战术意识', weight: 25, max_score: 100 },
      { dimension_code: 'FITNESS', dimension_name: '体能状态', weight: 25, max_score: 100 },
      { dimension_code: 'MENTAL', dimension_name: '心理素质', weight: 25, max_score: 100 },
    ],
  },
]

async function phaseSelection() {
  ensureBucket('selectionTemplates')
  ensureBucket('selectionScores')
  ensureBucket('publicity')
  const existingTemplates = await listOf('/selection/templates/')
  for (const def of TEMPLATE_DEFS) {
    let template = state.selectionTemplates[def.key]
    if (!template) {
      template = existingTemplates.find((row) => row.name === def.name)
    }
    if (!template) {
      const result = await api('POST', '/selection/templates/', {
        body: {
          name: def.name,
          group_type: def.group_type,
          round: def.round,
          items: def.items,
        },
      })
      template = assertOk(result, `评分模板/${def.name}`)
      log(`已创建 评分模板/${def.name}: ${template.id}`)
    } else {
      log(`已存在 评分模板/${def.name}: ${template.id}`)
    }
    state.selectionTemplates[def.key] = template
    saveState()
  }

  // 取已通过报名单的名单作为评分候选人（真实人员 + 真实报名关系）。
  const rosterResult = await api('GET', '/enrollments/enr_demo_boys_u15/players?page=1&pageSize=50')
  const roster = assertOk(rosterResult, '读取名单/初中男子组').items || []
  const candidates = roster.slice(0, 5)
  if (!candidates.length) {
    log('没有可用于评分的名单，跳过评分')
    return
  }

  const initialScores = [92, 88, 85, 90, 82]
  const finalScores = [90, 91, 84, 88, 86]
  for (const round of ['INITIAL', 'FINAL']) {
    const template = state.selectionTemplates[round === 'INITIAL' ? 'middle-initial' : 'middle-final']
    if (!template) continue
    const listResult = await api(
      'GET',
      `/selection/scores/?event_id=event_01&group_type=MIDDLE&round=${round}&page=1&size=100`,
    )
    const existing = assertOk(listResult, `评分列表/${round}`)
    const existingRows = Array.isArray(existing) ? existing : existing.items || existing.records || []
    for (const [index, candidate] of candidates.entries()) {
      const key = `${round}|${candidate.athleteId}`
      if (state.selectionScores[key]) continue
      if (existingRows.some((row) => String(row.candidate_id) === String(candidate.athleteId))) {
        log(`已存在 评分/${round}/${candidate.athleteName}`)
        continue
      }
      const base = round === 'INITIAL' ? initialScores[index] : finalScores[index]
      const codes = template.items || template.dimensions || []
      const scores = codes.map((item, dimIndex) => ({
        dimension_code: item.dimension_code || item.dimensionCode,
        score: Math.max(0, Math.min(100, base + (dimIndex % 2 === 0 ? 2 : -2))),
      }))
      const result = await api('POST', '/selection/scores/', {
        body: {
          event_id: 'event_01',
          group_type: 'MIDDLE',
          round,
          template_id: template.id,
          candidate_id: String(candidate.athleteId),
          scores,
        },
      })
      if (result.status >= 400 || result.code !== 'OK') {
        log(`评分/${round}/${candidate.athleteName} 失败：${result.code} ${result.message}`)
        continue
      }
      state.selectionScores[key] = result.data
      saveState()
      log(`已录入 评分/${round}/${candidate.athleteName}`)
    }
  }

  const generate = await api('POST', '/selection/results/generate/', {
    body: {
      event_id: 'event_01',
      group_type: 'MIDDLE',
      result_round: 'FINAL',
      quota: 5,
      initial_weight: 0.4,
      final_weight: 0.6,
    },
  })
  if (generate.status < 400 && generate.code === 'OK') {
    log(`已生成遴选结果批次：${generate.data.id}`)
  } else {
    log(`生成遴选结果失败：${generate.code} ${generate.message}`)
  }

  const publicityDefs = [
    { key: 'team-boys-u15', publicity_type: 'TEAM', source_id: 'enr_demo_boys_u15' },
    { key: 'athlete-rst-00', publicity_type: 'ATHLETE', source_id: 'rst_demo_boys_u15_00' },
    { key: 'athlete-rst-01', publicity_type: 'ATHLETE', source_id: 'rst_demo_boys_u15_01' },
  ]
  for (const def of publicityDefs) {
    if (state.publicity[def.key]) {
      log(`已存在 公示/${def.key}`)
      continue
    }
    const result = await api('POST', '/selection/publicity/', {
      body: {
        event_id: 'event_01',
        publicity_type: def.publicity_type,
        source_id: def.source_id,
      },
    })
    if (result.status >= 400 || result.code !== 'OK') {
      log(`公示/${def.key} 失败：${result.code} ${result.message}`)
      continue
    }
    state.publicity[def.key] = result.data
    saveState()
    log(`已公示/${def.key}: ${result.data.id}`)
  }
}

// ---------------------------------------------------------------- 入口

const phases = {
  base: phaseBase,
  event: phaseEvent,
  teams: phaseTeams,
  people: phasePeople,
  enroll: phaseEnroll,
  matches: phaseMatches,
  contents: phaseContents,
  selection: phaseSelection,
}

const requested = process.argv[2] || 'all'
const selected =
  requested === 'all'
    ? ['base', 'event', 'teams', 'people', 'enroll', 'matches', 'contents', 'selection']
    : [requested]

for (const name of selected) {
  if (!phases[name]) {
    console.error(`未知阶段：${name}，可选：${Object.keys(phases).join(', ')} 或 all`)
    process.exit(1)
  }
  log(`==== 开始阶段 ${name}`)
  try {
    await phases[name]()
  } catch (error) {
    console.error(`阶段 ${name} 中断：${error.message}`)
    saveState()
    process.exit(1)
  }
}
log('完成')
