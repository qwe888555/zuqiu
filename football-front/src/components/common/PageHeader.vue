<script setup lang="ts">
import { ArrowLeft } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'

withDefaults(
  defineProps<{
    title: string
    description?: string
    showBack?: boolean
  }>(),
  { description: '', showBack: false },
)

const router = useRouter()
</script>

<template>
  <div class="page-header">
    <div class="page-header__main">
      <button v-if="showBack" type="button" class="back-btn" @click="router.back()">
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <div>
        <h1>{{ title }}</h1>
        <p v-if="description">{{ description }}</p>
      </div>
    </div>
    <div class="page-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.page-header__main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.page-header h1 {
  font-size: 22px;
  line-height: 1.3;
  color: var(--ink-900);
}

.page-header p {
  margin-top: 6px;
  max-width: 760px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.page-header__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.back-btn {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  margin-top: 3px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--ink-700);
  cursor: pointer;
}

.back-btn:hover {
  border-color: var(--brand-500);
  color: var(--brand-700);
}

@media (max-width: 640px) {
  .page-header h1 {
    font-size: 20px;
  }
}
</style>
