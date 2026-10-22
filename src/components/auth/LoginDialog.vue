<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ArrowRight, Close, Lock, User } from '@element-plus/icons-vue'
import { useAuthStore } from '../../stores/auth'
import { DEMO_ACCOUNTS } from '../../mock/data'
import { ROLE_LABELS } from '../../config/labels'
import { canEnroll, canOpenEnrollment, homeForRoles, workspaceLabelForRoles } from '../../utils/roles'
import { useLoginDialog } from '../../composables/useLoginDialog'

const router = useRouter()
const auth = useAuthStore()
const { visible, redirect } = useLoginDialog()

const REMEMBER_KEY = 'football.remember-username'
const remembered = localStorage.getItem(REMEMBER_KEY) || ''

const formRef = ref<FormInstance>()
const form = reactive({ username: remembered, password: '' })
const remember = ref(Boolean(remembered))
const quickLoading = ref('')

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码长度不少于 8 位', trigger: 'blur' },
  ],
}

const switching = computed(() => Boolean(auth.token && auth.user))
const workspaceLabel = computed(() =>
  auth.user ? workspaceLabelForRoles(auth.roles) : '',
)

const badgeOf: Record<string, string> = {
  TEAM: '球',
  UNIVERSITY: '学',
  CITY: '市',
  PROVINCE_REVIEWER: '省',
  ATHLETE: '运',
  COACH: '教',
  ADMIN: '管',
  MATCH_RECORDER: '赛',
}

const open = computed({
  get: () => visible.value,
  set: (value: boolean) => {
    visible.value = value
  },
})

watch(visible, (value) => {
  if (!value) {
    form.password = ''
    quickLoading.value = ''
  }
})

/** 登录后的落点：优先回到被拦截的业务页；报名页只允许报名角色进入。 */
function destination() {
  const target = redirect.value
  if (target.startsWith('/console/')) {
    if (target.startsWith('/console/enrollments/create') && !canEnroll(auth.roles)) {
      return homeForRoles(auth.roles)
    }
    if (target.startsWith('/console/enrollments') && !canOpenEnrollment(auth.roles)) {
      return homeForRoles(auth.roles)
    }
    return target
  }
  return homeForRoles(auth.roles)
}

function rememberAccount() {
  if (remember.value) localStorage.setItem(REMEMBER_KEY, form.username.trim())
  else localStorage.removeItem(REMEMBER_KEY)
}

function finish() {
  const target = destination()
  visible.value = false
  router.push(target)
}

async function submit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    await auth.login(form.username.trim(), form.password)
    rememberAccount()
    ElMessage.success(`欢迎回来，${auth.displayName}`)
    finish()
  } catch {
    // 错误提示由 HTTP 拦截器统一处理
  }
}

async function quickLogin(username: string) {
  const demo = DEMO_ACCOUNTS.find((item) => item.username === username)
  if (!demo || quickLoading.value) return
  quickLoading.value = username
  try {
    await auth.login(demo.username, demo.password)
    form.username = demo.username
    if (remember.value) localStorage.setItem(REMEMBER_KEY, demo.username)
    ElMessage.success(`已以${ROLE_LABELS[demo.role]}身份登录`)
    finish()
  } catch {
    // 拦截器已提示
  } finally {
    quickLoading.value = ''
  }
}

async function continueCurrent() {
  if (!auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      auth.clear()
      return
    }
  }
  finish()
}
</script>

<template>
  <el-dialog
    v-model="open"
    width="840px"
    class="login-dialog"
    modal-class="login-overlay"
    :show-close="false"
    append-to-body
    align-center
  >
    <div class="login-modal">
      <header class="login-modal__head">
        <div class="modal-brand">
          <span class="modal-brand__mark">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="18" fill="var(--brand-700)" />
              <path d="M20 10.5l5.4 3.9-2 6.3h-6.8l-2-6.3L20 10.5z" fill="var(--lime)" />
            </svg>
          </span>
          <span class="modal-brand__text">
            <strong>绿茵少年</strong>
            <small>省级中小学足球联赛</small>
          </span>
          <span class="modal-brand__tag">统一登录</span>
        </div>
        <button type="button" class="modal-close" aria-label="关闭登录窗口" @click="visible = false">
          <el-icon><Close /></el-icon>
        </button>
      </header>

      <div v-if="switching" class="session-banner">
        <span class="session-banner__dot" />
        <div>
          <strong>当前已登录：{{ auth.displayName }}</strong>
          <small>{{ workspaceLabel }} · 可直接继续，或在右侧切换其他端</small>
        </div>
        <button type="button" @click="continueCurrent">继续进入</button>
      </div>

      <div class="login-modal__body">
        <section class="form-side">
          <span class="form-side__eyebrow">ACCOUNT LOGIN</span>
          <h2>账号登录</h2>
          <p>学校端统一管理本校多支球队，球队端仅维护所属球队；登录后按角色进入对应工作台。</p>

          <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-position="top"
            size="large"
            hide-required-asterisk
            @submit.prevent="submit"
          >
            <el-form-item label="账号" prop="username">
              <el-input
                v-model="form.username"
                :prefix-icon="User"
                placeholder="请输入账号"
                autocomplete="username"
                clearable
              />
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input
                v-model="form.password"
                :prefix-icon="Lock"
                type="password"
                show-password
                placeholder="请输入登录密码"
                autocomplete="current-password"
                @keyup.enter="submit"
              />
            </el-form-item>

            <div class="form-extra">
              <el-checkbox v-model="remember">记住账号</el-checkbox>
              <span>忘记密码请联系组委会管理员重置</span>
            </div>

            <el-button type="primary" size="large" class="submit-btn" :loading="auth.loading" @click="submit">
              登录
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </el-form>
        </section>

        <aside class="demo-side">
          <div class="demo-side__head">
            <div>
              <strong>快速进入各端</strong>
              <small>演示环境 · 点击即登录</small>
            </div>
            <span class="demo-side__tag">8 个端</span>
          </div>
          <div class="demo-grid">
            <button
              v-for="demo in DEMO_ACCOUNTS"
              :key="demo.username"
              type="button"
              class="demo-card"
              :class="{ 'is-current': demo.username === auth.user?.username }"
              :disabled="Boolean(quickLoading)"
              @click="quickLogin(demo.username)"
            >
              <span class="demo-card__badge">{{ badgeOf[demo.role] }}</span>
              <span class="demo-card__body">
                <strong>{{ ROLE_LABELS[demo.role] }}</strong>
                <small>{{ demo.orgName }}</small>
              </span>
              <span v-if="quickLoading === demo.username" class="demo-card__state">登录中</span>
              <span v-else-if="demo.username === auth.user?.username" class="demo-card__state">当前</span>
              <el-icon v-else class="demo-card__arrow"><ArrowRight /></el-icon>
            </button>
          </div>
          <p class="demo-side__note">演示账号统一密码 12345678；正式环境请使用组委会发放的账号。</p>
        </aside>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
:global(.login-overlay) {
  background: rgba(4, 31, 23, 0.64);
  backdrop-filter: blur(7px);
}

:global(.login-dialog) {
  --el-dialog-padding-primary: 0;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 40px);
  padding: 0;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 30px 90px rgba(4, 31, 23, 0.35);
}

.login-modal {
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  background: #fff;
}

.login-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--line);
}

.modal-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.modal-brand__mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
}

.modal-brand__mark svg {
  width: 100%;
  height: 100%;
}

.modal-brand__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.modal-brand__text strong {
  font-size: 14px;
  color: var(--ink-900);
}

.modal-brand__text small {
  font-size: 10px;
  color: var(--ink-300);
}

.modal-brand__tag {
  margin-left: 6px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--brand-50);
  font-size: 10.5px;
  color: var(--brand-700);
}

.modal-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #fff;
  color: var(--ink-500);
  cursor: pointer;
  transition: 0.15s;
}

.modal-close:hover {
  border-color: var(--brand-500);
  color: var(--brand-700);
}

.session-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 24px 0;
  padding: 11px 13px;
  border-radius: 9px;
  background: var(--brand-50);
}

.session-banner__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--lime);
  flex-shrink: 0;
}

.session-banner > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.session-banner strong {
  font-size: 12px;
  color: var(--brand-800);
}

.session-banner small {
  font-size: 11px;
  color: var(--ink-500);
}

.session-banner button {
  margin-left: auto;
  border: none;
  background: none;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-700);
  cursor: pointer;
  white-space: nowrap;
}

.login-modal__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr);
}

.form-side {
  padding: 28px 28px 26px 30px;
}

.form-side__eyebrow {
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--brand-600);
}

.form-side h2 {
  margin-top: 5px;
  font-size: 27px;
  font-weight: 700;
  color: var(--ink-900);
}

.form-side > p {
  margin: 7px 0 20px;
  font-size: 12px;
  line-height: 1.75;
  color: var(--ink-500);
}

.form-side :deep(.el-form-item) {
  margin-bottom: 16px;
}

.form-side :deep(.el-form-item__label) {
  padding-bottom: 6px;
  font-size: 12px;
  color: var(--ink-700);
}

.form-extra {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: -2px 0 18px;
}

.form-extra span {
  font-size: 10.5px;
  color: var(--ink-300);
  text-align: right;
}

.submit-btn {
  width: 100%;
  height: 44px;
  font-weight: 600;
}

.demo-side {
  padding: 26px 24px 24px;
  background: #f5f8f3;
  border-left: 1px solid var(--line);
}

.demo-side__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.demo-side__head > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.demo-side__head strong {
  font-size: 14px;
  color: var(--ink-900);
}

.demo-side__head small {
  font-size: 10.5px;
  color: var(--ink-300);
}

.demo-side__tag {
  padding: 3px 8px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid var(--line);
  font-size: 10px;
  color: var(--ink-500);
}

.demo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.demo-card {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 8px 9px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: 0.15s;
}

.demo-card:hover:not(:disabled) {
  border-color: var(--brand-500);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(24, 53, 43, 0.07);
}

.demo-card:disabled {
  cursor: wait;
  opacity: 0.7;
}

.demo-card.is-current {
  border-color: var(--brand-500);
  background: #fbfdf8;
}

.demo-card__badge {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border-radius: 7px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.demo-card.is-current .demo-card__badge {
  background: var(--lime);
  color: var(--brand-900);
}

.demo-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.demo-card__body strong {
  font-size: 12px;
  color: var(--ink-900);
}

.demo-card__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9.5px;
  color: var(--ink-300);
}

.demo-card__arrow {
  margin-left: auto;
  color: var(--ink-300);
  font-size: 12px;
}

.demo-card__state {
  margin-left: auto;
  font-size: 9.5px;
  font-weight: 600;
  color: var(--brand-700);
  white-space: nowrap;
}

.demo-side__note {
  margin-top: 13px;
  font-size: 10px;
  line-height: 1.6;
  color: var(--ink-300);
}

@media (max-width: 760px) {
  :global(.login-dialog) {
    width: calc(100vw - 24px) !important;
  }

  .login-modal__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .demo-side {
    border-left: none;
    border-top: 1px solid var(--line);
  }

  .form-side {
    padding: 22px 20px 18px;
  }

  .demo-side {
    padding: 20px;
  }

  .login-modal__head {
    padding: 14px 18px;
  }
}
</style>
