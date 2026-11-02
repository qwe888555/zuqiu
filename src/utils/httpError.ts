/** 读取 axios 错误里的 HTTP 状态码，非 HTTP 错误返回 undefined。 */
export function httpStatusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status
}

/** 读取后端信封里的 message；静默请求失败时用于逐行展示原因。 */
export function httpMessageOf(error: unknown): string {
  const payload = error as
    | { response?: { data?: { message?: string } }; message?: string }
    | null
    | undefined
  return payload?.response?.data?.message || payload?.message || '请求失败'
}
