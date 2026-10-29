<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Close, Key, Lock, User, WarningFilled } from '@element-plus/icons-vue'
import { authApi } from '../../api'
import { isUnauthenticated, loginErrorMessage, useAuthStore } from '../../stores/auth'
import { canEnroll, canOpenEnrollment, homeForRoles, workspaceLabelForRoles } from '../../utils/roles'
import { useLoginDialog } from '../../composables/useLoginDialog'

const router = useRouter()
const auth = useAuthStore()
const { visible, redirect, mode, registerToken } = useLoginDialog()

const REMEMBER_KEY = 'football.remember-username'
const remembered = localStorage.getItem(REMEMBER_KEY) || ''

const formRef = ref<FormInstance>()
const form = reactive({ username: remembered, password: '' })
const remember = ref(Boolean(remembered))
const errorText = ref('')

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码长度不少于 8 位', trigger: 'blur' },
  ],
}

const registerFormRef = ref<FormInstance>()
const registering = ref(false)
const registerForm = reactive({
  // /register?token=... 直接进入时，弹窗挂载前凭证已经放进 registerToken。
  registrationToken: registerToken.value,
  username: '',
  realName: '',
  idNumber: '',
  phone: '',
  password: '',
  confirmPassword: '',
})

const validateRegisterConfirm = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (value !== registerForm.password) callback(new Error('两次输入的密码不一致'))
  else callback()
}

const validateRegisterPhone = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (!value || /^1\d{10}$/.test(value)) callback()
  else callback(new Error('请输入 11 位手机号'))
}

const registerRules: FormRules = {
  registrationToken: [{ required: true, message: '请填写注册邀请凭证', trigger: 'blur' }],
  username: [
    { required: true, message: '请设置登录账号', trigger: 'blur' },
    { min: 4, max: 32, message: '账号长度为 4-32 位', trigger: 'blur' },
  ],
  realName: [{ required: true, message: '请填写真实姓名', trigger: 'blur' }],
  idNumber: [
    { required: true, message: '请填写身份证号', trigger: 'blur' },
    { pattern: /^\d{17}[\dXx]$/, message: '请输入 18 位身份证号', trigger: 'blur' },
  ],
  phone: [{ validator: validateRegisterPhone, trigger: 'blur' }],
  password: [
    { required: true, message: '请设置密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
  ],
  confirmPassword: [{ required: true, validator: validateRegisterConfirm, trigger: 'blur' }],
}

const hero = computed(() =>
  mode.value === 'register'
    ? {
        eyebrow: 'REGISTER',
        title: '账号注册',
        description: '凭邀请链接开通账号，设置登录名与密码。',
      }
    : {
        eyebrow: 'LOGIN',
        title: '登录',
        description: '使用组委会发放的账号登录，系统将按角色进入对应工作台。',
      },
)

const dialogWidth = computed(() => (mode.value === 'register' ? '600px' : '452px'))

const switching = computed(() => Boolean(auth.token && auth.user))
const workspaceLabel = computed(() => (auth.user ? workspaceLabelForRoles(auth.roles) : ''))

const open = computed({
  get: () => visible.value,
  set: (value: boolean) => {
    visible.value = value
  },
})

watch(visible, (value) => {
  errorText.value = ''
  if (value && mode.value === 'register' && registerToken.value) {
    registerForm.registrationToken = registerToken.value
  }
  if (!value) {
    form.password = ''
    registerForm.password = ''
    registerForm.confirmPassword = ''
    registerForm.registrationToken = ''
  }
})

// 在登录/注册之间切换时，把邀请链接带来的凭证带进表单。
watch(mode, (value) => {
  errorText.value = ''
  if (value === 'register' && registerToken.value) {
    registerForm.registrationToken = registerToken.value
  }
})

// 用户重新输入时收起上一次的失败提示
watch(
  () => [form.username, form.password],
  () => {
    errorText.value = ''
  },
)

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
  errorText.value = ''
  try {
    await auth.login(form.username.trim(), form.password)
    rememberAccount()
    ElMessage.success(`欢迎回来，${auth.displayName}`)
    finish()
  } catch (error) {
    // 账号或密码错误、服务异常统一在这里展示，不暴露后端原始报错
    errorText.value = loginErrorMessage(error)
  }
}

function switchMode(next: 'login' | 'register') {
  errorText.value = ''
  mode.value = next
}

async function submitRegister() {
  if (!registerFormRef.value) return
  const valid = await registerFormRef.value.validate().catch(() => false)
  if (!valid) return
  registering.value = true
  try {
    await authApi.register({
      registrationToken: registerForm.registrationToken.trim(),
      username: registerForm.username.trim(),
      password: registerForm.password,
      realName: registerForm.realName.trim(),
      idNumber: registerForm.idNumber.trim(),
      ...(registerForm.phone.trim() ? { phone: registerForm.phone.trim() } : {}),
    })
    ElMessage.success('注册成功，请使用新账号登录')
    // 注册成功后留在弹窗内切回登录，账号自动填好。
    form.username = registerForm.username.trim()
    form.password = ''
    mode.value = 'login'
  } catch {
    // 拦截器提示
  } finally {
    registering.value = false
  }
}

async function continueCurrent() {
  if (!auth.user) {
    try {
      await auth.fetchMe()
    } catch (error) {
      if (isUnauthenticated(error)) {
        auth.clear()
        return
      }
      // 网络抖动时不销毁登录态，提示后留在弹窗内可再次重试。
      ElMessage.error('登录状态校验失败，请稍后重试')
      return
    }
  }
  finish()
}
</script>

<template>
  <el-dialog
    v-model="open"
    :width="dialogWidth"
    class="login-dialog"
    modal-class="login-overlay"
    :show-close="false"
    append-to-body
    align-center
  >
    <div class="login-card">
      <header class="login-hero">
        <span class="login-hero__pitch" aria-hidden="true" />
        <span class="login-hero__glow" aria-hidden="true" />

        <div class="login-hero__brand">
          <span class="brand-mark">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="18" fill="rgba(255, 255, 255, 0.12)" />
              <path d="M20 10.5l5.4 3.9-2 6.3h-6.8l-2-6.3L20 10.5z" fill="var(--lime)" />
            </svg>
          </span>
          <span class="brand-text">
            <strong>绿茵少年</strong>
            <small>省级中小学足球联赛</small>
          </span>
        </div>

        <button type="button" class="login-hero__close" aria-label="关闭登录窗口" @click="visible = false">
          <el-icon><Close /></el-icon>
        </button>

        <div class="login-hero__title">
          <span class="eyebrow">{{ hero.eyebrow }}</span>
          <h2>{{ hero.title }}</h2>
          <p>{{ hero.description }}</p>
        </div>
      </header>

      <div class="login-body">
        <template v-if="mode === 'login'">
          <div v-if="switching" class="session-banner">
            <span class="session-banner__dot" />
            <div>
              <strong>当前已登录：{{ auth.displayName }}</strong>
              <small>{{ workspaceLabel }} · 可直接继续，或在下方登录其他账号</small>
            </div>
            <button type="button" @click="continueCurrent">继续进入</button>
          </div>

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

            <div v-if="errorText" class="login-alert" role="alert">
              <el-icon><WarningFilled /></el-icon>
              <span>{{ errorText }}</span>
            </div>

            <el-button type="primary" size="large" class="submit-btn" :loading="auth.loading" @click="submit">
              登录
            </el-button>
          </el-form>

          <p class="login-foot">
            <span>账号由组委会统一发放，请勿转借他人使用。</span>
            <button type="button" class="login-foot__link" @click="switchMode('register')">
              收到邀请？完成账号注册
            </button>
          </p>
        </template>

        <template v-else>
          <el-form
            ref="registerFormRef"
            :model="registerForm"
            :rules="registerRules"
            label-position="top"
            size="large"
            hide-required-asterisk
            @submit.prevent="submitRegister"
          >
            <el-form-item label="注册邀请凭证" prop="registrationToken">
              <el-input
                v-model="registerForm.registrationToken"
                :prefix-icon="Key"
                placeholder="粘贴邀请链接中的注册凭证"
                autocomplete="off"
              />
              <p v-if="registerToken" class="invite-hint">
                <el-icon><Key /></el-icon>
                已从邀请链接读取注册凭证
              </p>
            </el-form-item>

            <div class="register-grid">
              <el-form-item label="登录账号" prop="username">
                <el-input
                  v-model="registerForm.username"
                  :prefix-icon="User"
                  placeholder="4-32 位字母或数字"
                  autocomplete="username"
                />
              </el-form-item>
              <el-form-item label="真实姓名" prop="realName">
                <el-input
                  v-model="registerForm.realName"
                  placeholder="与身份证一致"
                  autocomplete="name"
                />
              </el-form-item>
              <el-form-item label="身份证号" prop="idNumber">
                <el-input v-model="registerForm.idNumber" maxlength="18" placeholder="18 位身份证号" />
              </el-form-item>
              <el-form-item label="手机号（选填）" prop="phone">
                <el-input
                  v-model="registerForm.phone"
                  maxlength="11"
                  placeholder="用于接收赛事通知"
                  autocomplete="tel"
                />
              </el-form-item>
              <el-form-item label="登录密码" prop="password">
                <el-input
                  v-model="registerForm.password"
                  :prefix-icon="Lock"
                  type="password"
                  show-password
                  placeholder="至少 8 位"
                  autocomplete="new-password"
                />
              </el-form-item>
              <el-form-item label="确认密码" prop="confirmPassword">
                <el-input
                  v-model="registerForm.confirmPassword"
                  :prefix-icon="Lock"
                  type="password"
                  show-password
                  placeholder="再次输入密码"
                  autocomplete="new-password"
                />
              </el-form-item>
            </div>

            <el-button
              type="primary"
              size="large"
              class="submit-btn"
              :loading="registering"
              @click="submitRegister"
            >
              完成注册
            </el-button>
          </el-form>

          <p class="login-foot">
            <span>邀请链接 24 小时内有效，仅可使用一次；账号仅限本人使用。</span>
            <button type="button" class="login-foot__link" @click="switchMode('login')">
              已有账号？返回登录
            </button>
          </p>
        </template>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
:global(.login-overlay) {
  background: rgba(4, 31, 23, 0.66);
  backdrop-filter: blur(8px);
}

:global(.login-dialog) {
  --el-dialog-padding-primary: 0;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 40px);
  padding: 0;
  border-radius: 18px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 32px 80px rgba(4, 31, 23, 0.38);
}

/* Element Plus 始终渲染空 header，会多出一条白边，这里彻底隐藏 */
:global(.login-dialog .el-dialog__header) {
  display: none;
}

:global(.login-dialog .el-dialog__body) {
  padding: 0;
}

.login-card {
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  background: #fff;
}

/* 顶部品牌区：深绿渐变 + 球场线条，突出赛事属性 */
.login-hero {
  position: relative;
  padding: 22px 28px 26px;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-900) 0%, var(--brand-800) 46%, var(--brand-700) 100%);
  overflow: hidden;
}

.login-hero__pitch {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 82% 8%, rgba(200, 243, 106, 0.18), transparent 56%),
    repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.055) 0 1px, transparent 1px 46px);
  pointer-events: none;
}

.login-hero__glow {
  position: absolute;
  right: -46px;
  bottom: -70px;
  width: 190px;
  height: 190px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: radial-gradient(circle, rgba(26, 167, 122, 0.34), transparent 66%);
  pointer-events: none;
}

.login-hero__brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
}

.brand-mark svg {
  width: 100%;
  height: 100%;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.brand-text strong {
  font-size: 14px;
  letter-spacing: 0.02em;
  color: var(--on-dark-1);
}

.brand-text small {
  font-size: 10px;
  color: var(--on-dark-3);
}

.login-hero__close {
  position: absolute;
  top: 18px;
  right: 20px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--on-dark-2);
  cursor: pointer;
  transition: 0.18s;
}

.login-hero__close:hover {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.login-hero__title {
  position: relative;
  margin-top: 26px;
}

.eyebrow {
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--focus-on-dark);
}

.login-hero__title h2 {
  margin-top: 6px;
  font-size: 25px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #fff;
}

.login-hero__title p {
  margin: 7px 0 0;
  max-width: 330px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--on-dark-3);
}

.login-body {
  padding: 24px 28px 24px;
}

.session-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  padding: 11px 13px;
  border: 1px solid var(--brand-100);
  border-radius: 10px;
  background: var(--brand-50);
}

.session-banner__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--brand-500);
  box-shadow: 0 0 0 3px rgba(26, 167, 122, 0.16);
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

.login-body :deep(.el-form-item) {
  margin-bottom: 15px;
}

.login-body :deep(.el-form-item__label) {
  padding-bottom: 5px;
  font-size: 12px;
  color: var(--ink-700);
}

.login-body :deep(.el-input__wrapper) {
  border-radius: 10px;
  padding: 2px 12px;
}

.register-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
}

.register-grid :deep(.el-form-item) {
  margin-bottom: 14px;
}

.invite-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 6px 0 0;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--brand-700);
}

.invite-hint .el-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.form-extra {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 2px 0 18px;
}

.form-extra span {
  font-size: 10.5px;
  color: var(--ink-300);
  text-align: right;
}

.login-alert {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: -2px 0 14px;
  padding: 9px 12px;
  border: 1px solid rgba(181, 71, 8, 0.22);
  border-radius: 9px;
  background: var(--live-soft);
  color: var(--live);
  font-size: 12px;
  line-height: 1.5;
  animation: login-alert-in 0.18s ease-out;
}

.login-alert .el-icon {
  font-size: 14px;
  flex-shrink: 0;
}

@keyframes login-alert-in {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.submit-btn {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.login-foot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: 16px 0 0;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
  font-size: 10.5px;
  line-height: 1.6;
  text-align: center;
  color: var(--ink-300);
}

.login-foot__link {
  padding: 0;
  border: none;
  background: none;
  font-size: 11px;
  font-weight: 600;
  color: var(--brand-700);
  cursor: pointer;
}

.login-foot__link:hover {
  text-decoration: underline;
}

@media (max-width: 520px) {
  :global(.login-dialog) {
    width: calc(100vw - 24px) !important;
  }

  .login-hero {
    padding: 18px 20px 22px;
  }

  .login-hero__title {
    margin-top: 20px;
  }

  .login-body {
    padding: 20px 20px 20px;
  }

  .form-extra {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .form-extra span {
    text-align: left;
  }

  .register-grid {
    grid-template-columns: 1fr;
  }
}
</style>
