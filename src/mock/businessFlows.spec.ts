import { beforeAll, describe, expect, it } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { mockAdapter } from './adapter'
import type {
  Enrollment,
  GoalRankingRow,
  Match,
  MatchEvent,
  PageResult,
  ReviewRecord,
} from '../api/types'

async function call<T>(
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  options: {
    token?: string
    params?: Record<string, unknown>
    body?: unknown
    headers?: Record<string, string>
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers || {}) }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  const response = await mockAdapter({
    method,
    url: `/api/v1${path}`,
    params: options.params,
    data: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
  } as unknown as InternalAxiosRequestConfig)
  return (response.data as { data: T }).data
}

async function login(username: string): Promise<string> {
  const res = await call<{ accessToken: string }>('post', '/auth/login', {
    body: { username, password: '12345678' },
  })
  return res.accessToken
}

async function expectError(promise: Promise<unknown>) {
  try {
    await promise
    return null
  } catch (error) {
    return error as { response?: { status?: number; data?: { code?: string; message?: string } } }
  }
}

let idempotencySeq = 0
function idemKey(prefix: string) {
  idempotencySeq += 1
  return `${prefix}_flow_${Date.now()}_${idempotencySeq}`
}

/** 测试专用赛事：报名窗口固定为 2020–2099，避免种子赛事过期导致用例随时间失效。 */
let eventId = ''
let teamGroupId = ''
let schoolGroupId = ''

beforeAll(async () => {
  const adminToken = await login('admin')
  const event = await call<{ id: string }>('post', '/events', {
    token: adminToken,
    body: {
      name: '自动化链路测试赛事',
      season: '2099',
      eventCategory: 'SCHOOL_LEAGUE',
      registrationOpensAt: '2020-01-01T00:00:00+08:00',
      registrationClosesAt: '2099-12-31T23:59:59+08:00',
      status: 'REGISTRATION_OPEN',
    },
  })
  eventId = event.id
  const teamGroup = await call<{ id: string }>('post', `/events/${eventId}/groups`, {
    token: adminToken,
    body: {
      name: '自动化小学混合组',
      category: 'PRIMARY',
      gender: 'MIXED',
      quota: 16,
      schoolQuota: 1,
      maxPlayers: 18,
      requiredMaterialTypes: ['STAMPED_FORM', 'STUDENT_STATUS'],
    },
  })
  teamGroupId = teamGroup.id
  const schoolGroup = await call<{ id: string }>('post', `/events/${eventId}/groups`, {
    token: adminToken,
    body: {
      name: '自动化初中男子组',
      category: 'MIDDLE',
      gender: 'MALE',
      quota: 20,
      schoolQuota: 1,
      maxPlayers: 20,
      requiredMaterialTypes: ['STAMPED_FORM', 'STUDENT_STATUS'],
    },
  })
  schoolGroupId = schoolGroup.id
})

async function addPlayers(token: string, enrollmentId: string, teamId: string, count: number) {
  const members = await call<PageResult<{ athleteId: string }>>('get', `/teams/${teamId}/members`, {
    token,
    params: { page: 1, pageSize: 50 },
  })
  expect(members.items.length).toBeGreaterThanOrEqual(count)
  for (const member of members.items.slice(0, count)) {
    await call('post', `/enrollments/${enrollmentId}/players`, {
      token,
      body: { athleteId: member.athleteId },
    })
  }
}

async function addMaterials(token: string, enrollmentId: string) {
  for (const materialType of ['STAMPED_FORM', 'STUDENT_STATUS']) {
    await call('post', `/enrollments/${enrollmentId}/attachments`, {
      token,
      body: {
        materialType,
        fileId: `file_${enrollmentId}_${materialType}`,
        fileName: `${materialType}.pdf`,
      },
    })
  }
}

async function submitEnrollment(token: string, enrollmentId: string) {
  const detail = await call<Enrollment>('get', `/enrollments/${enrollmentId}`, { token })
  return call<Enrollment>('post', `/enrollments/${enrollmentId}/submit`, {
    token,
    body: { version: detail.version },
    headers: { 'Idempotency-Key': idemKey('submit') },
  })
}

async function review(
  token: string,
  enrollmentId: string,
  decision: 'APPROVE' | 'REJECT' | 'RETURN_FOR_CORRECTION',
  reason?: string,
) {
  const detail = await call<Enrollment>('get', `/enrollments/${enrollmentId}`, { token })
  return call<Enrollment>('post', `/enrollments/${enrollmentId}/reviews`, {
    token,
    body: { version: detail.version, decision, reason },
    headers: { 'Idempotency-Key': idemKey('review') },
  })
}

describe('报名审核全链路：球队/学校报送 → 市州初审 → 省级终审', () => {
  it('球队端新建报名 → 被市州退回 → 重新提交 → 市州通过 → 省级终审通过', async () => {
    const teamToken = await login('team')
    const created = await call<Enrollment>('post', '/enrollments', {
      token: teamToken,
      body: {
        eventId,
        groupId: teamGroupId,
        teamId: 'team_cd_syxx',
        contactName: '球队领队',
        contactPhone: '13800001111',
      },
    })
    expect(created.status).toBe('DRAFT')
    expect(created.id).toBeTruthy()

    await addPlayers(teamToken, created.id, 'team_cd_syxx', 11)
    await addMaterials(teamToken, created.id)
    const precheck = await call<{ passed: boolean }>('post', `/enrollments/${created.id}/precheck`, {
      token: teamToken,
      body: { version: created.version },
    })
    expect(precheck.passed).toBe(true)

    const submitted = await submitEnrollment(teamToken, created.id)
    expect(submitted.status).toBe('PENDING_CITY_REVIEW')
    expect(submitted.editable).toBe(false)
    expect(submitted.submissionNo).toBe(1)

    // 球队端没有审核权限
    const teamReview = await expectError(review(teamToken, created.id, 'APPROVE'))
    expect(teamReview?.response?.status).toBe(403)

    // 非本校/本队的学校账号看不到这张报名单
    const otherSchoolToken = await login('school')
    const otherSchoolView = await expectError(
      call('get', `/enrollments/${created.id}`, { token: otherSchoolToken }),
    )
    expect(otherSchoolView?.response?.status).toBe(403)

    // 市州初审退回补正 → 报名单回到草稿并可编辑
    const cityToken = await login('city')
    const returned = await review(cityToken, created.id, 'RETURN_FOR_CORRECTION', '请补充领队联系方式')
    expect(returned.status).toBe('DRAFT')
    expect(returned.editable).toBe(true)
    expect(returned.latestReviewReason).toBe('请补充领队联系方式')

    // 球队修改后重新提交
    const resubmitted = await submitEnrollment(teamToken, created.id)
    expect(resubmitted.status).toBe('PENDING_CITY_REVIEW')
    expect(resubmitted.submissionNo).toBe(2)

    // 市州初审通过 → 进入省级终审
    const cityApproved = await review(cityToken, created.id, 'APPROVE')
    expect(cityApproved.status).toBe('PENDING_PROVINCE_REVIEW')

    // 市州账号不能越权做省级终审
    const cityFinal = await expectError(review(cityToken, created.id, 'APPROVE'))
    expect(cityFinal?.response?.status).toBe(403)

    // 省级终审通过
    const provinceToken = await login('province')
    const provinceApproved = await review(provinceToken, created.id, 'APPROVE')
    expect(provinceApproved.status).toBe('APPROVED')
    expect(provinceApproved.editable).toBe(false)

    const records = await call<PageResult<ReviewRecord>>('get', `/enrollments/${created.id}/reviews`, {
      token: provinceToken,
    })
    const timeline = records.items.map((record) => `${record.stage}:${record.action}`)
    expect(timeline).toContain('SUBMISSION:SUBMIT')
    expect(timeline).toContain('CITY:RETURN_FOR_CORRECTION')
    expect(timeline).toContain('CITY:APPROVE')
    expect(timeline).toContain('PROVINCE:APPROVE')
  })

  it('学校端新建报名 → 市州初审通过 → 省级终审通过', async () => {
    const schoolToken = await login('school')
    const created = await call<Enrollment>('post', '/enrollments', {
      token: schoolToken,
      body: {
        eventId,
        groupId: schoolGroupId,
        teamId: 'team_cd_qz',
        contactName: '学校联络员',
        contactPhone: '13900002222',
      },
    })
    expect(created.status).toBe('DRAFT')
    expect(created.schoolOrgId).toBe('org_school_cd_qz')

    await addPlayers(schoolToken, created.id, 'team_cd_qz', 11)
    await addMaterials(schoolToken, created.id)
    const submitted = await submitEnrollment(schoolToken, created.id)
    expect(submitted.status).toBe('PENDING_CITY_REVIEW')

    const cityToken = await login('city')
    const cityApproved = await review(cityToken, created.id, 'APPROVE')
    expect(cityApproved.status).toBe('PENDING_PROVINCE_REVIEW')

    const provinceToken = await login('province')
    const provinceApproved = await review(provinceToken, created.id, 'APPROVE')
    expect(provinceApproved.status).toBe('APPROVED')

    const schoolView = await call<Enrollment>('get', `/enrollments/${created.id}`, {
      token: schoolToken,
    })
    expect(schoolView.status).toBe('APPROVED')
  })
})

describe('比赛全链路：省端编排 → 记录台录入/结束 → 发布赛果 → 门户同步', () => {
  it('跨角色闭环', async () => {
    const provinceToken = await login('province')
    const recorderToken = await login('recorder')

    const created = await call<Match>('post', '/matches', {
      token: provinceToken,
      body: {
        eventId,
        groupId: schoolGroupId,
        homeTeamId: 'team_cd_qz',
        awayTeamId: 'team_my_ns',
        kickoffAt: '2026-11-18T09:00:00+08:00',
        venue: '自动化测试球场',
        stage: '自动化测试轮次',
        status: 'SCHEDULED',
      },
    })
    expect(created.published).toBe(false)

    // 未发布前门户不可见
    const hidden = await expectError(call('get', `/public/matches/${created.id}`))
    expect(hidden?.response?.status).toBe(404)

    const publishedMatch = await call<Match>('put', `/matches/${created.id}`, {
      token: provinceToken,
      body: { ...created, published: true, version: created.version },
    })
    await call('post', `/matches/${created.id}/publish`, {
      token: provinceToken,
      body: { version: publishedMatch.version },
    })

    const publicBefore = await call<{ status: string; homeScore: number; awayScore: number }>(
      'get',
      `/public/matches/${created.id}`,
    )
    expect(publicBefore.status).toBe('SCHEDULED')
    expect([publicBefore.homeScore, publicBefore.awayScore]).toEqual([0, 0])

    // 未结束前不允许发布赛果
    const current = await call<Match>('get', `/matches/${created.id}`, { token: recorderToken })
    const tooEarly = await expectError(
      call('post', `/matches/${created.id}/result/publish`, {
        token: recorderToken,
        body: { version: current.version },
      }),
    )
    expect(tooEarly?.response?.status).toBe(409)

    // 记录台录入两粒进球（主队、客队各一）
    const goalKey = idemKey('goal')
    const goal1 = await call<MatchEvent>('post', `/matches/${created.id}/events`, {
      token: recorderToken,
      body: {
        eventType: 'GOAL',
        minute: 10,
        teamId: 'team_cd_qz',
        scorerAthleteId: 'person_team_cd_qz_001',
        matchVersion: current.version,
      },
      headers: { 'Idempotency-Key': goalKey },
    })
    // 同一幂等键重复提交不会重复计分
    const goal1Again = await call<MatchEvent>('post', `/matches/${created.id}/events`, {
      token: recorderToken,
      body: {
        eventType: 'GOAL',
        minute: 10,
        teamId: 'team_cd_qz',
        scorerAthleteId: 'person_team_cd_qz_001',
        matchVersion: current.version,
      },
      headers: { 'Idempotency-Key': goalKey },
    })
    expect(goal1Again.id).toBe(goal1.id)

    const afterFirstGoal = await call<Match>('get', `/matches/${created.id}`, { token: recorderToken })
    expect([afterFirstGoal.homeScore, afterFirstGoal.awayScore]).toEqual([1, 0])
    expect(afterFirstGoal.status).toBe('LIVE')

    await call<MatchEvent>('post', `/matches/${created.id}/events`, {
      token: recorderToken,
      body: {
        eventType: 'GOAL',
        minute: 35,
        teamId: 'team_my_ns',
        scorerAthleteId: 'person_team_my_ns_001',
        matchVersion: afterFirstGoal.version,
      },
      headers: { 'Idempotency-Key': idemKey('goal') },
    })
    // 一张黄牌，不影响比分
    const afterSecondGoal = await call<Match>('get', `/matches/${created.id}`, { token: recorderToken })
    await call('post', `/matches/${created.id}/events`, {
      token: recorderToken,
      body: {
        eventType: 'PENALTY',
        penaltyType: 'YELLOW_CARD',
        minute: 40,
        teamId: 'team_cd_qz',
        athleteId: 'person_team_cd_qz_002',
        reason: '战术犯规',
        matchVersion: afterSecondGoal.version,
      },
      headers: { 'Idempotency-Key': idemKey('card') },
    })

    const live = await call<Match>('get', `/matches/${created.id}`, { token: recorderToken })
    expect([live.homeScore, live.awayScore]).toEqual([1, 1])
    expect(live.status).toBe('LIVE')

    const publicLive = await call<{ status: string; homeScore: number; awayScore: number; events: MatchEvent[] }>(
      'get',
      `/public/matches/${created.id}`,
    )
    expect(publicLive.status).toBe('LIVE')
    expect([publicLive.homeScore, publicLive.awayScore]).toEqual([1, 1])
    expect(publicLive.events.filter((e) => e.eventType === 'GOAL')).toHaveLength(2)

    // 赛果发布前，射手榜不统计该场
    const goalsBefore = await call<PageResult<GoalRankingRow>>('get', '/public/statistics/goals', {
      params: { eventId, page: 1, pageSize: 100 },
    })
    expect(goalsBefore.items).toHaveLength(0)

    // 记录台结束比赛
    const finished = await call<Match>('put', `/matches/${created.id}`, {
      token: recorderToken,
      body: {
        eventId: live.eventId,
        groupId: live.groupId,
        homeTeamId: live.homeTeamId,
        awayTeamId: live.awayTeamId,
        kickoffAt: live.kickoffAt,
        venue: live.venue,
        stage: live.stage,
        status: 'FINISHED',
        referees: live.referees || [],
        version: live.version,
      },
    })
    expect(finished.status).toBe('FINISHED')

    // 保存并发布赛果
    const result = await call<{ homeScore: number; awayScore: number; published: boolean }>(
      'put',
      `/matches/${created.id}/result`,
      {
        token: recorderToken,
        body: { version: finished.version, resultType: 'NORMAL' },
      },
    )
    expect([result.homeScore, result.awayScore]).toEqual([1, 1])
    expect(result.published).toBe(false)

    const matchAfterSave = await call<Match>('get', `/matches/${created.id}`, { token: recorderToken })
    await call('post', `/matches/${created.id}/result/publish`, {
      token: recorderToken,
      body: { version: matchAfterSave.version },
    })

    const publicFinal = await call<{ status: string; homeScore: number; awayScore: number }>(
      'get',
      `/public/matches/${created.id}`,
    )
    expect(publicFinal.status).toBe('FINISHED')
    expect([publicFinal.homeScore, publicFinal.awayScore]).toEqual([1, 1])

    // 门户射手榜同步两名进球球员
    const goalsAfter = await call<PageResult<GoalRankingRow>>('get', '/public/statistics/goals', {
      params: { eventId, page: 1, pageSize: 100 },
    })
    expect(goalsAfter.items).toHaveLength(2)
    expect(goalsAfter.items.every((row) => row.goals === 1)).toBe(true)
    expect(goalsAfter.items.map((row) => row.teamId).sort()).toEqual(['team_cd_qz', 'team_my_ns'].sort())

    // 门户赛程列表同步为已结束
    const portalMatches = await call<PageResult<{ id: string; status: string }>>('get', '/public/matches', {
      params: { eventId, page: 1, pageSize: 100 },
    })
    expect(portalMatches.items.find((m) => m.id === created.id)?.status).toBe('FINISHED')
  })

  it('记录台可录入但赛果发布仍受比赛状态约束', async () => {
    const provinceToken = await login('province')
    const match = await call<Match>('post', '/matches', {
      token: provinceToken,
      body: {
        eventId,
        groupId: schoolGroupId,
        homeTeamId: 'team_cd_qz',
        awayTeamId: 'team_my_ns',
        kickoffAt: '2026-11-18T10:00:00+08:00',
        status: 'SCHEDULED',
      },
    })
    await call('post', `/matches/${match.id}/publish`, {
      token: provinceToken,
      body: { version: match.version },
    })
    const recorderToken = await login('recorder')
    const error = await expectError(
      call('post', `/matches/${match.id}/result/publish`, {
        token: recorderToken,
        body: { version: match.version + 1 },
      }),
    )
    expect(error?.response?.status).toBe(409)
  })
})
