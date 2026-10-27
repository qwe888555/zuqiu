/** 读取 axios 错误里的 HTTP 状态码，非 HTTP 错误返回 undefined。 */
export function httpStatusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status
}
