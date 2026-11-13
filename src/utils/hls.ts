import type Hls from 'hls.js'
import type { HlsConfig } from 'hls.js'

type HlsConstructor = typeof Hls

interface PlaylistLoaderContext {
  url: string
  type?: string
}

interface PlaylistLoaderCallbacks {
  onSuccess: (
    response: { data: unknown },
    stats: unknown,
    context: unknown,
    networkDetails: unknown,
  ) => void
  onError: (error: unknown, context: unknown, networkDetails?: unknown, stats?: unknown) => void
  onTimeout: (stats: unknown, context: unknown, networkDetails: unknown) => void
}

type LoaderBase = new (config: unknown) => {
  load(context: PlaylistLoaderContext, config: unknown, callbacks: PlaylistLoaderCallbacks): void
}

const DROP_LINE_PREFIXES = [
  '#EXT-X-SERVER-CONTROL:',
  '#EXT-X-PART-INF:',
  '#EXT-X-PART:',
  '#EXT-X-PRELOAD-HINT:',
]

/**
 * 把 MediaMTX 的低延迟直播播放列表改写成普通 HLS 播放列表。
 *
 * MediaMTX 会在新会话开头用 #EXT-X-GAP 占位，并下发 CAN-BLOCK-RELOAD；
 * hls.js 据此携带 _HLS_msn/_HLS_part 阻塞拉取播放列表，实测服务端对这类请求
 * 经常一直挂到超时，播放器停在缓冲（页面表现为一直绿屏）。
 * 这里去掉分片级标签和开头占位、同步 MEDIA-SEQUENCE，让播放器按普通 HLS
 * 轮询、直接从最新完整分片起播。只处理播放列表，不影响 mp4 分片请求。
 */
export function normalizeLivePlaylist(text: string): string {
  if (!text.startsWith('#EXTM3U')) return text
  const lines = text.split(/\r?\n/)
  const kept: string[] = []
  let seqIndex = -1
  let seq = 0
  let targetIndex = -1
  let maxSegment = 0
  let droppedLeading = 0
  let seenSegment = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      seq = Number(line.split(':')[1]) || 0
      seqIndex = kept.length
      kept.push(line)
      continue
    }
    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      targetIndex = kept.length
      kept.push(line)
      continue
    }
    if (line.startsWith('#EXTINF:')) {
      const duration = Number(line.slice('#EXTINF:'.length).split(',')[0])
      if (Number.isFinite(duration) && duration > maxSegment) maxSegment = duration
    }
    // 开头的 GAP 占位分片不可播放，连同 EXTINF 与 gap.mp4 一起丢弃。
    // 出现在正常分片之后的 GAP 要原样保留：hls.js 会跳过它，
    // 丢掉反而会让后续分片的序号整体错位。
    if (line.startsWith('#EXT-X-GAP')) {
      if (!seenSegment && i + 2 < lines.length) {
        droppedLeading += 1
        i += 2
        continue
      }
      kept.push(line)
      continue
    }
    if (line.startsWith('#')) {
      if (!DROP_LINE_PREFIXES.some((prefix) => line.startsWith(prefix))) kept.push(line)
      continue
    }
    if (line.length) seenSegment = true
    kept.push(line)
  }
  if (seqIndex >= 0 && droppedLeading) {
    kept[seqIndex] = `#EXT-X-MEDIA-SEQUENCE:${seq + droppedLeading}`
  }
  // hls.js 用 TARGETDURATION 当作直播边缘的保底距离（延迟控制器里按 1×TARGETDURATION
  // 计算目标位置）。MediaMTX 会按分片长度再加一截余量，声明的值比实际分片大不少，
  // 播放器就被迫多落后几秒。这里收紧到实际最长分片（规范要求 TARGETDURATION ≥
  // 任一 EXTINF，向上取整仍然合法），只收紧不放宽。
  if (targetIndex >= 0 && maxSegment > 0) {
    const actual = Math.max(1, Math.ceil(maxSegment))
    const declared = Number(kept[targetIndex].split(':')[1]) || 0
    if (declared > actual) kept[targetIndex] = `#EXT-X-TARGETDURATION:${actual}`
  }
  return kept.join('\n')
}

interface StreamSession {
  /** MediaMTX 当前 HLS 会话令牌；播放列表和分片都必须带上它。 */
  session: string | null
  /**
   * 分片文件名的前缀（如 7fb0ba9fddd6）代表一次推流；同一前缀的会话可以互换，
   * 推流端重连后前缀会变，旧分片不能挂到新会话上。
   */
  runSessions: Map<string, string>
  /** 最近一次成功拿到的主播放列表地址（带 cookieCheck/缓存参数）。 */
  masterUrl: string
  /** 主播放列表里各码率播放列表的完整查询串（r + session），用于刷新后换新。 */
  variantQueries: Map<string, string>
  refreshTimer?: ReturnType<typeof setTimeout>
  refreshing: Promise<void> | null
  lastRefreshAt: number
}

const streamSessions = new Map<string, StreamSession>()

// MediaMTX 的 HLS 会话实测 40～60 秒就会失效（期间持续轮询也一样）；
// 提前 20 秒换新会话，给主播放列表十几秒的慢响应留出余量。
const SESSION_REFRESH_MS = 20_000

function getStreamSession(url: string): StreamSession {
  const key = streamKey(url)
  let state = streamSessions.get(key)
  if (!state) {
    state = {
      session: null,
      runSessions: new Map(),
      masterUrl: '',
      variantQueries: new Map(),
      refreshing: null,
      lastRefreshAt: 0,
    }
    streamSessions.set(key, state)
  }
  return state
}

/** 以流目录（如 http://host/live/u5/）为键，同一路直播的清单/分片共用会话。 */
function streamKey(url: string): string {
  try {
    const parsed = new URL(url, window.location.href)
    const dir = parsed.pathname.slice(0, parsed.pathname.lastIndexOf('/') + 1)
    return `${parsed.origin}${dir}`
  } catch {
    return url
  }
}

function fileKey(url: string): string {
  try {
    const parsed = new URL(url, window.location.href)
    return parsed.pathname.slice(parsed.pathname.lastIndexOf('/') + 1)
  } catch {
    return ''
  }
}

function queryParam(query: string, name: string): string | null {
  for (const part of query.split('&')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1)
  }
  return null
}

function setQueryParam(query: string, name: string, value: string): string {
  const parts = query.split('&').filter(Boolean)
  let replaced = false
  const next = parts.map((part) => {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq) === name) {
      replaced = true
      return `${name}=${value}`
    }
    return part
  })
  if (!replaced) next.push(`${name}=${value}`)
  return next.join('&')
}

/** 主播放列表中出现的播放列表地址（URI= 属性或独立行）。 */
function masterVariants(text: string): string[] {
  const variants: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('#')) {
      const match = /URI="([^"]+)"/.exec(trimmed)
      if (match) variants.push(match[1])
      continue
    }
    if (trimmed.includes('.m3u8')) variants.push(trimmed)
  }
  return variants
}

function rememberMaster(text: string, state: StreamSession) {
  const variants = masterVariants(text)
  if (!variants.length) return
  const queries = new Map<string, string>()
  let session: string | null = null
  for (const variant of variants) {
    const question = variant.indexOf('?')
    if (question < 0) continue
    const query = variant.slice(question + 1)
    queries.set(fileKey(variant), query)
    session = session || queryParam(query, 'session')
  }
  if (queries.size) state.variantQueries = queries
  if (session) state.session = session
}

function sessionFromText(text: string): string | null {
  const match = /[?&]session=([^&"\s]+)/.exec(text)
  return match ? match[1] : null
}

// MediaMTX 的分片文件名形如 7fb0ba9fddd6_video1_seg7.mp4，前缀代表一次推流；
// 推流重连后前缀会变，前缀相同的分片才能在会话之间互换。
const RUN_FILE_RE = /^([0-9a-zA-Z]{6,})_[0-9a-zA-Z]+_(?:init|seg\d+|part\d+)\.mp4$/i
const RUN_IN_PLAYLIST_RE = /([0-9a-zA-Z]{6,})_[0-9a-zA-Z]+_(?:init|seg\d+|part\d+)\.mp4/i

function runPrefix(filename: string): string | null {
  const match = RUN_FILE_RE.exec(filename)
  return match ? match[1] : null
}

function playlistRunPrefix(text: string): string | null {
  const match = RUN_IN_PLAYLIST_RE.exec(text)
  return match ? match[1] : null
}

function rememberRunSession(state: StreamSession, prefix: string, session: string) {
  state.runSessions.set(prefix, session)
  // 推流反复重连会不断产生新前缀，只保留最近几次，避免无限增长。
  while (state.runSessions.size > 6) {
    const oldest = state.runSessions.keys().next().value
    if (oldest === undefined || oldest === prefix) break
    state.runSessions.delete(oldest)
  }
}

/** 分片沿用自己那次推流的会话，不能把旧分片挂到新推流的会话上。 */
function sessionForFile(url: string, state: StreamSession): string | null {
  const prefix = runPrefix(fileKey(url))
  return (prefix && state.runSessions.get(prefix)) || state.session
}

/** 请求地址统一挂上当前会话；推流端换了会话也不会让播放器拿着旧令牌 404。 */
function withFreshSession(url: string, state: StreamSession): string {
  const isVariant = /\.m3u8(?:[?#]|$)/i.test(url) && !/(?:^|\/)index\.m3u8(?:[?#]|$)/i.test(url)
  try {
    const parsed = new URL(url, window.location.href)
    if (isVariant) {
      const known = state.variantQueries.get(fileKey(url))
      if (known) {
        parsed.search = known
        return parsed.toString()
      }
    }
    const session = sessionForFile(url, state)
    if (session && parsed.search) {
      parsed.search = setQueryParam(parsed.search.slice(1), 'session', session)
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function rewriteSessionsInPlaylist(text: string, state: StreamSession): string {
  const prefix = playlistRunPrefix(text)
  const session = (prefix && state.runSessions.get(prefix)) || state.session
  if (!session) return text
  return text.replace(/([?&])session=[^&"\s]*/g, `$1session=${session}`)
}

function refreshMaster(state: StreamSession): Promise<void> {
  if (state.refreshing || !state.masterUrl) return state.refreshing ?? Promise.resolve()
  // 断流时播放列表会连续 404，别每个请求都去撞主播放列表。
  if (Date.now() - state.lastRefreshAt < 4_000) return Promise.resolve()
  state.lastRefreshAt = Date.now()
  const url = state.masterUrl.includes('?')
    ? `${state.masterUrl}&_=${Date.now()}`
    : `${state.masterUrl}?_=${Date.now()}`
  state.refreshing = (async () => {
    try {
      // 单独 refresh 主播放列表只为换新会话，不参与播放，失败就等下次重试。
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit' })
      if (!response.ok) return
      const text = await response.text()
      if (text.startsWith('#EXTM3U')) rememberMaster(text, state)
    } catch {
      // 推流端没恢复：保留旧会话，播放流程自己会继续重试。
    } finally {
      state.refreshing = null
      // 无论这次成功与否都要排下一次：断流期间播放列表会一直报错，
      // 不能指望“播放列表成功”来续上定时器，否则恢复后只会拿着死会话。
      scheduleSessionRefresh(state)
    }
  })()
  return state.refreshing
}

function scheduleSessionRefresh(state: StreamSession) {
  if (state.refreshTimer) return
  state.refreshTimer = setTimeout(() => {
    state.refreshTimer = undefined
    void refreshMaster(state)
  }, SESSION_REFRESH_MS)
}

/**
 * 创建现场直播用的 hls.js 实例。
 *
 * 除了改写播放列表，还做了三件事：
 * - 放宽清单/分片超时：推流端冷启动要等关键帧，首次拉流实测 9～14 秒，
 *   hls.js 默认 10 秒就判超时；
 * - liveSyncDurationCount 取 1，尽量贴近直播边缘起播，减少等待；
 * - 跟踪 MediaMTX 的 HLS 会话（session/r 参数），播放列表与分片都用最新令牌，
 *   会话到期或推流重启后不用重新创建播放器也能继续拉流。
 */
export function createLiveHls(HlsCtor: HlsConstructor): Hls {
  const BaseLoader = (
    HlsCtor as unknown as { DefaultConfig: { loader: LoaderBase } }
  ).DefaultConfig.loader

  class LivePlaylistLoader extends BaseLoader {
    load(context: PlaylistLoaderContext, config: unknown, callbacks: PlaylistLoaderCallbacks) {
      const isPlaylist = /\.m3u8(?:[?#]|$)/i.test(context.url)
      const isMedia = /\.mp4(?:[?#]|$)/i.test(context.url)
      if (!isPlaylist && !isMedia) {
        super.load(context, config, callbacks)
        return
      }

      const state = getStreamSession(context.url)
      const isMaster = context.type === 'manifest' || /(?:^|\/)index\.m3u8(?:[?#]|$)/i.test(context.url)
      let url = isMaster ? context.url : withFreshSession(context.url, state)
      if (isMaster) {
        // nginx 的 /live/ 入口第一次会 302 到 ?cookieCheck=1；直接带上可少一次往返。
        if (!/[?&]cookieCheck=/.test(url)) {
          url = url.includes('?') ? `${url}&cookieCheck=1` : `${url}?cookieCheck=1`
        }
        state.masterUrl = url
      }

      const enriched = { ...context, url }
      const onSuccess = callbacks.onSuccess
      callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
        if (typeof response.data === 'string' && response.data.startsWith('#EXTM3U')) {
          if (isMaster) {
            rememberMaster(response.data, state)
          } else {
            const session = sessionFromText(response.data)
            const prefix = playlistRunPrefix(response.data)
            if (session) {
              state.session = session
              if (prefix) rememberRunSession(state, prefix, session)
            }
            response.data = rewriteSessionsInPlaylist(normalizeLivePlaylist(response.data), state)
          }
          scheduleSessionRefresh(state)
        }
        onSuccess(response, stats, ctx, networkDetails)
      }

      const onError = callbacks.onError
      callbacks.onError = (error, ctx, networkDetails, stats) => {
        // 401/404 基本是会话过期或推流端重启：后台换新会话，hls.js 自己的重试会用上新地址。
        const code = (error as { response?: { code?: number } } | undefined)?.response?.code
        if (code === 401 || code === 404) void refreshMaster(state)
        onError(error, ctx, networkDetails, stats)
      }

      super.load(enriched, config, callbacks)
    }
  }

  return new HlsCtor({
    lowLatencyMode: false,
    enableWorker: true,
    liveSyncDurationCount: 1,
    // 推流端掉帧时，分片声明时长会大于实际画面时长，中间留下几秒空洞；
    // 默认只容忍 0.1 秒，播放器会停在洞口。放宽到 4 秒后自动跳过这些空洞。
    maxBufferHole: 4,
    loader: LivePlaylistLoader as unknown as HlsConfig['loader'],
    manifestLoadPolicy: liveLoadPolicy(),
    playlistLoadPolicy: liveLoadPolicy(),
    fragLoadPolicy: liveLoadPolicy(),
  })
}

function liveLoadPolicy() {
  return {
    default: {
      maxTimeToFirstByteMs: 45_000,
      maxLoadTimeMs: 90_000,
      timeoutRetry: { maxNumRetry: 8, retryDelayMs: 1_000, maxRetryDelayMs: 4_000 },
      errorRetry: { maxNumRetry: 8, retryDelayMs: 1_000, maxRetryDelayMs: 8_000 },
    },
  }
}
