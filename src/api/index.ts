import { http, newIdempotencyKey } from './http'
import { normalizeOptionItems } from '../utils/options'
import type {
  Account,
  AuditLog,
  Content,
  CurrentUser,
  DictItem,
  DictType,
  DictionaryItem,
  Enrollment,
  EnrollmentAttachment,
  Event,
  EventGroup,
  FileRecord,
  GoalRankingRow,
  IdentityCheck,
  ImportReport,
  InviteBatchResult,
  LiveLink,
  LivePost,
  LoginResult,
  Match,
  MatchDocument,
  MatchEvent,
  MatchResult,
  Material,
  Message,
  MyAffiliation,
  Organization,
  PageResult,
  Person,
  PolicyAnswer,
  PortalResource,
  PrecheckResult,
  PublicContent,
  PublicEvent,
  PublicLiveFeed,
  PublicLivePost,
  PublicMatch,
  PublicResource,
  Region,
  ReviewRecord,
  RosterItem,
  School,
  StatRow,
  Team,
  TeamCoach,
  TeamMember,
} from './types'

type Query = Record<string, unknown>
/** 单个请求的提示控制：可选接口失败时由页面决定是否展示提示。 */
type RequestOptions = { silentError?: boolean }

export const authApi = {
  login: (data: { username: string; password: string }) =>
    // 登录失败由 auth store 统一给出提示，避免把后端的字段校验文案抛给用户。
    http.post<LoginResult>('/auth/login', data, { silentError: true }),
  register: (data: Query) => http.post<{ success: boolean }>('/auth/registrations', data),
  logout: () => http.post<{ success: boolean }>('/auth/logout'),
}

export const meApi = {
  get: () => http.get<CurrentUser>('/me'),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    http.post<{ success: boolean }>('/me/password', data),
  messages: (params: Query) => http.get<PageResult<Message>>('/me/messages', params),
  message: (id: string) => http.get<Message>(`/me/messages/${id}`),
  readMessage: (id: string) => http.post<{ success: boolean }>(`/me/messages/${id}/read`),
  profile: (options?: RequestOptions) => http.get<Person>('/me/profile', undefined, options),
  /** 本人档案更新：version 必填（乐观锁），缺失后端返回 400 INVALID_ARGUMENT。 */
  updateProfile: (data: Partial<Person> & { version: number }) =>
    http.put<Person>('/me/profile', data),
  teams: (options?: RequestOptions) => http.get<Team[]>('/me/teams', undefined, options),
  affiliations: (params: Query, options?: RequestOptions) =>
    http.get<PageResult<MyAffiliation>>('/me/team-affiliations', params, options),
  addAffiliation: (data: Query) => http.post<MyAffiliation>('/me/team-affiliations', data),
  updateAffiliation: (id: string, data: Query) =>
    http.put<MyAffiliation>(`/me/team-affiliations/${id}`, data),
  removeAffiliation: (id: string) => http.delete<{ success: boolean }>(`/me/team-affiliations/${id}`),
}

export const accountApi = {
  list: (params: Query) => http.get<PageResult<Account>>('/accounts', params),
  get: (id: string) => http.get<Account>(`/accounts/${id}`),
  create: (data: Query) => http.post<Account>('/accounts', data),
  update: (id: string, data: Query) => http.put<Account>(`/accounts/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/accounts/${id}`, { version }),
  resetPassword: (
    id: string,
    data: { version: number; newPassword: string; forceChangeOnNextLogin?: boolean },
  ) => http.post<{ success: boolean }>(`/accounts/${id}/password-reset`, data),
  invite: (data: {
    kind: 'ATHLETE' | 'COACH'
    orgId: string
    personId?: string
    expiresInMinutes?: number
  }) =>
    http.post<{ registrationToken: string; expiresAt: string }>(
      '/accounts/registration-invitations',
      data,
    ),
  /**
   * 批量签发注册邀请，返回逐行结果（成功行含一次性明文凭证）。
   * 页面据此渲染每行 code/error/fieldErrors，并在前端生成 CSV 供下载。
   */
  inviteBatch: (
    file: File,
    options: { orgId?: string; expiresInMinutes?: number } = {},
  ): Promise<InviteBatchResult> => {
    const form = new FormData()
    form.append('file', file)
    form.append('expiresInMinutes', String(options.expiresInMinutes ?? 1440))
    if (options.orgId) form.append('orgId', options.orgId)
    return http.postForm<InviteBatchResult>('/accounts/registration-invitations/batch', form)
  },
}

export const orgApi = {
  list: (params: Query) => http.get<PageResult<Organization>>('/organizations', params),
  create: (data: Query) => http.post<Organization>('/organizations', data),
  get: (id: string) => http.get<Organization>(`/organizations/${id}`),
  update: (id: string, data: Query) => http.put<Organization>(`/organizations/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/organizations/${id}`, { version }),
}

export const dictApi = {
  list: (params: Query) => http.get<PageResult<DictionaryItem>>('/dictionary-items', params),
  /** 不同后端版本返回结构不一，统一归一化并剔除无 value 的项。 */
  options: async (dictType: string) =>
    normalizeOptionItems(await http.get<unknown>(`/dictionaries/${dictType}/options`)),
  get: (id: string) => http.get<DictionaryItem>(`/dictionary-items/${id}`),
  create: (data: Query) => http.post<DictionaryItem>('/dictionary-items', data),
  update: (id: string, data: Query) => http.put<DictionaryItem>(`/dictionary-items/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/dictionary-items/${id}`, { version }),
}

/* ---------------------------------------------------------------------------
 * 成员4 基础数据域（/base-data）：区划 / 学校 / 字典类型 / 字典项，共 21 条端点。
 * 删除为「停用」语义（is_active=false）；区划/学校/字典项停用有下级/挂项时后端返回 409。
 * 字典类型删除为物理删除（有字典项引用时 409）。code 创建后禁改（学校 code 例外可改）。
 * ------------------------------------------------------------------------- */

/** 区划 Region：5 条端点。 */
export const regionApi = {
  list: (params: { level?: 1 | 2 | 3; parentId?: string; keyword?: string; isActive?: boolean; page?: number; pageSize?: number }) =>
    http.get<PageResult<Region>>('/base-data/regions', params),
  create: (data: {
    name: string
    code: string
    level: 1 | 2 | 3
    parentId?: string
    sortOrder?: number
    isActive?: boolean
  }) => http.post<Region>('/base-data/regions', data),
  get: (id: string) => http.get<Region>(`/base-data/regions/${id}`),
  /** 仅可改 name、parentId；code/level 创建后禁改。 */
  update: (id: string, data: { name: string; parentId?: string }) =>
    http.put<Region>(`/base-data/regions/${id}`, data),
  /** 停用（有启用下级→409 STATE_CONFLICT）。 */
  disable: (id: string) => http.delete<{ success: boolean; id: string }>(`/base-data/regions/${id}`),
}

/** 学校 School：5 条端点。 */
export const schoolApi = {
  list: (params: { regionId?: string; schoolType?: string; keyword?: string; isActive?: boolean; page?: number; pageSize?: number }) =>
    http.get<PageResult<School>>('/base-data/schools', params),
  create: (data: {
    name: string
    code?: string
    schoolType: string
    regionId: string
    address?: string
    isActive?: boolean
  }) => http.post<School>('/base-data/schools', data),
  get: (id: string) => http.get<School>(`/base-data/schools/${id}`),
  /** code 允许修改（可空唯一）。 */
  update: (id: string, data: {
    name: string
    code?: string
    schoolType: string
    regionId: string
    address?: string
    isActive?: boolean
  }) => http.put<School>(`/base-data/schools/${id}`, data),
  /** 停用。 */
  disable: (id: string) => http.delete<{ success: boolean; id: string }>(`/base-data/schools/${id}`),
}

/** 字典类型 DictType：6 条端点。 */
export const dictTypeApi = {
  list: (params: { keyword?: string; page?: number; pageSize?: number }) =>
    http.get<PageResult<DictType>>('/base-data/dict-types', params),
  create: (data: { code: string; name: string; remark?: string }) =>
    http.post<DictType>('/base-data/dict-types', data),
  get: (id: string) => http.get<DictType>(`/base-data/dict-types/${id}`),
  /** code 创建后禁改，仅可改 name、remark。 */
  update: (id: string, data: { name: string; remark?: string }) =>
    http.put<DictType>(`/base-data/dict-types/${id}`, data),
  /** 物理删除（存在字典项→409 STATE_CONFLICT）。 */
  remove: (id: string) => http.delete<{ success: boolean; id: string }>(`/base-data/dict-types/${id}`),
  /** 按类型编码取启用字典项；未知 typeCode 返回空数组。 */
  options: async (typeCode: string) =>
    normalizeOptionItems(
      await http.get<unknown>(`/base-data/dict-types/${typeCode}/options`),
    ),
}

/** 字典项 DictItem：5 条端点。 */
export const dictItemApi = {
  list: (params: { typeCode?: string; keyword?: string; isActive?: boolean; page?: number; pageSize?: number }) =>
    http.get<PageResult<DictItem>>('/base-data/dict-items', params),
  create: (data: {
    typeCode: string
    value: string
    label: string
    sortOrder?: number
    isActive?: boolean
    extJson?: Record<string, unknown>
  }) => http.post<DictItem>('/base-data/dict-items', data),
  get: (id: string) => http.get<DictItem>(`/base-data/dict-items/${id}`),
  /** value/type 创建后禁改；PUT 全量替换，extJson 未传视为清空。 */
  update: (id: string, data: {
    label: string
    sortOrder?: number
    isActive?: boolean
    extJson?: Record<string, unknown>
  }) => http.put<DictItem>(`/base-data/dict-items/${id}`, data),
  /** 停用。 */
  disable: (id: string) => http.delete<{ success: boolean; id: string }>(`/base-data/dict-items/${id}`),
}

export const auditApi = {
  list: (params: Query) => http.get<PageResult<AuditLog>>('/audit-logs', params),
}

/** 成员2 系统模块：健康检查（公开）。 */
export const healthApi = {
  check: () => http.get<{ status: string }>('/health'),
}

export const fileApi = {
  upload: (file: File, ownerType = 'PERSON', ownerId = '', category = 'MATERIAL') => {
    const form = new FormData()
    form.append('file', file)
    form.append('ownerType', ownerType)
    form.append('ownerId', ownerId)
    form.append('category', category)
    return http.postForm<FileRecord>('/files', form)
  },
  /** 批量上传：一次最多 20 个文件，返回与单文件同构的记录数组 */
  uploadBatch: (files: File[], ownerType = 'PERSON', ownerId = '', category = 'MATERIAL') => {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    form.append('ownerType', ownerType)
    form.append('ownerId', ownerId)
    form.append('category', category)
    return http.postForm<FileRecord[]>('/files/batch', form)
  },
  meta: (fileId: string) => http.get<FileRecord>(`/files/${fileId}`),
  download: (fileId: string, fileName: string) =>
    http.download(`/files/${fileId}/content`, fileName),
  /** 读取私有文件并生成可直接放进 img src 的 object URL（调用方负责 revoke）。 */
  contentObjectUrl: async (fileId: string) => {
    const blob = await http.getBlob(`/files/${fileId}/content`)
    return blob instanceof Blob ? URL.createObjectURL(blob) : ''
  },
  /** 签发短期展示地址（用于 <img> 等无法携带 Authorization 头的场景）。 */
  signedUrl: (fileId: string, variant: 'content' | 'thumbnail' = 'content') =>
    http.get<{ url: string; expiresAt: string; variant: string }>(
      `/files/${fileId}/signed-url`,
      { variant },
      { silentError: true },
    ),
  remove: (fileId: string) => http.delete<{ success: boolean }>(`/files/${fileId}`),
}

export const personApi = {
  list: (params: Query) => http.get<PageResult<Person>>('/people', params),
  search: (data: Query) => http.post<Person[]>('/people/search', data),
  get: (id: string) => http.get<Person>(`/people/${id}`),
  create: (data: Query) => http.post<Person>('/people', data),
  update: (id: string, data: Query) => http.put<Person>(`/people/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/people/${id}`, { version }),
}

export const materialApi = {
  list: (params: Query, options?: RequestOptions) =>
    http.get<PageResult<Material>>('/materials', params, options),
  create: (data: Query) => http.post<Material>('/materials', data),
  update: (id: string, data: Query) => http.put<Material>(`/materials/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/materials/${id}`, { version }),
  review: (id: string, data: { decision: 'APPROVE' | 'REJECT'; reason?: string; version: number }) =>
    http.post<Material>(`/materials/${id}/review`, data),
}

export const teamApi = {
  list: (params: Query) => http.get<PageResult<Team>>('/teams', params),
  get: (id: string) => http.get<Team>(`/teams/${id}`),
  create: (data: Query) => http.post<Team>('/teams', data),
  update: (id: string, data: Query) => http.put<Team>(`/teams/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/teams/${id}`, { version }),
  members: (id: string, params: Query) =>
    http.get<PageResult<TeamMember>>(`/teams/${id}/members`, params),
  addMember: (id: string, data: Query) => http.post<TeamMember>(`/teams/${id}/members`, data),
  searchMembers: (id: string, keyword: string) =>
    http.post<Person[]>(`/teams/${id}/members/search`, { keyword }),
  updateMember: (id: string, memberId: string, data: Query) =>
    http.put<TeamMember>(`/teams/${id}/members/${memberId}`, data),
  removeMember: (id: string, memberId: string, version?: number) =>
    http.delete<{ success: boolean }>(`/teams/${id}/members/${memberId}`, { version }),
  coaches: (id: string, params: Query) =>
    http.get<PageResult<TeamCoach>>(`/teams/${id}/coaches`, params),
  addCoach: (id: string, data: Query) => http.post<TeamCoach>(`/teams/${id}/coaches`, data),
  removeCoach: (id: string, coachId: string, version?: number) =>
    http.delete<{ success: boolean }>(`/teams/${id}/coaches/${coachId}`, { version }),
  matches: (id: string, params: Query) =>
    http.get<PageResult<Match>>(`/teams/${id}/matches`, params),
}

export const eventApi = {
  list: (params: Query) => http.get<PageResult<Event>>('/events', params),
  available: (params: Query) => http.get<PageResult<Event>>('/available-events', params),
  get: (id: string) => http.get<Event>(`/events/${id}`),
  create: (data: Query) => http.post<Event>('/events', data),
  update: (id: string, data: Query) => http.put<Event>(`/events/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/events/${id}`, { version }),
  groups: (id: string) =>
    http.get<PageResult<EventGroup>>(`/events/${id}/groups`, { page: 1, pageSize: 100 }),
  /** 后端返回分页信封，这里统一拍平成数组，调用方无需关心 page/pageSize。 */
  availableGroups: async (id: string) => {
    const res = await http.get<PageResult<EventGroup>>(`/available-events/${id}/groups`, {
      page: 1,
      pageSize: 100,
    })
    return res.items
  },
  createGroup: (id: string, data: Query) => http.post<EventGroup>(`/events/${id}/groups`, data),
  updateGroup: (id: string, groupId: string, data: Query) =>
    http.put<EventGroup>(`/events/${id}/groups/${groupId}`, data),
  removeGroup: (id: string, groupId: string, version?: number) =>
    http.delete<{ success: boolean }>(`/events/${id}/groups/${groupId}`, { version }),
  formConfig: (params: Query) =>
    http.get<Record<string, unknown>>('/enrollment-form-config', params),
}

export interface EnrollmentDetail extends Enrollment {
  players?: RosterItem[]
  attachments?: EnrollmentAttachment[]
}

/** 报名接口只返回 ID 与 teamName；名称缺失时回退到 ID，人数由名单推导。 */
function normalizeEnrollment<T extends Enrollment>(raw: T & { players?: RosterItem[] }): T {
  return {
    ...raw,
    eventName: raw.eventName || raw.eventId,
    groupName: raw.groupName || raw.groupId,
    playerCount:
      typeof raw.playerCount === 'number'
        ? raw.playerCount
        : Array.isArray(raw.players)
          ? raw.players.length
          : undefined,
  }
}

export const enrollmentApi = {
  list: async (params: Query, options?: RequestOptions) => {
    const page = await http.get<PageResult<Enrollment>>('/enrollments', params, options)
    return { ...page, items: page.items.map((item) => normalizeEnrollment(item)) }
  },
  get: async (id: string) =>
    normalizeEnrollment(await http.get<EnrollmentDetail>(`/enrollments/${id}`)),
  create: (data: Query) => http.post<Enrollment>('/enrollments', data),
  update: (id: string, data: Query) => http.put<Enrollment>(`/enrollments/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/enrollments/${id}`, { version }),
  players: (id: string, params?: Query) =>
    http.get<PageResult<RosterItem>>(`/enrollments/${id}/players`, params),
  player: (id: string, rid: string) => http.get<RosterItem>(`/enrollments/${id}/players/${rid}`),
  addPlayer: (id: string, data: Query) => http.post<RosterItem>(`/enrollments/${id}/players`, data),
  updatePlayer: (id: string, rid: string, data: Query) =>
    http.put<RosterItem>(`/enrollments/${id}/players/${rid}`, data),
  removePlayer: (id: string, rid: string, version?: number) =>
    http.delete<{ success: boolean }>(`/enrollments/${id}/players/${rid}`, { version }),
  /** 预检为纯规则校验，需带当前报名单版本，结果中的 checkedVersion 用于提交前核对 */
  precheck: (id: string, version: number) =>
    http.post<PrecheckResult>(`/enrollments/${id}/precheck`, { version }),
  /** 提交需带 version 与 Idempotency-Key，避免重复冻结快照 */
  submit: (id: string, version: number) =>
    http.postIdempotent<Enrollment>(`/enrollments/${id}/submit`, { version }, newIdempotencyKey('submit')),
  withdraw: (id: string, version: number, reason: string) =>
    http.post<Enrollment>(`/enrollments/${id}/withdraw`, { version, reason }),
  reviews: (id: string) => http.get<PageResult<ReviewRecord>>(`/enrollments/${id}/reviews`),
  /** 审核结论仅 APPROVE / REJECT / RETURN_FOR_CORRECTION，层级由后端按角色与状态推导 */
  review: (
    id: string,
    version: number,
    data: { decision: 'APPROVE' | 'REJECT' | 'RETURN_FOR_CORRECTION'; reason?: string },
  ) =>
    http.postIdempotent<Enrollment>(
      `/enrollments/${id}/reviews`,
      { version, ...data },
      newIdempotencyKey('review'),
    ),
  snapshot: (id: string, snapshotId: string) =>
    http.get<Record<string, unknown>>(`/enrollments/${id}/snapshots/${snapshotId}`),
  attachments: (id: string, params?: Query) =>
    http.get<PageResult<EnrollmentAttachment>>(`/enrollments/${id}/attachments`, params),
  addAttachment: (id: string, data: Query) =>
    http.post<EnrollmentAttachment>(`/enrollments/${id}/attachments`, data),
  removeAttachment: (id: string, aid: string, version?: number) =>
    http.delete<{ success: boolean }>(`/enrollments/${id}/attachments/${aid}`, { version }),
  importPlayers: (
    id: string,
    version: number,
    mode: 'VALIDATE_ONLY' | 'APPLY_VALID_ROWS',
    file: File,
  ) => {
    const form = new FormData()
    form.append('mode', mode)
    form.append('file', file)
    return http.postForm<ImportReport>(`/enrollments/${id}/imports/players?version=${version}`, form)
  },
  importPhotos: (id: string, version: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return http.postForm<ImportReport>(`/enrollments/${id}/imports/photos?version=${version}`, form)
  },
  downloadRosterTemplate: () =>
    http.download('/imports/templates/roster.xlsx', '球员名单导入模板.xlsx'),
  downloadImportErrors: (batchId: string) =>
    http.download(`/imports/${batchId}/errors.csv`, `导入错误清单-${batchId}.csv`),
  statistics: async (params: Query) => {
    // 契约要求分页信封；旧版后端/内置 Mock 可能直接返回数组，这里统一拍平。
    const res = await http.get<PageResult<StatRow> | StatRow[]>('/enrollment-statistics', params)
    return Array.isArray(res)
      ? { items: res, page: 1, pageSize: res.length, total: res.length }
      : res
  },
  downloadRegistration: (id: string, enrollmentNo?: string, snapshotId?: string) =>
    http.download(
      `/enrollments/${id}/documents/registration.pdf`,
      `报名表-${enrollmentNo || id}.pdf`,
      'get',
      undefined,
      snapshotId ? { snapshotId } : undefined,
    ),
  downloadPlayers: (id: string, enrollmentNo?: string) =>
    http.download(
      `/enrollments/${id}/documents/players.docx`,
      `球员信息表-${enrollmentNo || id}.docx`,
    ),
  /** 导出按文档要求以 filters + scope 提交，避免把筛选参数拼到 URL */
  exportRegistrations: (payload: ExportPayload) =>
    http.download('/enrollment-exports/registrations.xlsx', '赛事报名情况.xlsx', 'post', payload),
  exportDocuments: (payload: ExportPayload) =>
    http.download('/enrollment-exports/documents.zip', '报名资料打包.zip', 'post', payload),
}

export interface ExportPayload {
  filters: {
    eventId: string
    groupId?: string
    cityOrgId?: string
    teamName?: string
    subjectType?: string
    status?: string
  }
  scope: 'FILTERED' | 'SELECTED'
  enrollmentIds?: string[]
}

/**
 * 成员5 文档「待接入项」明确：队名/赛事名暂用 ID 占位，等成员6 公示名册落地。
 * 这里做前端兜底，避免模板对 undefined 做 slice() 导致白屏。
 */
function normalizeMatch(raw: Match): Match {
  return {
    ...raw,
    eventName: raw.eventName || raw.eventId,
    groupName: raw.groupName || raw.groupId,
    homeTeamName: raw.homeTeamName || raw.homeTeamId || '主队',
    awayTeamName: raw.awayTeamName || raw.awayTeamId || '客队',
  }
}

function normalizeMatchPage(page: PageResult<Match>): PageResult<Match> {
  return { ...page, items: page.items.map(normalizeMatch) }
}

/** 成员5 的列表类接口均返回分页对象，部分页面按数组消费。 */
function unwrapPage<T>(payload: PageResult<T> | T[]): T[] {
  return Array.isArray(payload) ? payload : payload.items
}

export const matchApi = {
  list: async (params: Query) => normalizeMatchPage(await http.get<PageResult<Match>>('/matches', params)),
  get: async (id: string) => normalizeMatch(await http.get<Match>(`/matches/${id}`)),
  create: async (data: Query) => normalizeMatch(await http.post<Match>('/matches', data)),
  update: async (id: string, data: Query) =>
    normalizeMatch(await http.put<Match>(`/matches/${id}`, data)),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/matches/${id}`, { version }),
  publish: (id: string, version: number) =>
    http.post<{ success: boolean }>(`/matches/${id}/publish`, { version }),
  /** 下线需填写原因并带 version，后端会写入审计 */
  unpublish: (id: string, version: number, reason: string) =>
    http.post<{ success: boolean }>(`/matches/${id}/unpublish`, { version, reason }),
  events: (id: string, params?: Query) =>
    http.get<PageResult<MatchEvent>>(`/matches/${id}/events`, params),
  /** 事件录入必带 Idempotency-Key，重复提交不会重复计分 */
  addEvent: (id: string, data: Query) =>
    http.postIdempotent<MatchEvent>(`/matches/${id}/events`, data, newIdempotencyKey('event')),
  /** 修改事件的后端信封是 { version, event: {...} }，不是平铺字段。 */
  updateEvent: (id: string, eid: string, data: Query) => {
    const { version, ...event } = data
    return http.put<MatchEvent>(`/matches/${id}/events/${eid}`, { version, event })
  },
  /** 撤销事件需同时带事件版本与比赛版本，后端重算比分 */
  removeEvent: (id: string, eid: string, version: number, matchVersion: number) =>
    http.delete<{ success: boolean }>(`/matches/${id}/events/${eid}`, { version, matchVersion }),
  documents: async (id: string) => {
    const page = await http.get<PageResult<MatchDocument>>(`/matches/${id}/documents`)
    return {
      ...page,
      // 成员5 只返回 fileId，没有 fileName；下载时用 fileId 兜底。
      items: page.items.map((item) => ({ ...item, fileName: item.fileName || item.fileId || '' })),
    }
  },
  addDocument: async (id: string, data: Query) => {
    const doc = await http.post<MatchDocument>(`/matches/${id}/documents`, data)
    return { ...doc, fileName: doc.fileName || doc.fileId || '' }
  },
  livePosts: (id: string, params?: Query) =>
    http.get<PageResult<LivePost>>(`/matches/${id}/live-posts`, params),
  addLivePost: (id: string, data: Query) => http.post<LivePost>(`/matches/${id}/live-posts`, data),
  updateLivePost: (id: string, pid: string, data: Query) =>
    http.put<LivePost>(`/matches/${id}/live-posts/${pid}`, data),
  removeLivePost: (id: string, pid: string, version?: number) =>
    http.delete<{ success: boolean }>(`/matches/${id}/live-posts/${pid}`, { version }),
  liveLinks: async (id: string) =>
    unwrapPage(await http.get<PageResult<LiveLink> | LiveLink[]>(`/matches/${id}/live-links`)),
  addLiveLink: (id: string, data: Query) => http.post<LiveLink>(`/matches/${id}/live-links`, data),
  updateLiveLink: (id: string, lid: string, data: Query) =>
    http.put<LiveLink>(`/matches/${id}/live-links/${lid}`, data),
  removeLiveLink: (id: string, lid: string, version?: number) =>
    http.delete<{ success: boolean }>(`/matches/${id}/live-links/${lid}`, { version }),
  result: (id: string) => http.get<MatchResult>(`/matches/${id}/result`),
  saveResult: (id: string, data: Query) => http.put<MatchResult>(`/matches/${id}/result`, data),
  publishResult: (id: string, version: number) =>
    http.post<{ success: boolean }>(`/matches/${id}/result/publish`, { version }),
  revokeResult: (id: string, version: number) =>
    http.delete<{ success: boolean }>(`/matches/${id}/result`, { version }),
  goals: async (params: Query) => {
    const res = await http.get<PageResult<GoalRankingRow>>('/statistics/goals', params)
    return { rows: res.items, generatedAt: '' }
  },
}

export const contentApi = {
  list: (params: Query) => http.get<PageResult<Content>>('/contents', params),
  get: (id: string) => http.get<Content>(`/contents/${id}`),
  create: (data: Query) => http.post<Content>('/contents', data),
  update: (id: string, data: Query) => http.put<Content>(`/contents/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/contents/${id}`, { version }),
  publish: (id: string, version: number) =>
    http.post<Content>(`/contents/${id}/publish`, { version }),
  unpublish: (id: string, version: number, reason: string) =>
    http.post<Content>(`/contents/${id}/unpublish`, { version, reason }),
}

export const resourceApi = {
  list: (params: Query) => http.get<PageResult<PortalResource>>('/portal-resources', params),
  create: (data: Query) => http.post<PortalResource>('/portal-resources', data),
  update: (id: string, data: Query) => http.put<PortalResource>(`/portal-resources/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/portal-resources/${id}`, { version }),
}

export const identityApi = {
  /** 成员2 文档中的列表路径是 /identity-checks/list，不是 /identity-checks。 */
  /** 状态与比赛筛选已由后端支持，分页与统计都基于服务端结果。 */
  list: (params: {
    page?: number
    pageSize?: number
    matchId?: string
    enrollmentId?: string
    athleteId?: string
    manualStatus?: string
    machineStatus?: string
  }) => http.get<PageResult<IdentityCheck>>('/identity-checks/list', params),
  get: (id: string) => http.get<IdentityCheck>(`/identity-checks/${id}`),
  /** 创建按幂等契约要求携带 Idempotency-Key。 */
  create: (data: Query) =>
    http.postIdempotent<IdentityCheck>('/identity-checks', data, newIdempotencyKey('identity')),
  review: (
    id: string,
    data: {
      version: number
      decision: 'CONFIRM_IDENTITY' | 'REJECT_IDENTITY'
      reason: string
    },
  ) => http.post<IdentityCheck>(`/identity-checks/${id}/manual-review`, data),
}

export const publicApi = {
  events: (params?: Query) => http.get<PageResult<PublicEvent>>('/public/events', params),
  contents: (params: Query) => http.get<PageResult<PublicContent>>('/public/contents', params),
  content: (id: string) => http.get<PublicContent>(`/public/contents/${id}`),
  resources: (params?: Query) => http.get<{ items: PublicResource[] }>('/public/resources', params),
  matches: (params: Query) => http.get<PageResult<PublicMatch>>('/public/matches', params),
  match: (id: string) => http.get<PublicMatch & { events: MatchEvent[]; referees?: Match['referees'] }>(`/public/matches/${id}`),
  liveFeed: (id: string, afterRevision = 0) =>
    http.get<PublicLiveFeed>(`/public/matches/${id}/live-feed`, { afterRevision }),
  liveLinks: async (id: string) =>
    unwrapPage(await http.get<PageResult<LiveLink> | LiveLink[]>(`/public/matches/${id}/live-links`)),
  goals: async (params: Query) => {
    const res = await http.get<PageResult<GoalRankingRow>>('/public/statistics/goals', params)
    return { rows: res.items, generatedAt: '' }
  },
  askPolicy: (question: string) => http.post<PolicyAnswer>('/public/policy-questions', { question }),
}

export type { PublicLivePost }
