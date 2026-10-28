<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Close, Menu as MenuIcon, UserFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { publicApi } from '../api'
import type { PublicResource } from '../api/types'
import { MOCK_ENABLED } from '../api/http'
import { useConsoleEntry } from '../composables/useConsoleEntry'
import LoginDialog from '../components/auth/LoginDialog.vue'
import PolicyAssistant from '../components/portal/PolicyAssistant.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const mobileOpen = ref(false)
/** 备案号属于部署信息，未配置时不展示占位号。 */
const icpNumber = import.meta.env.VITE_ICP_NUMBER || ''
/** 页脚合作伙伴取自门户资源里类型为 PARTNER 的条目，由管理端维护。 */
const partners = ref<PublicResource[]>([])

const {
  consoleLabel,
  goConsole: enterConsole,
  startEnrollment: enterEnrollment,
} = useConsoleEntry()

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

/** 内部预览页只能返回来源页，顶栏与页脚的其他入口需显示为不可用。 */
const inPreview = computed(
  () => route.name === 'portal-match-detail' && route.query.preview === '1',
)

async function loadPartners() {
  try {
    const res = await publicApi.resources()
    partners.value = res.items.filter(
      (item) => item.resourceType === 'PARTNER' && Boolean(item.title),
    )
  } catch {
    // 页脚是辅助信息，接口异常时直接不展示，不影响门户主体。
    partners.value = []
  }
}

onMounted(async () => {
  loadPartners()
  if (auth.token && !auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      auth.clear()
    }
  }
})

function previewBlocked() {
  mobileOpen.value = false
  ElMessage.warning('预览模式仅支持返回上一页，请点击「退出预览」返回')
}

function goConsole() {
  mobileOpen.value = false
  if (inPreview.value) return previewBlocked()
  enterConsole()
}

function startEnrollment() {
  mobileOpen.value = false
  if (inPreview.value) return previewBlocked()
  enterEnrollment()
}

function navigate(path: string) {
  mobileOpen.value = false
  router.push(path)
}
</script>

<template>
  <div class="portal" :class="{ 'is-preview': inPreview }">
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
          <span class="header-season"><i class="header-season__dot" />2026 赛季 · 四川</span>
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
      <div class="container footer-grid" :class="{ 'footer-grid--partners': partners.length }">
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
          <p>面向全省学校与球队的青少年足球赛事服务平台。</p>
          <span v-if="MOCK_ENABLED" class="footer-badge">演示环境 · 数据均为模拟数据</span>
        </div>

        <div class="footer-col">
          <h4>赛事服务</h4>
          <router-link to="/news">赛事资讯</router-link>
          <router-link to="/matches">赛程与比分</router-link>
          <router-link to="/rankings">射手榜</router-link>
          <router-link to="/publications">公示查询</router-link>
        </div>

        <div class="footer-col">
          <h4>政策与报名</h4>
          <router-link to="/policies">政策公告</router-link>
          <button type="button" class="footer-link" @click="startEnrollment">报名入口</button>
        </div>

        <div class="footer-col footer-contact">
          <h4>联系组委会</h4>
          <p>竞赛办公室：省教育厅体卫艺处</p>
          <p>服务时间：工作日 9:00 - 17:30</p>
          <p class="footer-note">赛况与公示以组委会确认结果为准</p>
        </div>

        <div v-if="partners.length" class="footer-col footer-partners">
          <h4>合作伙伴</h4>
          <component
            :is="partner.targetUrl ? 'a' : 'span'"
            v-for="partner in partners"
            :key="partner.id"
            class="partner-item"
            :title="partner.description || partner.title"
            :href="partner.targetUrl || undefined"
            :target="partner.targetUrl ? '_blank' : undefined"
            :rel="partner.targetUrl ? 'noopener noreferrer' : undefined"
          >
            <img
              v-if="partner.imageUrl"
              class="partner-item__logo"
              :src="partner.imageUrl"
              :alt="partner.title"
            />
            <span v-else class="partner-item__dot" aria-hidden="true" />
            <span class="partner-item__name">{{ partner.title }}</span>
          </component>
          <p class="footer-note partner-note">诚邀更多单位共建校园足球</p>
        </div>
      </div>

      <div class="footer-bottom">
        <div class="container">
          <span>© 2026 省级中小学足球联赛组委会</span>
          <span v-if="icpNumber">{{ icpNumber }}</span>
        </div>
      </div>
    </footer>

    <LoginDialog />
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
  height: 72px;
  gap: 44px;
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
  gap: 34px;
  height: 100%;
}

.nav__link {
  position: relative;
  display: flex;
  align-items: center;
  height: 100%;
  font-size: 15px;
  font-weight: 400;
  color: var(--ink-700);
  white-space: nowrap;
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

.header-season {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--paper);
  font-size: 11px;
  color: var(--ink-500);
  white-space: nowrap;
}

.header-season__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--brand-500);
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
  position: relative;
  overflow: hidden;
  background: var(--brand-900);
  color: var(--on-dark-2);
}

.portal-footer::before {
  content: '';
  position: absolute;
  right: -140px;
  top: -190px;
  width: 520px;
  height: 520px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 50%;
  pointer-events: none;
}

.footer-grid {
  position: relative;
  display: grid;
  grid-template-columns: 1.6fr 0.8fr 0.8fr 1.1fr;
  gap: 34px;
  padding: 44px 0 36px;
}

.brand__mark--footer {
  background: transparent;
}

.brand__text--footer strong {
  color: #fff;
}

.brand__text--footer small {
  color: var(--on-dark-3);
}

.footer-brand p {
  max-width: 320px;
  margin-top: 16px;
  font-size: 13px;
  line-height: 1.85;
  color: var(--on-dark-3);
}

.footer-badge {
  display: inline-block;
  margin-top: 14px;
  padding: 3px 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--on-dark-3);
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
  color: var(--on-dark-2);
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
  color: var(--on-dark-3);
}

/* 合作伙伴：页脚右侧的简略展示，条目来自门户资源（PARTNER 类型）。 */
.footer-grid--partners {
  grid-template-columns: 1.4fr 0.7fr 0.7fr 1.25fr 1.05fr;
}

.footer-partners {
  gap: 9px;
}

.partner-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: fit-content;
  max-width: 100%;
  color: var(--on-dark-2);
  transition: color 0.15s;
}

a.partner-item:hover {
  color: #fff;
}

.partner-item__dot {
  width: 5px;
  height: 5px;
  flex-shrink: 0;
  margin-left: 6px;
  border-radius: 50%;
  background: var(--lime);
  opacity: 0.85;
}

.partner-item__logo {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  object-fit: contain;
}

.partner-item__name {
  min-width: 0;
  overflow: hidden;
  font-size: 13.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.partner-note {
  margin-top: 2px;
}

.footer-bottom {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.footer-bottom .container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
  font-size: 12px;
  color: var(--on-dark-3);
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

@media (max-width: 1180px) {
  .header-season,
  .welcome {
    display: none;
  }

  .header-inner {
    gap: 26px;
  }

  .nav {
    gap: 24px;
  }
}

@media (max-width: 960px) {
  .nav {
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 30px;
    padding: 34px 0 28px;
  }

  .footer-brand {
    grid-column: 1 / -1;
  }

  /* 多一列合作伙伴后三列会挤，窄屏改成两列排。 */
  .footer-grid--partners {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 540px) {
  .header-actions .el-button {
    display: none;
  }

  .footer-grid {
    grid-template-columns: 1fr;
  }

  .footer-bottom .container {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}

/* 内部预览：除「退出预览」外，门户内其他入口都不可跳转。 */
.portal.is-preview :where(.nav__link, a.brand, .console-btn, .footer-col a, .footer-link) {
  opacity: 0.42;
  cursor: not-allowed;
}

.portal.is-preview .nav__link.is-active {
  opacity: 1;
}

.portal.is-preview .nav__link:hover {
  color: var(--ink-700);
}

.portal.is-preview .nav__link.is-active:hover {
  color: var(--brand-800);
}

.portal.is-preview .console-btn:hover,
.portal.is-preview .console-btn:focus {
  border-color: var(--brand-700);
  color: var(--brand-700);
  background: #fff;
}

.portal.is-preview .footer-col a:hover,
.portal.is-preview .footer-link:hover {
  color: var(--on-dark-2);
}

.portal.is-preview :deep(.crumbs a) {
  cursor: not-allowed;
}

.portal.is-preview :deep(.crumbs a:hover) {
  color: rgba(255, 255, 255, 0.42);
}
</style>
