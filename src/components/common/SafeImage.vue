<script setup lang="ts">
import { ref, watch } from 'vue'
import { isFileServiceUrl, resolveImageUrl } from '../../utils/images'

/**
 * 图片展示组件：文件服务地址先取二进制再生成 object URL，避免 <img> 直读被 ORB 拦截；
 * 外链与站内静态图保持原样直出。等待期间不写 src，避免先触发一次必然失败的请求。
 */
defineOptions({ inheritAttrs: false })

const props = defineProps<{ src?: string | null; alt?: string }>()

const resolved = ref('')
let seq = 0

watch(
  () => props.src || '',
  async (raw) => {
    const token = ++seq
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
    if (token === seq) resolved.value = next
  },
  { immediate: true },
)
</script>

<template>
  <img v-bind="$attrs" :src="resolved || undefined" :alt="alt" />
</template>
