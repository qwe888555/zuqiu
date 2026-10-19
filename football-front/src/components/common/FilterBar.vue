<script setup lang="ts">
/**
 * 列表页筛选栏。默认插槽放筛选控件，
 * summary 统一渲染右侧的结果统计，避免各页面重复布局。
 */
defineProps<{ summary?: string }>()
</script>

<template>
  <div class="filter-bar">
    <slot />
    <template v-if="summary">
      <span class="filter-bar__spacer" />
      <span class="muted">{{ summary }}</span>
    </template>
  </div>
</template>
