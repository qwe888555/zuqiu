import axios, { type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import type { Envelope } from './types'

export const TOKEN_KEY = 'football.token'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** 静默模式：失败时不弹全局提示，也不做登录跳转，由调用方给出统一文案。 */
    silentError?: boolean
  }
}

const useMock = import.meta.env.VITE_USE_MOCK !== 'false'

/** 演示/联调模式下开放角色切换等辅助能力 */
export const MOCK_ENABLED = useMock

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

if (useMock) {
  // 懒加载 mock 模块，关闭 Mock 时不会把演示数据打进产物包。
  instance.defaults.adapter = async (config) => {
    const { mockAdapter } = await import('../mock/adapter')
    return mockAdapter(config)
  }
}

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

instance.interceptors.response.use(
  (response) => {
    const body = response.data as Envelope<unknown>
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 'OK') return body.data
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return response.data
  },
  (error) => {
    const status = error?.response?.status
    const silent = Boolean((error?.config as AxiosRequestConfig | undefined)?.silentError)
    const message =
      error?.response?.data?.message || error?.message || '网络异常，请稍后重试'
    if (status === 401 && !silent) {
      localStorage.removeItem(TOKEN_KEY)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    if (!silent) ElMessage.error(message)
    return Promise.reject(error)
  },
)

async function request<T>(config: AxiosRequestConfig): Promise<T> {
  return (await instance.request(config)) as unknown as T
}

/**
 * 下载二进制文件。演示模式下 mock 返回 JSON，此时返回 false，
 * 由调用方给出“演示环境已模拟导出”的提示。
 */
async function download(
  url: string,
  filename: string,
  method: 'get' | 'post' = 'get',
  data?: unknown,
  params?: Record<string, unknown>,
): Promise<boolean> {
  const response = await instance.request({ method, url, data, params, responseType: 'blob' })
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

/** 生成 8–128 字符的幂等键，满足提交/审核/赛事事件等接口的 Idempotency-Key 约束 */
export function newIdempotencyKey(prefix = 'idem'): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return `${prefix}_${random}`.slice(0, 128)
}

export const http = {
  download,
  get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>({ method: 'get', url, params })
  },
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return request<T>({ method: 'post', url, data, ...config })
  },
  /**
   * 写操作带上 Idempotency-Key。即使重试也不会重复落库，
   * 后端要求 8–128 字符，超过长度会返回 400。
   */
  postIdempotent<T>(url: string, data?: unknown, key: string = newIdempotencyKey()): Promise<T> {
    return request<T>({ method: 'post', url, data, headers: { 'Idempotency-Key': key } })
  },
  putIdempotent<T>(url: string, data?: unknown, key: string = newIdempotencyKey()): Promise<T> {
    return request<T>({ method: 'put', url, data, headers: { 'Idempotency-Key': key } })
  },
  postForm<T>(url: string, form: FormData): Promise<T> {
    return request<T>({
      method: 'post',
      url,
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  put<T>(url: string, data?: unknown): Promise<T> {
    return request<T>({ method: 'put', url, data })
  },
  delete<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>({ method: 'delete', url, params })
  },
}

export default instance
