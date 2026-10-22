<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { openLoginDialog } from '../../composables/useLoginDialog'

const route = useRoute()
const router = useRouter()

/**
 * 登录已改为门户上的弹窗。保留 /login 路由用于路由守卫回跳，
 * 访问时打开弹窗并回到门户，避免出现独立登录页造成割裂。
 */
onMounted(() => {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  openLoginDialog({ redirect })
  router.replace('/')
})
</script>

<template>
  <div class="login-redirect">
    <span class="login-redirect__mark" />
    <p>正在打开登录窗口…</p>
  </div>
</template>

<style scoped>
.login-redirect {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 14px;
  min-height: 100vh;
  background: var(--brand-900);
  color: rgba(255, 255, 255, 0.62);
  font-size: 13px;
}

.login-redirect__mark {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.16);
  border-top-color: var(--lime);
  animation: login-spin 0.8s linear infinite;
}

@keyframes login-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
