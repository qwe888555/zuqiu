<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { ArrowRight, Bell, Expand, Fold, HomeFilled, Operation, SwitchButton } from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { ROLE_MENU_LABELS } from '../config/menus'
import { meApi } from '../api'
import { MOCK_ENABLED } from '../api/http'
import { DEMO_ACCOUNTS } from '../mock/data'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const app = useAppStore()
const isMobile = ref(window.innerWidth < 992)
const compact = ref(localStorage.getItem('console-density') === 'compact')

watch(compact, (value) => {
  localStorage.setItem('console-density', value ? 'compact' : 'comfortable')
})

const activeMenu = computed(() => {
  const path = route.path
  if (path.startsWith('/console/enrollments/')) return '/console/enrollments'
  if (path.startsWith('/console/matches/')) return '/console/matches'
  return path
})

const sectionTitle = computed(() => {
  const section = auth.sections.find((s) => s.items.some((item) => item.path === activeMenu.value))
  return section?.title || '控制台'
})

const currentRoleLabel = computed(() => {
  const labels = auth.roles.map((role) => ROLE_MENU_LABELS[role])
  return labels.join(' / ') || '访客'
})

const demoAccounts = computed(() =>
  DEMO_ACCOUNTS.map((demo) => ({
    username: demo.username,
    displayName: demo.displayName,
    roleLabel: ROLE_MENU_LABELS[demo.role],
    orgName: demo.orgName,
    current: demo.username === auth.user?.username,
  })),
)

const avatarText = computed(() => (auth.displayName || 'U').slice(0, 1))

const passwordVisible = ref(false)
const passwordSaving = ref(false)
const passwordFormRef = ref<FormInstance>()
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

const passwordRules: FormRules = {
  oldPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' },
    { min: 8, max: 128, message: '密码长度需为 8-128 位', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, max: 128, message: '密码长度需为 8-128 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (value !== passwordForm.newPassword) callback(new Error('两次输入的新密码不一致'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

function openPasswordDialog() {
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  passwordVisible.value = true
}

async function submitPassword() {
  if (!passwordFormRef.value) return
  const valid = await passwordFormRef.value.validate().catch(() => false)
  if (!valid) return
  passwordSaving.value = true
  try {
    await meApi.changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    })
    ElMessage.success('密码已更新，请使用新密码登录')
    passwordVisible.value = false
    await auth.logout()
    router.push('/login')
  } catch {
    // 拦截器提示
  } finally {
    passwordSaving.value = false
  }
}

function onResize() {
  isMobile.value = window.innerWidth < 992
  if (!isMobile.value) app.mobileMenuOpen = false
}

onMounted(async () => {
  window.addEventListener('resize', onResize)
  try {
    const res = await meApi.messages({ page: 1, pageSize: 1, read: false })
    app.unreadCount = res.total
  } catch {
    // 未读消息加载失败不阻塞页面
  }
})

onBeforeUnmount(() => window.removeEventListener('resize', onResize))

watch(
  () => route.fullPath,
  () => {
    app.mobileMenuOpen = false
  },
)

async function switchAccount(username: string) {
  const demo = DEMO_ACCOUNTS.find((item) => item.username === username)
  if (!demo || demo.username === auth.user?.username) return
  try {
    await ElMessageBox.confirm(
      `将退出当前账号并以「${demo.displayName}」身份重新登录，未保存的编辑内容会丢失。`,
      `切换为${ROLE_MENU_LABELS[demo.role]}`,
      { confirmButtonText: '切换身份', cancelButtonText: '取消', type: 'warning' },
    )
    await auth.logout()
    await auth.login(demo.username, demo.password)
    ElMessage.success(`已切换为${ROLE_MENU_LABELS[demo.role]}`)
    await router.push('/console/dashboard')
  } catch {
    // 取消或登录失败
  }
}

async function handleCommand(command: string) {
  if (command.startsWith('switch:')) {
    await switchAccount(command.slice('switch:'.length))
    return
  }
  if (command === 'logout') {
    await auth.logout()
    ElMessage.success('已安全退出')
    router.push('/login')
    return
  }
  if (command === 'portal') {
    router.push('/')
    return
  }
  if (command === 'password') {
    openPasswordDialog()
    return
  }
  if (command === 'profile') {
    router.push(auth.roles.includes('ATHLETE') || auth.roles.includes('COACH') ? '/console/profile' : '/console/dashboard')
  }
}
</script>

<template>
  <div
    class="console"
    :class="{ 'is-collapsed': app.sidebarCollapsed && !isMobile, 'density-compact': compact }"
  >
    <aside
      class="sidebar"
      :class="{
        'is-collapsed': app.sidebarCollapsed && !isMobile,
        'is-mobile-open': app.mobileMenuOpen,
      }"
    >
      <div class="brand">
        <div class="brand__mark">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="var(--lime)" />
            <path
              d="M20 10.5l5.4 3.9-2 6.3h-6.8l-2-6.3L20 10.5z"
              fill="#075c40"
            />
            <path d="M20 4v6.5M36 20h-6M10 20H4M31.5 31.5l-4.2-4.2M8.5 31.5l4.2-4.2" stroke="#075c40" stroke-width="2" stroke-linecap="round" />
          </svg>
        </div>
        <div v-show="!app.sidebarCollapsed || isMobile" class="brand__text">
          <strong>绿茵少年</strong>
          <span>省级中小学足球联赛</span>
        </div>
      </div>

      <div v-show="!app.sidebarCollapsed || isMobile" class="role-pill">
        <span class="role-pill__dot" />
        {{ currentRoleLabel }}
      </div>

      <nav class="menu-scroll">
        <template v-for="section in auth.sections" :key="section.key">
          <div v-if="!app.sidebarCollapsed || isMobile" class="menu-section">{{ section.title }}</div>
          <el-menu
            :default-active="activeMenu"
            :collapse="app.sidebarCollapsed && !isMobile"
            :collapse-transition="false"
            router
            class="side-menu"
          >
            <el-menu-item v-for="item in section.items" :key="item.key" :index="item.path">
              <el-icon><component :is="item.icon" /></el-icon>
              <template #title>
                <span>{{ item.title }}</span>
                <span v-if="item.badge" class="menu-badge">{{ item.badge }}</span>
              </template>
            </el-menu-item>
          </el-menu>
        </template>
      </nav>

      <div v-show="!app.sidebarCollapsed || isMobile" class="sidebar-foot">
        <span>2026 赛季 · 管理端</span>
        <span class="dot" />
        <span>v0.1</span>
      </div>
    </aside>

    <div v-if="app.mobileMenuOpen" class="sidebar-overlay" @click="app.mobileMenuOpen = false" />

    <div class="main">
      <header class="topbar">
        <button class="icon-btn" type="button" aria-label="切换菜单" @click="app.toggleSidebar">
          <el-icon :size="19">
            <Expand v-if="app.sidebarCollapsed || isMobile" />
            <Fold v-else />
          </el-icon>
        </button>

        <div class="crumb">
          <span>{{ sectionTitle }}</span>
          <el-icon :size="12"><ArrowRight /></el-icon>
          <strong>{{ route.meta.title }}</strong>
        </div>

        <div class="top-actions">
          <el-tooltip :content="compact ? '切换为舒适密度' : '切换为紧凑密度'" placement="bottom">
            <button
              class="icon-btn"
              :class="{ 'is-on': compact }"
              type="button"
              :aria-pressed="compact"
              @click="compact = !compact"
            >
              <el-icon :size="18"><Operation /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip content="返回门户" placement="bottom">
            <button class="icon-btn" type="button" @click="router.push('/')">
              <el-icon :size="18"><HomeFilled /></el-icon>
            </button>
          </el-tooltip>
          <el-badge :value="app.unreadCount" :hidden="!app.unreadCount" :max="99">
            <button class="icon-btn" type="button" @click="router.push('/console/messages')">
              <el-icon :size="18"><Bell /></el-icon>
            </button>
          </el-badge>

          <span class="top-divider" />

          <el-dropdown trigger="click" @command="handleCommand">
            <div class="user-chip">
              <span class="user-chip__avatar">{{ avatarText }}</span>
              <span class="user-chip__meta">
                <strong>{{ auth.displayName }}</strong>
                <small>{{ currentRoleLabel }}</small>
              </span>
              <el-icon :size="12"><ArrowRight class="rotate-90" /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">账号信息</el-dropdown-item>
                <el-dropdown-item command="password">修改密码</el-dropdown-item>
                <el-dropdown-item command="portal">返回门户</el-dropdown-item>
                <template v-if="MOCK_ENABLED">
                  <el-dropdown-item divided disabled class="switch-label">
                    切换演示身份
                  </el-dropdown-item>
                  <el-dropdown-item
                    v-for="demo in demoAccounts"
                    :key="demo.username"
                    :command="`switch:${demo.username}`"
                    :disabled="demo.current"
                    class="switch-item"
                  >
                    <span class="switch-dot" :class="{ 'is-current': demo.current }" />
                    <span class="switch-meta">
                      <strong>{{ demo.roleLabel }}</strong>
                      <small>{{ demo.orgName }}</small>
                    </span>
                    <span v-if="demo.current" class="switch-current">当前</span>
                  </el-dropdown-item>
                </template>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>

  <el-dialog v-model="passwordVisible" title="修改登录密码" width="420px" append-to-body>
    <p class="password-hint">
      当前账号：<strong>{{ auth.user?.username }}</strong>。修改成功后需要使用新密码重新登录。
    </p>
    <el-form
      ref="passwordFormRef"
      :model="passwordForm"
      :rules="passwordRules"
      label-position="top"
      @submit.prevent="submitPassword"
    >
      <el-form-item label="当前密码" prop="oldPassword">
        <el-input v-model="passwordForm.oldPassword" type="password" show-password autocomplete="current-password" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input v-model="passwordForm.newPassword" type="password" show-password autocomplete="new-password" />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirmPassword">
        <el-input v-model="passwordForm.confirmPassword" type="password" show-password autocomplete="new-password" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="passwordVisible = false">取消</el-button>
      <el-button type="primary" :loading="passwordSaving" @click="submitPassword">确认修改</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.console {
  display: flex;
  min-height: 100vh;
  background: var(--paper);
}

.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 30;
  width: 248px;
  display: flex;
  flex-direction: column;
  padding: 20px 0 14px;
  color: rgba(255, 255, 255, 0.72);
  background: var(--brand-900);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  transition: width 0.2s ease;
}

.sidebar.is-collapsed {
  width: 78px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 22px 18px;
  overflow: hidden;
}

.brand__mark {
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  overflow: hidden;
}

.brand__mark svg {
  width: 32px;
  height: 32px;
}

.brand__text {
  display: flex;
  flex-direction: column;
  white-space: nowrap;
}

.brand__text strong {
  color: #fff;
  font-size: 16px;
  letter-spacing: 0.04em;
}

.brand__text span {
  margin-top: 2px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.42);
}

.role-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 22px 12px;
  padding: 4px 0;
  width: fit-content;
  border-radius: 4px;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
}

.role-pill__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--lime);
}

.menu-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 10px 12px;
}

.menu-scroll::-webkit-scrollbar {
  width: 4px;
}

.menu-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.16);
}

.menu-section {
  padding: 16px 14px 6px;
  font-size: 10.5px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.32);
  white-space: nowrap;
}

.side-menu {
  border-right: none;
  background: transparent;
}

.side-menu:not(.el-menu--collapse) {
  width: auto;
}

.side-menu :deep(.el-menu-item) {
  position: relative;
  height: 40px;
  line-height: 40px;
  margin: 1px 0;
  padding: 0 14px !important;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.64);
  font-size: 13px;
}

.side-menu :deep(.el-menu-item .el-icon) {
  color: rgba(255, 255, 255, 0.5);
  margin-right: 10px;
}

.side-menu :deep(.el-menu-item:hover) {
  background: rgba(255, 255, 255, 0.07);
  color: #fff;
}

.side-menu :deep(.el-menu-item.is-active) {
  color: #fff;
  background: rgba(255, 255, 255, 0.09);
  font-weight: 600;
}

.side-menu :deep(.el-menu-item.is-active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 2px;
  border-radius: 2px;
  background: var(--lime);
}

.side-menu :deep(.el-menu-item.is-active .el-icon) {
  color: var(--lime);
}

.side-menu.el-menu--collapse :deep(.el-menu-item) {
  padding: 0 !important;
  justify-content: center;
  margin: 3px 6px;
}

.side-menu.el-menu--collapse :deep(.el-menu-item .el-icon) {
  margin: 0;
  font-size: 18px;
}

.menu-badge {
  margin-left: auto;
  padding: 0 5px;
  border-radius: 3px;
  font-size: 9px;
  line-height: 15px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.66);
}

.side-menu :deep(.el-menu-item.is-active) .menu-badge {
  background: rgba(200, 241, 105, 0.14);
  color: var(--lime);
}

.sidebar-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px 0;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.3);
  white-space: nowrap;
}

.sidebar-foot .dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
}

.main {
  flex: 1;
  min-width: 0;
  margin-left: 248px;
  transition: margin-left 0.2s ease;
}

.is-collapsed .main {
  margin-left: 78px;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 14px;
  height: 62px;
  padding: 0 28px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-500);
  cursor: pointer;
  transition: 0.15s;
}

.icon-btn:hover {
  background: var(--brand-50);
  border-color: var(--line);
  color: var(--brand-700);
}

.icon-btn.is-on {
  background: var(--brand-50);
  border-color: var(--brand-200, var(--line));
  color: var(--brand-700);
}

.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-300);
}

.crumb strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-700);
}

.top-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.top-divider {
  width: 1px;
  height: 22px;
  margin: 0 8px;
  background: var(--line);
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 5px 8px 5px 5px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.user-chip:hover {
  background: var(--brand-50);
}

.user-chip__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--brand-700);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.user-chip__meta {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.user-chip__meta strong {
  font-size: 12.5px;
  color: var(--ink-900);
}

.user-chip__meta small {
  font-size: 10px;
  color: var(--ink-500);
}

.rotate-90 {
  transform: rotate(90deg);
  color: var(--ink-300);
}

:global(.el-dropdown-menu__item.switch-label) {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--ink-300);
}

:global(.el-dropdown-menu__item.switch-item) {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 230px;
}

:global(.switch-item .switch-dot) {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--line-strong, #d5ddd8);
}

:global(.switch-item .switch-dot.is-current) {
  background: var(--brand-500);
  box-shadow: 0 0 0 3px rgba(11, 122, 83, 0.12);
}

:global(.switch-item .switch-meta) {
  display: flex;
  flex: 1;
  flex-direction: column;
  line-height: 1.3;
}

:global(.switch-item .switch-meta strong) {
  font-size: 11.5px;
  font-weight: 600;
}

:global(.switch-item .switch-meta small) {
  font-size: 9.5px;
  color: var(--ink-300);
}

:global(.switch-item .switch-current) {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--brand-50);
  font-size: 8.5px;
  color: var(--brand-700);
}

.content {
  width: min(1440px, 100%);
  margin: 0 auto;
  padding: 26px 28px 48px;
}

.password-hint {
  margin: -4px 0 16px;
  padding: 9px 12px;
  border-radius: 6px;
  background: var(--paper);
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.password-hint strong {
  color: var(--brand-700);
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  z-index: 25;
  background: rgba(6, 32, 23, 0.46);
}

@media (max-width: 991px) {
  .sidebar {
    transform: translateX(-100%);
    width: 248px !important;
    transition: transform 0.22s ease;
  }

  .sidebar.is-mobile-open {
    transform: translateX(0);
  }

  .sidebar.is-collapsed {
    width: 248px;
  }

  .main,
  .is-collapsed .main {
    margin-left: 0;
  }

  .topbar {
    padding: 0 16px;
  }

  .content {
    padding: 18px 16px 40px;
  }

  .user-chip__meta {
    display: none;
  }

  .crumb span,
  .crumb .el-icon {
    display: none;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
