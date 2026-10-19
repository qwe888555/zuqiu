<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Document, Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicContent } from '../../api/types'

const loading = ref(false)
const keyword = ref('')
const page = ref(1)
const total = ref(0)
const items = ref<PublicContent[]>([])

async function load() {
  loading.value = true
  try {
    const res = await publicApi.contents({
      page: page.value,
      pageSize: 10,
      contentType: 'POLICY',
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

function search() {
  page.value = 1
  load()
}

onMounted(load)
</script>

<template>
  <div class="policy-page">
    <section class="page-hero">
      <div class="container hero-grid">
        <div>
          <span class="eyebrow">POLICIES & ANNOUNCEMENTS</span>
          <h1>政策公告</h1>
          <p>竞赛规程、报名办法与资格审查要求，均以本栏目发布的正式文件为准。</p>
        </div>
        <div class="hero-note">
          <el-icon :size="20"><Document /></el-icon>
          <div>
            <strong>政策问答</strong>
            <span>点击页面右下角悬浮按钮，可从政策原文中检索答案。</span>
          </div>
        </div>
      </div>
    </section>

    <div class="container policy-body">
      <div class="policy-toolbar">
        <div>
          <h2>正式文件</h2>
          <span class="muted">共 {{ total }} 份已发布文件</span>
        </div>
        <el-input
          v-model="keyword"
          placeholder="搜索政策标题"
          :prefix-icon="Search"
          clearable
          class="search"
          @keyup.enter="search"
          @clear="search"
        />
      </div>

      <div v-loading="loading" class="policy-list">
        <router-link
          v-for="(item, index) in items"
          :key="item.id"
          :to="`/policies/${item.id}`"
          class="policy-item"
        >
          <div class="policy-item__mark">
            <span class="num">{{ String(index + 1 + (page - 1) * 10).padStart(2, '0') }}</span>
          </div>
          <div class="policy-item__body">
            <div class="policy-item__meta">
              <span class="policy-item__doc">政策文件</span>
              <span>{{ dayjs(item.publishedAt).format('YYYY-MM-DD') }}</span>
            </div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.summary }}</p>
          </div>
          <span class="policy-item__action">查看全文 →</span>
        </router-link>

        <el-empty v-if="!loading && !items.length" description="暂无政策文件" />
      </div>

      <el-pagination
        v-if="total > 10"
        v-model:current-page="page"
        :page-size="10"
        :total="total"
        layout="prev, pager, next"
        background
        @current-change="load"
      />
    </div>
  </div>
</template>

<style scoped>
.policy-page {
  min-height: 70vh;
  padding-bottom: 60px;
  background: var(--paper);
}

.page-hero {
  padding: 56px 0 44px;
  background: linear-gradient(150deg, #083c2b, #0a5a3e);
  color: #fff;
}

.hero-grid {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 30px;
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
  letter-spacing: 0.03em;
}

.page-hero p {
  max-width: 600px;
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.58);
}

.hero-note {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  max-width: 310px;
  padding: 15px 16px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--lime);
}

.hero-note strong {
  display: block;
  font-size: 12px;
  color: #fff;
}

.hero-note span {
  display: block;
  margin-top: 4px;
  font-size: 10.5px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.5);
}

.policy-body {
  margin-top: 30px;
}

.policy-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.policy-toolbar h2 {
  font-size: 20px;
}

.policy-toolbar .muted {
  font-size: 11px;
}

.search {
  width: 250px;
}

.policy-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.policy-item {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 20px 22px;
  border-radius: 15px;
  background: #fff;
  border: 1px solid var(--line);
  transition: 0.16s;
}

.policy-item:hover {
  border-color: var(--brand-500);
  box-shadow: var(--shadow-card);
}

.policy-item__mark {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 16px;
  font-weight: 700;
}

.policy-item__body {
  min-width: 0;
}

.policy-item__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  color: var(--ink-300);
}

.policy-item__doc {
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--lime-soft);
  color: #5b7310;
  font-weight: 600;
}

.policy-item__body h3 {
  margin-top: 6px;
  font-size: 15.5px;
  line-height: 1.5;
}

.policy-item__body p {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--ink-500);
}

.policy-item__action {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 11.5px;
  color: var(--ink-300);
}

.policy-item:hover .policy-item__action {
  color: var(--brand-700);
}

@media (max-width: 760px) {
  .hero-grid {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-note {
    max-width: 100%;
  }

  .policy-item {
    align-items: flex-start;
    padding: 16px;
  }

  .policy-item__action {
    display: none;
  }

  .search {
    width: 100%;
  }
}
</style>
