<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ArrowRight, Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicContent } from '../../api/types'
import { IMG } from '../../config/images'
import PaginationBar from '../../components/common/PaginationBar.vue'

const loading = ref(false)
const allItems = ref<PublicContent[]>([])
const page = ref(1)
const pageSize = 10
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
        <div class="hero-copy">
          <span class="hero-kicker">MATCH REPORT · 赛事资讯</span>
          <h1>赛场内外</h1>
          <p>赛事动态、球队故事与赛场图集。记录每一个比赛日，也记录绿茵场外的成长。</p>
        </div>
        <div v-if="!loading" class="hero-stat">
          <strong class="num">{{ allItems.length }}</strong>
          <span>篇已发布内容</span>
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
          <span class="sort-note">共 {{ total }} 条 · 按发布时间倒序</span>
          <el-input
            v-model="keyword"
            size="large"
            placeholder="搜索资讯标题"
            :prefix-icon="Search"
            clearable
            class="search"
            @keyup.enter="search"
            @clear="search"
            @input="page = 1"
          />
        </div>
      </div>

      <div v-loading="loading" class="news-content">
        <router-link
          v-if="featured"
          :to="`/news/${featured.id}`"
          class="featured-card"
        >
          <img :src="featured.publicCoverUrl || IMG.training" :alt="featured.title" />
          <span class="featured-card__shade" />
          <div class="featured-card__top">
            <span class="featured-card__label">最新发布</span>
            <span class="news-type-badge">{{ typeLabel(featured.contentType) }}</span>
          </div>
          <div class="featured-card__body">
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
              <span class="news-type-badge news-type-badge--light">{{ typeLabel(item.contentType) }}</span>
            </div>
            <div class="news-card__body">
              <div class="news-card__meta">
                <span>{{ dayjs(item.publishedAt).format('YYYY.MM.DD') }}</span>
                <span>第 {{ item.revision }} 版</span>
              </div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.summary }}</p>
              <span class="news-card__more">
                阅读全文
                <el-icon><ArrowRight /></el-icon>
              </span>
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
  min-height: 70vh;
  padding-bottom: 62px;
  background: var(--paper);
}

.page-hero {
  padding: 20px 0 34px;
  background: var(--brand-900);
  color: #fff;
}

.hero-grid {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 30px;
}

.hero-copy {
  min-width: 0;
}

.hero-kicker {
  display: block;
  margin-bottom: 9px;
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--lime);
}

.page-hero h1 {
  font-size: clamp(30px, 3.4vw, 42px);
  font-weight: 700;
  line-height: 1.2;
}

.page-hero p {
  max-width: 660px;
  margin-top: 11px;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.6);
}

.hero-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  padding-bottom: 4px;
}

.hero-stat strong {
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
  color: var(--lime);
}

.hero-stat span {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.48);
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
  gap: 3px;
  padding: 3px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line);
}

.tab {
  min-height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-size: 13px;
  color: var(--ink-500);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.tab:hover {
  background: var(--paper);
  color: var(--ink-900);
}

.tab.is-active {
  background: var(--brand-900);
  color: #fff;
  font-weight: 600;
}

.toolbar__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sort-note {
  font-size: 11.5px;
  color: var(--ink-300);
  white-space: nowrap;
}

.search {
  width: 240px;
}

.news-content {
  min-height: 200px;
}

.featured-card {
  position: relative;
  display: block;
  height: clamp(340px, 34vw, 430px);
  margin-bottom: 18px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--brand-900);
}

.featured-card > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.featured-card:hover > img {
  transform: scale(1.025);
}

.featured-card__shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(0deg, rgba(4, 33, 24, 0.94) 0%, rgba(4, 33, 24, 0.48) 46%, rgba(4, 33, 24, 0.06) 76%),
    linear-gradient(90deg, rgba(4, 33, 24, 0.38), transparent 62%);
}

.featured-card__top {
  position: absolute;
  left: 30px;
  right: 30px;
  top: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.featured-card__label {
  padding: 4px 9px;
  border-radius: 4px;
  background: var(--lime);
  color: var(--brand-900);
  font-size: 10.5px;
  font-weight: 700;
}

.featured-card__body {
  position: absolute;
  left: 30px;
  right: 30px;
  bottom: 28px;
  color: #fff;
}

.featured-card__body h2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 880px;
  font-size: clamp(24px, 2.7vw, 36px);
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.01em;
}

.featured-card__body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 760px;
  margin-top: 10px;
  font-size: 13.5px;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.66);
}

.featured-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.55);
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
  margin-left: 8px;
  padding-left: 14px;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  font-weight: 600;
  color: var(--lime);
}

.news-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.news-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 9px;
  background: #fff;
  border: 1px solid var(--line);
  transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.news-card:hover {
  border-color: var(--brand-500);
  box-shadow: 0 8px 24px rgba(24, 53, 43, 0.06);
  transform: translateY(-2px);
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
  transform: scale(1.04);
}

.featured-card__top .news-type-badge {
  position: static;
}

.news-type-badge {
  position: absolute;
  left: 12px;
  top: 12px;
  padding: 3px 8px;
  border-radius: 3px;
  background: rgba(6, 60, 43, 0.84);
  color: #fff;
  font-size: 10.5px;
}

.news-type-badge--light {
  background: rgba(255, 255, 255, 0.9);
  color: var(--brand-800);
  font-weight: 600;
}

.news-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 14px 16px 16px;
}

.news-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.news-card__body h3 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 7px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--ink-900);
}

.news-card__body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 6px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.news-card__more {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: auto;
  padding-top: 13px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-700);
}

.news-card__more .el-icon {
  transition: transform 0.16s;
}

.news-card:hover .news-card__more .el-icon {
  transform: translateX(3px);
}

.empty {
  grid-column: 1 / -1;
}

@media (max-width: 900px) {
  .featured-card {
    height: 340px;
  }

  .news-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .hero-grid {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
  }

  .hero-stat {
    flex-direction: row;
    align-items: baseline;
    gap: 7px;
    padding-bottom: 0;
  }

  .hero-stat strong {
    font-size: 25px;
  }

  .toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .tabs {
    width: fit-content;
    max-width: 100%;
    overflow-x: auto;
  }

  .toolbar__right {
    width: 100%;
  }

  .sort-note {
    display: none;
  }

  .search {
    width: 100%;
  }
}

@media (max-width: 620px) {
  .page-hero {
    padding: 18px 0 26px;
  }

  .featured-card {
    height: 320px;
  }

  .featured-card__top {
    left: 18px;
    right: 18px;
    top: 18px;
  }

  .featured-card__body {
    left: 18px;
    right: 18px;
    bottom: 18px;
  }

  .featured-card__body h2 {
    font-size: 22px;
  }

  .featured-card__body p {
    display: none;
  }

  .featured-card__more {
    padding-left: 0;
    border-left: none;
  }

  .news-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
