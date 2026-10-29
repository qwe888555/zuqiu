<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ArrowRight, Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicContent } from '../../api/types'
import PaginationBar from '../../components/common/PaginationBar.vue'
import SafeImage from '../../components/common/SafeImage.vue'

const loading = ref(false)
const allItems = ref<PublicContent[]>([])
const page = ref(1)
const pageSize = 10
const keyword = ref('')
const activeType = ref('')
/** 管理端「新闻配图」按关联内容覆盖资讯封面；未配置的仍用内容自带封面。 */
const resourceCovers = ref<Map<string, string>>(new Map())

const tabs = [
  { label: '全部资讯', value: '' },
  { label: '赛事动态', value: 'NEWS' },
  { label: '精彩瞬间', value: 'HIGHLIGHT' },
  { label: '最佳阵容', value: 'BEST_LINEUP' },
]

const typeLabel = (type: string) =>
  type === 'HIGHLIGHT'
    ? '精彩瞬间'
    : type === 'BEST_LINEUP'
      ? '最佳阵容'
      : '赛事动态'

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
/** 首条做特写，右侧速递最多 3 条，其余进入下方卡片网格。 */
const featured = computed(() => (page.value === 1 ? pagedItems.value[0] : undefined))
const railItems = computed(() =>
  page.value === 1 ? pagedItems.value.slice(1, 4) : [],
)
const gridItems = computed(() =>
  pagedItems.value.slice(page.value === 1 ? 1 + railItems.value.length : 0),
)

// 分类计数跟随搜索词，避免搜到的内容与标签数字不一致；当前选中的空分类仍保留，防止筛选后标签消失。
const visibleTabs = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const source = kw
    ? allItems.value.filter((item) => item.title.toLowerCase().includes(kw))
    : allItems.value
  const counts = new Map<string, number>()
  source.forEach((item) => {
    counts.set(item.contentType, (counts.get(item.contentType) || 0) + 1)
  })
  return tabs
    .map((tab) => ({ ...tab, count: tab.value ? counts.get(tab.value) || 0 : source.length }))
    .filter((tab) => tab.value === activeType.value || tab.count > 0)
})

async function load() {
  loading.value = true
  try {
    const res = await publicApi.contents({ page: 1, pageSize: 100 })
    // 政策公告在顶部导航有独立栏目，资讯流不重复收录，避免同一内容出现两个入口。
    allItems.value = res.items.filter((item) => item.contentType !== 'POLICY')
  } catch {
    allItems.value = []
  } finally {
    loading.value = false
  }
}

async function loadResourceCovers() {
  try {
    const res = await publicApi.resources({ resourceType: 'NEWS_LINK_IMAGE' })
    const map = new Map<string, string>()
    res.items.forEach((item) => {
      if (item.targetContentId && item.imageUrl) map.set(item.targetContentId, item.imageUrl)
    })
    resourceCovers.value = map
  } catch {
    resourceCovers.value = new Map()
  }
}

/**
 * 管理端配图优先，其次内容自带封面。
 * 封面在内容发布时不是必填项，没有配图时返回空串，由各版式走纯文字方案，不拿站内图冒充新闻图。
 */
function coverFor(item: PublicContent) {
  return resourceCovers.value.get(item.id) || item.publicCoverUrl || ''
}

function hasCover(item: PublicContent) {
  return Boolean(coverFor(item))
}

/** 网格卡片位于当前页的起始序号，用于无图卡片的版面编号。 */
const gridStartIndex = computed(() => {
  const beforeGrid = page.value === 1 ? 1 + railItems.value.length : 0
  return (page.value - 1) * pageSize + beforeGrid
})

function switchTab(value: string) {
  activeType.value = value
  page.value = 1
}

function search() {
  page.value = 1
}

onMounted(() => {
  load()
  loadResourceCovers()
})
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
            v-for="tab in visibleTabs"
            :key="tab.value"
            type="button"
            class="tab"
            :class="{ 'is-active': activeType === tab.value }"
            @click="switchTab(tab.value)"
          >
            {{ tab.label }}
            <span class="tab__count num">{{ tab.count }}</span>
          </button>
        </div>
        <div class="toolbar__right">
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
        <div
          v-if="featured"
          class="lead-layout"
          :class="{ 'is-solo': railItems.length <= 1 }"
        >
          <router-link
            :to="`/news/${featured.id}`"
            class="featured-card"
            :class="{ 'featured-card--text': !hasCover(featured) }"
          >
            <SafeImage v-if="hasCover(featured)" :src="coverFor(featured)" :alt="featured.title" />
            <span v-if="hasCover(featured)" class="featured-card__shade" />
            <div class="featured-card__top">
              <span class="news-type-badge news-type-badge--solid">
                {{ typeLabel(featured.contentType) }}
              </span>
              <span class="featured-card__date num">
                {{ dayjs(featured.publishedAt).format('MM.DD') }}
              </span>
            </div>
            <span class="featured-card__index num" aria-hidden="true">01</span>
            <div class="featured-card__body">
              <span class="featured-card__kicker">最新发布 · LATEST</span>
              <h2>{{ featured.title }}</h2>
              <p>{{ featured.summary }}</p>
              <div class="featured-card__meta">
                <span>{{ dayjs(featured.publishedAt).format('YYYY年MM月DD日') }}</span>
                <span class="dot" />
                <span>第 {{ featured.revision }} 版</span>
                <span class="featured-card__more">
                  阅读全文 <el-icon><ArrowRight /></el-icon>
                </span>
              </div>
            </div>
          </router-link>

          <aside v-if="railItems.length > 1" class="news-rail">
            <div class="news-rail__head">
              <strong>最新速递</strong>
              <span>按发布时间</span>
            </div>
            <div class="news-rail__list">
              <router-link
                v-for="(item, index) in railItems"
                :key="item.id"
                :to="`/news/${item.id}`"
                class="rail-item"
                :class="{ 'rail-item--with-cover': hasCover(item) }"
              >
                <span class="rail-item__index num">{{ String(index + 2).padStart(2, '0') }}</span>
                <span class="rail-item__body">
                  <span class="rail-item__meta">
                    <span class="rail-item__type">{{ typeLabel(item.contentType) }}</span>
                    <span>{{ dayjs(item.publishedAt).format('YYYY.MM.DD') }}</span>
                  </span>
                  <strong class="rail-item__title">{{ item.title }}</strong>
                  <span class="rail-item__summary">{{ item.summary }}</span>
                  <span class="rail-item__more">
                    阅读 <el-icon><ArrowRight /></el-icon>
                  </span>
                </span>
                <span v-if="hasCover(item)" class="rail-item__thumb">
                  <SafeImage :src="coverFor(item)" :alt="item.title" />
                </span>
              </router-link>
            </div>
          </aside>
        </div>

        <router-link
          v-if="railItems.length === 1"
          :to="`/news/${railItems[0].id}`"
          class="follow-card"
          :class="{ 'follow-card--with-cover': hasCover(railItems[0]) }"
        >
          <span class="follow-card__index num" aria-hidden="true">02</span>
          <span class="follow-card__body">
            <span class="follow-card__meta">
              <span class="follow-card__type">{{ typeLabel(railItems[0].contentType) }}</span>
              <span>{{ dayjs(railItems[0].publishedAt).format('YYYY.MM.DD') }}</span>
              <span>第 {{ railItems[0].revision }} 版</span>
            </span>
            <strong class="follow-card__title">{{ railItems[0].title }}</strong>
            <span class="follow-card__summary">{{ railItems[0].summary }}</span>
          </span>
          <span v-if="hasCover(railItems[0])" class="follow-card__thumb">
            <SafeImage :src="coverFor(railItems[0])" :alt="railItems[0].title" />
          </span>
          <span class="follow-card__arrow"><el-icon><ArrowRight /></el-icon></span>
        </router-link>

        <section v-if="gridItems.length" class="more-news">
          <div class="more-news__head">
            <h2>{{ page > 1 ? '本页资讯' : '更多资讯' }}</h2>
            <span>{{ gridItems.length }} 篇</span>
          </div>
          <div class="news-grid">
            <router-link
              v-for="(item, index) in gridItems"
              :key="item.id"
              :to="`/news/${item.id}`"
              class="news-card"
              :class="{ 'news-card--text': !hasCover(item) }"
            >
              <div v-if="hasCover(item)" class="news-card__cover">
                <SafeImage :src="coverFor(item)" :alt="item.title" />
                <span class="news-type-badge news-type-badge--light">{{ typeLabel(item.contentType) }}</span>
              </div>
              <div class="news-card__body">
                <span class="news-card__index num" aria-hidden="true">
                  {{ String(gridStartIndex + index + 1).padStart(2, '0') }}
                </span>
                <span v-if="!hasCover(item)" class="news-card__type">
                  {{ typeLabel(item.contentType) }}
                </span>
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
        </section>

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
  white-space: nowrap;
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

.tab__count {
  margin-left: 6px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--ink-300);
}

.tab.is-active .tab__count {
  color: var(--lime);
}

.toolbar__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search {
  width: 240px;
}

.news-content {
  min-height: 200px;
}

.lead-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.9fr) minmax(300px, 0.85fr);
  gap: 18px;
  align-items: stretch;
}

.lead-layout.is-solo {
  grid-template-columns: minmax(0, 1fr);
}

.featured-card {
  position: relative;
  display: block;
  min-height: 460px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--brand-900);
}

.featured-card--text {
  border-top: 3px solid var(--lime);
  background:
    radial-gradient(circle at 82% 20%, rgba(200, 243, 106, 0.13), transparent 34%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 118px),
    linear-gradient(145deg, var(--brand-800), var(--brand-900) 58%);
}

.featured-card--text::before {
  content: '';
  position: absolute;
  right: -90px;
  top: 46%;
  width: 340px;
  height: 340px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 50%;
  transform: translateY(-50%);
  pointer-events: none;
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

.featured-card__date {
  padding: 4px 9px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.featured-card__kicker {
  display: block;
  margin-bottom: 8px;
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--lime);
}

.featured-card__index {
  position: absolute;
  right: 18px;
  bottom: -10px;
  font-size: 112px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  color: rgba(255, 255, 255, 0.08);
  pointer-events: none;
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

.news-rail {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
}

.news-rail__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--line);
}

.news-rail__head strong {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-900);
}

.news-rail__head span {
  font-size: 10.5px;
  color: var(--ink-300);
}

.news-rail__list {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.rail-item {
  position: relative;
  display: grid;
  flex: 1;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
  min-height: 112px;
  padding: 17px 20px;
  border-top: 1px solid var(--line);
  align-content: center;
  transition: background-color 0.18s ease;
}

.rail-item:first-child {
  border-top: none;
}

.rail-item:hover {
  background: var(--brand-50);
}

.rail-item__index {
  padding-top: 1px;
  font-size: 25px;
  font-weight: 800;
  line-height: 1;
  color: var(--brand-100);
  transition: color 0.18s ease;
}

.rail-item:hover .rail-item__index {
  color: var(--brand-500);
}

.rail-item--with-cover {
  grid-template-columns: 36px minmax(0, 1fr) 68px;
}

.rail-item__thumb {
  align-self: center;
  width: 68px;
  height: 68px;
  overflow: hidden;
  border-radius: 7px;
  background: var(--brand-50);
}

.rail-item__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rail-item__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.rail-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.rail-item__type {
  font-weight: 600;
  color: var(--brand-700);
}

.rail-item__title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.55;
  color: var(--ink-900);
  transition: color 0.18s ease;
}

.rail-item:hover .rail-item__title {
  color: var(--brand-800);
}

.rail-item__summary {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-500);
}

.rail-item__more {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 2px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ink-300);
}

.rail-item:hover .rail-item__more {
  color: var(--brand-700);
}

.rail-item__more .el-icon {
  transition: transform 0.16s;
}

.rail-item:hover .rail-item__more .el-icon {
  transform: translateX(3px);
}

.follow-card {
  position: relative;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 44px;
  gap: 22px;
  align-items: center;
  margin-top: 18px;
  padding: 24px 30px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--brand-900);
  color: #fff;
  transition: background-color 0.18s ease;
}

.follow-card:hover {
  background: var(--brand-800);
}

.follow-card__index {
  font-family: var(--font-display);
  font-size: 46px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--lime);
}

.follow-card--with-cover {
  grid-template-columns: 64px minmax(0, 1fr) 120px 44px;
}

.follow-card__thumb {
  width: 120px;
  height: 76px;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
}

.follow-card__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.follow-card__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.follow-card__meta {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
}

.follow-card__type {
  font-weight: 600;
  color: var(--lime);
}

.follow-card__title {
  overflow: hidden;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.follow-card__summary {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.55);
}

.follow-card__arrow {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 50%;
  color: var(--lime);
  transition: border-color 0.18s ease, transform 0.18s ease;
}

.follow-card:hover .follow-card__arrow {
  border-color: var(--lime);
  transform: translateX(4px);
}

.more-news {
  margin-top: 28px;
}

.more-news__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.more-news__head h2 {
  font-size: 19px;
  font-weight: 700;
  color: var(--ink-900);
}

.more-news__head span {
  font-size: 11.5px;
  color: var(--ink-300);
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

.news-type-badge--solid {
  background: var(--lime);
  color: var(--brand-900);
  font-weight: 700;
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

.news-card--text {
  border-top: 3px solid var(--brand-800);
}

.news-card--text .news-card__body {
  position: relative;
  padding: 18px 18px 18px;
}

.news-card__index {
  display: none;
}

.news-card--text .news-card__index {
  display: block;
  position: absolute;
  top: 8px;
  right: 14px;
  font-size: 38px;
  font-weight: 800;
  line-height: 1;
  color: var(--brand-50);
}

.news-card__type {
  display: inline-block;
  margin-bottom: 8px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--brand-700);
}

.news-card--text .news-card__body h3 {
  margin-top: 10px;
  font-size: 18px;
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

@media (max-width: 1020px) {
  .lead-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .featured-card {
    min-height: 380px;
  }
}

@media (max-width: 900px) {
  .news-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .follow-card--with-cover {
    grid-template-columns: 52px minmax(0, 1fr) 40px;
  }

  .follow-card__thumb {
    display: none;
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
    width: 100%;
    max-width: 100%;
    gap: 2px;
    padding: 2px;
    overflow-x: auto;
  }

  .tab {
    flex: 1 0 auto;
    padding: 0 9px;
    font-size: 12.5px;
  }

  .tab__count {
    margin-left: 4px;
    font-size: 10px;
  }

  .toolbar__right {
    width: 100%;
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
    min-height: 320px;
  }

  .featured-card__index {
    right: 12px;
    font-size: 84px;
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

  .follow-card {
    grid-template-columns: 40px minmax(0, 1fr) 32px;
    gap: 12px;
    padding: 18px;
  }

  .follow-card__index {
    font-size: 34px;
  }

  .follow-card__title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: normal;
    font-size: 16px;
  }

  .follow-card__summary {
    display: none;
  }

  .follow-card__arrow {
    width: 32px;
    height: 32px;
  }
}
</style>
