import axios, { type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { mockAdapter } from '../mock/adapter'
import type { Envelope } from './types'

export const TOKEN_KEY = 'football.token'

const useMock = import.meta.env.VITE_USE_MOCK !== 'false'

/** 演示/联调模式下开放角色切换等辅助能力 */
export const MOCK_ENABLED = useMock

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
  ...(useMock ? { adapter: mockAdapter } : {}),
})

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
    const message =
      error?.response?.data?.message || error?.message || '网络异常，请稍后重试'
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    ElMessage.error(message)
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

export const http = {
  download,
  get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return request<T>({ method: 'get', url, params })
  },
  post<T>(url: string, data?: unknown): Promise<T> {
    return request<T>({ method: 'post', url, data })
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
  delete<T>(url: string, data?: unknown): Promise<T> {
    return request<T>({ method: 'delete', url, data })
  },
}

export default instance
