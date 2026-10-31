import { onMounted, onUnmounted } from 'vue'

/**
 * 页面可见时按固定间隔执行刷新任务；页面隐藏或上一次任务未结束时跳过。
 * 用于门户比分/射手榜的静默刷新，避免后台标签页持续请求。
 */
export function useVisiblePolling(task: () => void | Promise<void>, interval = 30_000) {
  let timer: ReturnType<typeof setInterval> | null = null
  let running = false

  async function tick() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (running) return
    running = true
    try {
      await task()
    } finally {
      running = false
    }
  }

  onMounted(() => {
    timer = setInterval(tick, Math.max(5_000, interval))
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
    timer = null
  })

  return { tick }
}
