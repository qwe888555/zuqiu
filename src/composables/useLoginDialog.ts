import { ref } from 'vue'

export type AuthDialogMode = 'login' | 'register'

/**
 * 登录/注册共用门户上的全局弹窗：任何入口只负责发起请求，
 * 具体表单与角色落点由 PortalLayout 中的 LoginDialog 统一处理。
 */
const visible = ref(false)
const redirect = ref('')
const intent = ref('')
const mode = ref<AuthDialogMode>('login')
/** 邀请链接里的注册凭证，由 /register?token=... 带入。 */
const registerToken = ref('')

export function openLoginDialog(
  options: {
    redirect?: string
    intent?: string
    register?: boolean
    token?: string
  } = {},
) {
  redirect.value = options.redirect || ''
  intent.value = options.intent || ''
  mode.value = options.register ? 'register' : 'login'
  registerToken.value = options.token || ''
  visible.value = true
}

export function closeLoginDialog() {
  visible.value = false
}

export function useLoginDialog() {
  return {
    visible,
    redirect,
    intent,
    mode,
    registerToken,
    openLoginDialog,
    closeLoginDialog,
  }
}
