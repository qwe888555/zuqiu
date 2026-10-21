<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, HomeFilled, Lock, Right } from '@element-plus/icons-vue'
import { useAuthStore } from '../../stores/auth'
import { usePermission } from '../../composables/usePermission'
import { ROLE_MENU_LABELS } from '../../config/menus'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { permissionCount, permissionTotal } = usePermission()

const requestedPath = computed(() => String(route.query.from || '未知页面'))
const roleLabels = computed(() => auth.roles.map((role) => ROLE_MENU_LABELS[role]).join(' / ') || '未识别角色')
const entries = computed(() =>
  auth.sections
    .flatMap((section) => section.items)
    .filter((item) => item.key !== 'dashboard')
    .slice(0, 6),
)
</script>

<template>
  <div class="forbidden">
    <section class="forbidden-card">
      <div class="lock-art" aria-hidden="true">
        <el-icon :size="26"><Lock /></el-icon>
      </div>

      <span class="eyebrow">访问受限</span>
      <h1>当前角色无权访问该页面</h1>
      <p class="lede">
        系统已按角色拦截本次访问。如需处理该业务，请联系管理员调整账号角色，
        或切换到具备对应权限的演示账号。
      </p>

      <div class="context-grid">
        <div>
          <span>请求地址</span>
          <strong class="mono">{{ requestedPath }}</strong>
        </div>
        <div>
          <span>当前角色</span>
          <strong>{{ roleLabels }}</strong>
        </div>
        <div>
          <span>可用权限点</span>
          <strong>{{ permissionCount }} / {{ permissionTotal }}</strong>
        </div>
        <div>
          <span>所属机构</span>
          <strong>{{ auth.user?.orgName || '—' }}</strong>
        </div>
      </div>

      <div v-if="entries.length" class="quick-links">
        <span class="quick-links__label">可访问的功能</span>
        <button
          v-for="item in entries"
          :key="item.key"
          type="button"
          class="quick-link"
          @click="router.push(item.path)"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          {{ item.title }}
          <el-icon class="quick-link__arrow" :size="11"><Right /></el-icon>
        </button>
      </div>

      <div class="actions">
        <el-button :icon="HomeFilled" @click="router.push('/')">返回门户</el-button>
        <el-button type="primary" :icon="ArrowLeft" @click="router.push('/console/dashboard')">
          回到工作台
        </el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.forbidden {
  display: grid;
  place-items: center;
  min-height: calc(100vh - 160px);
}

.forbidden-card {
  width: min(720px, 100%);
  padding: 36px 40px 30px;
  border: 1px solid var(--line);
  border-top: 3px solid var(--brand-700);
  border-radius: var(--radius-lg);
  background: #fff;
  box-shadow: var(--shadow-card);
}

.lock-art {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 18px;
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.eyebrow {
  font-size: 11px;
  font-weight: 600;
  color: var(--brand-700);
}

h1 {
  margin-top: 8px;
  font-size: clamp(22px, 3vw, 28px);
  letter-spacing: -0.01em;
}

.lede {
  max-width: 560px;
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--ink-500);
}

.context-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 24px;
}

.context-grid > div {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--paper);
}

.context-grid span {
  display: block;
  font-size: 9.5px;
  color: var(--ink-300);
}

.context-grid strong {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-700);
  word-break: break-all;
}

.mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px !important;
}

.quick-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 22px;
}

.quick-links__label {
  width: 100%;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-500);
}

.quick-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: #fff;
  color: var(--ink-700);
  font-size: 11.5px;
  cursor: pointer;
  transition: 0.15s;
}

.quick-link:hover {
  border-color: var(--brand-500);
  color: var(--brand-700);
  background: var(--brand-50);
}

.quick-link__arrow {
  color: var(--ink-300);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px dashed var(--line);
}

@media (max-width: 640px) {
  .forbidden-card {
    padding: 30px 22px 26px;
  }

  .context-grid {
    grid-template-columns: 1fr;
  }

  .actions {
    flex-direction: column-reverse;
  }
}
</style>
