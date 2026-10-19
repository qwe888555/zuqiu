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
        <el-icon :size="18"><component :is="icon" /></el-icon>
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
  position: relative;
  padding: 19px 20px 17px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.stat-card::after {
  content: '';
  position: absolute;
  right: -30px;
  top: -36px;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: var(--brand-50);
  opacity: 0.9;
}

.stat-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}

.stat-card__label {
  font-size: 12px;
  letter-spacing: 0.03em;
  color: var(--ink-500);
}

.stat-card__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.stat-card__value {
  position: relative;
  z-index: 1;
  margin-top: 12px;
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
  color: var(--ink-900);
}

.stat-card__foot {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 11px;
  font-size: 11px;
}

.stat-card__trend {
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-weight: 600;
}

.stat-card__hint {
  color: var(--ink-300);
}

.tone-lime .stat-card__icon {
  background: var(--lime-soft);
  color: #4c6a09;
}

.tone-lime::after {
  background: var(--lime-soft);
}

.tone-amber .stat-card__icon {
  background: #fff4e2;
  color: #b26a00;
}

.tone-amber::after {
  background: #fff8ec;
}

.tone-blue .stat-card__icon {
  background: #eaf3ff;
  color: #2563a8;
}

.tone-blue::after {
  background: #f1f7ff;
}
</style>
