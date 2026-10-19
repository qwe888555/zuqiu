import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi, meApi } from '../api'
import { TOKEN_KEY } from '../api/http'
import { visibleSections } from '../config/menus'
import type { CurrentUser, RoleCode } from '../api/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref<CurrentUser | null>(null)
  const loading = ref(false)

  const roles = computed<RoleCode[]>(() => user.value?.roles ?? [])
  const displayName = computed(() => user.value?.displayName || user.value?.username || '未登录')
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
    } finally {
      loading.value = false
    }
  }

  async function fetchMe() {
    if (!token.value) return null
    const me = await meApi.get()
    user.value = me
    return me
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
