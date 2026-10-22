import { http } from './http'
import type {
  Account,
  AuditLog,
  Content,
  CurrentUser,
  DictionaryItem,
  Enrollment,
  EnrollmentAttachment,
  Event,
  EventGroup,
  FileRecord,
  GoalRankingRow,
  IdentityCheck,
  ImportReport,
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
  OptionItem,
  Organization,
  PageResult,
  Person,
  PolicyAnswer,
  PortalResource,
  PrecheckResult,
  Publication,
  PublicContent,
  PublicLiveFeed,
  PublicLivePost,
  PublicMatch,
  PublicResource,
  ReviewRecord,
  RosterItem,
  SelectionResult,
  SelectionRule,
  SelectionScore,
  SelectionSummary,
  StatRow,
  Team,
  TeamCoach,
  TeamMember,
} from './types'

type Query = Record<string, unknown>

export const authApi = {
  login: (data: { username: string; password: string }) => http.post<LoginResult>('/auth/login', data),
  register: (data: Query) => http.post<{ success: boolean }>('/auth/registrations', data),
  logout: () => http.post<{ success: boolean }>('/auth/logout'),
}

export const meApi = {
  get: () => http.get<CurrentUser>('/me'),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    http.post<{ success: boolean }>('/me/password', data),
  messages: (params: Query) => http.get<PageResult<Message>>('/me/messages', params),
  readMessage: (id: string) => http.post<{ success: boolean }>(`/me/messages/${id}/read`),
  profile: () => http.get<Person>('/me/profile'),
  updateProfile: (data: Partial<Person>) => http.put<Person>('/me/profile', data),
  confirmProfile: () => http.post<{ success: boolean }>('/me/profile-confirmation'),
  profileMatch: () => http.get<Record<string, unknown>>('/me/profile-match'),
  teams: () => http.get<Team[]>('/me/teams'),
  affiliations: (params: Query) => http.get<PageResult<MyAffiliation>>('/me/team-affiliations', params),
  addAffiliation: (data: Query) => http.post<MyAffiliation>('/me/team-affiliations', data),
  updateAffiliation: (id: string, data: Query) =>
    http.put<MyAffiliation>(`/me/team-affiliations/${id}`, data),
  removeAffiliation: (id: string) => http.delete<{ success: boolean }>(`/me/team-affiliations/${id}`),
}

export const accountApi = {
  list: (params: Query) => http.get<PageResult<Account>>('/accounts', params),
  create: (data: Query) => http.post<Account>('/accounts', data),
  update: (id: string, data: Query) => http.put<Account>(`/accounts/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/accounts/${id}`, { version }),
  resetPassword: (id: string) => http.post<{ success: boolean }>(`/accounts/${id}/password-reset`),
  invite: () => http.post<{ registrationToken: string; expiresAt: string }>('/accounts/registration-invitations'),
}

export const orgApi = {
  list: (params: Query) => http.get<PageResult<Organization>>('/organizations', params),
  create: (data: Query) => http.post<Organization>('/organizations', data),
  update: (id: string, data: Query) => http.put<Organization>(`/organizations/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/organizations/${id}`, { version }),
}

export const dictApi = {
  list: (params: Query) => http.get<PageResult<DictionaryItem>>('/dictionary-items', params),
  options: (dictType: string) => http.get<OptionItem[]>(`/dictionaries/${dictType}/options`),
  create: (data: Query) => http.post<DictionaryItem>('/dictionary-items', data),
  update: (id: string, data: Query) => http.put<DictionaryItem>(`/dictionary-items/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/dictionary-items/${id}`, { version }),
}

export const auditApi = {
  list: (params: Query) => http.get<PageResult<AuditLog>>('/audit-logs', params),
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
  download: (fileId: string, fileName: string) =>
    http.download(`/files/${fileId}/content`, fileName),
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
  list: (params: Query) => http.get<PageResult<Material>>('/materials', params),
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
  groups: (id: string) => http.get<PageResult<EventGroup>>(`/events/${id}/groups`),
  availableGroups: (id: string) =>
    http.get<EventGroup[]>(`/available-events/${id}/groups`),
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

export const enrollmentApi = {
  list: (params: Query) => http.get<PageResult<Enrollment>>('/enrollments', params),
  get: (id: string) => http.get<EnrollmentDetail>(`/enrollments/${id}`),
  create: (data: Query) => http.post<Enrollment>('/enrollments', data),
  update: (id: string, data: Query) => http.put<Enrollment>(`/enrollments/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/enrollments/${id}`, { version }),
  players: (id: string, params?: Query) =>
    http.get<PageResult<RosterItem>>(`/enrollments/${id}/players`, params),
  addPlayer: (id: string, data: Query) => http.post<RosterItem>(`/enrollments/${id}/players`, data),
  updatePlayer: (id: string, rid: string, data: Query) =>
    http.put<RosterItem>(`/enrollments/${id}/players/${rid}`, data),
  removePlayer: (id: string, rid: string, version?: number) =>
    http.delete<{ success: boolean }>(`/enrollments/${id}/players/${rid}`, { version }),
  precheck: (id: string) => http.post<PrecheckResult>(`/enrollments/${id}/precheck`),
  submit: (id: string) => http.post<Enrollment>(`/enrollments/${id}/submit`),
  withdraw: (id: string, reason: string) => http.post<Enrollment>(`/enrollments/${id}/withdraw`, { reason }),
  reviews: (id: string) => http.get<ReviewRecord[]>(`/enrollments/${id}/reviews`),
  review: (id: string, data: { decision: 'APPROVE' | 'REJECT'; reason?: string }) =>
    http.post<Enrollment>(`/enrollments/${id}/reviews`, data),
  attachments: (id: string) => http.get<EnrollmentAttachment[]>(`/enrollments/${id}/attachments`),
  addAttachment: (id: string, data: Query) =>
    http.post<EnrollmentAttachment>(`/enrollments/${id}/attachments`, data),
  removeAttachment: (id: string, aid: string, version?: number) =>
    http.delete<{ success: boolean }>(`/enrollments/${id}/attachments/${aid}`, { version }),
  importPlayers: (id: string, mode: 'VALIDATE_ONLY' | 'APPLY_VALID_ROWS', file?: File) => {
    if (file) {
      const form = new FormData()
      form.append('mode', mode)
      form.append('file', file)
      return http.postForm<ImportReport>(`/enrollments/${id}/imports/players`, form)
    }
    return http.post<ImportReport>(`/enrollments/${id}/imports/players`, { mode })
  },
  importPhotos: (id: string, file?: File) => {
    if (file) {
      const form = new FormData()
      form.append('file', file)
      return http.postForm<ImportReport>(`/enrollments/${id}/imports/photos`, form)
    }
    return http.post<ImportReport>(`/enrollments/${id}/imports/photos`)
  },
  downloadRosterTemplate: () =>
    http.download('/imports/templates/roster.xlsx', '球员名单导入模板.xlsx'),
  downloadImportErrors: (batchId: string) =>
    http.download(`/imports/${batchId}/errors.csv`, `导入错误清单-${batchId}.csv`),
  statistics: (params: Query) => http.get<StatRow[]>('/enrollment-statistics', params),
  downloadRegistration: (id: string, enrollmentNo?: string) =>
    http.download(
      `/enrollments/${id}/documents/registration.pdf`,
      `报名表-${enrollmentNo || id}.pdf`,
    ),
  downloadPlayers: (id: string, enrollmentNo?: string) =>
    http.download(
      `/enrollments/${id}/documents/players.docx`,
      `球员信息表-${enrollmentNo || id}.docx`,
    ),
  exportRegistrations: (params: Query) =>
    http.download('/enrollment-exports/registrations.xlsx', '赛事报名情况.xlsx', 'post', params),
  exportDocuments: (params: Query) =>
    http.download('/enrollment-exports/documents.zip', '报名资料打包.zip', 'post', params),
}

export const matchApi = {
  list: (params: Query) => http.get<PageResult<Match>>('/matches', params),
  get: (id: string) => http.get<Match>(`/matches/${id}`),
  create: (data: Query) => http.post<Match>('/matches', data),
  update: (id: string, data: Query) => http.put<Match>(`/matches/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/matches/${id}`, { version }),
  publish: (id: string) => http.post<{ success: boolean }>(`/matches/${id}/publish`),
  unpublish: (id: string) => http.post<{ success: boolean }>(`/matches/${id}/unpublish`),
  events: (id: string, params?: Query) =>
    http.get<PageResult<MatchEvent>>(`/matches/${id}/events`, params),
  addEvent: (id: string, data: Query) => http.post<MatchEvent>(`/matches/${id}/events`, data),
  updateEvent: (id: string, eid: string, data: Query) =>
    http.put<MatchEvent>(`/matches/${id}/events/${eid}`, data),
  removeEvent: (id: string, eid: string) =>
    http.delete<{ success: boolean }>(`/matches/${id}/events/${eid}`),
  documents: (id: string) => http.get<MatchDocument[]>(`/matches/${id}/documents`),
  addDocument: (id: string, data: Query) => http.post<MatchDocument>(`/matches/${id}/documents`, data),
  livePosts: (id: string, params?: Query) =>
    http.get<PageResult<LivePost>>(`/matches/${id}/live-posts`, params),
  addLivePost: (id: string, data: Query) => http.post<LivePost>(`/matches/${id}/live-posts`, data),
  removeLivePost: (id: string, pid: string) =>
    http.delete<{ success: boolean }>(`/matches/${id}/live-posts/${pid}`),
  liveLinks: (id: string) => http.get<LiveLink[]>(`/matches/${id}/live-links`),
  addLiveLink: (id: string, data: Query) => http.post<LiveLink>(`/matches/${id}/live-links`, data),
  removeLiveLink: (id: string, lid: string) =>
    http.delete<{ success: boolean }>(`/matches/${id}/live-links/${lid}`),
  result: (id: string) => http.get<MatchResult>(`/matches/${id}/result`),
  saveResult: (id: string, data: Query) => http.put<MatchResult>(`/matches/${id}/result`, data),
  publishResult: (id: string) => http.post<{ success: boolean }>(`/matches/${id}/result/publish`),
  goals: (params: Query) =>
    http.get<{ rows: GoalRankingRow[]; generatedAt: string }>('/statistics/goals', params),
}

export const contentApi = {
  list: (params: Query) => http.get<PageResult<Content>>('/contents', params),
  get: (id: string) => http.get<Content>(`/contents/${id}`),
  create: (data: Query) => http.post<Content>('/contents', data),
  update: (id: string, data: Query) => http.put<Content>(`/contents/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/contents/${id}`, { version }),
  publish: (id: string) => http.post<Content>(`/contents/${id}/publish`),
  unpublish: (id: string) => http.post<Content>(`/contents/${id}/unpublish`),
}

export const resourceApi = {
  list: (params: Query) => http.get<PageResult<PortalResource>>('/portal-resources', params),
  create: (data: Query) => http.post<PortalResource>('/portal-resources', data),
  update: (id: string, data: Query) => http.put<PortalResource>(`/portal-resources/${id}`, data),
  remove: (id: string, version?: number) => http.delete<{ success: boolean }>(`/portal-resources/${id}`, { version }),
}

export const publicationApi = {
  list: (params: Query) => http.get<PageResult<Publication>>('/publications', params),
  create: (data: Query) => http.post<Publication>('/publications', data),
  cancel: (id: string, data: { version: number; reason: string }) =>
    http.post<{ success: boolean }>(`/publications/${id}/cancel`, data),
}

export const selectionApi = {
  rules: (params: Query) => http.get<PageResult<SelectionRule>>('/selection-rules', params),
  rule: (id: string) => http.get<SelectionRule>(`/selection-rules/${id}`),
  createRule: (data: Query) => http.post<SelectionRule>('/selection-rules', data),
  updateRule: (id: string, data: Query) => http.put<SelectionRule>(`/selection-rules/${id}`, data),
  scores: (params: Query) => http.get<PageResult<SelectionScore>>('/selection-scores', params),
  createScore: (data: Query) => http.post<SelectionScore>('/selection-scores', data),
  updateScore: (id: string, data: Query) => http.put<SelectionScore>(`/selection-scores/${id}`, data),
  summary: (ruleId: string) => http.get<SelectionSummary>('/selection-summaries', { ruleId }),
  exportSummary: (ruleId: string) =>
    http.download('/selection-summaries/export.xlsx', '遴选排名汇总.xlsx', 'get', undefined, {
      ruleId,
    }),
  results: (params: Query) => http.get<PageResult<SelectionResult>>('/selection-results', params),
  result: (id: string) => http.get<SelectionResult>(`/selection-results/${id}`),
  generate: (ruleId: string) => http.post<SelectionResult>('/selection-results/generate', { ruleId }),
  dossiers: (data: Query) => http.post<Record<string, unknown>[]>('/selection-dossiers/search', data),
  dossier: (athleteId: string) =>
    http.get<Record<string, unknown>>(`/selection-dossiers/${athleteId}`),
}

export const identityApi = {
  list: (params: Query) => http.get<PageResult<IdentityCheck>>('/identity-checks', params),
  get: (id: string) => http.get<IdentityCheck>(`/identity-checks/${id}`),
  create: (data: Query) => http.post<IdentityCheck>('/identity-checks', data),
  review: (id: string, data: { decision: 'CONFIRM_IDENTITY' | 'REJECT_IDENTITY'; reason?: string }) =>
    http.post<IdentityCheck>(`/identity-checks/${id}/manual-review`, data),
}

export const publicApi = {
  contents: (params: Query) => http.get<PageResult<PublicContent>>('/public/contents', params),
  content: (id: string) => http.get<PublicContent>(`/public/contents/${id}`),
  resources: (params?: Query) => http.get<{ items: PublicResource[] }>('/public/resources', params),
  matches: (params: Query) => http.get<PageResult<PublicMatch>>('/public/matches', params),
  match: (id: string) => http.get<PublicMatch & { events: MatchEvent[]; referees?: Match['referees'] }>(`/public/matches/${id}`),
  liveFeed: (id: string) => http.get<PublicLiveFeed>(`/public/matches/${id}/live-feed`),
  liveLinks: (id: string) => http.get<LiveLink[]>(`/public/matches/${id}/live-links`),
  goals: (params: Query) =>
    http.get<{ rows: GoalRankingRow[]; generatedAt: string }>('/public/statistics/goals', params),
  publications: (params: Query) =>
    http.get<PageResult<{ publicationId: string; targetType: 'ATHLETE' | 'COACH' | 'ENROLLMENT'; displayName: string; teamName?: string; cityName?: string; groupName?: string; publicPhotoUrl?: string }>>(
      '/public/publications',
      params,
    ),
  askPolicy: (question: string) => http.post<PolicyAnswer>('/public/policy-questions', { question }),
}

export type { PublicLivePost }
