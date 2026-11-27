<script setup lang="ts">
import { ref, watch } from 'vue'
import { isFileServiceUrl, resolveImageUrl } from '../../utils/images'

/**
 * 图片展示组件：文件服务地址先取二进制再生成 object URL，避免 <img> 直读被 ORB 拦截；
 * 外链与站内静态图保持原样直出。等待期间不写 src，避免先触发一次必然失败的请求。
 */
defineOptions({ inheritAttrs: false })

const props = defineProps<{ src?: string | null; alt?: string; fallbackSrc?: string }>()

const resolved = ref('')
const failed = ref(false)
let seq = 0

watch(
  () => props.src || '',
  async (raw) => {
    const token = ++seq
    failed.value = false
    if (!raw) {
      resolved.value = ''
      return
    }
    if (!isFileServiceUrl(raw)) {
      resolved.value = raw
      return
    }
    resolved.value = ''
    const next = await resolveImageUrl(raw)
    if (token !== seq) return
    resolved.value = next
    // 文件服务预取失败（文件缺失/被清理）时直接进入失败占位，不留空白格。
    if (!next) failed.value = true
  },
  { immediate: true },
)

/** 图片加载失败：有兜底图则切到兜底图（兜底也失败就占位），没有兜底则占位。 */
function handleError() {
  if (props.fallbackSrc && resolved.value !== props.fallbackSrc) {
    resolved.value = props.fallbackSrc
    return
  }
  resolved.value = ''
  failed.value = true
}
</script>

<template>
  <img
    v-bind="$attrs"
    :src="resolved || undefined"
    :alt="alt"
    :class="{ 'img-load-failed': failed }"
    @error="handleError"
  />
</template>
