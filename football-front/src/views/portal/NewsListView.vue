<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicContent } from '../../api/types'
import { IMG } from '../../mock/data'
import PaginationBar from '../../components/common/PaginationBar.vue'

const loading = ref(false)
const keyword = ref('')
const page = ref(1)
const total = ref(0)
const items = ref<PublicContent[]>([])
const activeType = ref('')

const tabs = [
  { label: '全部资讯', value: '' },
  { label: '赛事动态', value: 'NEWS' },
  { label: '精彩瞬间', value: 'HIGHLIGHT' },
  { label: '最佳阵容', value: 'BEST_LINEUP' },
]

async function load() {
  loading.value = true
  try {
    const res = await publicApi.contents({
      page: page.value,
      pageSize: 9,
      contentType: activeType.value || undefined,
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
  activeType.value = value
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
  <div class="news-page">
    <section class="page-hero">
      <div class="container">
        <span class="page-hero__eyebrow">NEWSROOM</span>
        <h1>新闻资讯</h1>
        <p>赛事动态、球队风采与赛场高光，记录绿茵场上的每一个瞬间。</p>
      </div>
    </section>

    <div class="container news-body">
      <div class="toolbar">
        <div class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            type="button"
            class="tab"
            :class="{ 'is-active': activeType === tab.value }"
            @click="switchTab(tab.value)"
          >
            {{ tab.label }}
          </button>
        </div>
        <el-input
          v-model="keyword"
          placeholder="搜索资讯标题"
          :prefix-icon="Search"
          clearable
          class="search"
          @keyup.enter="search"
          @clear="search"
        />
      </div>

      <div v-loading="loading" class="news-grid">
        <router-link
          v-for="item in items"
          :key="item.id"
          :to="`/news/${item.id}`"
          class="news-card"
        >
          <div class="news-card__cover">
            <img :src="item.publicCoverUrl || IMG.training" :alt="item.title" />
            <span class="news-card__type">
              {{ item.contentType === 'HIGHLIGHT' ? '精彩瞬间' : item.contentType === 'BEST_LINEUP' ? '最佳阵容' : '赛事动态' }}
            </span>
          </div>
          <div class="news-card__body">
            <span class="news-card__date">{{ dayjs(item.publishedAt).format('YYYY.MM.DD') }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.summary }}</p>
          </div>
        </router-link>

        <el-empty v-if="!loading && !items.length" description="暂无资讯内容" class="empty" />
      </div>

      <PaginationBar
        v-model:page="page"
        :page-size="9"
        :total="total"
        layout="prev, pager, next"
        hide-when-single
        @current-change="load"
      />
    </div>
  </div>
</template>

<style scoped>
.news-page {
  background: var(--paper);
  min-height: 70vh;
  padding-bottom: 60px;
}

.page-hero {
  padding: 56px 0 42px;
  background:
    radial-gradient(circle at 82% 20%, rgba(200, 241, 105, 0.18), transparent 35%),
    linear-gradient(150deg, #075c40, #054331);
  color: #fff;
}

.page-hero__eyebrow {
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
  margin-top: 10px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.58);
}

.news-body {
  margin-top: 30px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 22px;
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
  padding: 8px 16px;
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

.news-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  min-height: 200px;
}

.news-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-card);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.news-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-soft);
}

.news-card__cover {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--brand-50);
}

.news-card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s ease;
}

.news-card:hover .news-card__cover img {
  transform: scale(1.05);
}

.news-card__type {
  position: absolute;
  left: 12px;
  top: 12px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(6, 60, 43, 0.82);
  color: var(--lime);
  font-size: 9px;
  letter-spacing: 0.06em;
}

.news-card__body {
  padding: 16px 18px 19px;
}

.news-card__date {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--brand-600);
}

.news-card__body h3 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 7px;
  font-size: 15px;
  line-height: 1.55;
}

.news-card__body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 7px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.empty {
  grid-column: 1 / -1;
}

@media (max-width: 900px) {
  .news-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .news-grid {
    grid-template-columns: 1fr;
  }

  .search {
    width: 100%;
  }
}
</style>
