<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { authApi } from '../../api'

const router = useRouter()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({
  registrationToken: '',
  username: '',
  displayName: '',
  password: '',
  confirmPassword: '',
})

const validateConfirm = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (value !== form.password) callback(new Error('两次输入的密码不一致'))
  else callback()
}

const rules: FormRules = {
  registrationToken: [{ required: true, message: '请填写注册邀请凭证', trigger: 'blur' }],
  username: [
    { required: true, message: '请设置登录账号', trigger: 'blur' },
    { min: 4, max: 32, message: '账号长度为 4-32 位', trigger: 'blur' },
  ],
  displayName: [{ required: true, message: '请填写姓名或单位名称', trigger: 'blur' }],
  password: [
    { required: true, message: '请设置密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
  ],
  confirmPassword: [{ required: true, validator: validateConfirm, trigger: 'blur' }],
}

async function submit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await authApi.register({
      registrationToken: form.registrationToken,
      username: form.username,
      displayName: form.displayName,
      password: form.password,
    })
    ElMessage.success('注册成功，请使用新账号登录')
    router.push('/login')
  } catch {
    // 错误提示由拦截器统一处理
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="register-page">
    <div class="register-card">
      <router-link to="/" class="brand-line">← 返回门户</router-link>
      <header>
        <span class="kicker">仅限邀请注册</span>
        <h1>账号注册</h1>
        <p>本平台账号由组委会统一邀请开通，请使用邀请链接中附带的注册凭证完成注册。</p>
      </header>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large">
        <el-form-item label="注册邀请凭证" prop="registrationToken">
          <el-input v-model="form.registrationToken" placeholder="粘贴邀请链接中的注册凭证" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="登录账号" prop="username">
            <el-input v-model="form.username" placeholder="4-32 位字母或数字" />
          </el-form-item>
          <el-form-item label="姓名 / 单位名称" prop="displayName">
            <el-input v-model="form.displayName" placeholder="用于平台内展示" />
          </el-form-item>
          <el-form-item label="登录密码" prop="password">
            <el-input v-model="form.password" type="password" show-password placeholder="至少 8 位" />
          </el-form-item>
          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input v-model="form.confirmPassword" type="password" show-password placeholder="再次输入密码" />
          </el-form-item>
        </div>
        <el-button type="primary" size="large" class="submit" :loading="submitting" @click="submit">
          完成注册
        </el-button>
      </el-form>

      <p class="foot">
        已有账号？<router-link to="/login">返回登录</router-link>
      </p>
    </div>
  </div>
</template>

<style scoped>
.register-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 40px 20px;
  background: var(--brand-900);
}

.register-card {
  width: min(600px, 100%);
  padding: 34px 36px;
  border-radius: var(--radius-lg);
  background: #fff;
  border-top: 3px solid var(--brand-700);
  box-shadow: 0 10px 30px rgba(3, 32, 22, 0.22);
}

.brand-line {
  font-size: 12px;
  color: var(--ink-500);
}

header {
  margin: 22px 0 26px;
}

.kicker {
  font-size: 11px;
  font-weight: 600;
  color: var(--brand-700);
}

header h1 {
  margin-top: 7px;
  font-size: 28px;
}

header p {
  margin-top: 9px;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-500);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.submit {
  width: 100%;
  height: 44px;
  margin-top: 8px;
  border-radius: var(--radius-sm);
}

.foot {
  margin-top: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--ink-300);
}

.foot a {
  color: var(--brand-700);
  font-weight: 600;
}

@media (max-width: 560px) {
  .register-card {
    padding: 28px 22px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
