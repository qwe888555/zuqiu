<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ArrowRight } from '@element-plus/icons-vue'
import { useAuthStore } from '../../stores/auth'
import { DEMO_ACCOUNTS, IMG } from '../../mock/data'
import { ROLE_LABELS } from '../../config/labels'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const form = reactive({ username: 'team', password: '12345678' })

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const demos = DEMO_ACCOUNTS

async function submit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    await auth.login(form.username, form.password)
    ElMessage.success(`欢迎回来，${auth.displayName}`)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/console/dashboard'
    router.push(redirect)
  } catch {
    // 错误提示由 HTTP 拦截器统一处理
  }
}

function useDemo(username: string) {
  form.username = username
  form.password = '12345678'
}
</script>

<template>
  <div class="login-page">
    <section class="login-hero">
      <img :src="IMG.stadium" alt="足球场" class="login-hero__bg" />
      <div class="login-hero__overlay" />
      <div class="login-hero__content">
        <router-link to="/" class="hero-brand">
          <span class="hero-brand__mark">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="18" fill="var(--lime)" />
              <path d="M20 10.5l5.4 3.9-2 6.3h-6.8l-2-6.3L20 10.5z" fill="var(--brand-900)" />
            </svg>
          </span>
          <span>
            <strong>绿茵少年</strong>
            <small>省级中小学足球联赛</small>
          </span>
        </router-link>

        <div class="hero-copy">
          <span class="hero-eyebrow">2026 赛季 · 省级青少年足球联赛</span>
          <h1>全省校园足球<br /><em>赛事管理平台</em></h1>
          <p>
            连接学校、高校、市州与赛事组委会，覆盖报名审核、赛程编排、比赛记录、人才遴选与公示发布。
          </p>
        </div>

        <div class="hero-stats">
          <div>
            <strong class="num">128</strong>
            <span>参赛球队</span>
          </div>
          <div>
            <strong class="num">2,436</strong>
            <span>注册球员</span>
          </div>
          <div>
            <strong class="num">21</strong>
            <span>覆盖市州</span>
          </div>
          <div>
            <strong class="num">186</strong>
            <span>已完赛场次</span>
          </div>
        </div>

        <p class="hero-note">演示环境 · 所有数据均为模拟数据</p>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-box">
        <router-link to="/" class="panel-brand">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="var(--brand-700)" />
            <path d="M20 10.5l5.4 3.9-2 6.3h-6.8l-2-6.3L20 10.5z" fill="var(--lime)" />
          </svg>
          <span>
            <strong>绿茵少年</strong>
            <small>省级中小学足球联赛</small>
          </span>
        </router-link>

        <router-link to="/" class="back-home">← 返回门户首页</router-link>

        <header class="login-head">
          <span class="login-kicker">赛事组委会工作台</span>
          <h2>账号登录</h2>
          <p>使用组委会分配的账号登录，系统将按角色进入对应工作台。</p>
        </header>

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
              placeholder="请输入账号或用户名"
              autocomplete="username"
            />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              placeholder="请输入登录密码"
              autocomplete="current-password"
              @keyup.enter="submit"
            />
          </el-form-item>
          <el-button type="primary" size="large" class="submit-btn" :loading="auth.loading" @click="submit">
            登录
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </el-form>

        <div class="demo-block">
          <div class="demo-block__head">
            <span>演示账号</span>
            <small>点击填充 · 统一密码 12345678</small>
          </div>
          <div class="demo-grid">
            <button
              v-for="demo in demos"
              :key="demo.username"
              type="button"
              class="demo-item"
              :class="{ 'is-selected': form.username === demo.username }"
              @click="useDemo(demo.username)"
            >
              <strong>{{ ROLE_LABELS[demo.role] || demo.role }}</strong>
              <small>{{ demo.username }}</small>
            </button>
          </div>
        </div>

        <p class="login-foot">
          首次使用？请使用组委会发放的注册邀请链接完成账号注册。
          <router-link to="/register">前往注册</router-link>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(440px, 0.92fr);
  min-height: 100vh;
  background: #fff;
}

.login-hero {
  position: relative;
  overflow: hidden;
  background: var(--brand-900);
  color: #fff;
}

.login-hero__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(0.8);
}

.login-hero__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(4, 37, 26, 0.42) 0%,
    rgba(4, 37, 26, 0.76) 62%,
    rgba(4, 37, 26, 0.96) 100%
  );
}

.login-hero__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: 44px 58px;
}

.hero-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  width: fit-content;
}

.hero-brand__mark svg {
  width: 38px;
  height: 38px;
}

.hero-brand span:last-child {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.hero-brand strong {
  font-size: 17px;
}

.hero-brand small {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.55);
}

.hero-copy {
  margin: auto 0;
  padding: 40px 0;
}

.hero-eyebrow {
  font-size: 11px;
  font-weight: 500;
  color: var(--lime);
}

.hero-copy h1 {
  margin-top: 18px;
  font-size: clamp(36px, 4.3vw, 56px);
  font-weight: 700;
  line-height: 1.18;
}

.hero-copy h1 em {
  font-style: normal;
  color: var(--lime);
}

.hero-copy p {
  max-width: 460px;
  margin-top: 22px;
  font-size: 13.5px;
  line-height: 1.9;
  color: rgba(255, 255, 255, 0.66);
}

.hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px 44px;
  padding: 22px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.hero-stats div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hero-stats strong {
  font-size: 24px;
  color: var(--lime);
}

.hero-stats span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.46);
}

.hero-note {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
}

.login-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 44px 40px;
  background: #fff;
}

.login-box {
  width: min(420px, 100%);
}

.panel-brand {
  display: none;
}

.back-home {
  display: inline-block;
  margin-bottom: 30px;
  font-size: 12px;
  color: var(--ink-500);
}

.back-home:hover {
  color: var(--brand-700);
}

.login-head {
  margin: 0 0 26px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line);
}

.login-kicker {
  font-size: 11px;
  font-weight: 600;
  color: var(--brand-700);
}

.login-head h2 {
  margin-top: 8px;
  font-size: 26px;
}

.login-head p {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.login-box :deep(.el-form-item) {
  margin-bottom: 18px;
}

.login-box :deep(.el-form-item__label) {
  padding-bottom: 6px;
  font-size: 12px;
}

.submit-btn {
  width: 100%;
  height: 44px;
  margin-top: 4px;
  border-radius: var(--radius-sm);
  font-size: 14px;
}

.demo-block {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}

.demo-block__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-700);
}

.demo-block__head small {
  font-weight: 400;
  font-size: 10px;
  color: var(--ink-300);
}

.demo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.demo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.demo-item strong {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ink-700);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.demo-item small {
  flex-shrink: 0;
  font-family: var(--font-display);
  font-size: 10px;
  color: var(--ink-300);
}

.demo-item:hover {
  border-color: var(--brand-500);
}

.demo-item.is-selected {
  border-color: var(--brand-500);
  background: var(--brand-50);
  box-shadow: inset 2px 0 0 var(--brand-700);
}

.demo-item.is-selected strong {
  color: var(--brand-800);
  font-weight: 600;
}

.login-foot {
  margin-top: 22px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-300);
  text-align: center;
}

.login-foot a {
  color: var(--brand-700);
  font-weight: 600;
}

@media (max-width: 1000px) {
  .login-page {
    grid-template-columns: minmax(0, 1fr);
  }

  .login-hero {
    display: none;
  }

  .login-panel {
    min-width: 0;
    padding: 34px 22px;
  }

  .login-box {
    width: 100%;
    max-width: 420px;
  }

  .panel-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    width: fit-content;
    margin-bottom: 26px;
  }

  .panel-brand svg {
    width: 32px;
    height: 32px;
  }

  .panel-brand > span {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .panel-brand strong {
    font-size: 14px;
    color: var(--ink-900);
  }

  .panel-brand small {
    font-size: 10px;
    color: var(--ink-500);
  }

  .back-home {
    margin-bottom: 22px;
  }
}

@media (max-width: 480px) {
  .demo-grid {
    grid-template-columns: 1fr;
  }

  .login-head h2 {
    font-size: 23px;
  }
}
</style>
