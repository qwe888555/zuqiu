<script setup lang="ts">
/**
 * 统一分页条。列表页只声明分页状态与加载方法，
 * 页码/每页条数变化后由组件回写 v-model 并抛出事件。
 */
withDefaults(
  defineProps<{
    page: number
    pageSize: number
    total: number
    pageSizes?: number[]
    layout?: string
    small?: boolean
    hideWhenSingle?: boolean
  }>(),
  {
    pageSizes: () => [10, 20, 50],
    layout: 'total, sizes, prev, pager, next',
    small: false,
    hideWhenSingle: false,
  },
)

const emit = defineEmits<{
  'update:page': [value: number]
  'update:pageSize': [value: number]
  'current-change': [value: number]
  'size-change': [value: number]
}>()

function handleCurrent(value: number) {
  emit('update:page', value)
  emit('current-change', value)
}

function handleSize(value: number) {
  emit('update:pageSize', value)
  emit('size-change', value)
}
</script>

<template>
  <el-pagination
    v-if="!hideWhenSingle || total > pageSize"
    background
    :small="small"
    :current-page="page"
    :page-size="pageSize"
    :page-sizes="pageSizes"
    :total="total"
    :layout="layout"
    @current-change="handleCurrent"
    @size-change="handleSize"
  />
</template>
