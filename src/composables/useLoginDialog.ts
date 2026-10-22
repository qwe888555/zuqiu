import { ref } from 'vue'

/**
 * 登录改为门户上的全局弹窗：任何入口只负责发起请求，
 * 具体表单与角色落点由 PortalLayout 中的 LoginDialog 统一处理。
 */
const visible = ref(false)
const redirect = ref('')
const intent = ref('')

export function openLoginDialog(options: { redirect?: string; intent?: string } = {}) {
  redirect.value = options.redirect || ''
  intent.value = options.intent || ''
  visible.value = true
}

export function closeLoginDialog() {
  visible.value = false
}

export function useLoginDialog() {
  return { visible, redirect, intent, openLoginDialog, closeLoginDialog }
}
