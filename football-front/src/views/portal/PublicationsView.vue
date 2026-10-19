<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'

interface PublicCard {
  publicationId: string
  targetType: string
  displayName: string
  teamName?: string
  cityName?: string
  groupName?: string
  publicPhotoUrl?: string
}

const loading = ref(false)
const items = ref<PublicCard[]>([])
const page = ref(1)
const total = ref(0)
const keyword = ref('')
const targetType = ref('')

const tabs = [
  { label: '全部公示', value: '' },
  { label: '运动员', value: 'ATHLETE' },
  { label: '教练员', value: 'COACH' },
  { label: '参赛球队', value: 'ENROLLMENT' },
]

const typeLabel = (type: string) =>
  type === 'ATHLETE' ? '运动员' : type === 'COACH' ? '教练员' : '参赛球队'

async function load() {
  loading.value = true
  try {
    const res = await publicApi.publications({
      page: page.value,
      pageSize: 12,
      targetType: targetType.value || undefined,
      keyword: keyword.value || undefined,
    })
    items.value = res.items
    total.value = res.total
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

function switchTab(value: string) {
  targetType.value = value
  page.value = 1
  load()
}

function search() {
  page.value = 1
  load()
}

onMounted(load)
</script>

<template>
  <div class="publication-page">
    <section class="page-hero">
      <div class="container">
        <span class="eyebrow">PUBLIC NOTICE</span>
        <h1>公示信息</h1>
        <p>参赛资格、遴选结果与人才名单公示。公示期内如有异议，可通过组委会渠道反馈。</p>
      </div>
    </section>

    <div class="container publication-body">
      <div class="toolbar">
        <div class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            type="button"
            class="tab"
            :class="{ 'is-active': targetType === tab.value }"
            @click="switchTab(tab.value)"
          >
            {{ tab.label }}
          </button>
        </div>
        <el-input
          v-model="keyword"
          placeholder="搜索姓名或球队"
          :prefix-icon="Search"
          clearable
          class="search"
          @keyup.enter="search"
          @clear="search"
        />
      </div>

      <div v-loading="loading" class="card-grid">
        <article v-for="item in items" :key="item.publicationId" class="person-card">
          <div class="person-card__top">
            <span class="person-card__avatar">{{ item.displayName.slice(0, 1) }}</span>
            <span class="person-card__type">{{ typeLabel(item.targetType) }}</span>
          </div>
          <strong class="person-card__name">{{ item.displayName }}</strong>
          <span class="person-card__team">{{ item.teamName || item.cityName || '—' }}</span>
          <div class="person-card__meta">
            <span v-if="item.groupName">{{ item.groupName }}</span>
            <span v-if="item.cityName">{{ item.cityName }}</span>
          </div>
          <span class="person-card__badge">公示中</span>
        </article>

        <el-empty v-if="!loading && !items.length" description="暂无公示信息" class="empty" />
      </div>

      <el-pagination
        v-if="total > 12"
        v-model:current-page="page"
        :page-size="12"
        :total="total"
        layout="prev, pager, next"
        background
        @current-change="load"
      />

      <p class="notice">
        说明：公示信息仅展示经审核确认可公开的内容，身份证号、联系方式等个人信息不会对外展示。
      </p>
    </div>
  </div>
</template>

<style scoped>
.publication-page {
  min-height: 70vh;
  padding-bottom: 60px;
  background: var(--paper);
}

.page-hero {
  padding: 54px 0 44px;
  background:
    radial-gradient(circle at 80% 20%, rgba(200, 241, 105, 0.15), transparent 36%),
    linear-gradient(150deg, #075c40, #054331);
  color: #fff;
}

.eyebrow {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.24em;
  color: var(--lime);
}

.page-hero h1 {
  margin-top: 9px;
  font-size: 36px;
}

.page-hero p {
  max-width: 660px;
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.56);
}

.publication-body {
  margin-top: 28px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.tabs {
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--line);
}

.tab {
  padding: 8px 15px;
  border: none;
  border-radius: 9px;
  background: transparent;
  font-size: 12.5px;
  color: var(--ink-500);
  cursor: pointer;
}

.tab.is-active {
  background: var(--brand-700);
  color: #fff;
  font-weight: 600;
}

.search {
  width: 240px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  min-height: 160px;
}

.person-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 18px;
  border-radius: 15px;
  background: #fff;
  border: 1px solid var(--line);
  overflow: hidden;
  transition: 0.16s;
}

.person-card:hover {
  border-color: var(--brand-500);
  box-shadow: var(--shadow-card);
}

.person-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
}

.person-card__avatar {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--brand-700), var(--brand-500));
  color: #fff;
  font-size: 18px;
  font-weight: 700;
}

.person-card__type {
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9px;
}

.person-card__name {
  margin-top: 13px;
  font-size: 15px;
}

.person-card__team {
  margin-top: 3px;
  font-size: 11px;
  color: var(--ink-500);
}

.person-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 11px;
}

.person-card__meta span {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--paper);
  color: var(--ink-500);
  font-size: 9px;
}

.person-card__badge {
  position: absolute;
  right: 16px;
  bottom: 14px;
  font-size: 9px;
  color: #3f7d22;
}

.person-card__badge::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 4px;
  margin-right: 4px;
  border-radius: 50%;
  background: #67b52e;
  vertical-align: middle;
}

.empty {
  grid-column: 1 / -1;
}

.notice {
  margin-top: 24px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  font-size: 10px;
  color: var(--ink-300);
}

@media (max-width: 1000px) {
  .card-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .search {
    width: 100%;
  }
}

@media (max-width: 440px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
