import { http } from './http'
import type { Match, Material, PageResult, Person, Team } from './types'

/** 遴选档案聚合结果，字段口径见《后端接口文档》CandidateDossier。 */
export interface CandidateDossier {
  id: string
  athlete: Person
  teams?: Team[]
  materials?: Material[]
  enrollments?: Record<string, unknown>[]
  matchRecords?: Match[]
  version: number
  createdAt?: string
  updatedAt?: string
}

export interface DossierSearchPayload {
  athleteName?: string
  /** 后端按完整身份证号做受控精确检索，不支持后四位模糊匹配。 */
  idNumber?: string
  teamId?: string
  eventId?: string
  groupId?: string
  page?: number
  pageSize?: number
}

/**
 * 遴选档案查询（成员4，原框架模块 6.1）。
 * 检索固定为 POST /selection-dossiers/search，返回分页档案；
 * 详情 GET /selection-dossiers/{athleteId} 聚合人员、球队、材料与比赛记录。
 */
export const selectionDossierApi = {
  search: (data: DossierSearchPayload) =>
    http.post<PageResult<CandidateDossier>>('/selection-dossiers/search', {
      page: 1,
      pageSize: 20,
      ...data,
    }),
  get: (athleteId: string, eventId?: string) =>
    http.get<CandidateDossier>(
      `/selection-dossiers/${athleteId}`,
      eventId ? { eventId } : undefined,
    ),
}
