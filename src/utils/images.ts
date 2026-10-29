/**
 * 文件服务展示地址的前端兜底。
 *
 * 后端签名地址 /api/v1/public/files/{id}/content 是跨域直读（<img> 不带 Authorization），
 * 当响应 MIME 与浏览器预期不一致时会被 ORB 拦截（控制台 ERR_BLOCKED_BY_ORB），
 * 图片表现为加载失败。这里改为用 fetch 取回二进制再转 object URL：ORB 只作用于
 * 浏览器的图片解码通道，object URL 不受影响；签名地址本身免认证，匿名门户同样适用。
 */

const blobCache = new Map<string, Promise<string>>()

/** 仅处理文件服务的受控下载地址，外链、data:、blob: 一律原样使用。 */
export function isFileServiceUrl(raw: string): boolean {
  if (!raw) return false
  try {
    const url = new URL(raw, window.location.origin)
    return /\/(?:public\/)?files\/[^/]+\/(?:content|thumbnail)$/.test(url.pathname)
  } catch {
    return false
  }
}

function fetchObjectUrl(raw: string): Promise<string> {
  const cached = blobCache.get(raw)
  if (cached) return cached
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 15000)
  const request = fetch(raw, { credentials: 'omit', signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`image request failed: ${response.status}`)
      const blob = await response.blob()
      const type = blob.type || ''
      // 错误信封（JSON/HTML）即便返回 200 也不是可解码图片，直接走原地址。
      if (!blob.size || /json|html|text\//i.test(type)) throw new Error('not an image')
      return URL.createObjectURL(blob)
    })
    .catch(() => {
      // 失败不缓存，下次渲染仍可重试。
      blobCache.delete(raw)
      return ''
    })
    .finally(() => window.clearTimeout(timer))
  blobCache.set(raw, request)
  return request
}

/** 文件服务地址转为可直接放进 img src 的 object URL；其他地址原样返回。 */
export async function resolveImageUrl(raw: string): Promise<string> {
  if (!isFileServiceUrl(raw)) return raw
  return (await fetchObjectUrl(raw)) || raw
}

let installed = false

/**
 * 全局兜底：v-html 富文本、动态插入的 <img> 无法逐个替换为 SafeImage，
 * 在捕获阶段监听图片错误，命中文件服务地址时换成本地 object URL 重试一次。
 */
export function installImageFallback() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener(
    'error',
    (event) => {
      const target = event.target
      if (!(target instanceof HTMLImageElement)) return
      const source = target.currentSrc || target.src || target.getAttribute('src') || ''
      if (!isFileServiceUrl(source)) return
      if (target.dataset.blobFallback === '1') return
      target.dataset.blobFallback = '1'
      void resolveImageUrl(source).then((resolved) => {
        if (resolved && resolved !== source) target.src = resolved
      })
    },
    true,
  )
}
