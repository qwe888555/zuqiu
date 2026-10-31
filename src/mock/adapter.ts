﻿import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
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
  reviewRecords,
  rosterItems,
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
  GoalRankingRow,
  Message,
  PageResult,
  Person,
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

/**
 * messages 是共享的 mock 数据，直接改 read 会让切换演示账号时互相污染。
 * 已读操作按账号记在覆盖层里，初始 read 字段仍作为所有账号的默认值。
 */
const messageReadAt = new Map<string, Map<string, string>>()

function messageForAccount(accountId: string, message: Message): Message {
  const readAt = messageReadAt.get(accountId)?.get(message.id)
  // 始终返回副本：前端标记已读时会原地修改 item，不能改到共享的 mock 数据。
  return readAt ? { ...message, read: true, readAt } : { ...message }
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function contains(value: unknown, keyword: string): boolean {
  return str(value).toLowerCase().includes(keyword.toLowerCase())
}

/** 只保留白名单字段，避免 PUT 请求篡改 id/归属/状态等系统字段。 */
function pickFields(body: Record<string, unknown>, fields: readonly string[]): Record<string, any> {
  const result: Record<string, any> = {}
  fields.forEach((field) => {
    if (body[field] !== undefined) result[field] = body[field]
  })
  return result
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

/**
 * 乐观锁版本校验（成员4文档 §6.5）：version = updated_at UTC 微秒派生。
 * PUT/DELETE 必填，缺失/非法 → 400 INVALID_ARGUMENT；不匹配 → 409 VERSION_CONFLICT。
 */
function ensureVersion(current: number, provided: unknown): void {
  if (provided === undefined || provided === null || provided === '') {
    throw new MockHttpError(400, 'INVALID_ARGUMENT', 'version 必填')
  }
  if (Number(provided) !== current) {
    throw new MockHttpError(409, 'VERSION_CONFLICT', '数据已被其他操作更新，请刷新后重试')
  }
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
  let items = messages.map((m) => messageForAccount(account.id, m))
  if (account.roles.includes('TEAM') || account.roles.includes('UNIVERSITY')) {
    items = items.filter(
      (m) =>
        !m.businessType ||
        ['ENROLLMENT', 'REVIEW', 'MATERIAL', 'MATCH', 'PUBLICATION'].includes(m.businessType),
    )
  }
  // 后端使用 read 布尔参数；保留 unreadOnly 兼容旧调用。
  if (query.read !== undefined) {
    const read = str(query.read) === 'true'
    items = items.filter((m) => m.read === read)
  } else if (str(query.unreadOnly) === 'true') {
    items = items.filter((m) => !m.read)
  }
  return pageOf(items, query)
})

on('GET', '/me/messages/:messageId', ({ config, params }) => {
  const account = requireAccount(config)
  const msg = messages.find((m) => m.id === params.messageId)
  if (!msg) throw new MockHttpError(404, 'NOT_FOUND', '消息不存在')
  return messageForAccount(account.id, msg)
})

on('POST', '/me/messages/:messageId/read', ({ config, params }) => {
  const account = requireAccount(config)
  const msg = messages.find((m) => m.id === params.messageId)
  if (!msg) throw new MockHttpError(404, 'NOT_FOUND', '消息不存在')
  const readAt = now()
  const state = messageReadAt.get(account.id) || new Map<string, string>()
  state.set(msg.id, readAt)
  messageReadAt.set(account.id, state)
  return { success: true, id: msg.id, version: msg.version + 1, readAt }
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
  ensureVersion(person.version, body.version)
  Object.assign(person, body, { version: person.version + 1 })
  return person
})

on('GET', '/me/teams', ({ config }) => {
  const account = requireAccount(config)
  // 学校端以学校组织为范围，自动覆盖本校全部分校/校区球队，不依赖 teamIds。
  if (account.roles.includes('UNIVERSITY')) {
    return teams.filter((t) => t.orgId === account.orgId)
  }
  const directIds = account.teamIds || []
  // 合并“归属记录”中已通过核验且当前仍归属的球队，避免账号 teamIds 与归属数据脱节。
  const affiliatedIds = affiliations
    .filter((a) => a.personId === account.personId && a.current && a.verifyStatus === 'VERIFIED')
    .map((a) => a.teamId)
  const teamIds = Array.from(new Set([...directIds, ...affiliatedIds]))
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

on('POST', '/accounts/registration-invitations', ({ body }) => {
  const org = organizations.find((item) => item.id === str(body.orgId))
  if (!org) throw new MockHttpError(404, 'NOT_FOUND', '组织不存在')
  if (!['SCHOOL', 'UNIVERSITY', 'TEAM'].includes(org.orgType)) {
    throw new MockHttpError(400, 'INVALID_ARGUMENT', '邀请只能挂学校或球队组织')
  }
  const person = persons.find((item) => item.id === str(body.personId))
  if (person?.schoolOrgId && org.orgType !== 'TEAM' && person.schoolOrgId !== org.id) {
    throw new MockHttpError(422, 'BUSINESS_VALIDATION_FAILED', '人员所属学校与邀请组织不一致')
  }
  return {
    registrationToken: `invite_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  }
})

on('POST', '/accounts/registration-invitations/batch', () => {
  const token = `invite_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString()
  const rows = [
    {
      rowNo: 2,
      realName: '张子轩',
      maskedIdNumber: '510101********1234',
      kind: 'ATHLETE',
      orgCode: 'CD-SYXX',
      status: 'OK',
      registrationToken: token,
      expiresAt,
    },
    {
      rowNo: 3,
      realName: '未建档人员',
      kind: 'ATHLETE',
      orgCode: 'CD-SYXX',
      status: 'FAILED',
      error: '未找到人员档案',
      code: 'INVALID_ARGUMENT',
      fieldErrors: [{ field: 'idNumber', reason: '请先在人员管理中建档后再发账号' }],
    },
    {
      rowNo: 4,
      realName: '重复人员',
      kind: 'ATHLETE',
      orgCode: 'CD-SYXX',
      status: 'FAILED',
      error: '名单内身份证号重复（与第 2 行相同）',
      code: 'DUPLICATE_RESOURCE',
      fieldErrors: [{ field: 'idNumber', reason: '名单内重复' }],
    },
    {
      rowNo: 5,
      realName: '姓名不符',
      kind: 'COACH',
      orgCode: 'CD-QZYC',
      status: 'FAILED',
      error: '姓名与人员档案不一致',
      code: 'INVALID_ARGUMENT',
      fieldErrors: [{ field: 'realName', reason: '与身份证匹配到的档案姓名不符' }],
    },
    {
      rowNo: 6,
      realName: '跨范围人员',
      kind: 'ATHLETE',
      orgCode: 'MY-NSZX',
      status: 'FAILED',
      error: '人员不在当前账号数据范围内',
      code: 'DATA_SCOPE_DENIED',
      fieldErrors: [{ field: 'idNumber', reason: '所属学校超出当前账号范围' }],
    },
    {
      rowNo: 7,
      realName: '省节点人员',
      kind: 'ATHLETE',
      orgCode: 'CD',
      status: 'FAILED',
      error: '邀请只能挂学校或球队组织',
      code: 'INVALID_ARGUMENT',
      fieldErrors: [{ field: 'orgCode', reason: '不可挂省/市州节点' }],
    },
  ]
  const successCount = rows.filter((row) => row.status === 'OK').length
  return {
    total: rows.length,
    successCount,
    failureCount: rows.length - successCount,
    rows,
  }
})

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

on('GET', '/dictionary-items/:id', ({ params }) => {
  const item = dictionaries.find((d) => d.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '字典项不存在')
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

// ---------------------------------------------------------------------------
// 成员4 基础数据域（/base-data）：区划 / 学校 / 字典类型 / 字典项（21 条）
// 依据：成员4接口文档 §1.2-§1.6。删除为「停用」（is_active=false）；无独立 version 列。
// ---------------------------------------------------------------------------

const regions: Array<{
  id: string
  name: string
  code: string
  level: 1 | 2 | 3
  parentId?: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}> = [
  { id: 'region_sc', name: '四川省', code: '510000', level: 1, sortOrder: 1, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'region_cd', name: '成都市', code: '510100', level: 2, parentId: 'region_sc', sortOrder: 1, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'region_my', name: '绵阳市', code: '510700', level: 2, parentId: 'region_sc', sortOrder: 2, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'region_dy', name: '德阳市', code: '510600', level: 2, parentId: 'region_sc', sortOrder: 3, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'region_cd_wuhou', name: '武侯区', code: '510107', level: 3, parentId: 'region_cd', sortOrder: 1, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'region_cd_jinjiang', name: '锦江区', code: '510104', level: 3, parentId: 'region_cd', sortOrder: 2, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
]

const schools: Array<{
  id: string
  name: string
  code?: string
  schoolType: string
  regionId: string
  address?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}> = [
  { id: 'school_cd_sy', name: '成都市实验小学', code: 'CD-SYXX', schoolType: 'PRIMARY', regionId: 'region_cd', address: '成都市青羊区', isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'school_cd_qz', name: '成都七中育才学校', code: 'CD-QZYC', schoolType: 'JUNIOR', regionId: 'region_cd', address: '成都市锦江区', isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'school_my_ns', name: '绵阳南山中学', code: 'MY-NSZX', schoolType: 'SENIOR', regionId: 'region_my', address: '绵阳市涪城区', isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
]

const dictTypes: Array<{
  id: string
  code: string
  name: string
  remark?: string
  createdAt: string
  updatedAt: string
}> = [
  { id: 'dt_team_category', code: 'team_category', name: '球队组别', remark: '球队所属学段组别', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'dt_position', code: 'position', name: '场上位置', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'dt_coach_level', code: 'coach_level', name: '教练等级', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'dt_coach_category', code: 'coach_category', name: '教练类别', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'dt_guardian_relation', code: 'guardian_relation', name: '监护人关系', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'dt_school_type', code: 'school_type', name: '学校类别', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
]

const dictItems: Array<{
  id: string
  typeId: string
  value: string
  label: string
  sortOrder: number
  isActive: boolean
  extJson?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}> = [
  { id: 'di_tc_primary', typeId: 'dt_team_category', value: 'PRIMARY', label: '小学组', sortOrder: 1, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'di_tc_middle', typeId: 'dt_team_category', value: 'MIDDLE', label: '中学组', sortOrder: 2, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'di_pos_gk', typeId: 'dt_position', value: 'GK', label: '守门员', sortOrder: 1, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'di_pos_df', typeId: 'dt_position', value: 'DF', label: '后卫', sortOrder: 2, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'di_pos_mf', typeId: 'dt_position', value: 'MF', label: '中场', sortOrder: 3, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'di_pos_fw', typeId: 'dt_position', value: 'FW', label: '前锋', sortOrder: 4, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'di_st_primary', typeId: 'dt_school_type', value: 'PRIMARY', label: '小学', sortOrder: 1, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'di_st_junior', typeId: 'dt_school_type', value: 'JUNIOR', label: '初中', sortOrder: 2, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'di_st_senior', typeId: 'dt_school_type', value: 'SENIOR', label: '高中', sortOrder: 3, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'di_cc_head', typeId: 'dt_coach_category', value: 'HEAD_COACH', label: '主教练', sortOrder: 1, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'di_cc_assistant', typeId: 'dt_coach_category', value: 'ASSISTANT_COACH', label: '助理教练', sortOrder: 2, isActive: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
]

function withRegionName<T extends { regionId: string }>(item: T): T & { regionName?: string } {
  const region = regions.find((r) => r.id === item.regionId)
  return { ...item, regionName: region?.name }
}

function withTypeCode<T extends { typeId: string }>(item: T): T & { typeCode?: string } {
  const dt = dictTypes.find((d) => d.id === item.typeId)
  return { ...item, typeCode: dt?.code }
}

// --- 区划 Region ---

on('GET', '/base-data/regions', ({ query }) => {
  let items = [...regions]
  if (query.level !== undefined) items = items.filter((r) => r.level === Number(query.level))
  if (query.parentId) items = items.filter((r) => r.parentId === str(query.parentId))
  if (query.keyword) items = items.filter((r) => contains(r.name, str(query.keyword)) || contains(r.code, str(query.keyword)))
  if (query.isActive !== undefined) items = items.filter((r) => r.isActive === Boolean(query.isActive))
  items.sort((a, b) => a.level - b.level || a.sortOrder - b.sortOrder || a.code.localeCompare(b.code) || a.id.localeCompare(b.id))
  return pageOf(items, query)
})

on('POST', '/base-data/regions', ({ body }) => {
  const level = Number(body.level) as 1 | 2 | 3
  if (![1, 2, 3].includes(level)) throw new MockHttpError(400, 'INVALID_ARGUMENT', 'level 必须为 1-3')
  const code = str(body.code)
  if (regions.some((r) => r.code === code)) throw new MockHttpError(409, 'DUPLICATE_RESOURCE', '区划编码已存在')
  // 层级校验
  if (level === 1 && body.parentId) throw new MockHttpError(400, 'INVALID_ARGUMENT', '省级区划不得设置上级')
  if (level > 1) {
    if (!body.parentId) throw new MockHttpError(400, 'INVALID_ARGUMENT', '非省级区划必须设置上级')
    const parent = regions.find((r) => r.id === str(body.parentId))
    if (!parent) throw new MockHttpError(400, 'INVALID_ARGUMENT', '上级区划不存在')
    if (parent.level !== level - 1) throw new MockHttpError(400, 'INVALID_ARGUMENT', '上级区划层级必须为 level-1')
    if (!parent.isActive) throw new MockHttpError(400, 'INVALID_ARGUMENT', '上级区划已停用')
  }
  const item = {
    id: nextId('region'),
    name: str(body.name),
    code,
    level,
    parentId: body.parentId ? str(body.parentId) : undefined,
    sortOrder: Number(body.sortOrder) || 0,
    isActive: body.isActive !== false,
    createdAt: now(),
    updatedAt: now(),
  }
  regions.push(item)
  return item
})

on('GET', '/base-data/regions/:id', ({ params }) => {
  const item = regions.find((r) => r.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '区划不存在')
  return item
})

on('PUT', '/base-data/regions/:id', ({ params, body }) => {
  const item = regions.find((r) => r.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '区划不存在')
  if (body.parentId && body.parentId === params.id) throw new MockHttpError(400, 'INVALID_ARGUMENT', '上级区划不能为自身')
  if (body.parentId) {
    const parent = regions.find((r) => r.id === str(body.parentId))
    if (parent && !parent.isActive) throw new MockHttpError(400, 'INVALID_ARGUMENT', '上级区划已停用')
  }
  // code/level 禁改，只更新 name/parentId
  item.name = str(body.name) || item.name
  if (body.parentId !== undefined) item.parentId = body.parentId ? str(body.parentId) : undefined
  item.updatedAt = now()
  return item
})

on('DELETE', '/base-data/regions/:id', ({ params }) => {
  const item = regions.find((r) => r.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '区划不存在')
  const hasActiveChildren = regions.some((r) => r.parentId === params.id && r.isActive)
  if (hasActiveChildren) throw new MockHttpError(409, 'STATE_CONFLICT', '该区划存在启用的下级，请先停用下级')
  item.isActive = false
  item.updatedAt = now()
  return { success: true, id: item.id }
})

// --- 学校 School ---

on('GET', '/base-data/schools', ({ query }) => {
  let items = [...schools]
  if (query.regionId) items = items.filter((s) => s.regionId === str(query.regionId))
  if (query.schoolType) items = items.filter((s) => s.schoolType === str(query.schoolType))
  if (query.keyword) items = items.filter((s) => contains(s.name, str(query.keyword)) || contains(s.code || '', str(query.keyword)))
  if (query.isActive !== undefined) items = items.filter((s) => s.isActive === Boolean(query.isActive))
  items.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  return pageOf(items.map(withRegionName), query)
})

on('POST', '/base-data/schools', ({ body }) => {
  const region = regions.find((r) => r.id === str(body.regionId))
  if (!region || !region.isActive) throw new MockHttpError(400, 'INVALID_ARGUMENT', '所属区划不存在或已停用')
  const code = body.code ? str(body.code) : undefined
  if (code && schools.some((s) => s.code === code)) throw new MockHttpError(409, 'DUPLICATE_RESOURCE', '学校标识码已存在')
  if (schools.some((s) => s.name === str(body.name) && s.regionId === str(body.regionId) && s.isActive)) {
    throw new MockHttpError(409, 'DUPLICATE_RESOURCE', '同一区划下已存在同名学校')
  }
  const item = {
    id: nextId('school'),
    name: str(body.name),
    code,
    schoolType: str(body.schoolType),
    regionId: str(body.regionId),
    address: body.address ? str(body.address) : undefined,
    isActive: body.isActive !== false,
    createdAt: now(),
    updatedAt: now(),
  }
  schools.push(item)
  return withRegionName(item)
})

on('GET', '/base-data/schools/:id', ({ params }) => {
  const item = schools.find((s) => s.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '学校不存在')
  return withRegionName(item)
})

on('PUT', '/base-data/schools/:id', ({ params, body }) => {
  const item = schools.find((s) => s.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '学校不存在')
  const code = body.code !== undefined ? (body.code ? str(body.code) : undefined) : item.code
  if (code && schools.some((s) => s.id !== params.id && s.code === code)) {
    throw new MockHttpError(409, 'DUPLICATE_RESOURCE', '学校标识码已存在')
  }
  if (schools.some((s) => s.id !== params.id && s.name === str(body.name) && s.regionId === str(body.regionId) && s.isActive)) {
    throw new MockHttpError(409, 'DUPLICATE_RESOURCE', '同一区划下已存在同名学校')
  }
  Object.assign(item, {
    name: str(body.name),
    code,
    schoolType: str(body.schoolType),
    regionId: str(body.regionId),
    address: body.address !== undefined ? (body.address ? str(body.address) : undefined) : item.address,
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : item.isActive,
    updatedAt: now(),
  })
  return withRegionName(item)
})

on('DELETE', '/base-data/schools/:id', ({ params }) => {
  const item = schools.find((s) => s.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '学校不存在')
  item.isActive = false
  item.updatedAt = now()
  return { success: true, id: item.id }
})

// --- 字典类型 DictType ---

on('GET', '/base-data/dict-types', ({ query }) => {
  let items = [...dictTypes]
  if (query.keyword) items = items.filter((d) => contains(d.code, str(query.keyword)) || contains(d.name, str(query.keyword)))
  items.sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id))
  return pageOf(items, query)
})

on('POST', '/base-data/dict-types', ({ body }) => {
  const code = str(body.code)
  if (dictTypes.some((d) => d.code === code)) throw new MockHttpError(409, 'DUPLICATE_RESOURCE', '字典类型编码已存在')
  const item = {
    id: nextId('dt'),
    code,
    name: str(body.name),
    remark: body.remark ? str(body.remark) : undefined,
    createdAt: now(),
    updatedAt: now(),
  }
  dictTypes.push(item)
  return item
})

on('GET', '/base-data/dict-types/:id', ({ params }) => {
  const item = dictTypes.find((d) => d.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '字典类型不存在')
  return item
})

on('PUT', '/base-data/dict-types/:id', ({ params, body }) => {
  const item = dictTypes.find((d) => d.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '字典类型不存在')
  // code 禁改，只更新 name/remark
  item.name = str(body.name) || item.name
  if (body.remark !== undefined) item.remark = body.remark ? str(body.remark) : undefined
  item.updatedAt = now()
  return item
})

on('DELETE', '/base-data/dict-types/:id', ({ params }) => {
  const idx = dictTypes.findIndex((d) => d.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '字典类型不存在')
  if (dictItems.some((i) => i.typeId === params.id)) {
    throw new MockHttpError(409, 'STATE_CONFLICT', '该字典类型下存在字典项，请先处理字典项')
  }
  const [removed] = dictTypes.splice(idx, 1)
  return { success: true, id: removed.id }
})

// 注意：此路由须注册在 /base-data/dict-types/:id 之后，避免被 :id 匹配拦截。
on('GET', '/base-data/dict-types/:typeCode/options', ({ params }) => {
  const type = dictTypes.find((d) => d.code === params.typeCode)
  if (!type) return []
  return dictItems
    .filter((i) => i.typeId === type.id && i.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value) || a.id.localeCompare(b.id))
    .map((i) => ({ value: i.value, label: i.label }))
})

// --- 字典项 DictItem ---

on('GET', '/base-data/dict-items', ({ query }) => {
  let items = [...dictItems]
  if (query.typeCode) {
    const type = dictTypes.find((d) => d.code === str(query.typeCode))
    items = type ? items.filter((i) => i.typeId === type.id) : []
  }
  if (query.keyword) items = items.filter((i) => contains(i.label, str(query.keyword)) || contains(i.value, str(query.keyword)))
  if (query.isActive !== undefined) items = items.filter((i) => i.isActive === Boolean(query.isActive))
  items.sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value) || a.id.localeCompare(b.id))
  return pageOf(items.map(withTypeCode), query)
})

on('POST', '/base-data/dict-items', ({ body }) => {
  const type = dictTypes.find((d) => d.code === str(body.typeCode))
  if (!type) throw new MockHttpError(400, 'INVALID_ARGUMENT', '字典类型不存在')
  const value = str(body.value)
  if (dictItems.some((i) => i.typeId === type.id && i.value === value)) {
    throw new MockHttpError(409, 'DUPLICATE_RESOURCE', '同类型下字典项值已存在')
  }
  const item = {
    id: nextId('di'),
    typeId: type.id,
    value,
    label: str(body.label),
    sortOrder: Number(body.sortOrder) || 0,
    isActive: body.isActive !== false,
    extJson: body.extJson && typeof body.extJson === 'object' ? body.extJson : undefined,
    createdAt: now(),
    updatedAt: now(),
  }
  dictItems.push(item)
  return withTypeCode(item)
})

on('GET', '/base-data/dict-items/:id', ({ params }) => {
  const item = dictItems.find((i) => i.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '字典项不存在')
  return withTypeCode(item)
})

on('PUT', '/base-data/dict-items/:id', ({ params, body }) => {
  const item = dictItems.find((i) => i.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '字典项不存在')
  // value/type 禁改；PUT 全量替换，extJson 未传视为清空
  item.label = str(body.label) || item.label
  if (body.sortOrder !== undefined) item.sortOrder = Number(body.sortOrder) || 0
  if (body.isActive !== undefined) item.isActive = Boolean(body.isActive)
  item.extJson = body.extJson && typeof body.extJson === 'object' ? body.extJson : undefined
  item.updatedAt = now()
  return withTypeCode(item)
})

on('DELETE', '/base-data/dict-items/:id', ({ params }) => {
  const item = dictItems.find((i) => i.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '字典项不存在')
  item.isActive = false
  item.updatedAt = now()
  return { success: true, id: item.id }
})

/** 健康检查：成员2 文档定义为公开接口，返回服务存活状态。 */
on('GET', '/health', () => ({ status: 'UP' }))

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
  if (!files.length) throw new MockHttpError(400, 'VALIDATION_ERROR', '请至少选择一个文件')
  if (files.length > 20) throw new MockHttpError(400, 'VALIDATION_ERROR', '单次批量上传不超过 20 个文件')
  return files.map((f: unknown) => makeFileRecord(f, config))
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

on('GET', '/files/:id/content', () => ({ success: true }))

on('GET', '/files/:id/thumbnail', ({ params }) => ({
  url: `https://picsum.photos/seed/${encodeURIComponent(params.id)}/320/200`,
}))

/** 签发短期展示地址：供 <img> 等无法携带 Authorization 头的场景使用（成员4文档 §10.4）。 */
on('GET', '/files/:id/signed-url', ({ params }) => {
  const expiresAt = new Date(Date.now() + 300 * 1000).toISOString()
  return {
    url: `/api/v1/public/files/${params.id}/content?exp=${encodeURIComponent(expiresAt)}&sign=mock_sig_${params.id}`,
    expiresAt,
    variant: 'content',
  }
})

/** 免认证签名读取（auth=None）：mock 直接返回占位内容，真实后端走 HMAC 验签。 */
on('GET', '/public/files/:id/content', () => ({ success: true }))

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
  if (account.roles.includes('UNIVERSITY')) {
    return items.filter((p) => p.schoolOrgId === account.orgId)
  }
  if (account.roles.includes('TEAM')) {
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
  ensureVersion(person.version, body.version)
  Object.assign(person, body, { version: person.version + 1 })
  if (body.avatarFileId) {
    person.avatarUrl = `https://picsum.photos/seed/${encodeURIComponent(str(body.avatarFileId))}/300/300`
  }
  return person
})

on('DELETE', '/people/:id', ({ params, query }) => {
  const idx = persons.findIndex((p) => p.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '人员档案不存在')
  ensureVersion(persons[idx].version, query.version)
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
    COMPETITION: '参赛记录',
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
  ensureVersion(item.version, body.version)
  Object.assign(item, body, { version: item.version + 1 })
  return item
})

on('DELETE', '/materials/:id', ({ params, query }) => {
  const idx = materials.findIndex((m) => m.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '材料不存在')
  ensureVersion(materials[idx].version, query.version)
  materials.splice(idx, 1)
  return { success: true }
})

on('POST', '/materials/:id/review', ({ params, body }) => {
  const item = materials.find((m) => m.id === params.id)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '材料不存在')
  ensureVersion(item.version, body.version)
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
  if (account.roles.includes('UNIVERSITY')) return items.filter((t) => t.orgId === account.orgId)
  if (account.roles.includes('TEAM')) {
    const teamIds = account.teamIds || []
    return teamIds.length ? items.filter((t) => teamIds.includes(t.id)) : []
  }
  return []
}

on('GET', '/teams', ({ config, query }) => {
  let items = scopeTeams(config, teams)
  if (query.cityOrgId) items = items.filter((t) => t.cityOrgId === query.cityOrgId)
  if (query.category) items = items.filter((t) => t.category === query.category)
  if (query.keyword) items = items.filter((t) => contains(t.name, str(query.keyword)) || contains(t.schoolName, str(query.keyword)))
  return pageOf(items, query)
})

on('POST', '/teams', ({ body, config }) => {
  const account = requireAccount(config)
  const isUniversity = account.roles.includes('UNIVERSITY')
  if (!isUniversity && !account.roles.includes('ADMIN')) {
    throw new MockHttpError(403, 'FORBIDDEN', '仅学校端可新建球队')
  }
  if (!str(body.name).trim()) throw new MockHttpError(400, 'VALIDATION_ERROR', '请填写球队名称')
  // 学校账号只能为自身学校建队，忽略前端传入的其他学校归属。
  const schoolOrgId = isUniversity ? account.orgId : str(body.schoolOrgId || body.orgId)
  const schoolOrg = organizations.find((o) => o.id === schoolOrgId && o.orgType === 'SCHOOL')
  if (!schoolOrg) throw new MockHttpError(400, 'VALIDATION_ERROR', '学校组织不存在')
  const gender = ['MALE', 'FEMALE', 'MIXED'].includes(str(body.gender)) ? str(body.gender) : 'MALE'
  // 学校端新建球队时未传市州，优先沿用同校已有球队的市州，否则取学校组织的上级市州。
  const sibling = teams.find((team) => team.orgId === schoolOrgId && team.cityOrgId)
  const cityOrgId = body.cityOrgId || sibling?.cityOrgId || schoolOrg.parentId
  const cityOrg = organizations.find((o) => o.id === cityOrgId)
  const team: Team = {
    id: nextId('team'),
    name: str(body.name).trim(),
    shortName: str(body.shortName),
    orgId: schoolOrgId,
    cityOrgId,
    cityName: sibling?.cityName || cityOrg?.name,
    category: body.groupCategory || body.category,
    schoolName: schoolOrg.name,
    campusName: str(body.campusName) || undefined,
    gender: gender as Team['gender'],
    coachName: body.coachName,
    intro: body.intro,
    memberCount: 0,
    // 学校是报名责任主体，新建球队直接认证，避免因缺少球队审核流程而无法报名。
    status: 'APPROVED',
    version: 1,
    createdAt: now(),
  }
  teams.unshift(team)
  // 学校端新建的球队自动纳入本校账号的数据范围；球队端不持有新建权限。
  if (isUniversity && schoolOrgId === account.orgId) {
    account.teamIds = [...(account.teamIds || []), team.id]
  }
  return team
})

on('GET', '/teams/:id', ({ params }) => {
  const team = teams.find((t) => t.id === params.id)
  if (!team) throw new MockHttpError(404, 'NOT_FOUND', '球队不存在')
  return team
})

on('PUT', '/teams/:id', ({ params, body, config }) => {
  const account = requireAccount(config)
  const team = teams.find((t) => t.id === params.id)
  if (!team) throw new MockHttpError(404, 'NOT_FOUND', '球队不存在')
  ensureVersion(team.version, body.version)
  if (!account.roles.includes('ADMIN')) {
    if (!account.roles.includes('UNIVERSITY') || team.orgId !== account.orgId) {
      throw new MockHttpError(403, 'FORBIDDEN', '仅可维护本校球队')
    }
  }
  const patch = pickFields(body, ['name', 'shortName', 'category', 'campusName', 'gender', 'coachName', 'intro', 'flagUrl', 'emblemUrl', 'groupPhotoUrl'])
  if (patch.gender && !['MALE', 'FEMALE', 'MIXED'].includes(str(patch.gender))) delete patch.gender
  Object.assign(team, patch, { version: team.version + 1 })
  return team
})

on('DELETE', '/teams/:id', ({ params }) => {
  const idx = teams.findIndex((t) => t.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '球队不存在')
  teams.splice(idx, 1)
  return { success: true }
})

on('GET', '/teams/:id/members', ({ params, query }) => {
  let items = teamMembers.filter((m) => m.teamId === params.id).map((m) => {
    const person = persons.find((p) => p.id === m.athleteId)
    return {
      ...m,
      athleteName: person?.realName || m.athleteName,
      maskedIdNumber: person?.maskedIdNumber || m.maskedIdNumber,
      avatarFileId: person?.avatarFileId || m.avatarFileId,
      photoUrl: person?.avatarUrl || m.photoUrl || '',
    }
  })
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
    avatarFileId: person?.avatarFileId,
    photoUrl: person?.avatarUrl || '',
    effectiveFrom: body.effectiveFrom || now().slice(0, 10),
    active: true,
    status: 'CURRENT' as const,
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
  ensureVersion(item.version, body.version)
  Object.assign(item, body, { version: item.version + 1 })
  return item
})

on('DELETE', '/teams/:id/members/:memberId', ({ params, query }) => {
  const idx = teamMembers.findIndex((m) => m.id === params.memberId)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '球队成员不存在')
  ensureVersion(teamMembers[idx].version, query.version)
  teamMembers.splice(idx, 1)
  return { success: true }
})

on('GET', '/teams/:id/coaches', ({ params, query }) => {
  let items = teamCoaches.filter((c) => c.teamId === params.id)
  if (query.reviewStatus) items = items.filter((c) => c.reviewStatus === query.reviewStatus)
  if (query.category) items = items.filter((c) => c.category === query.category)
  return pageOf(items, query)
})

on('POST', '/teams/:id/coaches', ({ params, body }) => {
  const person = persons.find((p) => p.id === body.coachId)
  const coach = {
    id: nextId('tc'),
    teamId: params.id,
    coachId: str(body.coachId),
    coachName: person?.realName || str(body.coachName),
    category: body.category || 'HEAD_COACH',
    effectiveFrom: body.effectiveFrom || now().slice(0, 10),
    effectiveTo: body.effectiveTo,
    maskedPhone: person?.maskedPhone,
    reviewStatus: 'PENDING' as const,
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
  // 列表筛选统一使用 name；兼容旧调用方仍传 keyword 的情况。
  const name = str(query.name) || str(query.keyword)
  if (name) items = items.filter((e) => contains(e.name, name))
  if (query.eventCategory) {
    items = items.filter((e) => e.eventCategory === query.eventCategory)
  }
  return pageOf(items, query)
})

// ---------------------------------------------------------------------------
// 报名合规规则（学校为报送主体，分校共享学校名额）
// ---------------------------------------------------------------------------

const QUOTA_OCCUPYING_STATUSES: Enrollment['status'][] = ['DRAFT', 'PENDING_CITY_REVIEW', 'PENDING_PROVINCE_REVIEW', 'APPROVED']
const MIN_ENROLLMENT_PLAYERS = 11
const MATERIAL_LABELS: Record<string, string> = {
  STAMPED_FORM: '加盖学校公章的报名表',
  STUDENT_STATUS: '学籍验证材料',
}

function isQuotaOccupying(e: Enrollment): boolean {
  return QUOTA_OCCUPYING_STATUSES.includes(e.status)
}

function schoolOrgIdOfTeam(team?: Team): string | undefined {
  return team?.orgId
}

function schoolOrgIdOfEnrollment(e: Enrollment): string | undefined {
  return e.schoolOrgId || schoolOrgIdOfTeam(teams.find((t) => t.id === e.teamId))
}

function attachmentsOf(enrollmentId: string) {
  return enrollmentAttachments.filter((a) => a.id.startsWith(`att_${enrollmentId}_`))
}

function rosterOf(enrollmentId: string) {
  return rosterItems.filter((r) => r.id.startsWith(`roster_${enrollmentId}_`))
}

function syncPlayerCount(enrollment: Enrollment) {
  enrollment.playerCount = rosterOf(enrollment.id).length
}

function isRegistrationOpen(event?: { status?: string; registrationOpensAt?: string; registrationClosesAt?: string }): boolean {
  if (!event || event.status !== 'REGISTRATION_OPEN') return false
  const current = Date.now()
  const opens = event.registrationOpensAt ? Date.parse(event.registrationOpensAt) : NaN
  const closes = event.registrationClosesAt ? Date.parse(event.registrationClosesAt) : NaN
  if (!Number.isNaN(opens) && current < opens) return false
  if (!Number.isNaN(closes) && current > closes) return false
  return true
}

function assertRegistrationOpen(event: { status?: string; registrationOpensAt?: string; registrationClosesAt?: string }) {
  if (!isRegistrationOpen(event)) {
    throw new MockHttpError(409, 'REGISTRATION_CLOSED', '当前不在赛事报名时间内，无法新建或提交报名')
  }
}

function assertGroupBelongsToEvent(groupId: string, eventId: string) {
  const group = eventGroups.find((g) => g.id === groupId)
  if (!group) throw new MockHttpError(400, 'GROUP_NOT_FOUND', '组别不存在')
  if (group.eventId !== eventId) throw new MockHttpError(400, 'GROUP_MISMATCH', '所选组别不属于该赛事')
  return group
}

function assertTeamEligibleForGroup(team: Team | undefined, group: typeof eventGroups[number]) {
  if (!team) throw new MockHttpError(400, 'TEAM_NOT_FOUND', '参赛球队不存在')
  if (team.status === 'PENDING') throw new MockHttpError(409, 'TEAM_PENDING', '球队尚未完成认证，暂不能报名')
  if (team.category && team.category !== group.category) {
    throw new MockHttpError(409, 'CATEGORY_MISMATCH', `球队学段与「${group.name}」不一致`)
  }
  if (group.gender !== 'MIXED' && team.gender && team.gender !== group.gender) {
    throw new MockHttpError(409, 'GENDER_MISMATCH', `球队性别与「${group.name}」不一致`)
  }
}

function quotaUsage(groupId: string, schoolOrgId?: string, excludeId?: string) {
  const active = enrollments.filter((e) => e.groupId === groupId && e.id !== excludeId && isQuotaOccupying(e))
  return {
    total: active.length,
    school: schoolOrgId ? active.filter((e) => schoolOrgIdOfEnrollment(e) === schoolOrgId).length : 0,
  }
}

function assertQuotaAvailable(group: typeof eventGroups[number], schoolOrgId: string, excludeId?: string) {
  const usage = quotaUsage(group.id, schoolOrgId, excludeId)
  if (group.quota && group.quota > 0 && usage.total + 1 > group.quota) {
    throw new MockHttpError(409, 'GROUP_QUOTA_FULL', `「${group.name}」总名额已满，无法继续报名`)
  }
  const schoolLimit = group.schoolQuota ?? 1
  if (schoolLimit > 0 && usage.school + 1 > schoolLimit) {
    throw new MockHttpError(409, 'SCHOOL_QUOTA_FULL', `本校在「${group.name}」最多可报 ${schoolLimit} 支球队，名额已用完`)
  }
  return usage
}

function assertNoDuplicateEnrollment(teamId: string, groupId: string, excludeId?: string) {
  const duplicate = enrollments.find(
    (e) => e.teamId === teamId && e.groupId === groupId && e.id !== excludeId && e.status !== 'WITHDRAWN',
  )
  if (duplicate) {
    throw new MockHttpError(409, 'DUPLICATE_ENROLLMENT', `该球队在「${duplicate.groupName}」已有报名单，请编辑原报名单后提交`)
  }
}

function groupView(group: typeof eventGroups[number], config: AxiosRequestConfig) {
  const account = accountFrom(config)
  const schoolOrgId = account?.roles.includes('UNIVERSITY') ? account.orgId : undefined
  const usage = quotaUsage(group.id, schoolOrgId)
  return {
    ...group,
    schoolQuota: group.schoolQuota ?? 1,
    totalUsed: usage.total,
    schoolUsed: usage.school,
    teamCount: usage.total,
  }
}

function collectEnrollmentIssues(enrollment: Enrollment) {
  const issues: Array<{ code: string; field?: string; message: string; severity: 'ERROR' | 'WARNING' }> = []
  const event = events.find((item) => item.id === enrollment.eventId)
  const group = eventGroups.find((item) => item.id === enrollment.groupId)
  const team = teams.find((item) => item.id === enrollment.teamId)

  if (!event) {
    issues.push({ code: 'EVENT_NOT_FOUND', field: 'eventId', message: '赛事不存在', severity: 'ERROR' })
  } else if (!isRegistrationOpen(event)) {
    issues.push({ code: 'REGISTRATION_CLOSED', field: 'eventId', message: '当前不在赛事报名时间内', severity: 'ERROR' })
  }
  if (!group) {
    issues.push({ code: 'GROUP_NOT_FOUND', field: 'groupId', message: '组别不存在', severity: 'ERROR' })
  } else if (group.eventId !== enrollment.eventId) {
    issues.push({ code: 'GROUP_MISMATCH', field: 'groupId', message: '组别不属于该赛事', severity: 'ERROR' })
  }
  if (!team) {
    issues.push({ code: 'TEAM_NOT_FOUND', field: 'teamId', message: '参赛球队不存在', severity: 'ERROR' })
  } else {
    if (team.status === 'PENDING') {
      issues.push({ code: 'TEAM_PENDING', field: 'teamId', message: '球队尚未完成认证', severity: 'ERROR' })
    }
    if (group && team.category && team.category !== group.category) {
      issues.push({ code: 'CATEGORY_MISMATCH', field: 'teamId', message: `球队学段与「${group.name}」不一致`, severity: 'ERROR' })
    }
    if (group && group.gender !== 'MIXED' && team.gender && team.gender !== group.gender) {
      issues.push({ code: 'GENDER_MISMATCH', field: 'teamId', message: `球队性别与「${group.name}」不一致`, severity: 'ERROR' })
    }
  }

  const duplicate = enrollments.find(
    (e) => e.teamId === enrollment.teamId && e.groupId === enrollment.groupId && e.id !== enrollment.id && e.status !== 'WITHDRAWN',
  )
  if (duplicate) {
    issues.push({ code: 'DUPLICATE_ENROLLMENT', field: 'teamId', message: '该球队在此组别已有报名单，请编辑原单', severity: 'ERROR' })
  }

  if (group) {
    const usage = quotaUsage(group.id, schoolOrgIdOfEnrollment(enrollment), enrollment.id)
    if (group.quota && group.quota > 0 && usage.total + 1 > group.quota) {
      issues.push({ code: 'GROUP_QUOTA_FULL', field: 'groupId', message: `「${group.name}」总名额已满`, severity: 'ERROR' })
    }
    const schoolLimit = group.schoolQuota ?? 1
    if (schoolLimit > 0 && usage.school + 1 > schoolLimit) {
      issues.push({ code: 'SCHOOL_QUOTA_FULL', field: 'groupId', message: `本校在「${group.name}」最多可报 ${schoolLimit} 支球队`, severity: 'ERROR' })
    }
    const attachments = attachmentsOf(enrollment.id)
    group.requiredMaterialTypes.forEach((type) => {
      if (!attachments.some((a) => a.materialType === type)) {
        issues.push({
          code: 'MISSING_MATERIAL',
          field: type,
          message: `缺少必备材料：${MATERIAL_LABELS[type] || type}`,
          severity: 'ERROR',
        })
      }
    })
    if ((enrollment.playerCount ?? 0) > group.maxPlayers) {
      issues.push({ code: 'PLAYER_LIMIT', field: 'players', message: `名单人数超过组别上限 ${group.maxPlayers} 人`, severity: 'ERROR' })
    }
  }
  if ((enrollment.playerCount ?? 0) < MIN_ENROLLMENT_PLAYERS) {
    issues.push({
      code: 'PLAYER_LIMIT',
      field: 'players',
      message: `当前仅报送 ${enrollment.playerCount} 名球员，低于最低 ${MIN_ENROLLMENT_PLAYERS} 人`,
      severity: 'ERROR',
    })
  }
  if (!enrollment.contactName) {
    issues.push({ code: 'CONTACT_REQUIRED', field: 'contactName', message: '请填写领队/联系人', severity: 'ERROR' })
  }
  if (!enrollment.maskedContactPhone) {
    issues.push({ code: 'CONTACT_REQUIRED', field: 'contactPhone', message: '请填写联系电话', severity: 'ERROR' })
  }
  return issues
}

function canViewEnrollment(account: Account, enrollment: Enrollment): boolean {
  if (account.roles.includes('ADMIN') || account.roles.includes('PROVINCE_REVIEWER')) return true
  if (account.roles.includes('CITY')) return enrollment.cityOrgId === account.orgId
  if (account.roles.includes('UNIVERSITY')) return schoolOrgIdOfEnrollment(enrollment) === account.orgId
  if (account.roles.includes('TEAM')) return Boolean(account.teamIds?.includes(enrollment.teamId))
  return false
}

function assertEnrollmentVisible(config: AxiosRequestConfig, enrollment: Enrollment) {
  const account = requireAccount(config)
  if (!canViewEnrollment(account, enrollment)) {
    throw new MockHttpError(403, 'FORBIDDEN', '无权查看该报名单')
  }
  return account
}

function assertEnrollmentEditable(config: AxiosRequestConfig, enrollment: Enrollment) {
  const account = requireUniversity(config)
  if (schoolOrgIdOfEnrollment(enrollment) !== account.orgId) {
    throw new MockHttpError(403, 'FORBIDDEN', '仅报送学校可维护该报名单')
  }
  if (!enrollment.editable) {
    throw new MockHttpError(409, 'ENROLLMENT_LOCKED', '当前报名单已提交审核，不能修改')
  }
  return account
}

function requireUniversity(config: AxiosRequestConfig): Account {
  const account = requireAccount(config)
  if (!account.roles.includes('UNIVERSITY')) {
    throw new MockHttpError(403, 'FORBIDDEN', '报名由学校端统一报送，当前账号无报送权限')
  }
  return account
}

function maskPhone(phone: string): string {
  return phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : ''
}

on('GET', '/available-events', ({ query }) => {
  let items = events.filter((e) => e.status !== 'DRAFT')
  if (str(query.registrationOpen) === 'true') items = items.filter((e) => isRegistrationOpen(e))
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

on('GET', '/events/:id/groups', ({ params, query, config }) => {
  const items = eventGroups.filter((g) => g.eventId === params.id).map((g) => groupView(g, config))
  return pageOf(items, query)
})

on('GET', '/available-events/:id/groups', ({ params, config }) =>
  eventGroups.filter((g) => g.eventId === params.id).map((g) => groupView(g, config)),
)

on('POST', '/events/:id/groups', ({ params, body }) => {
  const quota = body.quota == null ? 0 : Number(body.quota)
  const schoolQuota = body.schoolQuota == null ? 1 : Number(body.schoolQuota)
  if (schoolQuota < 0) throw new MockHttpError(400, 'VALIDATION_ERROR', '每校名额不能为负数')
  if (quota > 0 && schoolQuota > quota) {
    throw new MockHttpError(400, 'VALIDATION_ERROR', '每校名额不能大于组别总名额')
  }
  const group = {
    id: nextId('group'),
    eventId: params.id,
    name: str(body.name),
    category: body.category || 'PRIMARY',
    gender: body.gender || 'MALE',
    quota,
    schoolQuota,
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
  const patch = pickFields(body, [
    'name',
    'category',
    'gender',
    'quota',
    'schoolQuota',
    'minAge',
    'maxAge',
    'maxPlayers',
    'requiredMaterialTypes',
  ])
  const quota = patch.quota === undefined ? group.quota ?? 0 : Number(patch.quota)
  const schoolQuota = patch.schoolQuota === undefined ? group.schoolQuota ?? 1 : Number(patch.schoolQuota)
  if (schoolQuota < 0) throw new MockHttpError(400, 'VALIDATION_ERROR', '每校名额不能为负数')
  if (quota > 0 && schoolQuota > quota) {
    throw new MockHttpError(400, 'VALIDATION_ERROR', '每校名额不能大于组别总名额')
  }
  Object.assign(group, patch, { quota, schoolQuota, version: group.version + 1 })
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
    submissionRoute: ['学校填报', '市州初审', '省级终审'],
  }
})

// ---------------------------------------------------------------------------
// 报名
// ---------------------------------------------------------------------------

function scopeEnrollments(config: AxiosRequestConfig, items: Enrollment[]): Enrollment[] {
  const account = accountFrom(config)
  if (!account) return []
  if (account.roles.includes('ADMIN') || account.roles.includes('PROVINCE_REVIEWER')) return items
  if (account.roles.includes('CITY')) return items.filter((e) => e.cityOrgId === account.orgId)
  if (account.roles.includes('UNIVERSITY')) return items.filter((e) => schoolOrgIdOfEnrollment(e) === account.orgId)
  if (account.roles.includes('TEAM')) {
    const teamIds = account.teamIds || []
    return teamIds.length ? items.filter((e) => teamIds.includes(e.teamId)) : []
  }
  return []
}

on('GET', '/enrollments', ({ config, query }) => {
  let items = scopeEnrollments(config, enrollments)
  if (query.eventId) items = items.filter((e) => e.eventId === query.eventId)
  if (query.groupId) items = items.filter((e) => e.groupId === query.groupId)
  if (query.status) items = items.filter((e) => e.status === query.status)
  if (query.subjectType) items = items.filter((e) => e.subjectType === query.subjectType)
  if (query.cityOrgId) items = items.filter((e) => e.cityOrgId === query.cityOrgId)
  if (query.schoolOrgId) items = items.filter((e) => schoolOrgIdOfEnrollment(e) === query.schoolOrgId)
  if (query.teamName) items = items.filter((e) => contains(e.teamName, str(query.teamName)))
  return pageOf(items, query)
})

on('POST', '/enrollments', ({ body, config }) => {
  const account = requireUniversity(config)
  const event = events.find((e) => e.id === str(body.eventId))
  if (!event) throw new MockHttpError(404, 'NOT_FOUND', '赛事不存在')
  assertRegistrationOpen(event)
  const group = assertGroupBelongsToEvent(str(body.groupId), event.id)
  const team = teams.find((t) => t.id === str(body.teamId))
  if (!team) throw new MockHttpError(400, 'TEAM_NOT_FOUND', '参赛球队不存在')
  if (schoolOrgIdOfTeam(team) !== account.orgId) {
    throw new MockHttpError(403, 'FORBIDDEN', '只能为本校球队报名')
  }
  assertTeamEligibleForGroup(team, group)
  assertNoDuplicateEnrollment(team.id, group.id)
  assertQuotaAvailable(group, account.orgId)

  const enrollment: Enrollment = {
    id: nextId('enr'),
    eventId: event.id,
    eventName: event.name,
    groupId: group.id,
    groupName: group.name,
    teamId: team.id,
    teamName: team.name,
    subjectType: 'SCHOOL_TEAM',
    schoolOrgId: account.orgId,
    schoolName: team.schoolName,
    campusName: team.campusName,
    cityOrgId: team.cityOrgId,
    cityName: team.cityName,
    status: 'DRAFT',
    submissionNo: 0,
    contactName: str(body.contactName),
    maskedContactPhone: maskPhone(str(body.contactPhone)),
    remarks: str(body.remarks) || undefined,
    editable: true,
    playerCount: 0,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
  }
  enrollments.unshift(enrollment)
  return enrollment
})

on('GET', '/enrollments/:id', ({ params, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentVisible(config, enrollment)
  return {
    ...enrollment,
    players: rosterItems.filter((r) => r.id.startsWith(`roster_${enrollment.id}_`)),
    attachments: attachmentsOf(enrollment.id),
  }
})

on('PUT', '/enrollments/:id', ({ params, body, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentEditable(config, enrollment)
  const patch = pickFields(body, ['groupId', 'contactName', 'remarks'])
  if (patch.groupId && patch.groupId !== enrollment.groupId) {
    const group = assertGroupBelongsToEvent(str(patch.groupId), enrollment.eventId)
    const team = teams.find((t) => t.id === enrollment.teamId)
    assertTeamEligibleForGroup(team, group)
    assertNoDuplicateEnrollment(enrollment.teamId, group.id, enrollment.id)
    assertQuotaAvailable(group, schoolOrgIdOfEnrollment(enrollment) || '', enrollment.id)
    enrollment.groupId = group.id
    enrollment.groupName = group.name
  }
  if (patch.contactName !== undefined) enrollment.contactName = str(patch.contactName)
  if (patch.remarks !== undefined) enrollment.remarks = str(patch.remarks)
  if (body.contactPhone !== undefined) enrollment.maskedContactPhone = maskPhone(str(body.contactPhone))
  enrollment.version += 1
  enrollment.updatedAt = now()
  return enrollment
})

on('DELETE', '/enrollments/:id', ({ params, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  const account = requireUniversity(config)
  if (schoolOrgIdOfEnrollment(enrollment) !== account.orgId) {
    throw new MockHttpError(403, 'FORBIDDEN', '仅报送学校可删除该报名单')
  }
  if (!['DRAFT', 'REJECTED', 'WITHDRAWN'].includes(enrollment.status)) {
    throw new MockHttpError(409, 'ENROLLMENT_LOCKED', '仅草稿、被驳回或已撤回的报名单可删除')
  }
  const idx = enrollments.indexOf(enrollment)
  enrollments.splice(idx, 1)
  return { success: true }
})

on('GET', '/enrollments/:id/players', ({ params, query, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentVisible(config, enrollment)
  return pageOf(rosterOf(enrollment.id), query)
})

on('POST', '/enrollments/:id/players', ({ params, body, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentEditable(config, enrollment)
  const person = persons.find((p) => p.id === str(body.athleteId))
  if (!person) throw new MockHttpError(404, 'NOT_FOUND', '运动员不存在')
  const schoolOrgId = schoolOrgIdOfEnrollment(enrollment)
  if (person.schoolOrgId && person.schoolOrgId !== schoolOrgId) {
    throw new MockHttpError(403, 'FORBIDDEN', '只能添加本校在籍运动员')
  }
  const roster = rosterOf(enrollment.id)
  if (roster.some((r) => r.athleteId === person.id)) {
    throw new MockHttpError(409, 'DUPLICATE_PLAYER', '该运动员已在报名名单中')
  }
  const group = eventGroups.find((g) => g.id === enrollment.groupId)
  if (group && roster.length >= group.maxPlayers) {
    throw new MockHttpError(409, 'PLAYER_LIMIT', `名单人数已达组别上限 ${group.maxPlayers} 人`)
  }
  const item = {
    id: `roster_${params.id}_${nextId('player')}`,
    athleteId: person.id,
    athleteName: person.realName || str(body.athleteName),
    maskedIdNumber: person.maskedIdNumber,
    jerseyNumber: Number(body.jerseyNumber) || undefined,
    position: body.position,
    photoUrl: '',
    gender: person.gender,
    schoolName: person.schoolName,
    version: 1,
  }
  rosterItems.push(item)
  syncPlayerCount(enrollment)
  return item
})

on('PUT', '/enrollments/:id/players/:rid', ({ params, body, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentEditable(config, enrollment)
  const item = rosterOf(enrollment.id).find((r) => r.id === params.rid)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '名单条目不存在')
  Object.assign(item, pickFields(body, ['jerseyNumber', 'position']), { version: item.version + 1 })
  return item
})

on('DELETE', '/enrollments/:id/players/:rid', ({ params, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentEditable(config, enrollment)
  const item = rosterOf(enrollment.id).find((r) => r.id === params.rid)
  if (!item) throw new MockHttpError(404, 'NOT_FOUND', '名单条目不存在')
  rosterItems.splice(rosterItems.indexOf(item), 1)
  syncPlayerCount(enrollment)
  return { success: true }
})

function assertVersion(current: number, expected: unknown) {
  const version = Number(expected)
  if (Number.isFinite(version) && version !== current) {
    throw new MockHttpError(409, 'VERSION_CONFLICT', '报名单已被他人修改，请刷新后重试')
  }
}

on('POST', '/enrollments/:id/precheck', ({ params, body, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentEditable(config, enrollment)
  assertVersion(enrollment.version, body.version)
  const issues = collectEnrollmentIssues(enrollment)
  return {
    passed: issues.every((issue) => issue.severity !== 'ERROR'),
    checkedVersion: enrollment.version,
    issues,
  }
})

const submitIdempotency = new Map<string, string>()

on('POST', '/enrollments/:id/submit', ({ params, body, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  const headers = (config.headers || {}) as Record<string, unknown>
  const key = String(headers['Idempotency-Key'] || headers['idempotency-key'] || '')
  if (!key || key.length < 8 || key.length > 128) {
    throw new MockHttpError(400, 'INVALID_ARGUMENT', '提交需携带 8–128 字符的 Idempotency-Key')
  }
  const fingerprint = `${params.id}|${Number(body.version)}`
  const seen = submitIdempotency.get(key)
  if (seen) {
    if (seen !== fingerprint) {
      throw new MockHttpError(409, 'IDEMPOTENCY_CONFLICT', '同一幂等键提交了不同内容')
    }
    return enrollment
  }
  submitIdempotency.set(key, fingerprint)
  assertVersion(enrollment.version, body.version)
  const account = requireUniversity(config)
  if (schoolOrgIdOfEnrollment(enrollment) !== account.orgId) {
    throw new MockHttpError(403, 'FORBIDDEN', '仅报送学校可提交该报名单')
  }
  if (!['DRAFT', 'REJECTED', 'WITHDRAWN'].includes(enrollment.status)) {
    throw new MockHttpError(409, 'INVALID_STATUS', '当前状态不可提交审核')
  }
  const issues = collectEnrollmentIssues(enrollment).filter((issue) => issue.severity === 'ERROR')
  if (issues.length) {
    throw new MockHttpError(
      422,
      'PRECHECK_FAILED',
      '报名预检未通过，请先处理问题项',
      issues.map((issue) => ({ field: issue.field, reason: issue.message })),
    )
  }
  const from = enrollment.status
  enrollment.status = 'PENDING_CITY_REVIEW'
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
    fromStatus: from,
    toStatus: enrollment.status,
    operatorName: account.displayName,
    createdAt: now(),
  })
  return enrollment
})

on('POST', '/enrollments/:id/withdraw', ({ params, body, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  const account = requireUniversity(config)
  if (schoolOrgIdOfEnrollment(enrollment) !== account.orgId) {
    throw new MockHttpError(403, 'FORBIDDEN', '仅报送学校可撤回该报名单')
  }
  assertVersion(enrollment.version, body.version)
  if (!['PENDING_CITY_REVIEW', 'PENDING_PROVINCE_REVIEW'].includes(enrollment.status)) {
    throw new MockHttpError(409, 'INVALID_STATUS', '仅审核中的报名单可撤回')
  }
  if (!str(body.reason).trim()) {
    throw new MockHttpError(400, 'VALIDATION_ERROR', '撤回必须填写原因')
  }
  const from = enrollment.status
  enrollment.status = 'WITHDRAWN'
  enrollment.editable = true
  enrollment.version += 1
  enrollment.updatedAt = now()
  reviewRecords.push({
    id: nextId('rev'),
    enrollmentId: enrollment.id,
    submissionNo: enrollment.submissionNo,
    stage: 'SUBMISSION',
    action: 'WITHDRAW',
    fromStatus: from,
    toStatus: enrollment.status,
    reason: body.reason,
    operatorName: account.displayName,
    createdAt: now(),
  })
  return enrollment
})

on('POST', '/enrollments/:id/reviews', ({ params, body, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  const account = assertEnrollmentVisible(config, enrollment)
  const from = enrollment.status
  if (from === 'PENDING_CITY_REVIEW') {
    if (!account.roles.includes('CITY') && !account.roles.includes('ADMIN')) {
      throw new MockHttpError(403, 'FORBIDDEN', '市州初审仅限本市审核账号')
    }
  } else if (from === 'PENDING_PROVINCE_REVIEW') {
    if (!account.roles.includes('PROVINCE_REVIEWER') && !account.roles.includes('ADMIN')) {
      throw new MockHttpError(403, 'FORBIDDEN', '省级终审仅限省级审核账号')
    }
  } else {
    throw new MockHttpError(409, 'INVALID_STATUS', '当前报名单不在审核流程中')
  }
  assertVersion(enrollment.version, body.version)
  if (!['APPROVE', 'REJECT', 'RETURN_FOR_CORRECTION'].includes(str(body.decision))) {
    throw new MockHttpError(400, 'VALIDATION_ERROR', '审核结论无效')
  }
  if (body.decision !== 'APPROVE' && !str(body.reason).trim()) {
    throw new MockHttpError(400, 'VALIDATION_ERROR', '驳回或退回补正时必须填写原因')
  }
  if (body.decision === 'APPROVE') {
    enrollment.status = from === 'PENDING_CITY_REVIEW' ? 'PENDING_PROVINCE_REVIEW' : 'APPROVED'
  } else if (body.decision === 'RETURN_FOR_CORRECTION') {
    enrollment.status = 'DRAFT'
    enrollment.editable = true
    enrollment.latestReviewReason = str(body.reason)
  } else {
    enrollment.status = 'REJECTED'
    enrollment.editable = true
    enrollment.latestReviewReason = str(body.reason)
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
    operatorName: account.displayName,
    createdAt: now(),
  })
  return enrollment
})

on('GET', '/enrollments/:id/reviews', ({ params, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentVisible(config, enrollment)
  const list = reviewRecords
    .filter((r) => r.enrollmentId === params.id)
    .sort((a, b) => str(b.createdAt).localeCompare(str(a.createdAt)))
  return { items: list, page: 1, pageSize: list.length || 10, total: list.length }
})

on('GET', '/enrollments/:id/snapshots/:sid', ({ params, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentVisible(config, enrollment)
  const team = teams.find((t) => t.id === enrollment.teamId)
  return {
    id: params.sid,
    enrollmentId: params.id,
    submissionNo: enrollment.submissionNo || 1,
    submittedAt: enrollment.updatedAt,
    enrollment,
    team,
    players: rosterOf(enrollment.id),
    coachIds: teamCoaches.filter((c) => c.teamId === enrollment.teamId).map((c) => c.coachId),
    attachments: attachmentsOf(enrollment.id),
  }
})

on('GET', '/enrollments/:id/attachments', ({ params, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentVisible(config, enrollment)
  return attachmentsOf(enrollment.id)
})

on('POST', '/enrollments/:id/attachments', ({ params, body, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentEditable(config, enrollment)
  const materialType = str(body.materialType)
  if (materialType && !['STAMPED_FORM', 'STUDENT_STATUS'].includes(materialType)) {
    throw new MockHttpError(400, 'VALIDATION_ERROR', '材料类型无效')
  }
  const att = {
    // 关联到报名的 id 必须带上报名单编号，详情接口按 `att_${enrollmentId}_` 过滤材料。
    id: `att_${enrollment.id}_${nextId('att')}`,
    materialType: (materialType || 'STAMPED_FORM') as 'STAMPED_FORM' | 'STUDENT_STATUS',
    fileId: str(body.fileId) || nextId('file'),
    fileName: str(body.fileName) || '盖章报名表.pdf',
    athleteId: body.athleteId,
    version: 1,
  }
  enrollmentAttachments.push(att)
  return att
})

on('DELETE', '/enrollments/:id/attachments/:aid', ({ params, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentEditable(config, enrollment)
  const att = attachmentsOf(enrollment.id).find((a) => a.id === params.aid)
  if (!att) throw new MockHttpError(404, 'NOT_FOUND', '材料关联不存在')
  enrollmentAttachments.splice(enrollmentAttachments.indexOf(att), 1)
  return { success: true }
})

on('POST', '/enrollments/:id/imports/players', ({ params, body, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentEditable(config, enrollment)
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

on('POST', '/enrollments/:id/imports/photos', ({ params, config }) => {
  const enrollment = enrollments.find((e) => e.id === params.id)
  if (!enrollment) throw new MockHttpError(404, 'NOT_FOUND', '报名单不存在')
  assertEnrollmentEditable(config, enrollment)
  return {
    batchId: nextId('batch'),
    mode: 'PHOTO_IMPORT',
    total: 24,
    successCount: 21,
    failureCount: 3,
    enrollmentVersion: enrollment.version,
    errors: [
      { fileName: '5101**********1201.jpg', code: 'NOT_IN_ROSTER', message: '照片未匹配到报名名单' },
      { fileName: '5101**********1312.jpg', code: 'INVALID_IMAGE', message: '文件不是有效图片' },
      { fileName: '5101**********1444.jpg', code: 'NOT_IN_ROSTER', message: '照片未匹配到报名名单' },
    ],
  }
})

on('GET', '/enrollment-statistics', ({ query, config }) => {
  const eventId = str(query.eventId)
  // 与成员3契约一致：CITY / UNIVERSITY / GROUP。
  const dimension = (str(query.dimension) || 'CITY').toUpperCase()
  const source = scopeEnrollments(config, enrollments)
  const scoped = eventId ? source.filter((e) => e.eventId === eventId) : source
  const groups = new Map<string, { label: string; teamCount: number; athleteCount: number; pendingCount: number; approvedCount: number; rejectedCount: number }>()
  scoped.forEach((e) => {
    const key =
      dimension === 'GROUP'
        ? e.groupId
        : dimension === 'UNIVERSITY'
          ? schoolOrgIdOfEnrollment(e) || '未分组'
          : e.cityName || '未分组'
    const label =
      dimension === 'GROUP'
        ? e.groupName
        : dimension === 'UNIVERSITY'
          ? e.schoolName || '未分组'
          : e.cityName || '未分组'
    const row = groups.get(key) || { label, teamCount: 0, athleteCount: 0, pendingCount: 0, approvedCount: 0, rejectedCount: 0 }
    row.teamCount += 1
    row.athleteCount += e.playerCount ?? 0
    if (e.status === 'PENDING_CITY_REVIEW' || e.status === 'PENDING_PROVINCE_REVIEW') row.pendingCount += 1
    if (e.status === 'APPROVED') row.approvedCount += 1
    if (e.status === 'REJECTED') row.rejectedCount += 1
    groups.set(key, row)
  })
  return pageOf(
    Array.from(groups.entries()).map(([key, v]) => ({ key, ...v })),
    query,
  )
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

on('POST', '/matches/:id/unpublish', ({ params, body }) => {
  const match = matches.find((m) => m.id === params.id)
  if (!match) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在')
  if (!str(body.reason).trim()) {
    throw new MockHttpError(400, 'VALIDATION_ERROR', '下线必须填写原因')
  }
  assertVersion(match.version, body.version)
  if (!match.published) {
    throw new MockHttpError(409, 'STATE_CONFLICT', '该对阵尚未发布，无需下线')
  }
  match.published = false
  match.version += 1
  return { success: true }
})

on('GET', '/matches/:id/events', ({ params, query }) => {
  const items = matchEvents.filter((e) => e.matchId === params.id)
  return pageOf(items, query)
})

const eventIdempotency = new Map<string, string>()

on('POST', '/matches/:id/events', ({ params, body, config }) => {
  const match = matches.find((m) => m.id === params.id)
  if (!match) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在')
  const headers = (config.headers || {}) as Record<string, unknown>
  const key = String(headers['Idempotency-Key'] || headers['idempotency-key'] || '')
  if (!key || key.length < 8 || key.length > 128) {
    throw new MockHttpError(400, 'INVALID_ARGUMENT', '录入事件需携带 8–128 字符的 Idempotency-Key')
  }
  const seenEventId = eventIdempotency.get(key)
  if (seenEventId) {
    const existing = matchEvents.find((e) => e.id === seenEventId)
    if (existing) return existing
  }
  if (body.matchVersion != null) assertVersion(match.version, body.matchVersion)
  if (match.status === 'FINISHED' || match.status === 'CANCELLED') {
    throw new MockHttpError(409, 'STATE_CONFLICT', '比赛已结束或已取消，不能继续录入事件')
  }
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
  eventIdempotency.set(key, event.id)
  return event
})

on('PUT', '/matches/:id/events/:eid', ({ params, body }) => {
  const event = matchEvents.find((e) => e.id === params.eid)
  if (!event) throw new MockHttpError(404, 'NOT_FOUND', '比赛事件不存在')
  Object.assign(event, body, { version: event.version + 1 })
  return event
})

on('DELETE', '/matches/:id/events/:eid', ({ params, body }) => {
  const idx = matchEvents.findIndex((e) => e.id === params.eid)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '比赛事件不存在')
  const event = matchEvents[idx]
  assertVersion(event.version, body.version)
  const match = matches.find((m) => m.id === params.id)
  if (match && body.matchVersion != null) assertVersion(match.version, body.matchVersion)
  // 撤销进球需回退比分，与文档“事件变更自动重算比分”保持一致
  if (match && event.eventType === 'GOAL') {
    const scoredByHome = event.teamId === match.homeTeamId
    const homeScored = event.ownGoal ? !scoredByHome : scoredByHome
    if (homeScored) match.homeScore = Math.max(0, (match.homeScore || 0) - 1)
    else match.awayScore = Math.max(0, (match.awayScore || 0) - 1)
    match.scoreRevision += 1
    match.version += 1
  }
  matchEvents.splice(idx, 1)
  return { success: true }
})

on('GET', '/matches/:id/documents', ({ params, query }) =>
  pageOf(matchDocuments.filter((d) => d.matchId === params.id), query),
)

on('POST', '/matches/:id/documents', ({ params, body }) => {
  const doc = {
    id: nextId('doc'),
    matchId: params.id,
    documentType: body.documentType || 'SIGN_IN',
    fileId: str(body.fileId),
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

on('PUT', '/matches/:id/result', ({ params, body, config }) => {
  const match = matches.find((m) => m.id === params.id)
  if (!match) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在')
  assertVersion(match.version, body.version)
  const resultType = str(body.resultType || 'NORMAL')
  if (!['NORMAL', 'FORFEIT', 'ADMIN_CORRECTION'].includes(resultType)) {
    throw new MockHttpError(400, 'VALIDATION_ERROR', '赛果类型无效')
  }
  if (resultType !== 'NORMAL') {
    const account = accountFrom(config)
    if (!account || !account.roles.some((role) => role === 'ADMIN' || role === 'PROVINCE_REVIEWER')) {
      throw new MockHttpError(403, 'FORBIDDEN', '弃权与人工改判仅赛事管理员可录入')
    }
    if (!str(body.reason).trim()) throw new MockHttpError(400, 'VALIDATION_ERROR', '请填写人工改判原因')
    if (body.manualHomeScore == null || body.manualAwayScore == null) {
      throw new MockHttpError(400, 'VALIDATION_ERROR', '请填写人工主客队比分')
    }
    match.homeScore = Number(body.manualHomeScore)
    match.awayScore = Number(body.manualAwayScore)
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
  if (!match) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在')
  // 文档：仅 FINISHED 比赛可发布赛果
  if (match.status !== 'FINISHED') {
    throw new MockHttpError(409, 'STATE_CONFLICT', '仅已结束的比赛可发布赛果')
  }
  match.resultPublished = true
  match.version += 1
  return { success: true }
})

on('DELETE', '/matches/:id/result', ({ params, body }) => {
  const match = matches.find((m) => m.id === params.id)
  if (!match) throw new MockHttpError(404, 'NOT_FOUND', '比赛不存在')
  assertVersion(match.version, body.version)
  match.resultPublished = false
  match.version += 1
  return { success: true }
})

function aggregateGoalRanking(query: Record<string, unknown>): GoalRankingRow[] {
  const eventId = str(query.eventId)
  const eventCategory = str(query.eventCategory)
  const groupCategory = str(query.category) || str(query.groupCategory)

  let scopedEventIds: Set<string> | null = null
  if (eventId) {
    scopedEventIds = new Set([eventId])
  } else if (eventCategory) {
    scopedEventIds = new Set(events.filter((e) => e.eventCategory === eventCategory).map((e) => e.id))
  }

  const allowedTeamIds = groupCategory
    ? new Set(teams.filter((t) => t.category === groupCategory).map((t) => t.id))
    : null

  const scopedMatches = new Map(
    matches
      .filter(
        (m) =>
          m.published &&
          m.resultPublished &&
          (!scopedEventIds || scopedEventIds.has(m.eventId)),
      )
      .map((m) => [m.id, m]),
  )

  const rows = new Map<string, GoalRankingRow>()
  for (const event of matchEvents) {
    if (event.eventType !== 'GOAL' || event.ownGoal) continue
    const match = scopedMatches.get(event.matchId)
    if (!match) continue
    const teamId =
      event.teamId || (event.scorerName && event.teamName === match.awayTeamName ? match.awayTeamId : match.homeTeamId)
    if (allowedTeamIds && !allowedTeamIds.has(teamId)) continue
    const athleteId = event.scorerAthleteId || ''
    const athleteName = event.scorerName || '未知球员'
    const key = athleteId || `${teamId}:${athleteName}`
    const teamName =
      event.teamName ||
      (teamId === match.homeTeamId ? match.homeTeamName : match.awayTeamName) ||
      ''
    const current = rows.get(key)
    if (current) {
      current.goals += 1
    } else {
      rows.set(key, {
        rank: 0,
        athleteId,
        athleteName,
        teamId,
        teamName: teamName || '',
        goals: 1,
      })
    }
  }

  return [...rows.values()]
    .sort((a, b) => b.goals - a.goals || a.athleteName.localeCompare(b.athleteName, 'zh-Hans-CN'))
    .map((row, index) => ({ ...row, rank: index + 1 }))
}

on('GET', '/statistics/goals', ({ query }) =>
  pageOf(aggregateGoalRanking(query), query),
)

// ---------------------------------------------------------------------------
// 内容 / 门户资源 / 公示
// ---------------------------------------------------------------------------

on('GET', '/contents', ({ query }) => {
  let items = contents
  if (query.contentType) items = items.filter((c) => c.contentType === query.contentType)
  if (query.status) items = items.filter((c) => c.status === query.status)
  if (query.eventId) items = items.filter((c) => c.eventId === query.eventId)
  if (query.groupId) items = items.filter((c) => c.groupId === query.groupId)
  if (query.eventCategory) {
    const eventIds = events.filter((e) => e.eventCategory === query.eventCategory).map((e) => e.id)
    items = items.filter((c) => c.eventId && eventIds.includes(c.eventId))
  }
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
    coverUrl: body.coverFileId
      ? `https://picsum.photos/seed/${encodeURIComponent(str(body.coverFileId))}/1200/640`
      : body.coverUrl,
    coverFileId: body.coverFileId,
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
  const coverUrl = body.coverFileId
    ? `https://picsum.photos/seed/${encodeURIComponent(str(body.coverFileId))}/1200/640`
    : content.coverUrl
  Object.assign(content, body, { coverUrl, version: content.version + 1, revision: content.revision + 1 })
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

on('POST', '/contents/:id/unpublish', ({ params, body }) => {
  const content = contents.find((c) => c.id === params.id)
  if (!content) throw new MockHttpError(404, 'NOT_FOUND', '内容不存在')
  if (!str(body.reason).trim()) throw new MockHttpError(400, 'VALIDATION_ERROR', '下线必须填写原因')
  assertVersion(content.version, body.version)
  if (content.status !== 'PUBLISHED') {
    throw new MockHttpError(409, 'STATE_CONFLICT', '仅已发布内容可下线')
  }
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
    imageUrl: body.imageFileId
      ? `https://picsum.photos/seed/${encodeURIComponent(str(body.imageFileId))}/1200/600`
      : body.imageUrl || `https://picsum.photos/seed/${Date.now()}/1200/600`,
    imageFileId: body.imageFileId,
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
  const imageUrl = body.imageFileId
    ? `https://picsum.photos/seed/${encodeURIComponent(str(body.imageFileId))}/1200/600`
    : resource.imageUrl
  Object.assign(resource, body, { imageUrl, version: resource.version + 1 })
  return resource
})

on('DELETE', '/portal-resources/:id', ({ params }) => {
  const idx = portalResources.findIndex((r) => r.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'NOT_FOUND', '资源不存在')
  portalResources.splice(idx, 1)
  return { success: true }
})
// ---------------------------------------------------------------------------
// 身份核验
// ---------------------------------------------------------------------------

function listIdentityChecks({ query }: { query: Record<string, unknown> }) {
  let items = identityChecks
  if (query.matchId) items = items.filter((i) => i.matchId === query.matchId)
  if (query.manualStatus) items = items.filter((i) => i.manualStatus === query.manualStatus)
  if (query.machineStatus) items = items.filter((i) => i.machineStatus === query.machineStatus)
  return pageOf(items, query)
}

on('GET', '/identity-checks', listIdentityChecks)
// 后端契约路径是 /identity-checks/list，必须在 :id 动态路由之前注册。
on('GET', '/identity-checks/list', listIdentityChecks)

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

on('GET', '/public/events', ({ query }) => {
  let items = events.filter((e) => e.status !== 'DRAFT')
  if (query.season) items = items.filter((e) => e.season === query.season)
  if (query.eventCategory) items = items.filter((e) => e.eventCategory === query.eventCategory)
  const mapped = items.map((e) => ({
    id: e.id,
    name: e.name,
    season: e.season,
    eventCategory: e.eventCategory,
    status: e.status,
    registrationOpensAt: e.registrationOpensAt,
    registrationClosesAt: e.registrationClosesAt,
    description: e.description || '',
  }))
  return pageOf(mapped, query)
})

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

on('GET', '/public/statistics/goals', ({ query }) =>
  pageOf(aggregateGoalRanking(query), query),
)

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
  // 政策类关键词优先生效：报名/资格等没有依据时仍返回 NO_EVIDENCE，
  // 只有明确的日常/操作类问题才走 GENERAL 答复。
  const policyTopic = /报名|资格|材料|审核|截止|名额|年龄|组别|学籍|盖章|赛制|规程|名次|奖励|安全|医疗|天气|政策/.test(
    question,
  )
  const generalTopic =
    /^(你好|您好|在吗|嗨|hello|hi)|谢谢|感谢|忘记密码|怎么(注册|登录|使用|操作|上传|下载)|如何(注册|登录|使用|操作|上传|下载)|平台(怎么|如何|能做什么)|系统(怎么|如何)|越位|足球(是什么|比赛几|一场)/i.test(
      question,
    )
  if (!policyTopic && generalTopic) {
    const help = /密码/.test(question)
      ? '如忘记密码，请联系所属学校或组委会账号管理员重置；重置后首次登录需要修改新密码。'
      : /注册|邀请/.test(question)
        ? '注册参赛账号需要使用管理员签发的一次性邀请链接；填写姓名、身份证号和手机号后即可完成注册，邀请凭证仅可使用一次。'
        : /登录/.test(question)
          ? '请使用管理员发放的账号登录；首次登录会要求修改初始密码。如账号被停用，请联系所属机构管理员。'
          : '这是平台日常使用问题，可先通过页面导航进入对应功能，具体以页面提示为准；涉及政策与报名要求时，请查看已发布文件。'
    return {
      status: 'ANSWERED',
      answer: help,
      answerMode: 'GENERAL',
      notice: '该答复未引用政策原文，仅供参考；政策与报名要求以平台发布为准。',
      citations: [],
      fallbackPolicies: [],
      aiGenerated: true,
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
