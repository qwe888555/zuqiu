<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ArrowRight, Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicContent } from '../../api/types'
import { IMG } from '../../mock/data'
import PaginationBar from '../../components/common/PaginationBar.vue'

const loading = ref(false)
const allItems = ref<PublicContent[]>([])
const page = ref(1)
const pageSize = 9
const keyword = ref('')
const activeType = ref('')

const tabs = [
  { label: '全部资讯', value: '' },
  { label: '赛事动态', value: 'NEWS' },
  { label: '精彩瞬间', value: 'HIGHLIGHT' },
  { label: '最佳阵容', value: 'BEST_LINEUP' },
]

const typeLabel = (type: string) =>
  type === 'HIGHLIGHT' ? '精彩瞬间' : type === 'BEST_LINEUP' ? '最佳阵容' : '赛事动态'

// 公开接口没有置顶与排序参数，一次取回后按发布时间倒序；置顶需要后端字段才能可靠展示。
const filteredItems = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return allItems.value
    .filter((item) => {
      if (activeType.value && item.contentType !== activeType.value) return false
      if (kw && !item.title.toLowerCase().includes(kw)) return false
      return true
    })
    .slice()
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
})

const total = computed(() => filteredItems.value.length)
const pagedItems = computed(() =>
  filteredItems.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)
const featured = computed(() => (page.value === 1 ? pagedItems.value[0] : undefined))
const restItems = computed(() =>
  featured.value ? pagedItems.value.slice(1) : pagedItems.value,
)

async function load() {
  loading.value = true
  try {
    const res = await publicApi.contents({ page: 1, pageSize: 100 })
    allItems.value = res.items
  } catch {
    allItems.value = []
  } finally {
    loading.value = false
  }
}

function switchTab(value: string) {
  activeType.value = value
  page.value = 1
}

function search() {
  page.value = 1
}

onMounted(load)
</script>

<template>
  <div class="news-page">
    <section class="page-hero">
      <div class="container hero-grid">
        <div>
          <h1>赛事资讯</h1>
          <p>发布赛事动态、球队风采与赛场图集，记录全省校园足球赛事进展。</p>
        </div>
        <div v-if="!loading" class="hero-stat">
          <strong class="num">{{ allItems.length }}</strong>
          <span>条已发布资讯</span>
        </div>
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
        <div class="toolbar__right">
          <span class="sort-note">按发布时间倒序</span>
          <el-input
            v-model="keyword"
            size="large"
            placeholder="搜索资讯标题"
            :prefix-icon="Search"
            clearable
            class="search"
            @keyup.enter="search"
            @clear="search"
          />
        </div>
      </div>

      <div v-loading="loading" class="news-content">
        <router-link
          v-if="featured"
          :to="`/news/${featured.id}`"
          class="featured-card"
        >
          <div class="featured-card__cover">
            <img :src="featured.publicCoverUrl || IMG.training" :alt="featured.title" />
            <span class="news-type-badge">{{ typeLabel(featured.contentType) }}</span>
          </div>
          <div class="featured-card__body">
            <span class="featured-card__label">最新发布</span>
            <h2>{{ featured.title }}</h2>
            <p>{{ featured.summary }}</p>
            <div class="featured-card__meta">
              <span>{{ dayjs(featured.publishedAt).format('YYYY年MM月DD日') }}</span>
              <span class="dot" />
              <span>第 {{ featured.revision }} 版</span>
              <span class="featured-card__more">阅读全文 <el-icon><ArrowRight /></el-icon></span>
            </div>
          </div>
        </router-link>

        <div class="news-grid">
          <router-link
            v-for="item in restItems"
            :key="item.id"
            :to="`/news/${item.id}`"
            class="news-card"
          >
            <div class="news-card__cover">
              <img :src="item.publicCoverUrl || IMG.training" :alt="item.title" />
              <span class="news-type-badge">{{ typeLabel(item.contentType) }}</span>
            </div>
            <div class="news-card__body">
              <span class="news-card__date">{{ dayjs(item.publishedAt).format('YYYY.MM.DD') }}</span>
              <h3>{{ item.title }}</h3>
              <p>{{ item.summary }}</p>
            </div>
          </router-link>
        </div>

        <el-empty
          v-if="!loading && !filteredItems.length"
          description="暂无符合条件的资讯"
          class="empty"
        />
      </div>

      <PaginationBar
        v-model:page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        hide-when-single
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
  padding: 28px 0 26px;
  background: var(--brand-900);
  color: #fff;
}

.hero-grid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.page-hero h1 {
  font-size: 27px;
  font-weight: 600;
}

.page-hero p {
  margin-top: 7px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
}

.hero-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex-shrink: 0;
}

.hero-stat strong {
  font-size: 26px;
  line-height: 1;
  color: var(--lime);
}

.hero-stat span {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.62);
}

.news-body {
  margin-top: 22px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line);
}

.tab {
  min-height: 40px;
  padding: 8px 14px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-size: 14px;
  color: var(--ink-500);
  cursor: pointer;
}

.tab:hover {
  background: var(--paper);
}

.tab.is-active {
  background: var(--brand-700);
  color: #fff;
  font-weight: 600;
}

.toolbar__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sort-note {
  font-size: 12.5px;
  color: var(--ink-500);
  white-space: nowrap;
}

.search {
  width: 240px;
}

.news-content {
  min-height: 200px;
}

.featured-card {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 0;
  margin-bottom: 20px;
  overflow: hidden;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--line);
  transition: border-color 0.18s ease;
}

.featured-card:hover {
  border-color: var(--brand-500);
}

.featured-card__cover {
  position: relative;
  min-height: 280px;
  overflow: hidden;
  background: var(--brand-50);
}

.featured-card__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s ease;
}

.featured-card:hover .featured-card__cover img {
  transform: scale(1.03);
}

.featured-card__body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 30px 34px;
}

.featured-card__label {
  align-self: flex-start;
  padding: 3px 8px;
  border-radius: 3px;
  background: var(--lime-soft);
  color: #4f6808;
  font-size: 12px;
  font-weight: 600;
}

.featured-card__body h2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 12px;
  font-size: clamp(23px, 2.2vw, 29px);
  line-height: 1.4;
  color: var(--ink-900);
}

.featured-card__body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 12px;
  font-size: 15px;
  line-height: 1.8;
  color: var(--ink-500);
}

.featured-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
  font-size: 13px;
  color: var(--ink-500);
}

.featured-card__meta .dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
}

.featured-card__more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-weight: 600;
  color: var(--brand-700);
}

.news-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.news-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line);
  transition: border-color 0.18s ease;
}

.news-card:hover {
  border-color: var(--brand-500);
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

.news-type-badge {
  position: absolute;
  left: 12px;
  top: 12px;
  padding: 3px 8px;
  border-radius: 3px;
  background: rgba(6, 60, 43, 0.82);
  color: #fff;
  font-size: 12px;
}

.news-card__body {
  padding: 16px 18px 19px;
}

.news-card__date {
  font-size: 13px;
  color: var(--ink-500);
}

.news-card__body h3 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 7px;
  font-size: 19px;
  line-height: 1.5;
  color: var(--ink-900);
}

.news-card__body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 7px;
  font-size: 14.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.empty {
  grid-column: 1 / -1;
}

@media (max-width: 900px) {
  .featured-card {
    grid-template-columns: 1fr;
  }

  .featured-card__cover {
    min-height: 230px;
    aspect-ratio: 16 / 9;
  }

  .featured-card__body {
    padding: 22px;
  }

  .news-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .page-hero {
    padding: 22px 0 20px;
  }

  .page-hero h1 {
    font-size: 23px;
  }

  .hero-grid {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }

  .toolbar__right,
  .search {
    width: 100%;
  }

  .news-grid {
    grid-template-columns: 1fr;
  }

  .featured-card__body h2 {
    font-size: 21px;
  }
}
</style>
