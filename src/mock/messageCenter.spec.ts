import { describe, expect, it } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import { mockAdapter } from './adapter'
import type { Message, PageResult } from '../api/types'

async function call<T>(
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  options: { token?: string; params?: Record<string, unknown>; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
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

async function expectMockError(promise: Promise<unknown>) {
  try {
    await promise
    return null
  } catch (error) {
    return error as { response?: { status?: number; data?: { code?: string; message?: string } } }
  }
}

describe('消息中心 Mock 全流程', () => {
  it('未登录访问消息列表返回 401', async () => {
    const error = await expectMockError(call('get', '/me/messages'))
    expect(error?.response?.status).toBe(401)
  })

  it('登录后可分页读取消息，未读过滤与总数一致', async () => {
    const token = await login('team')
    const all = await call<PageResult<Message>>('get', '/me/messages', {
      token,
      params: { page: 1, pageSize: 100 },
    })
    expect(all.total).toBe(all.items.length)
    // 球队端只应收到报名/审核/材料/赛程/公示类消息。
    expect(
      all.items.every((m) =>
        ['ENROLLMENT', 'REVIEW', 'MATERIAL', 'MATCH', 'PUBLICATION'].includes(m.businessType || ''),
      ),
    ).toBe(true)

    const expectedUnread = all.items.filter((m) => !m.read).length
    const unread = await call<PageResult<Message>>('get', '/me/messages', {
      token,
      params: { page: 1, pageSize: 1, read: false },
    })
    expect(unread.total).toBe(expectedUnread)
    expect(unread.items.every((m) => !m.read)).toBe(true)

    const read = await call<PageResult<Message>>('get', '/me/messages', {
      token,
      params: { page: 1, pageSize: 100, read: true },
    })
    expect(read.total).toBe(all.total - expectedUnread)
  })

  it('标记已读后状态、未读总数与详情保持一致，重复标记幂等', async () => {
    const token = await login('team')
    const before = await call<PageResult<Message>>('get', '/me/messages', {
      token,
      params: { page: 1, pageSize: 1, read: false },
    })
    const target = before.items[0]

    await call('post', `/me/messages/${target.id}/read`, { token })
    const detail = await call<Message>('get', `/me/messages/${target.id}`, { token })
    expect(detail.read).toBe(true)
    expect(detail.readAt).toBeTruthy()

    const after = await call<PageResult<Message>>('get', '/me/messages', {
      token,
      params: { page: 1, pageSize: 1, read: false },
    })
    expect(after.total).toBe(before.total - 1)

    await call('post', `/me/messages/${target.id}/read`, { token })
    const again = await call<PageResult<Message>>('get', '/me/messages', {
      token,
      params: { page: 1, pageSize: 1, read: false },
    })
    expect(again.total).toBe(after.total)
  })

  it('已读状态按账号隔离，不影响其他账号', async () => {
    const teamToken = await login('team')
    const athleteToken = await login('athlete')
    const adminToken = await login('admin')

    await call('post', '/me/messages/msg_001/read', { token: teamToken })
    expect((await call<Message>('get', '/me/messages/msg_001', { token: teamToken })).read).toBe(true)
    expect((await call<Message>('get', '/me/messages/msg_001', { token: athleteToken })).read).toBe(false)
    expect((await call<Message>('get', '/me/messages/msg_001', { token: adminToken })).read).toBe(false)
  })

  it('管理员发布消息后出现在目标角色收件箱，其他角色不可见', async () => {
    const adminToken = await login('admin')
    const published = await call<{ count: number }>('post', '/messages', {
      token: adminToken,
      body: { title: '全流程测试通知', body: '这是一条自动化测试消息', roles: ['TEAM'] },
    })
    expect(published.count).toBeGreaterThan(0)

    const teamToken = await login('team')
    const teamMessages = await call<PageResult<Message>>('get', '/me/messages', {
      token: teamToken,
      params: { page: 1, pageSize: 100 },
    })
    const received = teamMessages.items.find((m) => m.title === '全流程测试通知')
    expect(received).toBeTruthy()
    expect(received?.read).toBe(false)

    // 群发的消息同样支持标记已读。
    await call('post', `/me/messages/${received!.id}/read`, { token: teamToken })
    expect((await call<Message>('get', `/me/messages/${received!.id}`, { token: teamToken })).read).toBe(true)

    const athleteToken = await login('athlete')
    const athleteMessages = await call<PageResult<Message>>('get', '/me/messages', {
      token: athleteToken,
      params: { page: 1, pageSize: 100 },
    })
    expect(athleteMessages.items.some((m) => m.title === '全流程测试通知')).toBe(false)
  })

  it('非管理员不能发布消息', async () => {
    const teamToken = await login('team')
    const error = await expectMockError(
      call('post', '/messages', { token: teamToken, body: { title: '越权消息', roles: [] } }),
    )
    expect(error?.response?.status).toBe(403)
  })

  it('发布消息校验标题与角色', async () => {
    const adminToken = await login('admin')
    const emptyTitle = await expectMockError(
      call('post', '/messages', { token: adminToken, body: { title: '  ', roles: [] } }),
    )
    expect(emptyTitle?.response?.status).toBe(422)

    const badRole = await expectMockError(
      call('post', '/messages', { token: adminToken, body: { title: '通知', roles: ['NOPE'] } }),
    )
    expect(badRole?.response?.status).toBe(422)
  })
})
