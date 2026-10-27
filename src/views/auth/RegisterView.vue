<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { openLoginDialog } from '../../composables/useLoginDialog'

const route = useRoute()
const router = useRouter()

/**
 * 注册已并入门户上的登录弹窗（同一弹窗内切换登录/注册）。
 * 保留 /register 路由只用于接收邀请链接，打开注册弹窗后回到门户。
 */
onMounted(() => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  openLoginDialog({ register: true, token })
  router.replace('/')
})
</script>

<template>
  <div class="register-redirect">
    <span class="register-redirect__mark" />
    <p>正在打开注册窗口…</p>
  </div>
</template>

<style scoped>
.register-redirect {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 14px;
  min-height: 100vh;
  background: var(--brand-900);
  color: rgba(255, 255, 255, 0.62);
  font-size: 13px;
}

.register-redirect__mark {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.16);
  border-top-color: var(--lime);
  animation: register-spin 0.8s linear infinite;
}

@keyframes register-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
