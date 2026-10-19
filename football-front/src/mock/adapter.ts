import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import {
  DEMO_ACCOUNTS,
  accounts,
  affiliations,
  auditLogs,
  contents,
  dictionaries,
  enrollmentAttachments,
  enrollments,
  eventGroups,
  events,
  goalRanking,
  identityChecks,
  liveLinks,
  livePosts,
  matchDocuments,
  matchEvents,
  matches,
  materials,
  messages,
  organizations,
  persons,
  portalResources,
  publications,
  reviewRecords,
  rosterItems,
  selectionRules,
  selectionScores,
  teamCoaches,
  teamMembers,
  teams,
  ROLE_LABELS,
} from './data'
import type {
  Account,
  Enrollment,
  Envelope,
  PageResult,
  Person,
  SelectionResult,
  SelectionSummaryRow,
  Team,
} from '../api/types'

const API_PREFIX = '/api/v1'

let requestSeq = 0

class MockHttpError extends Error {
  status: number
  code: string
  details: Array<{ field?: string; reason?: string }>

  constructor(status: number, code: string, message: string, details: Array<{ field?: string; reason?: string }> = []) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

function envelope<T>(data: T): Envelope<T> {
  requestSeq += 1
  return {
    code: 'OK',
    message: '成功',
    data,
    requestId: `req_mock_${requestSeq}`,
  }
}

function pageOf<T>(items: T[], query: Record<string, unknown>): PageResult<T> {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10))
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length }
}

function parseBody<T>(config: AxiosRequestConfig): T {
  if (!config.data) return {} as T
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data) as T
    } catch {
      return {} as T
    }
  }
  return config.data as T
}

function pathOf(config: AxiosRequestConfig): string {
  const url = config.url || '/'
  const clean = url.startsWith('http') ? new URL(url).pathname : url
  const idx = clean.indexOf(API_PREFIX)
  const path = idx >= 0 ? clean.slice(idx + API_PREFIX.length) : clean
  return path.split('?')[0]
}

function tokenOf(config: AxiosRequestConfig): string {
  const headers = config.headers as Record<string, unknown> | undefined
  const raw = (headers?.Authorization || headers?.authorization) as string | undefined
  return raw ? raw.replace(/^Bearer\s+/i, '') : ''
}

function accountFrom(config: AxiosRequestConfig): Account | undefined {
  const token = tokenOf(config)
  const match = token.match(/^mock-token-(.+)$/)
  if (!match) return undefined
  return accounts.find((a) => a.username === match[1])
}

function requireAccount(config: AxiosRequestConfig): Account {
  const account = accountFrom(config)
  if (!account) throw new MockHttpError(401, 'UNAUTHENTICATED', '登录已过期，请重新登录')
  if (!account.enabled) throw new MockHttpError(403, 'FORBIDDEN', '账号已停用')
  return account
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function contains(value: unknown, keyword: string): boolean {
  return str(value).toLowerCase().includes(keyword.toLowerCase())
}

interface RouteContext {
  config: AxiosRequestConfig
  params: Record<string, string>
  query: Record<string, unknown>
  body: any
}

type RouteHandler = (ctx: RouteContext) => unknown

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: RouteHandler
}

const routes: Route[] = []

function on(method: string, path: string, handler: RouteHandler) {
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

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`
}

function now(): string {
  return new Date().toISOString()
}

function withOrgName<T extends { orgId?: string }>(item: T): T & { orgName?: string } {
  const org = organizations.find((o) => o.id === item.orgId)
  return { ...item, orgName: org?.name }
}

// ---------------------------------------------------------------------------
// 认证与本人
// ---------------------------------------------------------------------------

on('POST', '/auth/login', ({ body }) => {
  const username = str(body.username)
  const password = str(body.password)
  const demo = DEMO_ACCOUNTS.find((d) => d.username === username)
  const account = accounts.find((a) => a.username === username)
  if (!demo || password !== demo.password) {
    if (!account) throw new MockHttpError(401, 'UNAUTHENTICATED', '账号或密码不正确')
    throw new MockHttpError(401, 'UNAUTHENTICATED', '账号或密码不正确')
  }
  if (!account?.enabled) throw new MockHttpError(403, 'FORBIDDEN', '账号已停用，请联系管理员')
  if (account) account.lastLoginAt = now()
  auditLogs.unshift({
    id: nextId('log'),
    logType: 'LOGIN',
    operatorAccountId: account?.id,
    operatorName: account?.displayName,
    action: '登录',
    outcome: 'SUCCESS',
    summary: `账号 ${username} 登录成功`,
    version: 1,
    createdAt: now(),
  })
  return {
    accessToken: `mock-token-${username}`,
    expiresIn: 86400,
    accountId: account?.id || demo.accountId,
    roles: demo ? [demo.role] : account?.roles || [],
  }
})

on('POST', '/auth/registrations', ({ body }) => {
  if (str(body.registrationToken).length < 16) {
    throw new MockHttpError(422, 'BUSINESS_VALIDATION_FAILED', '注册邀请凭证无效或已过期')
  }
  return { success: true, id: nextId('acc') }
})

on('POST', '/auth/logout', () => ({ success: true }))

on('GET', '/me', ({ config }) => {
  const account = requireAccount(config)
  const org = organizations.find((o) => o.id === account.orgId)
  return {
    accountId: account.id,
    username: account.username,
    displayName: account.displayName,
    roles: account.roles,
    orgId: account.orgId,
    orgName: org?.name,
    personId: account.personId,
    teamIds: account.teamIds,
    permissions: ['*'],
    menus: [],
  }
})

on('POST', '/me/password', ({ body }) => {
  if (str(body.newPassword).length < 8) {
    throw new MockHttpError(422, 'BUSINESS_VALIDATION_FAILED', '新密码至少 8 位')
  }
  return { success: true }
})

on('GET', '/me/messages', ({ config, query }) => {
  const account = requireAccount(config)
  let items = messages
  if (account.roles.includes('TEAM') || account.roles.includes('UNIVERSITY')) {
    items = messages.filter((m) => !m.businessType || ['ENROLLMENT', 'MATERIAL', 'MATCH', 'PUBLICATION'].includes(m.businessType))
  }
  const unreadOnly = str(query.unreadOnly) === 'true'
  if (unreadOnly) items = items.filter((m) => !m.read)
  return pageOf(items, query)
})

on('GET', '/me/messages/:messageId', ({ params }) => {
  const msg = messages.find((m) => m.id === params.messageId)
  if (!msg) throw new MockHttpError(404, 'NOT_FOUND', '消息不存在')
  return msg
})

on('POST', '/me/messages/:messageId/read', ({ params }) => {
  const msg = messages.find((m) => m.id === params.messageId)
  if (!msg) throw new MockHttpError(404, 'NOT_FOUND', '消息不存在')
  msg.read = true
  msg.readAt = now()
  msg.version += 1
  return { success: true, id: msg.id, version: msg.version }
})

on('GET', '/me/profile', ({ config }) => {
  const account = requireAccount(config)
  const person = persons.find((p) => p.id === account.personId)
  if (!person) throw new MockHttpError(404, 'NOT_FOUND', '尚未绑定人员档案')
  return person
})

on('PUT', '/me/profile', ({ config, body }) => {
  const account = requireAccount(config)
  const person = persons.find((p) => p.id === account.personId)
  if (!person) throw new MockHttpError(404, 'NOT_FOUND', '尚未绑定人员档案')
  Object.assign(person, body, { version: person.version + 1 })
  return person
})

on('POST', '/me/profile-confirmation', ({ config }) => {
  const account = requireAccount(config)
  const person = persons.find((p) => p.id === account.personId)
  if (person) person.reviewStatus = 'APPROVED'
  return { success: true, id: person?.id, version: person?.version }
})

on('GET', '/me/profile-match', ({ config }) => {
  const account = requireAccount(config)
  const person = persons.find((p) => p.id === account.personId)
  if (!person) return { result: 'NO_MATCH' }
  return {
    result: 'MATCHED_TO_SELF',
    personId: person.id,
    maskedIdNumber: person.maskedIdNumber,
  }
})

on('GET', '/me/teams', ({ config }) => {
  const account = requireAccount(config)
  const teamIds = account.teamIds || []
  return teams.filter((t) => teamIds.includes(t.id))
})

on('GET', '/me/team-affiliations', ({ config, query }) => {
  const account = requireAccount(config)
  const items = affiliations.filter((a) => a.personId === account.personId)
  return pageOf(items, query)
})

on('POST', '/me/team-affiliations', ({ config, body }) => {
  const account = requireAccount(config)
  const aff = {
    id: nextId('aff'),
    personId: account.personId || '',
    teamId: str(body.teamId),
    teamName: teams.find((t) => t.id === body.teamId)?.name || str(body.teamName),
    relation: str(body.relation) || '运动员',
    startDate: str(body.startDate) || undefined,
    endDate: str(body.endDate) || undefined,
    current: Boolean(body.current),
    verifyStatus: 'UNVERIFIED' as const,
    version: 1,
  }
  affiliations.push(aff)
  return aff
})

on('PUT', '/me/team-affiliations/:id', ({ params, body }) => {
  const aff = affiliations.find((a) => a.id === params.id)
  if (!aff) throw new MockHttpError(404, 'NOT_FOUND', '所属队伍记录不存在')
  Object.assign(aff, body, { version: aff.version + 1 })
  return aff
})

on('DELETE', '/me/team-affiliations/:id', ({ params }) => {
  const idx = affiliations.findIndex((a) => a.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '所属队伍记录不存在')
  affiliations.splice(idx, 1)
  return { success: true }
})

// ---------------------------------------------------------------------------
// 账号 / 组织 / 字典 / 日志 / 文件
// ---------------------------------------------------------------------------

on('GET', '/accounts', ({ query }) => {
  let items = accounts.map(withOrgName)
  if (query.keyword) items = items.filter((a) => contains(a.username, str(query.keyword)) || contains(a.displayName, str(query.keyword)))
  if (query.role) items = items.filter((a) => a.roles.includes(query.role as never))
  return pageOf(items, query)
})

on('POST', '/accounts', ({ body }) => {
  const acc: Account = {
    id: nextId('acc'),
    username: str(body.username),
    displayName: str(body.displayName),
    roles: body.roles || ['TEAM'],
    orgId: str(body.orgId),
    teamIds: body.teamIds || [],
    personId: body.personId,
    enabled: body.enabled !== false,
    version: 1,
    createdAt: now(),
  }
  accounts.unshift(acc)
  return acc
})

on('POST', '/accounts/registration-invitations', () => ({
  registrationToken: `invite_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
  expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
}))

on('GET', '/accounts/:id', ({ params }) => {
  const acc = accounts.find((a) => a.id === params.id)
  if (!acc) throw new MockHttpError(404, 'NOT_FOUND', '账号不存在')
  return withOrgName(acc)
})

on('PUT', '/accounts/:id', ({ params, body }) => {
  const acc = accounts.find((a) => a.id === params.id)
  if (!acc) throw new MockHttpError(404, 'NOT_FOUND', '账号不存在')
  Object.assign(acc, body, { version: acc.version + 1 })
  return acc
})

on('DELETE', '/accounts/:id', ({ params }) => {
  const idx = accounts.findIndex((a) => a.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '账号不存在')
  accounts.splice(idx, 1)
  return { success: true }
})

on('POST', '/accounts/:id/password-reset', ({ params }) => {
  const acc = accounts.find((a) => a.id === params.id)
  if (!acc) throw new MockHttpError(404, 'NOT_FOUND', '账号不存在')
  acc.version += 1
  return { success: true, id: acc.id, version: acc.version }
})

on('GET', '/organizations', ({ query }) => {
  let items = organizations
  if (query.orgType) items = items.filter((o) => o.orgType === query.orgType)
  if (query.keyword) items = items.filter((o) => contains(o.name, str(query.keyword)) || contains(o.code, str(query.keyword)))
  return pageOf(items, query)
})

on('POST', '/organizations', ({ body }) => {
  const org = {
    id: nextId('org'),
    parentId: body.parentId,
    name: str(body.name),
    orgType: body.orgType || 'SCHOOL',
    code: str(body.code),
    enabled: body.enabled !== false,
    version: 1,
  }
  organizations.push(org as never)
  return org
})

on('GET', '/organizations/:id', ({ params }) => {
  const org = organizations.find((o) => o.id === params.id)
  if (!org) throw new MockHttpError(404, 'NOT_FOUND', '组织不存在')
  return org
})

on('PUT', '/organizations/:id', ({ params, body }) => {
  const org = organizations.find((o) => o.id === params.id)
  if (!org) throw new MockHttpError(404, 'NOT_FOUND', '组织不存在')
  Object.assign(org, body, { version: org.version + 1 })
  return org
})

on('DELETE', '/organizations/:id', ({ params }) => {
  const idx = organizations.findIndex((o) => o.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '组织不存在')
  organizations.splice(idx, 1)
  return { success: true }
})

on('GET', '/dictionary-items', ({ query }) => {
  let items = dictionaries
  if (query.dictType) items = items.filter((d) => d.dictType === query.dictType)
  return pageOf(items, query)
})

on('GET', '/dictionaries/:dictType/options', ({ params }) =>
  dictionaries
    .filter((d) => d.dictType === params.dictType && d.enabled)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((d) => ({ value: d.value, label: d.label })),
)

on('POST', '/dictionary-items', ({ body }) => {
  const item = {
    id: nextId('dict'),
    dictType: str(body.dictType),
    value: str(body.value),
    label: str(body.label),
    sortOrder: Number(body.sortOrder) || 0,
    enabled: body.enabled !== false,
    version: 1,
  }
  dictionaries.push(item)
  return item
})

on('PUT', '/dictionary-items/:id', ({ params, body }) => {
  const item = dictionaries.find((d) => d.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '字典项不存在')
  Object.assign(item, body, { version: item.version + 1 })
  return item
})

on('DELETE', '/dictionary-items/:id', ({ params }) => {
  const idx = dictionaries.findIndex((d) => d.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '字典项不存在')
  dictionaries.splice(idx, 1)
  return { success: true }
})

on('GET', '/audit-logs', ({ query }) => {
  let items = auditLogs
  if (query.logType) items = items.filter((l) => l.logType === query.logType)
  if (query.outcome) items = items.filter((l) => l.outcome === query.outcome)
  if (query.keyword) items = items.filter((l) => contains(l.summary, str(query.keyword)) || contains(l.operatorName, str(query.keyword)))
  return pageOf(items, query)
})

on('POST', '/files', ({ body, config }) => {
  const file = extractFile(body)
  return makeFileRecord(file, config)
})

on('POST', '/files/batch', ({ body, config }) => {
  const files = Array.isArray(body.files) ? body.files : []
  return { files: files.map((f: unknown) => makeFileRecord(f, config)), count: files.length }
})

function extractFile(body: any): File | { name?: string; size?: number; type?: string } {
  if (body && typeof body === 'object') {
    if (body.file && typeof body.file === 'object') return body.file
    if (body instanceof FormData) {
      const f = body.get('file')
      if (f && typeof f === 'object') return f as File
    }
  }
  return { name: 'uploaded-file.jpg', size: 1024 * 320, type: 'image/jpeg' }
}

function makeFileRecord(file: any, config: AxiosRequestConfig) {
  const name = file?.name || file?.originalName || 'uploaded-file.jpg'
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(name) || str(file?.type).startsWith('image/')
  const body = parseBody<Record<string, unknown>>(config)
  return {
    id: nextId('file'),
    ownerType: str(body.ownerType) || 'PERSON',
    ownerId: str(body.ownerId) || 'unknown',
    category: str(body.category) || 'MATERIAL',
    originalName: name,
    contentType: file?.type || 'application/octet-stream',
    sizeBytes: file?.size || 1024,
    private: true,
    url: isImage
      ? `https://picsum.photos/seed/${encodeURIComponent(name)}/900/560`
      : undefined,
    version: 1,
  }
}

on('GET', '/files/:id', ({ params }) => ({
  id: params.id,
  ownerType: 'PERSON',
  ownerId: 'unknown',
  originalName: '材料文件.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1024 * 512,
  private: true,
  version: 1,
}))

on('DELETE', '/files/:id', () => ({ success: true }))

// ---------------------------------------------------------------------------
// 人员 / 材料 / 球队
// ---------------------------------------------------------------------------

function scopePersons(config: AxiosRequestConfig, items: Person[]): Person[] {
  const account = accountFrom(config)
  if (!account) return items
  if (account.roles.includes('ADMIN') || account.roles.includes('PROVINCE_REVIEWER')) return items
  if (account.roles.includes('CITY')) {
    const citySchools = organizations.filter((o) => o.parentId === account.orgId).map((o) => o.id)
    return items.filter((p) => p.schoolOrgId && citySchools.includes(p.schoolOrgId))
  }
  if (account.roles.includes('TEAM') || account.roles.includes('UNIVERSITY')) {
    const memberIds = teamMembers.filter((m) => (account.teamIds || []).includes(m.teamId)).map((m) => m.athleteId)
    return items.filter((p) => memberIds.includes(p.id))
  }
  return items.filter((p) => p.id === account.personId)
}

on('GET', '/people', ({ config, query }) => {
  let items = scopePersons(config, persons)
  if (query.kind) items = items.filter((p) => p.kinds.includes(query.kind as never))
  if (query.keyword) items = items.filter((p) => contains(p.realName, str(query.keyword)) || contains(p.maskedIdNumber, str(query.keyword)))
  if (query.reviewStatus) items = items.filter((p) => p.reviewStatus === query.reviewStatus)
  if (query.teamId) {
    const ids = teamMembers.filter((m) => m.teamId === query.teamId).map((m) => m.athleteId)
    items = items.filter((p) => ids.includes(p.id))
  }
  return pageOf(items, query)
})

on('POST', '/people/search', ({ body, config }) => {
  const keyword = str(body.keyword)
  let items = scopePersons(config, persons)
  if (body.idNumber) items = items.filter((p) => str(p.maskedIdNumber).endsWith(str(body.idNumber).slice(-4)))
  if (keyword) items = items.filter((p) => contains(p.realName, keyword) || contains(p.maskedIdNumber, keyword))
  if (body.teamId) {
    const ids = teamMembers.filter((m) => m.teamId === body.teamId).map((m) => m.athleteId)
    items = items.filter((p) => ids.includes(p.id))
  }
  return items.slice(0, 20)
})

on('GET', '/people/:id', ({ params }) => {
  const person = persons.find((p) => p.id === params.id)
  if (!person) throw new MockHttpError(404, 'NOT_FOUND', '人员档案不存在')
  return person
})

on('POST', '/people', ({ body }) => {
  const person: Person = {
    id: nextId('person'),
    kinds: body.kinds || ['ATHLETE'],
    realName: str(body.realName),
    maskedIdNumber: body.idNumber ? `${str(body.idNumber).slice(0, 4)}**********${str(body.idNumber).slice(-4)}` : '',
    maskedPhone: body.phone ? `${str(body.phone).slice(0, 3)}****${str(body.phone).slice(-4)}` : '',
    gender: body.gender,
    birthDate: body.birthDate,
    schoolOrgId: body.schoolOrgId,
    schoolName: organizations.find((o) => o.id === body.schoolOrgId)?.name,
    teamName: body.teamName,
    education: body.education,
    coachCategory: body.coachCategory,
    reviewStatus: 'PENDING',
    version: 1,
    createdAt: now(),
  }
  persons.unshift(person)
  return person
})

on('PUT', '/people/:id', ({ params, body }) => {
  const person = persons.find((p) => p.id === params.id)
  if (!person) throw new MockHttpError(404, 'NOT_FOUND', '人员档案不存在')
  Object.assign(person, body, { version: person.version + 1 })
  return person
})

on('DELETE', '/people/:id', ({ params }) => {
  const idx = persons.findIndex((p) => p.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '人员档案不存在')
  persons.splice(idx, 1)
  return { success: true }
})

on('GET', '/materials', ({ config, query }) => {
  const account = requireAccount(config)
  let items = materials
  if (query.ownerType) items = items.filter((m) => m.ownerType === query.ownerType)
  if (query.ownerId) items = items.filter((m) => m.ownerId === query.ownerId)
  if (account.roles.includes('ATHLETE') || account.roles.includes('COACH')) {
    items = items.filter((m) => m.ownerType === 'PERSON' && m.ownerId === account.personId)
  }
  if (query.reviewStatus) items = items.filter((m) => m.reviewStatus === query.reviewStatus)
  return pageOf(items, query)
})

on('POST', '/materials', ({ config, body }) => {
  requireAccount(config)
  const typeLabels: Record<string, string> = {
    STUDENT_STATUS: '学籍证明',
    ATHLETE_CERTIFICATE: '运动员证书',
    AWARD: '获奖证书',
    COMPETITION: '参赛经历',
    EDUCATION: '学历证明',
    OTHER: '其他材料',
    COACHING_RECORD: '执教记录',
    TRAINING_RECORD: '培训记录',
    TEACHER_LICENSE: '教师资格证',
    COACH_LICENSE: '教练员证书',
    TRAINING_PLAN: '训练计划',
    TEAM_HONOR: '球队荣誉',
    MATCH_RECORD: '对阵记录',
  }
  const material = {
    id: nextId('mat'),
    ownerType: body.ownerType || 'PERSON',
    ownerId: str(body.ownerId),
    ownerName: persons.find((p) => p.id === body.ownerId)?.realName || teams.find((t) => t.id === body.ownerId)?.name,
    materialType: str(body.materialType),
    materialLabel: typeLabels[str(body.materialType)] || '履历材料',
    title: str(body.title) || '新履历材料',
    description: str(body.description),
    fileName: str(body.fileName) || '材料文件.pdf',
    reviewStatus: 'PENDING' as const,
    version: 1,
    createdAt: now(),
  }
  materials.unshift(material)
  return material
})

on('PUT', '/materials/:id', ({ params, body }) => {
  const item = materials.find((m) => m.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '材料不存在')
  Object.assign(item, body, { version: item.version + 1 })
  return item
})

on('DELETE', '/materials/:id', ({ params }) => {
  const idx = materials.findIndex((m) => m.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '材料不存在')
  materials.splice(idx, 1)
  return { success: true }
})

on('POST', '/materials/:id/review', ({ params, body }) => {
  const item = materials.find((m) => m.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '材料不存在')
  item.reviewStatus = body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
  item.reviewReason = body.reason
  item.version += 1
  return item
})

function scopeTeams(config: AxiosRequestConfig, items: Team[]): Team[] {
  const account = accountFrom(config)
  if (!account) return items
  if (account.roles.includes('ADMIN') || account.roles.includes('PROVINCE_REVIEWER')) return items
  if (account.roles.includes('CITY')) return items.filter((t) => t.cityOrgId === account.orgId)
  if (account.teamIds?.length) return items.filter((t) => account.teamIds?.includes(t.id))
  return items
}

on('GET', '/teams', ({ config, query }) => {
  let items = scopeTeams(config, teams)
  if (query.cityOrgId) items = items.filter((t) => t.cityOrgId === query.cityOrgId)
  if (query.category) items = items.filter((t) => t.category === query.category)
  if (query.keyword) items = items.filter((t) => contains(t.name, str(query.keyword)) || contains(t.schoolName, str(query.keyword)))
  return pageOf(items, query)
})

on('POST', '/teams', ({ body }) => {
  const team: Team = {
    id: nextId('team'),
    name: str(body.name),
    shortName: str(body.shortName),
    orgId: body.orgId,
    cityOrgId: body.cityOrgId,
    cityName: organizations.find((o) => o.id === body.cityOrgId)?.name,
    category: body.category,
    schoolName: organizations.find((o) => o.id === body.orgId)?.name,
    coachName: body.coachName,
    intro: body.intro,
    memberCount: 0,
    status: 'PENDING',
    version: 1,
    createdAt: now(),
  }
  teams.unshift(team)
  return team
})

on('GET', '/teams/:id', ({ params }) => {
  const team = teams.find((t) => t.id === params.id)
  if (!team) throw new MockHttpError(404, 'NOT_FOUND', '球队不存在')
  return team
})

on('PUT', '/teams/:id', ({ params, body }) => {
  const team = teams.find((t) => t.id === params.id)
  if (!team) throw new MockHttpError(404, 'NOT_FOUND', '球队不存在')
  Object.assign(team, body, { version: team.version + 1 })
  return team
})

on('DELETE', '/teams/:id', ({ params }) => {
  const idx = teams.findIndex((t) => t.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '球队不存在')
  teams.splice(idx, 1)
  return { success: true }
})

on('GET', '/teams/:id/members', ({ params, query }) => {
  let items = teamMembers.filter((m) => m.teamId === params.id)
  if (query.keyword) items = items.filter((m) => contains(m.athleteName, str(query.keyword)) || contains(m.maskedIdNumber, str(query.keyword)))
  if (query.status) items = items.filter((m) => m.status === query.status)
  return pageOf(items, query)
})

on('POST', '/teams/:id/members', ({ params, body }) => {
  const person = persons.find((p) => p.id === body.athleteId)
  const member = {
    id: nextId('tm'),
    teamId: params.id,
    athleteId: str(body.athleteId),
    athleteName: person?.realName || str(body.athleteName),
    maskedIdNumber: person?.maskedIdNumber,
    jerseyNumber: Number(body.jerseyNumber) || undefined,
    position: body.position,
    photoUrl: '',
    status: 'PENDING' as const,
    version: 1,
  }
  teamMembers.push(member)
  const team = teams.find((t) => t.id === params.id)
  if (team) team.memberCount = (team.memberCount || 0) + 1
  return member
})

on('POST', '/teams/:id/members/search', ({ params, body }) => {
  const keyword = str(body.keyword)
  return persons
    .filter((p) => p.kinds.includes('ATHLETE'))
    .filter((p) => contains(p.realName, keyword) || contains(p.maskedIdNumber, keyword))
    .filter((p) => !teamMembers.some((m) => m.teamId === params.id && m.athleteId === p.id))
    .slice(0, 20)
})

on('PUT', '/teams/:id/members/:memberId', ({ params, body }) => {
  const item = teamMembers.find((m) => m.id === params.memberId)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '球队成员不存在')
  Object.assign(item, body, { version: item.version + 1 })
  return item
})

on('DELETE', '/teams/:id/members/:memberId', ({ params }) => {
  const idx = teamMembers.findIndex((m) => m.id === params.memberId)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '球队成员不存在')
  teamMembers.splice(idx, 1)
  return { success: true }
})

on('GET', '/teams/:id/coaches', ({ params, query }) => {
  let items = teamCoaches.filter((c) => c.teamId === params.id)
  if (query.status) items = items.filter((c) => c.status === query.status)
  if (query.coachCategory) items = items.filter((c) => c.coachCategory === query.coachCategory)
  return pageOf(items, query)
})

on('POST', '/teams/:id/coaches', ({ params, body }) => {
  const coach = {
    id: nextId('tc'),
    teamId: params.id,
    coachId: str(body.coachId),
    coachName: persons.find((p) => p.id === body.coachId)?.realName || str(body.coachName),
    coachCategory: body.coachCategory,
    maskedPhone: persons.find((p) => p.id === body.coachId)?.maskedPhone,
    status: 'PENDING' as const,
    version: 1,
  }
  teamCoaches.push(coach)
  return coach
})

on('DELETE', '/teams/:id/coaches/:coachId', ({ params }) => {
  const idx = teamCoaches.findIndex((c) => c.id === params.coachId)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '球队教练关联不存在')
  teamCoaches.splice(idx, 1)
  return { success: true }
})

on('GET', '/teams/:id/matches', ({ params, query }) => {
  const items = matches.filter((m) => m.homeTeamId === params.id || m.awayTeamId === params.id)
  return pageOf(items, query)
})

// ---------------------------------------------------------------------------
// 遴选档案
// ---------------------------------------------------------------------------

on('POST', '/selection-dossiers/search', ({ body }) => {
  let items = persons.filter((p) => p.kinds.includes('ATHLETE'))
  if (body.idNumber) items = items.filter((p) => str(p.maskedIdNumber).endsWith(str(body.idNumber).slice(-4)))
  if (body.teamId) {
    const ids = teamMembers.filter((m) => m.teamId === body.teamId).map((m) => m.athleteId)
    items = items.filter((p) => ids.includes(p.id))
  }
  if (body.keyword) items = items.filter((p) => contains(p.realName, str(body.keyword)))
  return items.slice(0, 50).map((p) => {
    const member = teamMembers.find((m) => m.athleteId === p.id)
    const team = teams.find((t) => t.id === member?.teamId)
    return {
      athleteId: p.id,
      realName: p.realName,
      maskedIdNumber: p.maskedIdNumber,
      gender: p.gender,
      birthDate: p.birthDate,
      schoolName: p.schoolName,
      teamId: team?.id,
      teamName: team?.name,
      reviewStatus: p.reviewStatus,
      materialCount: materials.filter((m) => m.ownerId === p.id).length,
    }
  })
})

on('GET', '/selection-dossiers/:athleteId', ({ params }) => {
  const person = persons.find((p) => p.id === params.athleteId)
  if (!person) throw new MockHttpError(404, 'NOT_FOUND', '档案不存在')
  const member = teamMembers.find((m) => m.athleteId === params.athleteId)
  const team = teams.find((t) => t.id === member?.teamId)
  return {
    person,
    team,
    materials: materials.filter((m) => m.ownerId === params.athleteId),
    matches: matches.filter((m) => m.homeTeamId === team?.id || m.awayTeamId === team?.id).slice(0, 6),
    scores: selectionScores.filter((s) => s.athleteId === params.athleteId),
  }
})

// ---------------------------------------------------------------------------
// 赛事 / 组别
// ---------------------------------------------------------------------------

on('GET', '/events', ({ query }) => {
  let items = events
  if (query.status) items = items.filter((e) => e.status === query.status)
  if (query.keyword) items = items.filter((e) => contains(e.name, str(query.keyword)))
  return pageOf(items, query)
})

on('GET', '/available-events', ({ query }) => {
  const items = events.filter((e) => e.status === 'REGISTRATION_OPEN')
  return pageOf(items, query)
})

on('POST', '/events', ({ body }) => {
  const event = {
    id: nextId('event'),
    name: str(body.name),
    season: str(body.season),
    eventCategory: body.eventCategory,
    registrationOpensAt: str(body.registrationOpensAt),
    registrationClosesAt: str(body.registrationClosesAt),
    status: body.status || 'DRAFT',
    description: body.description,
    groupCount: 0,
    teamCount: 0,
    version: 1,
  }
  events.unshift(event as never)
  return event
})

on('GET', '/events/:id', ({ params }) => {
  const event = events.find((e) => e.id === params.id)
  if (!event) throw new MockHttpError(404, 'NOT_FOUND', '赛事不存在')
  return event
})

on('PUT', '/events/:id', ({ params, body }) => {
  const event = events.find((e) => e.id === params.id)
  if (!event) throw new MockHttpError(404, 'NOT_FOUND', '赛事不存在')
  Object.assign(event, body, { version: event.version + 1 })
  return event
})

on('DELETE', '/events/:id', ({ params }) => {
  const idx = events.findIndex((e) => e.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '赛事不存在')
  events.splice(idx, 1)
  return { success: true }
})

on('GET', '/events/:id/groups', ({ params, query }) => {
  const items = eventGroups.filter((g) => g.eventId === params.id)
  return pageOf(items, query)
})

on('GET', '/available-events/:id/groups', ({ params }) => eventGroups.filter((g) => g.eventId === params.id))

on('POST', '/events/:id/groups', ({ params, body }) => {
  const group = {
    id: nextId('group'),
    eventId: params.id,
    name: str(body.name),
    category: body.category || 'PRIMARY',
    gender: body.gender || 'MALE',
    quota: Number(body.quota) || 0,
    minAge: Number(body.minAge) || 0,
    maxAge: Number(body.maxAge) || 60,
    maxPlayers: Number(body.maxPlayers) || 18,
    requiredMaterialTypes: body.requiredMaterialTypes || ['STAMPED_FORM', 'STUDENT_STATUS'],
    teamCount: 0,
    version: 1,
  }
  eventGroups.push(group as never)
  return group
})

on('PUT', '/events/:id/groups/:groupId', ({ params, body }) => {
  const group = eventGroups.find((g) => g.id === params.groupId)
  if (!group) throw new MockHttpError(404, 'NOT_FOUND', '组别不存在')
  Object.assign(group, body, { version: group.version + 1 })
  return group
})

on('DELETE', '/events/:id/groups/:groupId', ({ params }) => {
  const idx = eventGroups.findIndex((g) => g.id === params.groupId)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '组别不存在')
  eventGroups.splice(idx, 1)
  return { success: true }
})

on('GET', '/enrollment-form-config', ({ query }) => {
  const group = eventGroups.find((g) => g.id === query.groupId)
  return {
    eventId: str(query.eventId),
    groupId: str(query.groupId),
    subjectType: str(query.subjectType) || 'SCHOOL_TEAM',
    fields: [
      { key: 'contactName', label: '领队/联系人', required: true, component: 'TEXT' },
      { key: 'contactPhone', label: '联系电话', required: true, component: 'TEXT' },
      { key: 'remarks', label: '备注说明', required: false, component: 'TEXT' },
    ],
    requiredMaterialTypes: group?.requiredMaterialTypes || ['STAMPED_FORM', 'STUDENT_STATUS'],
    submissionRoute:
      str(query.subjectType) === 'SCHOOL_TEAM'
        ? ['球队提交', '市州审核', '省级终审']
        : ['学校/高校提交', '省级终审'],
  }
})

// ---------------------------------------------------------------------------
// 报名
// ---------------------------------------------------------------------------

function scopeEnrollments(config: AxiosRequestConfig, items: Enrollment[]): Enrollment[] {
  const account = accountFrom(config)
  if (!account) return items
  if (account.roles.includes('ADMIN') || account.roles.includes('PROVINCE_REVIEWER')) return items
  if (account.roles.includes('CITY')) return items.filter((e) => e.cityOrgId === account.orgId)
  if (account.teamIds?.length) return items.filter((e) => account.teamIds?.includes(e.teamId))
  return items
}

on('GET', '/enrollments', ({ config, query }) => {
  let items = scopeEnrollments(config, enrollments)
  if (query.eventId) items = items.filter((e) => e.eventId === query.eventId)
  if (query.groupId) items = items.filter((e) => e.groupId === query.groupId)
  if (query.status) items = items.filter((e) => e.status === query.status)
  if (query.subjectType) items = items.filter((e) => e.subjectType === query.subjectType)
  if (query.cityOrgId) items = items.filter((e) => e.cityOrgId === query.cityOrgId)
  if (query.teamName) items = items.filter((e) => contains(e.teamName, str(query.teamName)))
  return pageOf(items, query)
})

on('POST', '/enrollments', ({ body }) => {
  const event = events.find((e) => e.id === body.eventId)
  const group = eventGroups.find((g) => g.id === body.groupId)
  const team = teams.find((t) => t.id === body.teamId)
  const enrollment: Enrollment = {
    id: nextId('enr'),
    eventId: str(body.eventId),
    eventName: event?.name || '',
    groupId: str(body.groupId),
    groupName: group?.name || '',
    teamId: str(body.teamId),
    teamName: team?.name || str(body.teamName),
    subjectType: body.subjectType || 'SCHOOL_TEAM',
    cityOrgId: team?.cityOrgId,
    cityName: team?.cityName,
    status: 'DRAFT',
    submissionNo: 0,
    contactName: str(body.contactName),
    maskedContactPhone: body.contactPhone ? `${str(body.contactPhone).slice(0, 3)}****${str(body.contactPhone).slice(-4)}` : '',
    editable: true,
    playerCount: 0,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
  }
  enrollments.unshift(enrollment)
  return enrollment
})

on('GET', '/enrollments/:id', ({ params }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  return {
    ...enrollment,
    players: rosterItems.filter((r) => r.id.startsWith(`roster_${enrollment.id}_`)),
    attachments: enrollmentAttachments.filter((a) => a.id.includes(`_${enrollment.id}_`)),
  }
})

on('PUT', '/enrollments/:id', ({ params, body }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  Object.assign(enrollment, body, { version: enrollment.version + 1, updatedAt: now() })
  return enrollment
})

on('DELETE', '/enrollments/:id', ({ params }) => {
  const idx = enrollments.findIndex((e) => e.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  enrollments.splice(idx, 1)
  return { success: true }
})

on('GET', '/enrollments/:id/players', ({ params, query }) => {
  const items = rosterItems.filter((r) => r.id.startsWith(`roster_${params.id}_`))
  return pageOf(items, query)
})

on('POST', '/enrollments/:id/players', ({ params, body }) => {
  const person = persons.find((p) => p.id === body.athleteId)
  const item = {
    id: nextId('roster'),
    athleteId: str(body.athleteId),
    athleteName: person?.realName || str(body.athleteName),
    maskedIdNumber: person?.maskedIdNumber,
    jerseyNumber: Number(body.jerseyNumber) || undefined,
    position: body.position,
    photoUrl: '',
    gender: person?.gender,
    schoolName: person?.schoolName,
    version: 1,
  }
  rosterItems.push(item)
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (enrollment) enrollment.playerCount += 1
  return item
})

on('PUT', '/enrollments/:id/players/:rid', ({ params, body }) => {
  const item = rosterItems.find((r) => r.id === params.rid)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '名单条目不存在')
  Object.assign(item, body, { version: item.version + 1 })
  return item
})

on('DELETE', '/enrollments/:id/players/:rid', ({ params }) => {
  const idx = rosterItems.findIndex((r) => r.id === params.rid)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '名单条目不存在')
  rosterItems.splice(idx, 1)
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (enrollment && enrollment.playerCount > 0) enrollment.playerCount -= 1
  return { success: true }
})

on('POST', '/enrollments/:id/precheck', ({ params }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  const issues = []
  if (!enrollmentAttachments.some((a) => a.id.includes(`_${params.id}_01`))) {
    issues.push({ code: 'MISSING_MATERIAL', field: 'STAMPED_FORM', message: '缺少加盖学校公章的报名表扫描件', severity: 'ERROR' })
  }
  if ((enrollment?.playerCount || 0) < 11) {
    issues.push({ code: 'PLAYER_LIMIT', field: 'players', message: `当前仅报送 ${enrollment?.playerCount || 0} 名球员，低于最低 11 人`, severity: 'ERROR' })
  }
  return {
    passed: issues.length === 0,
    checkedVersion: enrollment?.version || 1,
    issues,
  }
})

on('POST', '/enrollments/:id/submit', ({ params }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  enrollment.status = enrollment.subjectType === 'SCHOOL_TEAM' ? 'PENDING_CITY_REVIEW' : 'PENDING_PROVINCE_REVIEW'
  enrollment.submissionNo += 1
  enrollment.editable = false
  enrollment.snapshotId = nextId('snap')
  enrollment.version += 1
  enrollment.updatedAt = now()
  reviewRecords.push({
    id: nextId('rev'),
    enrollmentId: enrollment.id,
    submissionNo: enrollment.submissionNo,
    stage: 'SUBMISSION',
    action: 'SUBMIT',
    fromStatus: 'DRAFT',
    toStatus: enrollment.status,
    operatorName: '当前用户',
    createdAt: now(),
  })
  return enrollment
})

on('POST', '/enrollments/:id/withdraw', ({ params, body }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  enrollment.status = 'WITHDRAWN'
  enrollment.editable = true
  enrollment.version += 1
  reviewRecords.push({
    id: nextId('rev'),
    enrollmentId: enrollment.id,
    submissionNo: enrollment.submissionNo,
    stage: 'SUBMISSION',
    action: 'WITHDRAW',
    reason: body.reason,
    operatorName: '当前用户',
    createdAt: now(),
  })
  return enrollment
})

on('POST', '/enrollments/:id/reviews', ({ params, body }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  const from = enrollment.status
  if (body.decision === 'APPROVE') {
    enrollment.status = from === 'PENDING_CITY_REVIEW' ? 'PENDING_PROVINCE_REVIEW' : 'APPROVED'
  } else {
    enrollment.status = 'REJECTED'
    enrollment.editable = true
    enrollment.latestReviewReason = body.reason
  }
  enrollment.version += 1
  enrollment.updatedAt = now()
  reviewRecords.push({
    id: nextId('rev'),
    enrollmentId: enrollment.id,
    submissionNo: enrollment.submissionNo,
    stage: from === 'PENDING_CITY_REVIEW' ? 'CITY' : 'PROVINCE',
    action: body.decision,
    fromStatus: from,
    toStatus: enrollment.status,
    reason: body.reason,
    operatorName: '当前用户',
    createdAt: now(),
  })
  return enrollment
})

on('GET', '/enrollments/:id/reviews', ({ params }) =>
  reviewRecords.filter((r) => r.enrollmentId === params.id).sort((a, b) => str(a.createdAt).localeCompare(str(b.createdAt))),
)

on('GET', '/enrollments/:id/snapshots/:sid', ({ params }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  const team = teams.find((t) => t.id === enrollment?.teamId)
  return {
    id: params.sid,
    enrollmentId: params.id,
    submissionNo: enrollment?.submissionNo || 1,
    submittedAt: enrollment?.updatedAt,
    enrollment,
    team,
    players: rosterItems.filter((r) => r.id.startsWith(`roster_${params.id}_`)),
    coachIds: teamCoaches.filter((c) => c.teamId === enrollment?.teamId).map((c) => c.coachId),
    attachments: enrollmentAttachments.filter((a) => a.id.includes(`_${params.id}_`)),
  }
})

on('GET', '/enrollments/:id/attachments', ({ params }) =>
  enrollmentAttachments.filter((a) => a.id.includes(`_${params.id}_`)),
)

on('POST', '/enrollments/:id/attachments', ({ body }) => {
  const att = {
    id: nextId('att'),
    materialType: body.materialType || 'STAMPED_FORM',
    fileId: str(body.fileId) || nextId('file'),
    fileName: str(body.fileName) || '盖章报名表.pdf',
    athleteId: body.athleteId,
    version: 1,
  }
  enrollmentAttachments.push(att as never)
  return att
})

on('DELETE', '/enrollments/:id/attachments/:aid', ({ params }) => {
  const idx = enrollmentAttachments.findIndex((a) => a.id === params.aid)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '材料关联不存在')
  enrollmentAttachments.splice(idx, 1)
  return { success: true }
})

on('POST', '/enrollments/:id/imports/players', ({ body }) => {
  const mode = str(body.mode) || 'VALIDATE_ONLY'
  return {
    batchId: nextId('batch'),
    mode,
    total: 24,
    successCount: mode === 'APPLY_VALID_ROWS' ? 22 : 22,
    failureCount: 2,
    enrollmentVersion: 5,
    errors: [
      { rowNumber: 7, field: '身份证号', code: 'INVALID_ID_NUMBER', message: '身份证号校验位不正确（已脱敏）' },
      { rowNumber: 15, field: '学校编码', code: 'ORG_NOT_FOUND', message: '学校编码不在当前报送主体范围内' },
    ],
  }
})

on('POST', '/enrollments/:id/imports/photos', () => ({
  batchId: nextId('batch'),
  mode: 'PHOTO_IMPORT',
  total: 24,
  successCount: 21,
  failureCount: 3,
  enrollmentVersion: 5,
  errors: [
    { fileName: '5101**********1201.jpg', code: 'NOT_IN_ROSTER', message: '照片未匹配到报名名单' },
    { fileName: '5101**********1312.jpg', code: 'INVALID_IMAGE', message: '文件不是有效图片' },
    { fileName: '5101**********1444.jpg', code: 'NOT_IN_ROSTER', message: '照片未匹配到报名名单' },
  ],
}))

on('GET', '/enrollment-statistics', ({ query }) => {
  const eventId = str(query.eventId)
  const dimension = str(query.dimension) || 'city'
  const scoped = eventId ? enrollments.filter((e) => e.eventId === eventId) : enrollments
  const groups = new Map<string, { label: string; teamCount: number; athleteCount: number; pendingCount: number; approvedCount: number; rejectedCount: number }>()
  scoped.forEach((e) => {
    const key = dimension === 'group' ? e.groupId : dimension === 'subjectType' ? e.subjectType : e.cityName || '未分组'
    const label = dimension === 'group' ? e.groupName : dimension === 'subjectType' ? (e.subjectType === 'SCHOOL_TEAM' ? '中小学球队' : e.subjectType === 'UNIVERSITY' ? '高校' : '市州代报') : e.cityName || '未分组'
    const row = groups.get(key) || { label, teamCount: 0, athleteCount: 0, pendingCount: 0, approvedCount: 0, rejectedCount: 0 }
    row.teamCount += 1
    row.athleteCount += e.playerCount
    if (e.status === 'PENDING_CITY_REVIEW' || e.status === 'PENDING_PROVINCE_REVIEW') row.pendingCount += 1
    if (e.status === 'APPROVED') row.approvedCount += 1
    if (e.status === 'REJECTED') row.rejectedCount += 1
    groups.set(key, row)
  })
  return Array.from(groups.entries()).map(([key, v]) => ({ key, ...v }))
})

on('POST', '/enrollment-exports/registrations.xlsx', () => ({ success: true }))
on('POST', '/enrollment-exports/documents.zip', () => ({ success: true }))
on('GET', '/imports/:batchId/errors.csv', () => ({ success: true }))

// ---------------------------------------------------------------------------
// 比赛 / 事件 / 直播 / 赛果
// ---------------------------------------------------------------------------

on('GET', '/matches', ({ query }) => {
  let items = matches
  if (query.eventId) items = items.filter((m) => m.eventId === query.eventId)
  if (query.groupId) items = items.filter((m) => m.groupId === query.groupId)
  if (query.status) items = items.filter((m) => m.status === query.status)
  if (query.teamId) items = items.filter((m) => m.homeTeamId === query.teamId || m.awayTeamId === query.teamId)
  if (query.keyword) items = items.filter((m) => contains(m.homeTeamName, str(query.keyword)) || contains(m.awayTeamName, str(query.keyword)))
  if (query.date) items = items.filter((m) => str(m.kickoffAt).startsWith(str(query.date)))
  return pageOf(items, query)
})

on('POST', '/matches', ({ body }) => {
  const home = teams.find((t) => t.id === body.homeTeamId)
  const away = teams.find((t) => t.id === body.awayTeamId)
  const group = eventGroups.find((g) => g.id === body.groupId)
  const event = events.find((e) => e.id === body.eventId)
  const match = {
    id: nextId('match'),
    eventId: str(body.eventId),
    eventName: event?.name,
    groupId: str(body.groupId),
    groupName: group?.name,
    homeTeamId: str(body.homeTeamId),
    awayTeamId: str(body.awayTeamId),
    homeTeamName: home?.name || '',
    awayTeamName: away?.name || '',
    kickoffAt: str(body.kickoffAt),
    venue: body.venue,
    stage: body.stage,
    status: body.status || 'SCHEDULED',
    homeScore: 0,
    awayScore: 0,
    published: false,
    resultPublished: false,
    scoreRevision: 0,
    referees: body.referees || [],
    version: 1,
  }
  matches.unshift(match as never)
  return match
})

on('GET', '/matches/:id', ({ params }) => {
  const match = matches.find((m) => m.id === params.id)
  if (!match) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在')
  return match
})

on('PUT', '/matches/:id', ({ params, body }) => {
  const match = matches.find((m) => m.id === params.id)
  if (!match) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在')
  Object.assign(match, body, { version: match.version + 1 })
  return match
})

on('DELETE', '/matches/:id', ({ params }) => {
  const idx = matches.findIndex((m) => m.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在')
  matches.splice(idx, 1)
  return { success: true }
})

on('POST', '/matches/:id/publish', ({ params }) => {
  const match = matches.find((m) => m.id === params.id)
  if (match) {
    match.published = true
    match.version += 1
  }
  return { success: true }
})

on('POST', '/matches/:id/unpublish', ({ params }) => {
  const match = matches.find((m) => m.id === params.id)
  if (match) {
    match.published = false
    match.version += 1
  }
  return { success: true }
})

on('GET', '/matches/:id/events', ({ params, query }) => {
  const items = matchEvents.filter((e) => e.matchId === params.id)
  return pageOf(items, query)
})

on('POST', '/matches/:id/events', ({ params, body }) => {
  const match = matches.find((m) => m.id === params.id)
  if (!match) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在')
  const teamId = str(body.teamId)
  const isHome = teamId === match.homeTeamId
  const event = {
    id: nextId('me'),
    matchId: params.id,
    eventType: body.eventType || 'GOAL',
    minute: Number(body.minute) || 0,
    stoppageMinute: Number(body.stoppageMinute) || 0,
    teamId,
    teamName: isHome ? match.homeTeamName : match.awayTeamName,
    scorerAthleteId: body.scorerAthleteId,
    scorerName: body.scorerAthleteId
      ? persons.find((p) => p.id === body.scorerAthleteId)?.realName
      : str(body.scorerName) || undefined,
    ownGoal: Boolean(body.ownGoal),
    athleteId: body.athleteId,
    athleteName: body.athleteId
      ? persons.find((p) => p.id === body.athleteId)?.realName
      : str(body.athleteName) || undefined,
    penaltyType: body.penaltyType,
    reason: body.reason,
    outAthleteName: body.outAthleteId
      ? persons.find((p) => p.id === body.outAthleteId)?.realName
      : str(body.outAthleteName) || undefined,
    inAthleteName: body.inAthleteId
      ? persons.find((p) => p.id === body.inAthleteId)?.realName
      : str(body.inAthleteName) || undefined,
    note: body.note,
    version: 1,
    createdAt: now(),
  }
  matchEvents.push(event as never)
  if (event.eventType === 'GOAL' && !event.ownGoal) {
    const scoringTeam = isHome ? match.homeScore : match.awayScore
    if (isHome) match.homeScore = (scoringTeam || 0) + 1
    else match.awayScore = (match.awayScore || 0) + 1
  }
  if (event.eventType === 'GOAL' && event.ownGoal) {
    if (isHome) match.awayScore = (match.awayScore || 0) + 1
    else match.homeScore = (match.homeScore || 0) + 1
  }
  match.scoreRevision += 1
  match.version += 1
  if (match.status === 'SCHEDULED') match.status = 'LIVE'
  return event
})

on('PUT', '/matches/:id/events/:eid', ({ params, body }) => {
  const event = matchEvents.find((e) => e.id === params.eid)
  if (!event) throw new MockHttpError(404, 'NOT_FOUND', '比赛事件不存在')
  Object.assign(event, body, { version: event.version + 1 })
  return event
})

on('DELETE', '/matches/:id/events/:eid', ({ params }) => {
  const idx = matchEvents.findIndex((e) => e.id === params.eid)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '比赛事件不存在')
  matchEvents.splice(idx, 1)
  return { success: true }
})

on('GET', '/matches/:id/documents', ({ params }) =>
  matchDocuments.filter((d) => d.matchId === params.id),
)

on('POST', '/matches/:id/documents', ({ params, body }) => {
  const doc = {
    id: nextId('doc'),
    matchId: params.id,
    documentType: body.documentType || 'SIGN_IN',
    fileName: str(body.fileName) || '比赛文件.pdf',
    version: 1,
    createdAt: now(),
  }
  matchDocuments.push(doc as never)
  return doc
})

on('GET', '/matches/:id/live-posts', ({ params, query }) => {
  const items = livePosts.filter((p) => p.matchId === params.id)
  return pageOf(items, query)
})

on('POST', '/matches/:id/live-posts', ({ params, body }) => {
  const post = {
    id: nextId('live'),
    matchId: params.id,
    text: str(body.text),
    imageUrls: body.imageFileIds?.length ? [`https://picsum.photos/seed/${Date.now()}/900/600`] : [],
    minute: Number(body.minute) || 0,
    cursor: livePosts.length + 1,
    version: 1,
    createdAt: now(),
  }
  livePosts.unshift(post as never)
  const match = matches.find((m) => m.id === params.id)
  if (match) match.version += 1
  return post
})

on('PUT', '/matches/:id/live-posts/:pid', ({ params, body }) => {
  const post = livePosts.find((p) => p.id === params.pid)
  if (!post) throw new MockHttpError(404, 'NOT_FOUND', '直播条目不存在')
  Object.assign(post, body, { version: post.version + 1 })
  return post
})

on('DELETE', '/matches/:id/live-posts/:pid', ({ params }) => {
  const idx = livePosts.findIndex((p) => p.id === params.pid)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '直播条目不存在')
  livePosts.splice(idx, 1)
  return { success: true }
})

on('GET', '/matches/:id/live-links', ({ params }) => liveLinks.filter((l) => l.matchId === params.id))

on('POST', '/matches/:id/live-links', ({ params, body }) => {
  const link = {
    id: nextId('link'),
    matchId: params.id,
    title: str(body.title),
    url: str(body.url),
    enabled: body.enabled !== false,
    version: 1,
  }
  liveLinks.push(link)
  return link
})

on('PUT', '/matches/:id/live-links/:lid', ({ params, body }) => {
  const link = liveLinks.find((l) => l.id === params.lid)
  if (!link) throw new MockHttpError(404, 'NOT_FOUND', '直播链接不存在')
  Object.assign(link, body, { version: link.version + 1 })
  return link
})

on('DELETE', '/matches/:id/live-links/:lid', ({ params }) => {
  const idx = liveLinks.findIndex((l) => l.id === params.lid)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '直播链接不存在')
  liveLinks.splice(idx, 1)
  return { success: true }
})

on('GET', '/matches/:id/result', ({ params }) => {
  const match = matches.find((m) => m.id === params.id)
  if (!match) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在')
  return {
    matchId: match.id,
    resultType: 'NORMAL',
    homeScore: match.homeScore || 0,
    awayScore: match.awayScore || 0,
    published: match.resultPublished,
    sourceScoreRevision: match.scoreRevision,
    version: match.version,
  }
})

on('PUT', '/matches/:id/result', ({ params, body }) => {
  const match = matches.find((m) => m.id === params.id)
  if (!match) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在')
  if (body.resultType !== 'NORMAL') {
    match.homeScore = Number(body.manualHomeScore) || match.homeScore
    match.awayScore = Number(body.manualAwayScore) || match.awayScore
  }
  match.version += 1
  return {
    matchId: match.id,
    resultType: body.resultType || 'NORMAL',
    homeScore: match.homeScore || 0,
    awayScore: match.awayScore || 0,
    reason: body.reason,
    published: match.resultPublished,
    sourceScoreRevision: match.scoreRevision,
    version: match.version,
  }
})

on('POST', '/matches/:id/result/publish', ({ params }) => {
  const match = matches.find((m) => m.id === params.id)
  if (match) {
    match.resultPublished = true
    match.status = 'FINISHED'
    match.version += 1
  }
  return { success: true }
})

on('DELETE', '/matches/:id/result', ({ params }) => {
  const match = matches.find((m) => m.id === params.id)
  if (match) {
    match.resultPublished = false
    match.version += 1
  }
  return { success: true }
})

on('GET', '/statistics/goals', ({ query }) => {
  let items = goalRanking
  if (query.groupCategory) {
    const teamIds = teams.filter((t) => t.category === query.groupCategory).map((t) => t.id)
    items = items.filter((r) => teamIds.includes(r.teamId))
  }
  return { rows: items, generatedAt: now() }
})

// ---------------------------------------------------------------------------
// 内容 / 门户资源 / 公示
// ---------------------------------------------------------------------------

on('GET', '/contents', ({ query }) => {
  let items = contents
  if (query.contentType) items = items.filter((c) => c.contentType === query.contentType)
  if (query.status) items = items.filter((c) => c.status === query.status)
  if (query.eventId) items = items.filter((c) => c.eventId === query.eventId)
  if (query.keyword) items = items.filter((c) => contains(c.title, str(query.keyword)))
  return pageOf(items, query)
})

on('POST', '/contents', ({ body }) => {
  const content = {
    id: nextId('content'),
    contentType: body.contentType || 'NEWS',
    title: str(body.title),
    summary: body.summary,
    bodyHtml: str(body.bodyHtml),
    coverUrl: body.coverUrl,
    eventId: body.eventId,
    groupId: body.groupId,
    policyDocumentNo: body.policyDocumentNo,
    policyEffectiveFrom: body.policyEffectiveFrom,
    policyEffectiveTo: body.policyEffectiveTo,
    pinned: Boolean(body.pinned),
    status: 'DRAFT' as const,
    revision: 1,
    author: '系统管理员',
    viewCount: 0,
    version: 1,
    createdAt: now(),
  }
  contents.unshift(content as never)
  return content
})

on('GET', '/contents/:id', ({ params }) => {
  const content = contents.find((c) => c.id === params.id)
  if (!content) throw new MockHttpError(404, 'NOT_FOUND', '内容不存在')
  return content
})

on('PUT', '/contents/:id', ({ params, body }) => {
  const content = contents.find((c) => c.id === params.id)
  if (!content) throw new MockHttpError(404, 'NOT_FOUND', '内容不存在')
  Object.assign(content, body, { version: content.version + 1, revision: content.revision + 1 })
  return content
})

on('DELETE', '/contents/:id', ({ params }) => {
  const idx = contents.findIndex((c) => c.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '内容不存在')
  contents.splice(idx, 1)
  return { success: true }
})

on('POST', '/contents/:id/publish', ({ params }) => {
  const content = contents.find((c) => c.id === params.id)
  if (!content) throw new MockHttpError(404, 'NOT_FOUND', '内容不存在')
  content.status = 'PUBLISHED'
  content.publishedAt = now()
  content.version += 1
  return content
})

on('POST', '/contents/:id/unpublish', ({ params }) => {
  const content = contents.find((c) => c.id === params.id)
  if (!content) throw new MockHttpError(404, 'NOT_FOUND', '内容不存在')
  content.status = 'OFFLINE'
  content.version += 1
  return content
})

on('GET', '/portal-resources', ({ query }) => {
  let items = portalResources
  if (query.resourceType) items = items.filter((r) => r.resourceType === query.resourceType)
  return pageOf(items, query)
})

on('POST', '/portal-resources', ({ body }) => {
  const resource = {
    id: nextId('res'),
    resourceType: body.resourceType || 'CAROUSEL',
    title: str(body.title),
    imageUrl: body.imageUrl || `https://picsum.photos/seed/${Date.now()}/1200/600`,
    targetContentId: body.targetContentId,
    targetUrl: body.targetUrl,
    sortOrder: Number(body.sortOrder) || 0,
    enabled: body.enabled !== false,
    version: 1,
  }
  portalResources.push(resource as never)
  return resource
})

on('PUT', '/portal-resources/:id', ({ params, body }) => {
  const resource = portalResources.find((r) => r.id === params.id)
  if (!resource) throw new MockHttpError(404, 'NOT_FOUND', '资源不存在')
  Object.assign(resource, body, { version: resource.version + 1 })
  return resource
})

on('DELETE', '/portal-resources/:id', ({ params }) => {
  const idx = portalResources.findIndex((r) => r.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '资源不存在')
  portalResources.splice(idx, 1)
  return { success: true }
})

on('GET', '/publications', ({ query }) => {
  let items = publications
  if (query.targetType) items = items.filter((p) => p.targetType === query.targetType)
  if (query.active !== undefined) items = items.filter((p) => p.active === (str(query.active) === 'true'))
  if (query.groupName) items = items.filter((p) => contains(p.groupName, str(query.groupName)))
  if (query.cityName) items = items.filter((p) => contains(p.cityName, str(query.cityName)))
  if (query.eventId) items = items.filter((p) => p.eventId === query.eventId)
  return pageOf(items, query)
})

on('POST', '/publications', ({ body }) => {
  const target = body.targetType === 'ENROLLMENT'
    ? enrollments.find((e) => e.id === body.targetId)
    : persons.find((p) => p.id === body.targetId)
  const item = {
    id: nextId('pub'),
    targetType: body.targetType,
    targetId: str(body.targetId),
    targetName: target && 'teamName' in target ? target.teamName : (target as Person | undefined)?.realName,
    teamName: target && 'teamName' in target ? target.teamName : undefined,
    eventId: body.eventId,
    groupId: body.groupId,
    groupName: eventGroups.find((g) => g.id === body.groupId)?.name,
    cityName: '成都市',
    active: true,
    publishedAt: now(),
    version: 1,
  }
  publications.unshift(item as never)
  return item
})

on('POST', '/publications/:id/cancel', ({ params }) => {
  const item = publications.find((p) => p.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '公示记录不存在')
  item.active = false
  item.cancelledAt = now()
  item.version += 1
  return { success: true, id: item.id, version: item.version }
})

// ---------------------------------------------------------------------------
// 遴选
// ---------------------------------------------------------------------------

on('GET', '/selection-rules', ({ query }) => {
  let items = selectionRules
  if (query.round) items = items.filter((r) => r.round === query.round)
  if (query.groupId) items = items.filter((r) => r.groupId === query.groupId)
  return pageOf(items, query)
})

on('GET', '/selection-rules/:id', ({ params }) => {
  const rule = selectionRules.find((r) => r.id === params.id)
  if (!rule) throw new MockHttpError(404, 'NOT_FOUND', '评分规则不存在')
  return rule
})

on('POST', '/selection-rules', ({ body }) => {
  const rule = {
    id: nextId('rule'),
    eventId: str(body.eventId),
    eventName: events.find((e) => e.id === body.eventId)?.name,
    groupId: str(body.groupId),
    groupName: eventGroups.find((g) => g.id === body.groupId)?.name,
    round: body.round || 'PRELIMINARY',
    dimensions: body.dimensions || [],
    topN: Number(body.topN) || 10,
    tiePolicy: 'KEEP_TIES' as const,
    confirmed: Boolean(body.confirmed),
    version: 1,
  }
  selectionRules.unshift(rule as never)
  return rule
})

on('PUT', '/selection-rules/:id', ({ params, body }) => {
  const rule = selectionRules.find((r) => r.id === params.id)
  if (!rule) throw new MockHttpError(404, 'NOT_FOUND', '评分规则不存在')
  Object.assign(rule, body, { version: rule.version + 1 })
  return rule
})

on('GET', '/selection-scores', ({ query }) => {
  let items = selectionScores
  if (query.ruleId) items = items.filter((s) => s.ruleId === query.ruleId)
  if (query.round) items = items.filter((s) => s.round === query.round)
  if (query.keyword) items = items.filter((s) => contains(s.athleteName, str(query.keyword)) || contains(s.teamName, str(query.keyword)))
  return pageOf(items, query)
})

on('GET', '/selection-scores/:id', ({ params }) => {
  const item = selectionScores.find((s) => s.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '评分记录不存在')
  return item
})

on('POST', '/selection-scores', ({ body }) => {
  const rule = selectionRules.find((r) => r.id === body.ruleId)
  const person = persons.find((p) => p.id === body.athleteId)
  const member = teamMembers.find((m) => m.athleteId === body.athleteId)
  const scores = body.dimensionScores || []
  const total = (rule?.dimensions || []).reduce((sum, d, i) => {
    const value = scores[i]?.value || 0
    return sum + (value / d.maxScore) * 100 * d.weight
  }, 0)
  const item = {
    id: nextId('score'),
    ruleId: str(body.ruleId),
    athleteId: str(body.athleteId),
    athleteName: person?.realName || '',
    teamName: teams.find((t) => t.id === member?.teamId)?.name,
    groupName: rule?.groupName,
    round: rule?.round || 'PRELIMINARY',
    dimensionScores: scores,
    remark: body.remark,
    totalScore: Math.round(total * 100) / 100,
    scoreRevision: 13,
    operatorName: '当前用户',
    version: 1,
    createdAt: now(),
  }
  selectionScores.push(item as never)
  return item
})

on('PUT', '/selection-scores/:id', ({ params, body }) => {
  const item = selectionScores.find((s) => s.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '评分记录不存在')
  Object.assign(item, body, { version: item.version + 1, scoreRevision: 14 })
  return item
})

on('GET', '/selection-summaries', ({ query }) => {
  const rule = selectionRules.find((r) => r.id === query.ruleId) || selectionRules[0]
  const scores = selectionScores.filter((s) => s.ruleId === rule.id)
  const sorted = [...scores].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
  let lastScore: number | null = null
  let lastRank = 0
  const rows: SelectionSummaryRow[] = sorted.map((s, i) => {
    const score = s.totalScore || 0
    const rank = lastScore === score ? lastRank : i + 1
    lastScore = score
    lastRank = rank
    return {
      athleteId: s.athleteId,
      athleteName: s.athleteName,
      teamId: teamMembers.find((m) => m.athleteId === s.athleteId)?.teamId,
      teamName: s.teamName,
      totalScore: score,
      rank,
    }
  })
  return { ruleId: rule.id, round: rule.round, scoreRevision: 12, rows }
})

on('GET', '/selection-summaries/export.xlsx', () => ({ success: true }))

on('POST', '/selection-results/generate', ({ body }) => {
  const rule = selectionRules.find((r) => r.id === body.ruleId)
  if (!rule) throw new MockHttpError(404, 'NOT_FOUND', '评分规则不存在')
  if (!rule.confirmed) throw new MockHttpError(409, 'STATE_CONFLICT', '评分规则尚未确认，不能生成正式结果')
  const scores = selectionScores.filter((s) => s.ruleId === rule.id)
  const sorted = [...scores].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
  const cutoff = sorted[Math.min(rule.topN, sorted.length) - 1]?.totalScore ?? 0
  let lastScore: number | null = null
  let lastRank = 0
  const rows: SelectionSummaryRow[] = sorted
    .filter((s) => (s.totalScore || 0) >= cutoff)
    .map((s, i) => {
      const score = s.totalScore || 0
      const rank = lastScore === score ? lastRank : i + 1
      lastScore = score
      lastRank = rank
      return {
        athleteId: s.athleteId,
        athleteName: s.athleteName,
        teamId: teamMembers.find((m) => m.athleteId === s.athleteId)?.teamId,
        teamName: s.teamName,
        totalScore: score,
        rank,
      }
    })
  const result: SelectionResult = {
    id: nextId('result'),
    eventId: rule.eventId,
    eventName: rule.eventName,
    groupId: rule.groupId,
    groupName: rule.groupName,
    round: rule.round,
    ruleId: rule.id,
    sourceScoreRevision: 12,
    stale: false,
    rows,
    version: 1,
    createdAt: now(),
  }
  selectionResults.unshift(result)
  return result
})

const selectionResults: SelectionResult[] = [
  {
    id: 'result_primary_pre',
    eventId: 'event_primary_2026',
    eventName: events[0].name,
    groupId: 'group_primary_boys',
    groupName: '小学男子组',
    round: 'PRELIMINARY',
    ruleId: 'rule_primary_pre_2026',
    sourceScoreRevision: 12,
    stale: false,
    rows: [],
    version: 1,
    createdAt: '2026-10-17T09:30:00+08:00',
  },
]

function ensureResultRows(result: SelectionResult): SelectionResult {
  if (result.rows.length) return result
  const rule = selectionRules.find((r) => r.id === result.ruleId)
  const scores = selectionScores.filter((s) => s.ruleId === result.ruleId)
  const sorted = [...scores].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
  const cutoff = sorted[Math.min(rule?.topN || 8, sorted.length) - 1]?.totalScore ?? 0
  result.rows = sorted
    .filter((s) => (s.totalScore || 0) >= cutoff)
    .map((s, i) => ({
      athleteId: s.athleteId,
      athleteName: s.athleteName,
      teamId: teamMembers.find((m) => m.athleteId === s.athleteId)?.teamId,
      teamName: s.teamName,
      totalScore: s.totalScore || 0,
      rank: i + 1,
    }))
  return result
}

on('GET', '/selection-results', ({ query }) => {
  let items = selectionResults.map(ensureResultRows)
  if (query.groupId) items = items.filter((r) => r.groupId === query.groupId)
  if (query.round) items = items.filter((r) => r.round === query.round)
  return pageOf(items, query)
})

on('GET', '/selection-results/:id', ({ params }) => {
  const item = selectionResults.find((r) => r.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '遴选结果不存在')
  return ensureResultRows(item)
})

// ---------------------------------------------------------------------------
// 身份核验
// ---------------------------------------------------------------------------

on('GET', '/identity-checks', ({ query }) => {
  let items = identityChecks
  if (query.matchId) items = items.filter((i) => i.matchId === query.matchId)
  if (query.manualStatus) items = items.filter((i) => i.manualStatus === query.manualStatus)
  if (query.machineStatus) items = items.filter((i) => i.machineStatus === query.machineStatus)
  return pageOf(items, query)
})

on('GET', '/identity-checks/:id', ({ params }) => {
  const item = identityChecks.find((i) => i.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '核验记录不存在')
  return item
})

on('POST', '/identity-checks', ({ body }) => {
  const item = {
    id: nextId('idc'),
    matchId: str(body.matchId),
    matchLabel: matches.find((m) => m.id === body.matchId)?.homeTeamName,
    enrollmentId: str(body.enrollmentId),
    athleteId: str(body.athleteId),
    athleteName: persons.find((p) => p.id === body.athleteId)?.realName || '',
    teamName: '',
    mode: body.mode || 'MANUAL',
    machineStatus: body.mode === 'FACE_COMPARE' ? 'MATCH' : 'NOT_RUN',
    machineVerified: body.mode === 'FACE_COMPARE',
    manualStatus: body.mode === 'FACE_COMPARE' ? 'NOT_REVIEWED' : 'PENDING',
    capturedPhotoUrl: '',
    version: 1,
    createdAt: now(),
  }
  identityChecks.unshift(item as never)
  return item
})

on('POST', '/identity-checks/:id/manual-review', ({ params, body }) => {
  const item = identityChecks.find((i) => i.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '核验记录不存在')
  item.manualStatus = body.decision === 'CONFIRM_IDENTITY' ? 'CONFIRMED' : 'REJECTED'
  item.manualReason = body.reason
  item.reviewerName = '当前用户'
  item.reviewedAt = now()
  item.version += 1
  return item
})

// ---------------------------------------------------------------------------
// 公开门户
// ---------------------------------------------------------------------------

on('GET', '/public/contents', ({ query }) => {
  let items = contents.filter((c) => c.status === 'PUBLISHED')
  if (query.contentType) items = items.filter((c) => c.contentType === query.contentType)
  if (query.eventId) items = items.filter((c) => c.eventId === query.eventId)
  if (query.groupId) items = items.filter((c) => c.groupId === query.groupId)
  if (query.keyword) items = items.filter((c) => contains(c.title, str(query.keyword)))
  const mapped = items.map((c) => ({
    id: c.id,
    contentType: c.contentType,
    title: c.title,
    summary: c.summary,
    bodyHtml: c.bodyHtml,
    publicCoverUrl: c.coverUrl,
    eventId: c.eventId,
    groupId: c.groupId,
    publishedAt: c.publishedAt,
    revision: c.revision,
  }))
  return pageOf(mapped, query)
})

on('GET', '/public/contents/:id', ({ params }) => {
  const content = contents.find((c) => c.id === params.id && c.status === 'PUBLISHED')
  if (!content) throw new MockHttpError(404, 'NOT_FOUND', '内容不存在或未发布')
  return {
    id: content.id,
    contentType: content.contentType,
    title: content.title,
    summary: content.summary,
    bodyHtml: content.bodyHtml,
    publicCoverUrl: content.coverUrl,
    eventId: content.eventId,
    groupId: content.groupId,
    publishedAt: content.publishedAt,
    revision: content.revision,
  }
})

on('GET', '/public/resources', ({ query }) => {
  let items = portalResources.filter((r) => r.enabled)
  if (query.resourceType) items = items.filter((r) => r.resourceType === query.resourceType)
  items = [...items].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  return {
    items: items.map((r) => ({
      id: r.id,
      resourceType: r.resourceType,
      title: r.title,
      imageUrl: r.imageUrl,
      targetContentId: r.targetContentId,
      targetUrl: r.targetUrl,
      sortOrder: r.sortOrder,
    })),
  }
})

on('GET', '/public/matches', ({ query }) => {
  let items = matches.filter((m) => m.published)
  if (query.eventId) items = items.filter((m) => m.eventId === query.eventId)
  if (query.status) items = items.filter((m) => m.status === query.status)
  if (query.groupId) items = items.filter((m) => m.groupId === query.groupId)
  if (query.date) items = items.filter((m) => str(m.kickoffAt).startsWith(str(query.date)))
  const mapped = items.map((m) => ({
    id: m.id,
    eventId: m.eventId,
    eventName: m.eventName,
    groupId: m.groupId,
    groupName: m.groupName,
    homeTeamName: m.homeTeamName,
    awayTeamName: m.awayTeamName,
    kickoffAt: m.kickoffAt,
    venue: m.venue,
    status: m.status,
    homeScore: m.homeScore || 0,
    awayScore: m.awayScore || 0,
    scoreRevision: m.scoreRevision,
  }))
  return pageOf(mapped, query)
})

on('GET', '/public/matches/:id', ({ params }) => {
  const match = matches.find((m) => m.id === params.id && m.published)
  if (!match) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在或未发布')
  const group = eventGroups.find((g) => g.id === match.groupId)
  return {
    id: match.id,
    eventId: match.eventId,
    eventName: match.eventName,
    groupId: match.groupId,
    groupName: group?.name,
    homeTeamName: match.homeTeamName,
    awayTeamName: match.awayTeamName,
    kickoffAt: match.kickoffAt,
    venue: match.venue,
    status: match.status,
    homeScore: match.homeScore || 0,
    awayScore: match.awayScore || 0,
    scoreRevision: match.scoreRevision,
    events: matchEvents.filter((e) => e.matchId === match.id),
    referees: match.referees,
  }
})

on('GET', '/public/matches/:id/live-feed', ({ params }) => {
  const items = livePosts
    .filter((p) => p.matchId === params.id)
    .sort((a, b) => (a.cursor || 0) - (b.cursor || 0))
    .map((p) => ({
      id: p.id,
      text: p.text,
      imageUrls: p.imageUrls,
      minute: p.minute,
      updatedAt: p.createdAt,
    }))
  return {
    feedRevision: items.length,
    items,
    deletedIds: [],
    resetRequired: false,
  }
})

on('GET', '/public/matches/:id/live-links', ({ params }) =>
  liveLinks.filter((l) => l.matchId === params.id && l.enabled),
)

on('GET', '/public/statistics/goals', ({ query }) => {
  let items = goalRanking
  if (query.groupCategory) {
    const teamIds = teams.filter((t) => t.category === query.groupCategory).map((t) => t.id)
    items = items.filter((r) => teamIds.includes(r.teamId))
  }
  return { rows: items, generatedAt: now() }
})

on('GET', '/public/publications', ({ query }) => {
  let items = publications.filter((p) => p.active)
  if (query.targetType) items = items.filter((p) => p.targetType === query.targetType)
  if (query.groupName) items = items.filter((p) => contains(p.groupName, str(query.groupName)))
  if (query.cityName) items = items.filter((p) => contains(p.cityName, str(query.cityName)))
  if (query.keyword) items = items.filter((p) => contains(p.targetName, str(query.keyword)) || contains(p.teamName, str(query.keyword)))
  const mapped = items.map((p) => ({
    publicationId: p.id,
    targetType: p.targetType,
    displayName: p.targetName,
    teamName: p.teamName,
    cityName: p.cityName,
    groupName: p.groupName,
    publicPhotoUrl: '',
  }))
  return pageOf(mapped, query)
})

on('POST', '/public/policy-questions', ({ body }) => {
  const question = str(body.question)
  if (/1\d{10}|\d{17}[\dXx]/.test(question)) {
    return {
      status: 'NO_EVIDENCE',
      answer: '问题中包含身份证号或手机号等个人信息，请去除后重新提问。',
      citations: [],
      fallbackPolicies: [],
      aiGenerated: false,
      requestId: `req_${Date.now()}`,
    }
  }
  const policies = contents.filter((c) => c.contentType === 'POLICY' && c.status === 'PUBLISHED')
  let matched = policies.filter((p) => question && (contains(p.title, question) || contains(p.bodyHtml, question)))
  if (!matched.length) {
    if (/报名|材料|盖章|学籍/.test(question)) matched = policies.filter((p) => p.id === 'content_policy_002')
    else if (/年龄|组别|资格/.test(question)) matched = policies.filter((p) => p.id === 'content_policy_003')
    else if (/赛制|规程|名次|奖励/.test(question)) matched = policies.filter((p) => p.id === 'content_policy_001')
    else if (/安全|医疗|天气/.test(question)) matched = policies.filter((p) => p.id === 'content_policy_004')
  }
  if (!matched.length) {
    return {
      status: 'NO_EVIDENCE',
      answer: '未找到与该问题匹配的已发布政策依据。建议查看“政策公告”栏目或联系组委会。',
      citations: [],
      fallbackPolicies: policies.slice(0, 3).map(toCitation),
      aiGenerated: true,
      requestId: `req_${Date.now()}`,
    }
  }
  const citations = matched.slice(0, 3).map(toCitation)
  return {
    status: 'ANSWERED',
    answer: buildAnswer(citations[0]),
    citations,
    fallbackPolicies: [],
    aiGenerated: true,
    requestId: `req_${Date.now()}`,
  }
})

function toCitation(content: (typeof contents)[number]) {
  return {
    contentId: content.id,
    title: content.title,
    revision: content.revision,
    excerpt: content.bodyHtml.replace(/<[^>]+>/g, '').slice(0, 120),
    publicUrl: `/policies/${content.id}`,
  }
}

function buildAnswer(citation: { title: string; excerpt: string }): string {
  return `根据《${citation.title}》：${citation.excerpt}\n\n以上答复依据已发布政策原文生成，具体以正式文件为准。`
}

// ---------------------------------------------------------------------------
// 适配器入口
// ---------------------------------------------------------------------------

function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | undefined {
  for (const route of routes) {
    if (route.method !== method) continue
    const m = route.pattern.exec(path)
    if (!m) continue
    const params: Record<string, string> = {}
    route.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(m[i + 1])
    })
    return { route, params }
  }
  return undefined
}

function resolveConfig(config: AxiosRequestConfig) {
  const method = (config.method || 'get').toUpperCase()
  const path = pathOf(config)
  const query = (config.params || {}) as Record<string, unknown>
  const body = parseBody(config)
  return { method, path, query, body }
}

function toAxiosResponse(config: InternalAxiosRequestConfig, data: unknown): AxiosResponse {
  return {
    data: envelope(data),
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }
}

export const mockAdapter: AxiosAdapter = async (config) => {
  const internal = config as InternalAxiosRequestConfig
  const { method, path, query, body } = resolveConfig(config)
  const matched = matchRoute(method, path)
  if (!matched) {
    const err = new MockHttpError(404, 'NOT_FOUND', `Mock 接口未实现：${method} ${path}`)
    return Promise.reject(makeAxiosError(err, internal))
  }
  try {
    const result = matched.route.handler({ config, params: matched.params, query, body })
    return toAxiosResponse(internal, result)
  } catch (error) {
    if (error instanceof MockHttpError) {
      return Promise.reject(makeAxiosError(error, internal))
    }
    const err = new MockHttpError(500, 'INTERNAL_ERROR', (error as Error).message || 'Mock 处理异常')
    return Promise.reject(makeAxiosError(err, internal))
  }
}

function makeAxiosError(error: MockHttpError, config: InternalAxiosRequestConfig) {
  return {
    isAxiosError: true,
    message: error.message,
    config,
    response: {
      data: {
        code: error.code,
        message: error.message,
        data: error.details,
        requestId: `req_err_${Date.now()}`,
      },
      status: error.status,
      statusText: error.code,
      headers: {},
      config,
    },
  }
}

export { ROLE_LABELS }
