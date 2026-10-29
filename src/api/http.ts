import axios, { type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import type { Envelope } from './types'

export const TOKEN_KEY = 'football.token'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** 静默模式：失败时不弹全局提示，也不做登录跳转，由调用方给出统一文案。 */
    silentError?: boolean
    /** 公开端点（免登录）：不携带本地令牌，401 也不视为登录态失效。 */
    skipAuth?: boolean
  }
}

/** 公开接口前缀：不得附带 Authorization，否则过期令牌会让匿名浏览被判 401。 */
export function isPublicRequest(url?: string): boolean {
  if (!url) return false
  // logout 需要带上令牌才能注销服务端会话，因此不在此列。
  return ['/public/', '/health', '/auth/login', '/auth/registrations'].some((prefix) =>
    url.startsWith(prefix),
  )
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
  if (isPublicRequest(config.url)) {
    config.skipAuth = true
    return config
  }
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
  async (error) => {
    const status = error?.response?.status
    const requestConfig = error?.config as AxiosRequestConfig | undefined
    const silent = Boolean(requestConfig?.silentError)
    const skipAuth = Boolean(requestConfig?.skipAuth)
    // 批量导入/导出使用 responseType=blob；后端出错时返回的是 JSON 封装，
    // 需要先读出 Blob 文本，否则只能看到 axios 的通用错误。
    if (error?.response?.data instanceof Blob) {
      try {
        const text = await error.response.data.text()
        const body = JSON.parse(text) as Envelope<unknown>
        if (body && typeof body === 'object' && 'message' in body) {
          error.response.data = body
        }
      } catch {
        // 非 JSON 响应（例如网关 HTML），保留原始错误
      }
    }
    const message =
      error?.response?.data?.message || error?.message || '网络异常，请稍后重试'
    // 公开端点的 401 与登录态无关（例如接口配置问题），不能因此清令牌或跳登录页。
    if (status === 401 && !silent && !skipAuth) {
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
function saveBlob(payload: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(payload)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

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
  saveBlob(payload, filename)
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
  saveBlob,
  get<T>(url: string, params?: Record<string, unknown>, config?: AxiosRequestConfig): Promise<T> {
    return request<T>({ method: 'get', url, params, ...config })
  },
  /** 读取受控文件的二进制内容（照片、附件预览），由调用方负责释放 object URL。 */
  getBlob(url: string, params?: Record<string, unknown>): Promise<Blob> {
    return request<Blob>({ method: 'get', url, params, responseType: 'blob' })
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
  /** 上传并直接接收二进制结果（如批量邀请导出的 CSV）。 */
  postFormBlob<T>(url: string, form: FormData, params?: Record<string, unknown>): Promise<T> {
    return request<T>({
      method: 'post',
      url,
      data: form,
      params,
      // 实例默认 Content-Type 是 application/json，必须显式改成 multipart，
      // 否则 Axios 会把 FormData 序列化成 JSON（file 变成 {}）。
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
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
