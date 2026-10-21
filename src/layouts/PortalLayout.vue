<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Close, Menu as MenuIcon, UserFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import PolicyAssistant from '../components/portal/PolicyAssistant.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const mobileOpen = ref(false)

const navItems = [
  { label: '首页', path: '/' },
  { label: '赛事资讯', path: '/news' },
  { label: '政策公告', path: '/policies' },
  { label: '赛程与比分', path: '/matches' },
  { label: '射手榜', path: '/rankings' },
  { label: '公示查询', path: '/publications' },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const consoleLabel = computed(() => (auth.user ? '进入控制台' : '管理登录'))

onMounted(async () => {
  if (auth.token && !auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      auth.clear()
    }
  }
})

function goConsole() {
  mobileOpen.value = false
  router.push(auth.token ? '/console/dashboard' : '/login')
}

function navigate(path: string) {
  mobileOpen.value = false
  router.push(path)
}
</script>

<template>
  <div class="portal">
    <header class="portal-header">
      <div class="container header-inner">
        <router-link to="/" class="brand">
          <span class="brand__mark">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="18" fill="var(--brand-700)" />
              <path d="M20 10.5l5.4 3.9-2 6.3h-6.8l-2-6.3L20 10.5z" fill="var(--lime)" />
              <path
                d="M20 4v6.5M36 20h-6M10 20H4M31.5 31.5l-4.2-4.2M8.5 31.5l4.2-4.2"
                stroke="var(--lime)"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span class="brand__text">
            <strong>绿茵少年</strong>
            <small>省级中小学足球联赛</small>
          </span>
        </router-link>

        <nav class="nav">
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="nav__link"
            :class="{ 'is-active': isActive(item.path) }"
          >
            {{ item.label }}
          </router-link>
        </nav>

        <div class="header-actions">
          <span v-if="auth.user" class="welcome">
            <el-icon><UserFilled /></el-icon>
            {{ auth.displayName }}
          </span>
          <el-button class="console-btn" @click="goConsole">
            {{ consoleLabel }}
          </el-button>
          <button class="mobile-trigger" type="button" @click="mobileOpen = true">
            <el-icon :size="20"><MenuIcon /></el-icon>
          </button>
        </div>
      </div>
    </header>

    <main class="portal-main">
      <router-view />
    </main>

    <footer class="portal-footer">
      <div class="container footer-grid">
        <div class="footer-brand">
          <div class="brand">
            <span class="brand__mark brand__mark--footer">
              <svg viewBox="0 0 40 40" aria-hidden="true">
                <circle cx="20" cy="20" r="18" fill="var(--lime)" />
                <path d="M20 10.5l5.4 3.9-2 6.3h-6.8l-2-6.3L20 10.5z" fill="var(--brand-900)" />
              </svg>
            </span>
            <span class="brand__text brand__text--footer">
              <strong>绿茵少年</strong>
              <small>省级中小学足球联赛</small>
            </span>
          </div>
          <p>
            面向全省中小学与高校的青少年足球赛事服务平台，连接报名、审核、比赛与人才遴选。
          </p>
        </div>

        <div class="footer-col">
          <h4>快捷入口</h4>
          <router-link to="/matches">赛程与比分</router-link>
          <router-link to="/rankings">射手榜</router-link>
          <router-link to="/publications">公示查询</router-link>
          <router-link to="/login">管理登录</router-link>
        </div>

        <div class="footer-col">
          <h4>政策服务</h4>
          <router-link to="/policies">竞赛规程</router-link>
          <router-link to="/policies">报名办法</router-link>
          <router-link to="/policies">资格审查</router-link>
          <button type="button" class="footer-link" @click="navigate('/policies')">政策问答</button>
        </div>

        <div class="footer-col footer-contact">
          <h4>联系组委会</h4>
          <p>竞赛办公室：省教育厅体卫艺处</p>
          <p>服务时间：工作日 9:00 - 17:30</p>
          <p class="footer-note">平台演示版本 · 数据均为模拟数据</p>
        </div>
      </div>
      <div class="footer-bottom">
        <div class="container">
          <span>© 2026 省级中小学足球联赛组委会</span>
          <span>川 ICP 备 00000000 号</span>
        </div>
      </div>
    </footer>

    <PolicyAssistant />

    <el-drawer
      v-model="mobileOpen"
      direction="rtl"
      size="78%"
      :with-header="false"
      class="mobile-drawer"
    >
      <div class="mobile-panel">
        <div class="mobile-panel__head">
          <span class="mobile-panel__title">导航</span>
          <button type="button" class="mobile-panel__close" @click="mobileOpen = false">
            <el-icon><Close /></el-icon>
          </button>
        </div>
        <button
          v-for="item in navItems"
          :key="item.path"
          type="button"
          class="mobile-link"
          :class="{ 'is-active': isActive(item.path) }"
          @click="navigate(item.path)"
        >
          {{ item.label }}
        </button>
        <el-button type="primary" size="large" class="mobile-cta" @click="goConsole">
          {{ consoleLabel }}
        </el-button>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.portal {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
}

.portal-header {
  position: sticky;
  top: 0;
  z-index: 50;
  background: #fff;
  border-bottom: 1px solid var(--line);
}

.header-inner {
  display: flex;
  align-items: center;
  height: 68px;
  gap: 32px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  flex-shrink: 0;
}

.brand__mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
}

.brand__mark svg {
  width: 34px;
  height: 34px;
}

.brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.brand__text strong {
  font-size: 17px;
  letter-spacing: 0.04em;
  color: var(--brand-900);
}

.brand__text small {
  margin-top: 1px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--ink-500);
}

.nav {
  display: flex;
  align-items: center;
  gap: 26px;
  height: 100%;
}

.nav__link {
  position: relative;
  display: flex;
  align-items: center;
  height: 100%;
  font-size: 14.5px;
  font-weight: 400;
  color: var(--ink-700);
  transition: color 0.15s;
}

.nav__link:hover {
  color: var(--brand-700);
}

.nav__link.is-active {
  color: var(--brand-800);
  font-weight: 600;
}

.nav__link.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--brand-700);
}

.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}

.console-btn {
  border-color: var(--brand-700);
  color: var(--brand-700);
  background: #fff;
}

.console-btn:hover,
.console-btn:focus {
  border-color: var(--brand-800);
  color: var(--brand-800);
  background: var(--brand-50);
}

.welcome {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--ink-500);
}

.mobile-trigger {
  display: none;
  border: none;
  background: transparent;
  color: var(--ink-700);
  cursor: pointer;
}

.portal-main {
  flex: 1;
}

.portal-footer {
  background: var(--brand-900);
  color: rgba(255, 255, 255, 0.68);
}

.footer-grid {
  display: grid;
  grid-template-columns: 1.6fr 0.8fr 0.8fr 1.1fr;
  gap: 40px;
  padding: 54px 0 42px;
}

.brand__mark--footer {
  background: transparent;
}

.brand__text--footer strong {
  color: #fff;
}

.brand__text--footer small {
  color: rgba(255, 255, 255, 0.56);
}

.footer-brand p {
  max-width: 320px;
  margin-top: 18px;
  font-size: 13.5px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.6);
}

.footer-col {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.footer-col h4 {
  margin-bottom: 7px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.footer-col a,
.footer-link {
  width: fit-content;
  border: none;
  background: none;
  padding: 0;
  font-size: 13.5px;
  color: rgba(255, 255, 255, 0.68);
  cursor: pointer;
  transition: color 0.15s;
}

.footer-col a:hover,
.footer-link:hover {
  color: #fff;
}

.footer-contact p {
  font-size: 13px;
  line-height: 1.7;
}

.footer-note {
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.46);
}

.footer-bottom {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.footer-bottom .container {
  display: flex;
  justify-content: space-between;
  padding: 18px 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.46);
}

.mobile-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}

.mobile-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px 16px;
}

.mobile-panel__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-900);
}

.mobile-panel__close {
  border: none;
  background: var(--paper);
  border-radius: 6px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.mobile-link {
  border: none;
  background: transparent;
  padding: 14px 12px;
  border-radius: 6px;
  font-size: 15px;
  text-align: left;
  color: var(--ink-700);
  cursor: pointer;
}

.mobile-link.is-active {
  background: var(--brand-50);
  color: var(--brand-800);
  font-weight: 700;
}

.mobile-cta {
  margin-top: 18px;
}

@media (max-width: 960px) {
  .nav,
  .welcome {
    display: none;
  }

  .mobile-trigger {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
  }

  .header-inner {
    height: 64px;
    gap: 16px;
  }

  .footer-grid {
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    padding: 38px 0 30px;
  }

  .footer-brand {
    grid-column: 1 / -1;
  }
}

@media (max-width: 540px) {
  .header-actions .el-button {
    display: none;
  }

  .footer-grid {
    grid-template-columns: 1fr;
  }
}
</style>
