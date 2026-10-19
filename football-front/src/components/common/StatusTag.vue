<script setup lang="ts">
import { computed } from 'vue'

type TagType = 'success' | 'warning' | 'danger' | 'info' | 'primary'

const props = withDefaults(
  defineProps<{
    status?: string | boolean
    kind?: 'enrollment' | 'match' | 'event' | 'content' | 'review' | 'publication' | 'identity' | 'generic'
    size?: 'small' | 'default' | 'large'
  }>(),
  { status: '', kind: 'generic', size: 'small' },
)

const enrollmentMap: Record<string, [string, TagType]> = {
  DRAFT: ['草稿', 'info'],
  PENDING_CITY_REVIEW: ['待市州审核', 'warning'],
  PENDING_PROVINCE_REVIEW: ['待省级终审', 'warning'],
  APPROVED: ['已通过', 'success'],
  REJECTED: ['已驳回', 'danger'],
  WITHDRAWN: ['已撤回', 'info'],
}

const matchMap: Record<string, [string, TagType]> = {
  SCHEDULED: ['未开赛', 'info'],
  LIVE: ['进行中', 'danger'],
  FINISHED: ['已结束', 'success'],
  CANCELLED: ['已取消', 'info'],
}

const eventMap: Record<string, [string, TagType]> = {
  DRAFT: ['草稿', 'info'],
  REGISTRATION_OPEN: ['报名中', 'success'],
  REGISTRATION_CLOSED: ['报名截止', 'warning'],
  RUNNING: ['进行中', 'danger'],
  FINISHED: ['已结束', 'info'],
}

const contentMap: Record<string, [string, TagType]> = {
  DRAFT: ['草稿', 'info'],
  PUBLISHED: ['已发布', 'success'],
  OFFLINE: ['已下线', 'info'],
}

const reviewMap: Record<string, [string, TagType]> = {
  PENDING: ['待审核', 'warning'],
  NOT_REVIEWED: ['待复核', 'warning'],
  APPROVED: ['已通过', 'success'],
  CONFIRMED: ['已确认', 'success'],
  VERIFIED: ['已核验', 'success'],
  REJECTED: ['已驳回', 'danger'],
  UNVERIFIED: ['未核验', 'info'],
  MATCH: ['比对一致', 'success'],
  MISMATCH: ['比对不一致', 'danger'],
  UNAVAILABLE: ['服务不可用', 'info'],
  NOT_RUN: ['未比对', 'info'],
}

const label = computed(() => {
  if (props.kind === 'publication') {
    return props.status === true || props.status === 'ACTIVE'
      ? ['公示中', 'success']
      : ['已撤销', 'info']
  }
  const value = String(props.status ?? '')
  if (props.kind === 'enrollment') return enrollmentMap[value] || [value || '未知', 'info']
  if (props.kind === 'match') return matchMap[value] || [value || '未知', 'info']
  if (props.kind === 'event') return eventMap[value] || [value || '未知', 'info']
  if (props.kind === 'content') return contentMap[value] || [value || '未知', 'info']
  if (props.kind === 'review' || props.kind === 'identity') return reviewMap[value] || [value || '未知', 'info']
  return [value || '未知', 'info']
})
</script>

<template>
  <el-tag :type="label[1]" :size="size" effect="light" round class="status-tag">
    {{ label[0] }}
  </el-tag>
</template>

<style scoped>
.status-tag {
  font-weight: 600;
  letter-spacing: 0.02em;
}
</style>
