import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi, meApi } from '../api'
import { TOKEN_KEY } from '../api/http'
import { visibleSections } from '../config/menus'
import type { CurrentUser, RoleCode } from '../api/types'

/**
 * 登录失败统一文案：不把后端的参数校验/字段错误直接抛给用户。
 * 5xx 视为服务异常，其余有响应的失败统一提示账号或密码错误。
 */
export function loginErrorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status && status >= 500) return '登录服务暂时不可用，请稍后重试'
  if (status) return '账号或密码错误，请重新输入'
  return '登录失败，请检查网络后重试'
}

/** 只有 401 才代表登录态失效；网络抖动/网关 5xx 不能清除本地令牌。 */
export function isUnauthenticated(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 401
}

/** 后端个别账号的 displayName 存成了全问号/替换符，展示时回退到登录名，避免界面出现「?????」。 */
function usableDisplayName(name?: string): string {
  if (!name) return ''
  return /^[?�\s]+$/u.test(name) ? '' : name
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref<CurrentUser | null>(null)
  const loading = ref(false)
  /** 同一令牌下复用进行中的 /me 请求，避免布局、路由守卫、入口按钮重复请求。 */
  let meInFlight: { token: string; promise: Promise<CurrentUser> } | null = null

  const roles = computed<RoleCode[]>(() => user.value?.roles ?? [])
  const displayName = computed(
    () =>
      usableDisplayName(user.value?.displayName) || user.value?.username || '未登录',
  )
  const isAdmin = computed(() => roles.value.includes('ADMIN'))
  const sections = computed(() => visibleSections(roles.value))

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const result = await authApi.login({ username, password })
      token.value = result.accessToken
      localStorage.setItem(TOKEN_KEY, result.accessToken)
      await fetchMe()
      return result
    } catch (error) {
      // 具体文案由调用方（登录弹窗）展示，避免在 store 里重复弹提示。
      throw error
    } finally {
      loading.value = false
    }
  }

  async function fetchMe() {
    const currentToken = token.value
    if (!currentToken) return null
    if (meInFlight?.token === currentToken) return meInFlight.promise
    const request = meApi.get().then((me) => {
      // 请求期间已退出或切换账号时，丢弃旧令牌的响应。
      if (token.value === currentToken) user.value = me
      return me
    })
    const tracked = request.finally(() => {
      if (meInFlight?.token === currentToken) meInFlight = null
    })
    meInFlight = { token: currentToken, promise: tracked }
    return tracked
  }

  async function logout() {
    try {
      if (token.value) await authApi.logout()
    } catch {
      // 忽略退出接口异常，本地状态必须清理
    } finally {
      clear()
    }
  }

  function clear() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  function hasRole(required?: readonly RoleCode[]) {
    if (!required || required.length === 0) return true
    if (isAdmin.value) return true
    return required.some((role) => roles.value.includes(role))
  }

  return {
    token,
    user,
    loading,
    roles,
    displayName,
    isAdmin,
    sections,
    login,
    fetchMe,
    logout,
    clear,
    hasRole,
  }
})
