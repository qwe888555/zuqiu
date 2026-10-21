export interface PolicyAssistantContext {
  contentId: string
  title: string
}

export interface PolicyAssistantRequest {
  question?: string
  context?: PolicyAssistantContext
}

type AssistantHandler = (request: PolicyAssistantRequest) => void

let handler: AssistantHandler | null = null

/** 由 PortalLayout 中的政策问答组件注册；页面只负责发起请求。 */
export function registerPolicyAssistant(fn: AssistantHandler) {
  handler = fn
  return () => {
    if (handler === fn) handler = null
  }
}

export function openPolicyAssistant(request: PolicyAssistantRequest = {}) {
  handler?.(request)
}
