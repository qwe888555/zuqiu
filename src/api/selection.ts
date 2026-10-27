import axios from 'axios'
import { ElMessage } from 'element-plus'
import { TOKEN_KEY } from './http'
import type {
  PageResult,
  PublicityRecord,
  PublicityStatus,
  PublicityType,
  ScoreDimensionValue,
  SelectionGroupType,
  SelectionResultBatch,
  SelectionResultItem,
  SelectionRound,
  SelectionScoreRecord,
  SelectionTemplate,
  TemplateDimension,
} from './types'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** 指定状态码不弹全局错误提示，由调用方按业务语义处理。 */
    silentStatuses?: number[]
  }
}

/**
 * 成员6 遴选评分与报名公示服务（模块 selection）。
 * 并入主程序（默认）：/api/v1/selection，信封 { code: "OK", message, data, requestId }。
 * 独立部署：/api/selection，信封 { code: 0, message, data }，可通过环境变量覆盖。
 * 两种部署的分页与字段名均已兼容，字段统一按 snake_case 读取。
 */
const SELECTION_BASE_URL = import.meta.env.VITE_SELECTION_API_BASE_URL || '/api/v1/selection'
const useMock = import.meta.env.VITE_USE_MOCK !== 'false'

const instance = axios.create({
  baseURL: SELECTION_BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

if (useMock) {
  // 懒加载 mock 模块，避免动态 import 未完成时首个请求落到真实接口；
  // 同时保证真实联调时 mock 数据不进产物包。
  instance.defaults.adapter = async (config) => {
    const { selectionMockAdapter } = await import('../mock/selectionMock')
    return selectionMockAdapter(config)
  }
}

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

interface SelectionEnvelope<T> {
  code: number | string
  message: string
  data: T
  requestId?: string
}

/** 独立模式 code=0；并入主程序后 code="OK"。 */
function isSuccessCode(code: number | string): boolean {
  return code === 0 || code === '0' || code === 'OK'
}

instance.interceptors.response.use(
  (response) => {
    const body = response.data as SelectionEnvelope<unknown>
    if (body && typeof body === 'object' && 'code' in body) {
      if (isSuccessCode(body.code)) return body.data
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return response.data
  },
  (error) => {
    const status = error?.response?.status
    const message = error?.response?.data?.message || error?.message || '网络异常，请稍后重试'
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    const silent = (error?.config?.silentStatuses as number[] | undefined)?.includes(status)
    if (!silent) ElMessage.error(message)
    return Promise.reject(error)
  },
)

async function request<T>(
  method: 'get' | 'post' | 'put',
  url: string,
  data?: unknown,
  params?: Record<string, unknown>,
  config?: { silentStatuses?: number[] },
): Promise<T> {
  return (await instance.request({ method, url, data, params, ...config })) as unknown as T
}

async function download(
  url: string,
  filename: string,
  params?: Record<string, unknown>,
): Promise<boolean> {
  const response = await instance.request({ method: 'get', url, params, responseType: 'blob' })
  const payload = response.data
  if (!(payload instanceof Blob)) return false
  const objectUrl = URL.createObjectURL(payload)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
  return true
}

/* ---------------------------------------------------------------------------
 * 字段与枚举映射
 * ------------------------------------------------------------------------- */

export const GROUP_TYPE_LABEL: Record<SelectionGroupType, string> = {
  HIGHER: '高校组',
  MIDDLE: '中学组',
  PRIMARY: '小学组',
}

export const ROUND_LABEL: Record<SelectionRound, string> = {
  INITIAL: '初选',
  FINAL: '复选',
}

export const PUBLICITY_TYPE_LABEL: Record<PublicityType, string> = {
  ATHLETE: '运动员',
  COACH: '教练员',
  TEAM: '球队',
}

type Raw = Record<string, any>

function toTemplateDimension(raw: Raw): TemplateDimension {
  return {
    id: str(raw.id),
    code: str(raw.dimension_code ?? raw.dimensionCode),
    name: str(raw.dimension_name ?? raw.dimensionName),
    weight: Number(raw.weight) || 0,
    maxScore: Number(raw.max_score ?? raw.maxScore) || 100,
    sortNo: Number(raw.sort_no ?? raw.sortNo) || undefined,
  }
}

function toTemplate(raw: Raw): SelectionTemplate {
  const groupType = (raw.group_type ?? raw.groupType) as SelectionGroupType
  const round = raw.round as SelectionRound
  return {
    id: str(raw.id),
    name: str(raw.name),
    groupType,
    groupTypeLabel: raw.group_type_label ?? GROUP_TYPE_LABEL[groupType],
    round,
    roundLabel: raw.round_label ?? ROUND_LABEL[round],
    status: Number(raw.status) === 0 ? 0 : 1,
    dimensions: ((raw.items ?? []) as Raw[]).map(toTemplateDimension),
    createdBy: str(raw.created_by ?? '') || undefined,
    createdAt: str(raw.created_at ?? '') || undefined,
    updatedAt: str(raw.updated_at ?? '') || undefined,
  }
}

function toScoreItem(raw: Raw): ScoreDimensionValue {
  return {
    id: str(raw.id),
    code: str(raw.dimension_code ?? raw.dimensionCode),
    name: str(raw.dimension_name ?? raw.dimensionName),
    weight: Number(raw.weight) || 0,
    maxScore: Number(raw.max_score ?? raw.maxScore) || 100,
    score: Number(raw.score) || 0,
    sortNo: Number(raw.sort_no ?? raw.sortNo) || undefined,
  }
}

function toScore(raw: Raw): SelectionScoreRecord {
  const groupType = (raw.group_type ?? raw.groupType) as SelectionGroupType
  const round = raw.round as SelectionRound
  return {
    id: str(raw.id),
    eventId: str(raw.event_id ?? raw.eventId),
    groupType,
    groupTypeLabel: raw.group_type_label ?? GROUP_TYPE_LABEL[groupType],
    round,
    roundLabel: raw.round_label ?? ROUND_LABEL[round],
    templateId: str(raw.template_id ?? raw.templateId),
    candidateId: str(raw.candidate_id ?? raw.candidateId),
    candidateName: str(raw.candidate_name ?? raw.candidateName),
    teamName: str(raw.team_name ?? raw.teamName) || undefined,
    position: str(raw.position) || undefined,
    totalScore: Number(raw.total_score ?? raw.totalScore) || 0,
    version: Number(raw.version) || 0,
    createdBy: str(raw.created_by ?? '') || undefined,
    createdAt: str(raw.created_at ?? '') || undefined,
    updatedAt: str(raw.updated_at ?? '') || undefined,
    items: ((raw.items ?? []) as Raw[]).map(toScoreItem),
    rankNo: raw.rank_no != null ? Number(raw.rank_no) : undefined,
  }
}

function toResultItem(raw: Raw): SelectionResultItem {
  return {
    rankNo: Number(raw.rank_no ?? raw.rankNo) || 0,
    candidateId: str(raw.candidate_id ?? raw.candidateId),
    candidateName: str(raw.candidate_name ?? raw.candidateName),
    teamName: str(raw.team_name ?? raw.teamName) || undefined,
    position: str(raw.position) || undefined,
    initialScore: raw.initial_score != null ? Number(raw.initial_score) : undefined,
    finalScore: raw.final_score != null ? Number(raw.final_score) : undefined,
    compositeScore: Number(raw.composite_score ?? raw.compositeScore) || 0,
    detail: (raw.detail as Record<string, unknown>) || undefined,
  }
}

function toResultBatch(raw: Raw): SelectionResultBatch {
  const groupType = (raw.group_type ?? raw.groupType) as SelectionGroupType
  const resultRound = (raw.result_round ?? raw.resultRound) as SelectionRound
  return {
    id: str(raw.id),
    eventId: str(raw.event_id ?? raw.eventId),
    groupType,
    groupTypeLabel: raw.group_type_label ?? GROUP_TYPE_LABEL[groupType],
    resultRound,
    resultRoundLabel: raw.result_round_label ?? ROUND_LABEL[resultRound],
    quota: Number(raw.quota) || 0,
    initialWeight: Number(raw.initial_weight ?? raw.initialWeight) || 0,
    finalWeight: Number(raw.final_weight ?? raw.finalWeight) || 0,
    formulaSnapshot: str(raw.formula_snapshot ?? raw.formulaSnapshot) || undefined,
    versionNo: Number(raw.version_no ?? raw.versionNo) || 0,
    active: Boolean(raw.active),
    stale: Boolean(raw.stale),
    generatedBy: str(raw.generated_by ?? '') || undefined,
    generatedAt: str(raw.generated_at ?? '') || undefined,
    items: ((raw.items ?? []) as Raw[]).map(toResultItem),
    itemCount: raw.item_count != null ? Number(raw.item_count) : undefined,
  }
}

function toPublicity(raw: Raw): PublicityRecord {
  const groupType = (raw.group_type ?? raw.groupType) as SelectionGroupType | undefined
  const publicityType = (raw.publicity_type ?? raw.publicityType) as PublicityType
  const status = (raw.status ?? 'PUBLISHED') as PublicityStatus
  return {
    id: str(raw.id),
    eventId: str(raw.event_id ?? raw.eventId),
    groupType,
    groupTypeLabel: raw.group_type_label ?? (groupType ? GROUP_TYPE_LABEL[groupType] : undefined),
    city: str(raw.city) || undefined,
    publicityType,
    publicityTypeLabel: raw.publicity_type_label ?? PUBLICITY_TYPE_LABEL[publicityType],
    name: str(raw.name),
    teamName: str(raw.team_name ?? raw.teamName) || undefined,
    schoolName: str(raw.school_name ?? raw.schoolName) || undefined,
    idCardMasked: str(raw.id_card_masked ?? raw.idCardMasked) || undefined,
    fields: (raw.fields as Record<string, unknown>) || undefined,
    status,
    statusLabel: raw.status_label ?? (status === 'PUBLISHED' ? '已公示' : '已取消'),
    publishedAt: str(raw.published_at ?? raw.publishedAt) || undefined,
    sourceId: str(raw.source_id ?? raw.sourceId) || undefined,
    publishedBy: str(raw.published_by ?? '') || undefined,
    cancelledBy: str(raw.cancelled_by ?? '') || undefined,
    cancelledAt: str(raw.cancelled_at ?? raw.cancelledAt) || undefined,
    cancelReason: str(raw.cancel_reason ?? raw.cancelReason) || undefined,
    createdAt: str(raw.created_at ?? '') || undefined,
    updatedAt: str(raw.updated_at ?? '') || undefined,
  }
}

function str(value: unknown): string {
  return value == null ? '' : String(value)
}

function toPage<T>(raw: Raw | Raw[], mapper: (item: Raw) => T): PageResult<T> {
  // 模板列表等接口直接返回数组（不分页），统一包装成 PageResult 供页面消费。
  if (Array.isArray(raw)) {
    return { items: raw.map(mapper), page: 1, pageSize: raw.length || 10, total: raw.length }
  }
  const records = (raw.records ?? raw.items ?? []) as Raw[]
  return {
    items: records.map(mapper),
    page: Number(raw.page) || 1,
    pageSize: Number(raw.size ?? raw.pageSize) || 10,
    total: Number(raw.total) || records.length,
  }
}

/* ---------------------------------------------------------------------------
 * 评分模板
 * ------------------------------------------------------------------------- */

export interface TemplateQuery {
  groupType?: SelectionGroupType
  round?: SelectionRound
  status?: number
  page?: number
  size?: number
}

export interface TemplatePayload {
  name: string
  groupType: SelectionGroupType
  round: SelectionRound
  dimensions: TemplateDimension[]
}

export const selectionTemplateApi = {
  async list(params: TemplateQuery = {}): Promise<PageResult<SelectionTemplate>> {
    const raw = await request<Raw | Raw[]>('get', '/templates/', undefined, {
      group_type: params.groupType,
      round: params.round,
      status: params.status,
      page: params.page,
      size: params.size,
    })
    return toPage(raw, toTemplate)
  },
  async get(id: string): Promise<SelectionTemplate> {
    return toTemplate(await request<Raw>('get', `/templates/${id}/`))
  },
  async create(payload: TemplatePayload): Promise<SelectionTemplate> {
    const raw = await request<Raw>('post', '/templates/', {
      name: payload.name,
      group_type: payload.groupType,
      round: payload.round,
      items: payload.dimensions.map((item, index) => ({
        dimension_code: item.code,
        dimension_name: item.name,
        weight: item.weight,
        max_score: item.maxScore,
        sort_no: item.sortNo ?? index + 1,
      })),
    })
    return toTemplate(raw)
  },
  async update(id: string, payload: Partial<TemplatePayload>): Promise<SelectionTemplate> {
    const body: Raw = {}
    if (payload.name !== undefined) body.name = payload.name
    if (payload.groupType !== undefined) body.group_type = payload.groupType
    if (payload.round !== undefined) body.round = payload.round
    if (payload.dimensions) {
      body.items = payload.dimensions.map((item, index) => ({
        dimension_code: item.code,
        dimension_name: item.name,
        weight: item.weight,
        max_score: item.maxScore,
        sort_no: item.sortNo ?? index + 1,
      }))
    }
    return toTemplate(await request<Raw>('put', `/templates/${id}/`, body))
  },
  async setStatus(id: string, status: 0 | 1): Promise<SelectionTemplate> {
    return toTemplate(await request<Raw>('put', `/templates/${id}/`, { status }))
  },
}

/* ---------------------------------------------------------------------------
 * 可评分运动员
 * ------------------------------------------------------------------------- */

export interface ScoringCandidate {
  candidateId: string
  eventId: string
  name: string
  teamName: string
  groupType: SelectionGroupType
  position?: string
  idCardMasked?: string
}

export const selectionCandidateApi = {
  async list(params: {
    eventId?: string
    groupType: SelectionGroupType
    keyword?: string
  }): Promise<ScoringCandidate[]> {
    const raw = await request<Raw[]>('get', '/candidates/', undefined, {
      event_id: params.eventId || undefined,
      group_type: params.groupType,
      keyword: params.keyword || undefined,
    })
    return (raw || []).map((item) => ({
      candidateId: str(item.candidate_id ?? item.candidateId),
      eventId: str(item.event_id ?? item.eventId),
      name: str(item.name),
      teamName: str(item.team_name ?? item.teamName),
      groupType: (item.group_type ?? item.groupType) as SelectionGroupType,
      position: str(item.position) || undefined,
      idCardMasked: str(item.id_card_masked ?? item.idCardMasked) || undefined,
    }))
  },
}

/* ---------------------------------------------------------------------------
 * 评分录入与汇总
 * ------------------------------------------------------------------------- */

export interface ScoreQuery {
  eventId: string
  groupType: SelectionGroupType
  round: SelectionRound
  keyword?: string
  page?: number
  size?: number
}

export interface ScorePayload {
  eventId: string
  groupType: SelectionGroupType
  round: SelectionRound
  templateId: string
  candidateId: string
  scores: Array<{ dimensionCode: string; score: number }>
}

export const selectionScoreApi = {
  async list(params: ScoreQuery): Promise<PageResult<SelectionScoreRecord>> {
    const raw = await request<Raw>('get', '/scores/', undefined, {
      event_id: params.eventId,
      group_type: params.groupType,
      round: params.round,
      keyword: params.keyword || undefined,
      page: params.page,
      size: params.size,
    })
    return toPage(raw, toScore)
  },
  async get(id: string): Promise<SelectionScoreRecord> {
    return toScore(await request<Raw>('get', `/scores/${id}/`))
  },
  async create(payload: ScorePayload): Promise<SelectionScoreRecord> {
    const raw = await request<Raw>('post', '/scores/', {
      event_id: payload.eventId,
      group_type: payload.groupType,
      round: payload.round,
      template_id: payload.templateId,
      candidate_id: payload.candidateId,
      scores: payload.scores.map((item) => ({
        dimension_code: item.dimensionCode,
        score: item.score,
      })),
    })
    return toScore(raw)
  },
  async update(id: string, scores: Array<{ dimensionCode: string; score: number }>): Promise<SelectionScoreRecord> {
    const raw = await request<Raw>('put', `/scores/${id}/`, {
      scores: scores.map((item) => ({ dimension_code: item.dimensionCode, score: item.score })),
    })
    return toScore(raw)
  },
  async summary(params: Omit<ScoreQuery, 'keyword' | 'page' | 'size'>): Promise<SelectionScoreRecord[]> {
    const raw = await request<Raw | Raw[]>('get', '/scores/summary/', undefined, {
      event_id: params.eventId,
      group_type: params.groupType,
      round: params.round,
    })
    const list = Array.isArray(raw) ? raw : ((raw.records ?? raw.items ?? []) as Raw[])
    return list.map(toScore)
  },
  exportScores(params: Pick<ScoreQuery, 'eventId' | 'groupType' | 'round'>): Promise<boolean> {
    return download('/scores/export/', `评分汇总-${params.groupType}-${params.round}.xlsx`, {
      event_id: params.eventId,
      group_type: params.groupType,
      round: params.round,
    })
  },
}

/* ---------------------------------------------------------------------------
 * 遴选结果
 * ------------------------------------------------------------------------- */

export interface GenerateResultPayload {
  eventId: string
  groupType: SelectionGroupType
  resultRound: SelectionRound
  quota: number
  initialWeight: number
  finalWeight: number
}

export const selectionResultApi = {
  async generate(payload: GenerateResultPayload): Promise<SelectionResultBatch> {
    const raw = await request<Raw>('post', '/results/generate/', {
      event_id: payload.eventId,
      group_type: payload.groupType,
      result_round: payload.resultRound,
      quota: payload.quota,
      initial_weight: payload.initialWeight,
      final_weight: payload.finalWeight,
    })
    return toResultBatch(raw)
  },
  async latest(params: { eventId: string; groupType: SelectionGroupType }): Promise<SelectionResultBatch | null> {
    try {
      const raw = await request<Raw | null>(
        'get',
        '/results/latest/',
        undefined,
        {
          event_id: params.eventId,
          group_type: params.groupType,
        },
        // 404 = 该组别尚未生成结果，属于正常业务状态，不弹错误提示。
        { silentStatuses: [404] },
      )
      return raw ? toResultBatch(raw) : null
    } catch (error) {
      if ((error as { response?: { status?: number } })?.response?.status === 404) return null
      throw error
    }
  },
  async batches(params: { eventId: string; groupType: SelectionGroupType; limit?: number }): Promise<SelectionResultBatch[]> {
    const raw = await request<Raw | Raw[]>('get', '/results/batches/', undefined, {
      event_id: params.eventId,
      group_type: params.groupType,
      limit: params.limit,
    })
    const list = Array.isArray(raw) ? raw : ((raw.records ?? raw.items ?? []) as Raw[])
    return list.map(toResultBatch)
  },
  exportResult(params: { eventId: string; groupType: SelectionGroupType }): Promise<boolean> {
    return download('/results/export/', `遴选结果-${params.groupType}.xlsx`, {
      event_id: params.eventId,
      group_type: params.groupType,
    })
  },
}

/* ---------------------------------------------------------------------------
 * 报名公示
 * ------------------------------------------------------------------------- */

export interface PublicityQuery {
  eventId: string
  groupType?: SelectionGroupType
  city?: string
  publicityType?: PublicityType
  status?: PublicityStatus
  keyword?: string
  page?: number
  size?: number
}

export const publicityApi = {
  /** 门户公示列表（仅已公示） */
  async list(params: PublicityQuery): Promise<PageResult<PublicityRecord>> {
    const raw = await request<Raw>('get', '/publicity/', undefined, {
      event_id: params.eventId,
      group_type: params.groupType,
      city: params.city,
      publicity_type: params.publicityType,
      keyword: params.keyword || undefined,
      page: params.page,
      size: params.size,
    })
    return toPage(raw, toPublicity)
  },
  async detail(id: string): Promise<PublicityRecord> {
    return toPublicity(await request<Raw>('get', `/publicity/${id}/`))
  },
  async create(payload: { eventId: string; publicityType: PublicityType; sourceId: string }): Promise<PublicityRecord> {
    return toPublicity(
      await request<Raw>('post', '/publicity/', {
        event_id: payload.eventId,
        publicity_type: payload.publicityType,
        source_id: payload.sourceId,
      }),
    )
  },
  async cancel(id: string, reason?: string): Promise<PublicityRecord> {
    return toPublicity(
      await request<Raw>('post', `/publicity/${id}/cancel/`, reason ? { reason } : {}),
    )
  },
  async cities(params: { eventId: string; groupType?: SelectionGroupType; publicityType?: PublicityType }): Promise<string[]> {
    const raw = await request<string[] | Raw>('get', '/publicity/cities/', undefined, {
      event_id: params.eventId,
      group_type: params.groupType,
      publicity_type: params.publicityType,
    })
    return Array.isArray(raw) ? raw : []
  },
  async batch(payload: {
    eventId: string
    groupType?: SelectionGroupType
    publicityType?: PublicityType
    city?: string
  }): Promise<{ published: number; skipped: number; failed: number; errors: Array<{ sourceId?: string; message: string }> }> {
    const raw = await request<Raw>('post', '/publicity/batch/', {
      event_id: payload.eventId,
      group_type: payload.groupType,
      publicity_type: payload.publicityType,
      city: payload.city,
    })
    return {
      published: Number(raw.published) || 0,
      skipped: Number(raw.skipped) || 0,
      failed: Number(raw.failed) || 0,
      errors: ((raw.errors ?? []) as Raw[]).map((item) => ({
        sourceId: str(item.source_id ?? item.sourceId) || undefined,
        message: str(item.message),
      })),
    }
  },
  /** 仅按某一现行结果批次的入围名单发布运动员公示 */
  async publishResultBatch(payload: { resultBatchId: string }): Promise<{
    candidateCount: number
    published: number
    skipped: number
    failed: number
    errors: Array<{ candidateId?: string; sourceId?: string; message: string }>
  }> {
    const raw = await request<Raw>('post', '/publicity/result-batch/', {
      result_batch_id: payload.resultBatchId,
    })
    return {
      candidateCount: Number(raw.candidate_count) || 0,
      published: Number(raw.published) || 0,
      skipped: Number(raw.skipped) || 0,
      failed: Number(raw.failed) || 0,
      errors: ((raw.errors ?? []) as Raw[]).map((item) => ({
        candidateId: str(item.candidate_id ?? item.candidateId) || undefined,
        sourceId: str(item.source_id ?? item.sourceId) || undefined,
        message: str(item.message),
      })),
    }
  },
  /** 当前人员（运动员/教练）的全部公示记录，含已撤销 */
  async mine(params: { page?: number; size?: number } = {}): Promise<PageResult<PublicityRecord>> {
    const raw = await request<Raw>('get', '/publicity/mine/', undefined, {
      page: params.page,
      size: params.size,
    })
    return toPage(raw, toPublicity)
  },
  /** CMS 公示管理列表（含已取消） */
  async manageList(params: PublicityQuery): Promise<PageResult<PublicityRecord>> {
    const raw = await request<Raw>('get', '/publicity/manage/', undefined, {
      event_id: params.eventId,
      group_type: params.groupType,
      city: params.city,
      publicity_type: params.publicityType,
      status: params.status,
      keyword: params.keyword || undefined,
      page: params.page,
      size: params.size,
    })
    return toPage(raw, toPublicity)
  },
  async manageDetail(id: string): Promise<PublicityRecord> {
    return toPublicity(await request<Raw>('get', `/publicity/manage/${id}/`))
  },
}

/** 遴选档案（球员/报名档案）依赖成员4，走 /api/v1 档案聚合接口。 */
export { selectionDossierApi } from './selectionDossier'
export type { CandidateDossier, DossierSearchPayload } from './selectionDossier'
