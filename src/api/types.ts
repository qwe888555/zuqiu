/** 后端接口文档 v1.0.0-draft 对应的前端类型定义（节选常用模型） */

/**
 * 角色编码。UNIVERSITY 为接口沿用的历史编码，前端统一展示为“学校端”；
 * 学校端与 TEAM（球队端）是上下级关系，共用登录入口，按角色进入不同工作台并隔离数据。
 * 该编码只表示中小学学校端，不代表高校组别。
 */
export type RoleCode =
  | 'TEAM'
  | 'UNIVERSITY'
  | 'CITY'
  | 'PROVINCE_REVIEWER'
  | 'ATHLETE'
  | 'COACH'
  | 'ADMIN'
  | 'MATCH_RECORDER'

export type SubjectType = 'SCHOOL_TEAM' | 'CITY'

export type EnrollmentStatus =
  | 'DRAFT'
  | 'PENDING_CITY_REVIEW'
  | 'PENDING_PROVINCE_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'

export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELLED'
export type ContentType = 'NEWS' | 'POLICY' | 'HIGHLIGHT' | 'BEST_LINEUP'
export type RoundType = 'PRELIMINARY' | 'FINAL'
export type GroupCategory = 'PRIMARY' | 'MIDDLE'

export interface Envelope<T> {
  code: string
  message: string
  data: T
  requestId: string
}

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface ActionResult {
  success: boolean
  id?: string
  version?: number
}

export interface MenuItem {
  key: string
  title: string
  path: string
  permission?: string
  children?: MenuItem[]
}

export interface CurrentUser {
  accountId: string
  username: string
  displayName?: string
  roles: RoleCode[]
  orgId?: string
  orgName?: string
  personId?: string
  teamIds?: string[]
  permissions: string[]
  menus: MenuItem[]
}

export interface LoginResult {
  accessToken: string
  expiresIn: number
  accountId: string
  roles: RoleCode[]
}

export interface Account {
  id: string
  username: string
  displayName: string
  roles: RoleCode[]
  orgId: string
  orgName?: string
  teamIds?: string[]
  personId?: string
  enabled: boolean
  lastLoginAt?: string
  version: number
  createdAt?: string
  updatedAt?: string
}

export interface Organization {
  id: string
  parentId?: string
  name: string
  orgType: 'PROVINCE' | 'CITY' | 'SCHOOL' | 'TEAM'
  code: string
  enabled: boolean
  version: number
}

export interface DictionaryItem {
  id: string
  dictType: string
  value: string
  label: string
  sortOrder?: number
  enabled: boolean
  version: number
}

export interface AuditLog {
  id: string
  logType?: 'OPERATION' | 'LOGIN' | 'ENROLLMENT'
  operatorAccountId?: string
  operatorName?: string
  action?: string
  objectType?: string
  objectId?: string
  summary?: string
  outcome?: 'SUCCESS' | 'FAILURE'
  version: number
  createdAt?: string
}

export interface Message {
  id: string
  title: string
  body?: string
  businessType?: string
  businessId?: string
  read: boolean
  readAt?: string
  version: number
  createdAt?: string
}

export type PersonKind = 'ATHLETE' | 'COACH'

export interface Person {
  id: string
  kinds: PersonKind[]
  realName: string
  maskedIdNumber?: string
  maskedPhone?: string
  maskedStudentNumber?: string
  gender?: 'MALE' | 'FEMALE' | 'UNSPECIFIED'
  birthDate?: string
  schoolOrgId?: string
  schoolName?: string
  teamName?: string
  avatarFileId?: string
  avatarUrl?: string
  education?: string
  coachCategory?: string
  reviewStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
  version: number
  createdAt?: string
}

export interface Material {
  id: string
  ownerType: 'PERSON' | 'TEAM'
  ownerId: string
  ownerName?: string
  materialType: string
  materialLabel: string
  title: string
  description?: string
  fileIds?: string[]
  fileName?: string
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewReason?: string
  version: number
  createdAt?: string
}

export interface Team {
  id: string
  name: string
  shortName?: string
  orgId?: string
  cityOrgId?: string
  cityName?: string
  category?: GroupCategory
  schoolName?: string
  /** 分校/校区名称；同一学校（orgId）下的校区共享学校名额。 */
  campusName?: string
  gender?: 'MALE' | 'FEMALE' | 'MIXED'
  coachName?: string
  intro?: string
  flagUrl?: string
  emblemUrl?: string
  groupPhotoUrl?: string
  memberCount?: number
  status?: 'PENDING' | 'APPROVED'
  version: number
  createdAt?: string
}

export interface TeamMember {
  id: string
  teamId: string
  athleteId: string
  athleteName: string
  maskedIdNumber?: string
  jerseyNumber?: number
  position?: string
  avatarFileId?: string
  photoUrl?: string
  effectiveFrom?: string
  effectiveTo?: string
  active?: boolean
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  version: number
}

export type CoachCategory = 'HEAD_COACH' | 'ASSISTANT_COACH' | 'MANAGER' | 'OTHER'

export interface TeamCoach {
  id: string
  teamId: string
  coachId: string
  coachName: string
  category: CoachCategory
  effectiveFrom?: string
  effectiveTo?: string
  maskedPhone?: string
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  version: number
}

export interface MyAffiliation {
  id: string
  personId: string
  teamId: string
  teamName: string
  relation: string
  startDate?: string
  endDate?: string
  current: boolean
  verifyStatus: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED'
  version: number
}

export interface Event {
  id: string
  name: string
  season: string
  eventCategory?: string
  registrationOpensAt: string
  registrationClosesAt: string
  status: 'DRAFT' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'RUNNING' | 'FINISHED'
  description?: string
  groupCount?: number
  teamCount?: number
  version: number
}

export interface EventGroup {
  id: string
  eventId: string
  name: string
  category: GroupCategory
  gender: 'MALE' | 'FEMALE' | 'MIXED'
  quota?: number
  /** 每所学校在该组别最多可报的球队数；0 表示不限，缺省按 1 处理。 */
  schoolQuota?: number
  minAge?: number
  maxAge?: number
  maxPlayers: number
  requiredMaterialTypes: string[]
  teamCount?: number
  /** 接口动态返回：该组别已占用名额的报名数。 */
  totalUsed?: number
  /** 接口动态返回：当前学校在该组别已占用的名额数。 */
  schoolUsed?: number
  version: number
}

export interface Enrollment {
  id: string
  eventId: string
  eventName: string
  groupId: string
  groupName: string
  teamId: string
  teamName: string
  subjectType: SubjectType
  /** 报送学校（与球队 orgId 一致）。 */
  schoolOrgId?: string
  schoolName?: string
  campusName?: string
  cityOrgId?: string
  cityName?: string
  status: EnrollmentStatus
  submissionNo: number
  contactName: string
  maskedContactPhone?: string
  remarks?: string
  editable: boolean
  snapshotId?: string
  playerCount: number
  version: number
  createdAt?: string
  updatedAt?: string
  latestReviewReason?: string
}

export interface RosterItem {
  id: string
  athleteId: string
  athleteName: string
  maskedIdNumber?: string
  jerseyNumber?: number
  position?: string
  photoFileId?: string
  photoUrl?: string
  gender?: 'MALE' | 'FEMALE' | 'UNSPECIFIED'
  schoolName?: string
  version: number
}

export interface EnrollmentAttachment {
  id: string
  materialType: 'STAMPED_FORM' | 'STUDENT_STATUS'
  fileId: string
  fileName: string
  athleteId?: string
  athleteName?: string
  version: number
}

export interface ReviewRecord {
  id: string
  enrollmentId: string
  submissionNo?: number
  stage?: 'CITY' | 'PROVINCE' | 'SUBMISSION'
  action?: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'WITHDRAW'
  fromStatus?: EnrollmentStatus
  toStatus?: EnrollmentStatus
  reason?: string
  operatorName?: string
  createdAt?: string
}

export interface PrecheckIssue {
  code: string
  field?: string
  athleteId?: string
  athleteName?: string
  message: string
  severity: 'ERROR' | 'WARNING'
}

export interface PrecheckResult {
  passed: boolean
  checkedVersion: number
  issues: PrecheckIssue[]
}

export interface Match {
  id: string
  eventId: string
  eventName?: string
  groupId: string
  groupName?: string
  homeTeamId: string
  awayTeamId: string
  homeTeamName: string
  awayTeamName: string
  kickoffAt: string
  venue?: string
  stage?: string
  status: MatchStatus
  homeScore?: number
  awayScore?: number
  published: boolean
  resultPublished: boolean
  scoreRevision: number
  referees?: { name: string; role: string; level?: string }[]
  version: number
}

export interface MatchEvent {
  id: string
  matchId: string
  eventType: 'GOAL' | 'PENALTY' | 'SUBSTITUTION'
  minute?: number
  stoppageMinute?: number
  teamId?: string
  teamName?: string
  scorerAthleteId?: string
  scorerName?: string
  ownGoal?: boolean
  athleteId?: string
  athleteName?: string
  penaltyType?: 'YELLOW_CARD' | 'RED_CARD' | 'PENALTY_KICK' | 'OTHER'
  reason?: string
  outAthleteName?: string
  inAthleteName?: string
  note?: string
  version: number
  createdAt?: string
}

export interface LivePost {
  id: string
  matchId: string
  text: string
  imageUrls?: string[]
  minute?: number
  cursor?: number
  version: number
  createdAt?: string
}

export interface LiveLink {
  id: string
  matchId: string
  title: string
  url: string
  enabled: boolean
  version: number
}

export interface MatchDocument {
  id: string
  matchId: string
  documentType: 'SIGN_IN' | 'SIGNED_RECORD' | 'REFEREE_REPORT'
  fileId?: string
  fileName: string
  version: number
  createdAt?: string
}

export interface MatchResult {
  matchId: string
  resultType: 'NORMAL' | 'FORFEIT' | 'ADMIN_CORRECTION'
  homeScore: number
  awayScore: number
  reason?: string
  published: boolean
  sourceScoreRevision: number
  version: number
}

export interface GoalRankingRow {
  rank: number
  athleteId: string
  athleteName: string
  teamId: string
  teamName: string
  goals: number
}

export interface Content {
  id: string
  contentType: ContentType
  title: string
  summary?: string
  bodyHtml: string
  coverUrl?: string
  coverFileId?: string
  eventId?: string
  groupId?: string
  policyDocumentNo?: string
  policyEffectiveFrom?: string
  policyEffectiveTo?: string
  pinned?: boolean
  status: 'DRAFT' | 'PUBLISHED' | 'OFFLINE'
  publishedAt?: string
  revision: number
  author?: string
  viewCount?: number
  version: number
  createdAt?: string
}

export interface PortalResource {
  id: string
  resourceType: 'CAROUSEL' | 'NEWS_LINK_IMAGE' | 'PARTNER'
  title: string
  imageUrl?: string
  imageFileId?: string
  targetContentId?: string
  targetUrl?: string
  sortOrder?: number
  enabled: boolean
  version: number
}

export interface Publication {
  id: string
  targetType: 'ATHLETE' | 'COACH' | 'ENROLLMENT'
  targetId: string
  targetName?: string
  teamName?: string
  eventId?: string
  groupId?: string
  groupName?: string
  cityOrgId?: string
  cityName?: string
  active: boolean
  publishedAt?: string
  cancelledAt?: string
  version: number
}

export interface PublicCard {
  publicationId: string
  targetType: 'ATHLETE' | 'COACH' | 'ENROLLMENT'
  displayName: string
  teamName?: string
  cityName?: string
  groupName?: string
  publicPhotoUrl?: string
}

export interface ScoreDimension {
  key: string
  label: string
  maxScore: number
  weight: number
}

export interface SelectionRule {
  id: string
  eventId: string
  eventName?: string
  groupId: string
  groupName?: string
  round: RoundType
  dimensions: ScoreDimension[]
  topN: number
  tiePolicy: 'KEEP_TIES'
  confirmed: boolean
  version: number
}

export interface DimensionScore {
  key: string
  label?: string
  value: number
  maxScore?: number
}

export interface SelectionScore {
  id: string
  ruleId: string
  athleteId: string
  athleteName: string
  teamName?: string
  groupName?: string
  round: RoundType
  dimensionScores: DimensionScore[]
  remark?: string
  totalScore?: number
  scoreRevision?: number
  operatorName?: string
  version: number
  createdAt?: string
}

export interface SelectionSummaryRow {
  athleteId: string
  athleteName: string
  teamId?: string
  teamName?: string
  totalScore: number
  rank: number
}

export interface SelectionSummary {
  ruleId: string
  round: RoundType
  scoreRevision: number
  rows: SelectionSummaryRow[]
}

export interface SelectionResult {
  id: string
  eventId: string
  eventName?: string
  groupId: string
  groupName?: string
  round: RoundType
  ruleId: string
  sourceScoreRevision: number
  stale: boolean
  rows: SelectionSummaryRow[]
  version: number
  createdAt?: string
}

export interface IdentityCheck {
  id: string
  matchId: string
  matchLabel?: string
  enrollmentId: string
  athleteId: string
  athleteName: string
  teamName?: string
  mode: 'FACE_COMPARE' | 'MANUAL'
  machineStatus: 'NOT_RUN' | 'MATCH' | 'MISMATCH' | 'UNAVAILABLE'
  machineVerified: boolean
  manualStatus: 'NOT_REVIEWED' | 'PENDING' | 'CONFIRMED' | 'REJECTED'
  manualReason?: string
  capturedPhotoUrl?: string
  reviewerName?: string
  reviewedAt?: string
  version: number
  createdAt?: string
}

export interface PublicContent {
  id: string
  contentType: ContentType
  title: string
  summary?: string
  bodyHtml: string
  publicCoverUrl?: string
  eventId?: string
  groupId?: string
  publishedAt?: string
  revision: number
}

export interface PublicMatch {
  id: string
  eventId: string
  eventName?: string
  groupId: string
  groupName?: string
  homeTeamName: string
  awayTeamName: string
  kickoffAt?: string
  venue?: string
  status: MatchStatus
  homeScore: number
  awayScore: number
  scoreRevision?: number
}

export interface PublicResource {
  id: string
  resourceType: 'CAROUSEL' | 'NEWS_LINK_IMAGE' | 'PARTNER'
  title: string
  imageUrl?: string
  targetContentId?: string
  targetUrl?: string
  sortOrder?: number
}

export interface PublicLivePost {
  id: string
  text: string
  imageUrls?: string[]
  minute?: number
  updatedAt?: string
}

export interface PublicLiveFeed {
  feedRevision: number
  items: PublicLivePost[]
  deletedIds: string[]
  resetRequired: boolean
}

export interface PolicyCitation {
  contentId: string
  title: string
  revision: number
  excerpt: string
  publicUrl: string
}

export interface PolicyAnswer {
  status: 'ANSWERED' | 'NO_EVIDENCE' | 'UNAVAILABLE' | 'DISABLED'
  answer: string
  citations: PolicyCitation[]
  fallbackPolicies: PolicyCitation[]
  aiGenerated: boolean
  requestId: string
}

export interface FileRecord {
  id: string
  ownerType: string
  ownerId: string
  category?: string
  originalName: string
  contentType?: string
  sizeBytes: number
  private: boolean
  url?: string
  version: number
}

export interface ImportError {
  rowNumber?: number
  field?: string
  code: string
  message: string
  fileName?: string
}

export interface ImportReport {
  batchId: string
  mode: 'VALIDATE_ONLY' | 'APPLY_VALID_ROWS' | 'PHOTO_IMPORT'
  total: number
  successCount: number
  failureCount: number
  enrollmentVersion: number
  errors: ImportError[]
}

export interface StatRow {
  key: string
  label: string
  teamCount: number
  athleteCount: number
  pendingCount?: number
  approvedCount?: number
  rejectedCount?: number
}

export interface OptionItem {
  value: string
  label: string
}
