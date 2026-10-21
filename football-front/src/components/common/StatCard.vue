<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    icon?: Component
    tone?: 'green' | 'lime' | 'amber' | 'blue'
    trend?: string
  }>(),
  { hint: '', icon: undefined, tone: 'green', trend: '' },
)
</script>

<template>
  <div class="stat-card" :class="`tone-${tone}`">
    <div class="stat-card__top">
      <span class="stat-card__label">{{ label }}</span>
      <span v-if="icon" class="stat-card__icon">
        <el-icon :size="16"><component :is="icon" /></el-icon>
      </span>
    </div>
    <div class="stat-card__value num">{{ value }}</div>
    <div class="stat-card__foot">
      <span v-if="trend" class="stat-card__trend">{{ trend }}</span>
      <span v-if="hint" class="stat-card__hint">{{ hint }}</span>
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  padding: 18px 20px 16px;
  border-radius: var(--radius-md);
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-card);
}

.stat-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stat-card__label {
  font-size: 12px;
  color: var(--ink-500);
}

.stat-card__icon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  color: var(--ink-300);
}

.stat-card__value {
  margin-top: 10px;
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  color: var(--ink-900);
}

.stat-card__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 11px;
}

.stat-card__trend {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-weight: 600;
}

.stat-card__hint {
  color: var(--ink-300);
}

.tone-lime .stat-card__icon {
  color: #6d8a17;
}

.tone-amber .stat-card__icon {
  color: #b26a00;
}

.tone-blue .stat-card__icon {
  color: #2563a8;
}
</style>
