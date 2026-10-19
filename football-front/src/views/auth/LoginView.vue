<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ArrowRight, Lock, User } from '@element-plus/icons-vue'
import { useAuthStore } from '../../stores/auth'
import { DEMO_ACCOUNTS, IMG, ROLE_LABELS } from '../../mock/data'

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
              <circle cx="20" cy="20" r="18" fill="#c8f169" />
              <path d="M20 10.5l5.4 3.9-2 6.3h-6.8l-2-6.3L20 10.5z" fill="#064a35" />
            </svg>
          </span>
          <span>
            <strong>绿茵少年</strong>
            <small>省级中小学足球联赛</small>
          </span>
        </router-link>

        <div class="hero-copy">
          <span class="hero-eyebrow">2026 SEASON · PROVINCIAL YOUTH FOOTBALL</span>
          <h1>让每一场比赛<br /><em>都有迹可循</em></h1>
          <p>
            从报名送审到比赛记录、从人才遴选到公示发布，一个平台连接学校、球队、裁判与管理机构。
          </p>
        </div>

        <div class="hero-stats">
          <div>
            <strong class="num">120+</strong>
            <span>参赛学校</span>
          </div>
          <div>
            <strong class="num">2,400+</strong>
            <span>注册运动员</span>
          </div>
          <div>
            <strong class="num">8</strong>
            <span>业务角色</span>
          </div>
        </div>

        <p class="hero-note">演示环境 · 所有数据均为模拟数据</p>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-box">
        <router-link to="/" class="back-home">← 返回门户首页</router-link>

        <header class="login-head">
          <span class="login-kicker">CONSOLE ACCESS</span>
          <h2>登录管理端</h2>
          <p>使用赛事组委会分配的账号进入对应角色工作台。</p>
        </header>

        <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent="submit">
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="账号 / 用户名" :prefix-icon="User" />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              placeholder="登录密码"
              :prefix-icon="Lock"
              @keyup.enter="submit"
            />
          </el-form-item>
          <el-button type="primary" size="large" class="submit-btn" :loading="auth.loading" @click="submit">
            登录工作台
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </el-form>

        <div class="demo-block">
          <div class="demo-block__head">
            <span>演示账号 · 点击填充</span>
            <small>统一密码 12345678</small>
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
              <span class="demo-item__avatar">{{ demo.displayName.slice(0, 1) }}</span>
              <span class="demo-item__meta">
                <strong>{{ ROLE_LABELS[demo.role] || demo.role }}</strong>
                <small>{{ demo.username }}</small>
              </span>
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
  background:
    linear-gradient(180deg, rgba(4, 37, 26, 0.42) 0%, rgba(4, 37, 26, 0.76) 62%, rgba(4, 37, 26, 0.96) 100%),
    radial-gradient(circle at 70% 18%, rgba(200, 241, 105, 0.18), transparent 42%);
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
  letter-spacing: 0.1em;
}

.hero-brand small {
  font-size: 9px;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.5);
}

.hero-copy {
  margin: auto 0;
  padding: 40px 0;
}

.hero-eyebrow {
  font-size: 9.5px;
  letter-spacing: 0.28em;
  color: var(--lime);
}

.hero-copy h1 {
  margin-top: 18px;
  font-size: clamp(38px, 4.6vw, 62px);
  font-weight: 800;
  line-height: 1.14;
  letter-spacing: 0.01em;
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
  gap: 48px;
  padding: 22px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.hero-stats div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hero-stats strong {
  font-size: 26px;
  color: var(--lime);
  letter-spacing: 0.02em;
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
  background:
    radial-gradient(circle at 92% 4%, var(--brand-50), transparent 36%),
    #fff;
}

.login-box {
  width: min(440px, 100%);
}

.back-home {
  font-size: 12px;
  color: var(--ink-500);
}

.back-home:hover {
  color: var(--brand-700);
}

.login-head {
  margin: 28px 0 26px;
}

.login-kicker {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.24em;
  color: var(--brand-600);
}

.login-head h2 {
  margin-top: 8px;
  font-size: 30px;
  letter-spacing: 0.02em;
}

.login-head p {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--ink-500);
}

.submit-btn {
  width: 100%;
  height: 48px;
  margin-top: 6px;
  border-radius: 12px;
  font-size: 14px;
  letter-spacing: 0.06em;
}

.demo-block {
  margin-top: 30px;
  padding-top: 22px;
  border-top: 1px dashed var(--line);
}

.demo-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-700);
}

.demo-block__head small {
  font-weight: 400;
  color: var(--ink-300);
}

.demo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.demo-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: 0.15s;
}

.demo-item:hover {
  border-color: var(--brand-500);
  background: var(--brand-50);
}

.demo-item.is-selected {
  border-color: var(--brand-700);
  background: var(--brand-50);
  box-shadow: 0 0 0 2px var(--brand-100);
}

.demo-item__avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--brand-700), var(--brand-500));
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.demo-item__meta {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  overflow: hidden;
}

.demo-item__meta strong {
  font-size: 11.5px;
  color: var(--ink-900);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.demo-item__meta small {
  font-size: 10px;
  color: var(--ink-300);
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
    grid-template-columns: 1fr;
  }

  .login-hero {
    display: none;
  }

  .login-panel {
    padding: 34px 22px;
  }
}
</style>
