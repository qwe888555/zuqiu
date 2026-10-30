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

function typeTone(type: string) {
  if (type === 'HIGHLIGHT') return 'is-highlight'
  if (type === 'BEST_LINEUP') return 'is-lineup'
  return ''
}

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

/**
 * 首页第一屏按内容数量切换版式：
 * 1 条独占；2 条做左右双栏；3 条以上为“头条 + 速递栏”，剩余内容进入网格。
 */
const layoutMode = computed<'grid' | 'single' | 'duo' | 'lead'>(() => {
  if (page.value !== 1) return 'grid'
  const count = pagedItems.value.length
  if (count === 0) return 'grid'
  if (count === 1) return 'single'
  if (count === 2) return 'duo'
  return 'lead'
})

const leadStory = computed(() => (page.value === 1 ? pagedItems.value[0] : undefined))
const secondaryStory = computed(() => (page.value === 1 ? pagedItems.value[1] : undefined))
const railItems = computed(() =>
  page.value === 1 ? pagedItems.value.slice(1, 4) : [],
)
const gridItems = computed(() => {
  if (page.value !== 1) return pagedItems.value
  if (layoutMode.value !== 'lead') return []
  return pagedItems.value.slice(1 + railItems.value.length)
})

const latestPublishedAt = computed(
  () =>
    allItems.value
      .map((item) => item.publishedAt || '')
      .filter(Boolean)
      .sort()
      .at(-1) || '',
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
        <div v-if="!loading && allItems.length" class="hero-meta">
          <span>共 <strong class="num">{{ allItems.length }}</strong> 篇资讯</span>
          <span v-if="latestPublishedAt">
            更新至 {{ dayjs(latestPublishedAt).format('YYYY.MM.DD') }}
          </span>
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
        <template v-if="!loading && filteredItems.length">
          <div class="opening" :class="`opening--${layoutMode}`">
            <router-link
              v-if="leadStory"
              :to="`/news/${leadStory.id}`"
              class="lead-story"
              :class="hasCover(leadStory) ? 'lead-story--cover' : 'lead-story--text'"
            >
              <template v-if="hasCover(leadStory)">
                <SafeImage
                  class="lead-story__image"
                  :src="coverFor(leadStory)"
                  :alt="leadStory.title"
                />
                <span class="lead-story__shade" />
                <div class="lead-story__cover-top">
                  <span class="story-type" :class="typeTone(leadStory.contentType)">
                    {{ typeLabel(leadStory.contentType) }}
                  </span>
                  <span class="lead-story__date num">
                    {{ dayjs(leadStory.publishedAt).format('MM.DD') }}
                  </span>
                </div>
                <div class="lead-story__cover-body">
                  <span class="lead-story__kicker">焦点 · TOP STORY</span>
                  <h2>{{ leadStory.title }}</h2>
                  <p>{{ leadStory.summary }}</p>
                  <div class="lead-story__meta">
                    <span>{{ dayjs(leadStory.publishedAt).format('YYYY年MM月DD日') }}</span>
                    <span class="dot" />
                    <span>第 {{ leadStory.revision }} 版</span>
                    <span class="lead-story__more">
                      阅读全文 <el-icon><ArrowRight /></el-icon>
                    </span>
                  </div>
                </div>
              </template>

              <template v-else>
                <div class="lead-story__text-top">
                  <span class="story-type" :class="typeTone(leadStory.contentType)">
                    {{ typeLabel(leadStory.contentType) }}
                  </span>
                  <span class="lead-story__date num">
                    {{ dayjs(leadStory.publishedAt).format('YYYY.MM.DD') }}
                  </span>
                </div>
                <div class="lead-story__text-body">
                  <span class="lead-story__kicker">焦点 · TOP STORY</span>
                  <h2>{{ leadStory.title }}</h2>
                  <p>{{ leadStory.summary }}</p>
                  <div class="lead-story__meta">
                    <span>{{ dayjs(leadStory.publishedAt).format('YYYY年MM月DD日') }}</span>
                    <span class="dot" />
                    <span>第 {{ leadStory.revision }} 版</span>
                    <span class="lead-story__more">
                      阅读全文 <el-icon><ArrowRight /></el-icon>
                    </span>
                  </div>
                </div>
              </template>
            </router-link>

            <router-link
              v-if="layoutMode === 'duo' && secondaryStory"
              :to="`/news/${secondaryStory.id}`"
              class="side-story"
            >
              <div v-if="hasCover(secondaryStory)" class="side-story__cover">
                <SafeImage :src="coverFor(secondaryStory)" :alt="secondaryStory.title" />
              </div>
              <div class="side-story__body">
                <div class="side-story__meta">
                  <span class="story-type" :class="typeTone(secondaryStory.contentType)">
                    {{ typeLabel(secondaryStory.contentType) }}
                  </span>
                  <span class="num">{{ dayjs(secondaryStory.publishedAt).format('YYYY.MM.DD') }}</span>
                </div>
                <h3>{{ secondaryStory.title }}</h3>
                <p>{{ secondaryStory.summary }}</p>
                <div class="side-story__foot">
                  <span>第 {{ secondaryStory.revision }} 版</span>
                  <span class="side-story__more">
                    阅读全文 <el-icon><ArrowRight /></el-icon>
                  </span>
                </div>
              </div>
            </router-link>

            <aside v-if="layoutMode === 'lead'" class="news-rail">
              <div class="news-rail__head">
                <div>
                  <span class="news-rail__kicker">LATEST</span>
                  <strong>最新速递</strong>
                </div>
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
                  <span class="rail-item__no num">{{ String(index + 2).padStart(2, '0') }}</span>
                  <span class="rail-item__body">
                    <span class="rail-item__meta">
                      <span class="rail-item__type" :class="typeTone(item.contentType)">
                        {{ typeLabel(item.contentType) }}
                      </span>
                      <span>{{ dayjs(item.publishedAt).format('MM.DD') }}</span>
                    </span>
                    <strong class="rail-item__title">{{ item.title }}</strong>
                    <span class="rail-item__summary">{{ item.summary }}</span>
                  </span>
                  <span v-if="hasCover(item)" class="rail-item__thumb">
                    <SafeImage :src="coverFor(item)" :alt="item.title" />
                  </span>
                </router-link>
              </div>
            </aside>
          </div>

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
                :class="{
                  'news-card--text': !hasCover(item),
                  'news-card--wide': gridItems.length % 3 === 1 && index === gridItems.length - 1,
                }"
              >
                <div v-if="hasCover(item)" class="news-card__cover">
                  <SafeImage :src="coverFor(item)" :alt="item.title" />
                  <span class="story-type story-type--overlay" :class="typeTone(item.contentType)">
                    {{ typeLabel(item.contentType) }}
                  </span>
                </div>
                <div v-else class="news-card__banner">
                  <span class="story-type" :class="typeTone(item.contentType)">
                    {{ typeLabel(item.contentType) }}
                  </span>
                  <div class="news-card__banner-foot">
                    <span class="news-card__banner-label">赛场内外 · NEWS</span>
                    <span class="news-card__banner-date num">
                      {{ dayjs(item.publishedAt).format('YYYY.MM.DD') }}
                    </span>
                  </div>
                </div>
                <div class="news-card__body">
                  <div v-if="hasCover(item)" class="news-card__meta">
                    <span>{{ dayjs(item.publishedAt).format('YYYY.MM.DD') }}</span>
                    <span>第 {{ item.revision }} 版</span>
                  </div>
                  <h3>{{ item.title }}</h3>
                  <p>{{ item.summary }}</p>
                  <div class="news-card__foot">
                    <span v-if="!hasCover(item)">第 {{ item.revision }} 版</span>
                    <span v-else />
                    <span class="news-card__more">
                      阅读全文
                      <el-icon><ArrowRight /></el-icon>
                    </span>
                  </div>
                </div>
              </router-link>
            </div>
          </section>
        </template>

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
  padding-bottom: 64px;
  background: var(--paper);
}

.page-hero {
  padding: 26px 0 30px;
  background:
    radial-gradient(circle at 88% 22%, rgba(200, 243, 106, 0.11), transparent 28%),
    linear-gradient(110deg, var(--brand-900), var(--brand-800));
  color: #fff;
  border-bottom: 3px solid var(--lime);
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

.hero-meta {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  padding: 2px 0 2px 26px;
  border-left: 1px solid rgba(255, 255, 255, 0.16);
  font-size: 11.5px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
}

.hero-meta strong {
  font-size: 20px;
  font-weight: 700;
  color: var(--lime);
}

.news-body {
  margin-top: 24px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.tabs {
  display: flex;
  gap: 3px;
  padding: 4px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--line);
}

.tab {
  min-height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 7px;
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
  width: 250px;
}

.news-content {
  min-height: 380px;
}

.opening {
  display: grid;
  gap: 18px;
  align-items: stretch;
}

.opening--single {
  grid-template-columns: minmax(0, 1fr);
}

.opening--duo,
.opening--lead {
  grid-template-columns: minmax(0, 1.62fr) minmax(320px, 0.88fr);
}

/* ---------- 头条 ---------- */
.lead-story {
  position: relative;
  display: block;
  min-height: 380px;
  overflow: hidden;
  border-radius: 14px;
}

.lead-story--text {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 26px 32px 28px;
  border-top: 3px solid var(--lime);
  background:
    radial-gradient(circle at 82% 18%, rgba(200, 243, 106, 0.12), transparent 34%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 96px),
    linear-gradient(145deg, var(--brand-800), var(--brand-900) 62%);
  color: #fff;
}

.lead-story--text::before {
  content: '';
  position: absolute;
  right: -72px;
  top: 46%;
  width: 250px;
  height: 250px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

.lead-story__text-top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lead-story__text-body {
  position: relative;
  z-index: 1;
  max-width: 780px;
}

.lead-story__kicker {
  display: block;
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--brand-700);
}

.lead-story__text-body h2 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 12px;
  font-size: clamp(26px, 2.5vw, 36px);
  font-weight: 700;
  line-height: 1.34;
  letter-spacing: -0.015em;
  color: #fff;
  transition: color 0.18s ease;
}

.opening--single .lead-story__text-body h2 {
  font-size: clamp(30px, 3.1vw, 43px);
  -webkit-line-clamp: 2;
}

.lead-story:hover .lead-story__text-body h2 {
  color: var(--lime);
}

.lead-story__text-body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 680px;
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.78;
  color: rgba(255, 255, 255, 0.62);
}

.lead-story__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 26px;
  padding-top: 17px;
  border-top: 1px solid var(--line);
  font-size: 11.5px;
  color: var(--ink-300);
}

.lead-story__meta .dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
}

.lead-story__more {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  font-weight: 600;
  color: var(--brand-700);
}

.lead-story__more .el-icon {
  transition: transform 0.16s ease;
}

.lead-story:hover .lead-story__more .el-icon {
  transform: translateX(4px);
}

.lead-story--text .lead-story__kicker {
  color: var(--lime);
}

.lead-story--text .lead-story__meta {
  border-top-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.52);
}

.lead-story--text .lead-story__more {
  color: var(--lime);
}

.lead-story--text .story-type {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.lead-story--text .story-type.is-highlight {
  background: var(--lime);
  color: var(--brand-900);
}

.lead-story--text .story-type.is-lineup {
  background: rgba(141, 184, 255, 0.16);
  color: #c7dcff;
}

/* 有封面：图片铺底，下方压一层渐深遮罩 */
.lead-story--cover {
  background: var(--brand-900);
}

.lead-story__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.55s ease;
}

.lead-story--cover:hover .lead-story__image {
  transform: scale(1.025);
}

.lead-story__shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(0deg, rgba(4, 33, 24, 0.95) 0%, rgba(4, 33, 24, 0.5) 46%, rgba(4, 33, 24, 0.07) 74%),
    linear-gradient(90deg, rgba(4, 33, 24, 0.4), transparent 64%);
}

.lead-story__cover-top {
  position: absolute;
  left: 30px;
  right: 30px;
  top: 26px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lead-story__date {
  padding: 4px 9px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.lead-story__cover-body {
  position: absolute;
  left: 32px;
  right: 32px;
  bottom: 28px;
  z-index: 1;
  color: #fff;
}

.lead-story__cover-body .lead-story__kicker {
  color: var(--lime);
}

.lead-story__cover-body h2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 10px;
  font-size: clamp(25px, 2.7vw, 37px);
  font-weight: 700;
  line-height: 1.34;
  letter-spacing: -0.015em;
}

.lead-story__cover-body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 760px;
  margin-top: 10px;
  font-size: 13.5px;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.68);
}

.lead-story__cover-body .lead-story__meta {
  border-top-color: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.55);
}

.lead-story__cover-body .lead-story__more {
  color: var(--lime);
}

/* ---------- 双条时的次条 ---------- */
.side-story {
  display: flex;
  min-height: 380px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.side-story:hover {
  border-color: var(--brand-500);
  box-shadow: 0 10px 28px rgba(24, 53, 43, 0.07);
}

.side-story__cover {
  aspect-ratio: 16 / 8;
  overflow: hidden;
  background: var(--brand-50);
}

.side-story__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.38s ease;
}

.side-story:hover .side-story__cover img {
  transform: scale(1.04);
}

.side-story__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  padding: 28px 30px;
}

.side-story__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.side-story h3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 14px;
  font-size: clamp(21px, 1.9vw, 27px);
  font-weight: 600;
  line-height: 1.48;
  letter-spacing: -0.01em;
  color: var(--ink-900);
  transition: color 0.18s ease;
}

.side-story:hover h3 {
  color: var(--brand-800);
}

.side-story p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 11px;
  font-size: 12.5px;
  line-height: 1.78;
  color: var(--ink-500);
}

.side-story__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--ink-300);
}

.side-story__more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-700);
}

.side-story__more .el-icon {
  transition: transform 0.16s ease;
}

.side-story:hover .side-story__more .el-icon {
  transform: translateX(4px);
}

/* ---------- 最新速递 ---------- */
.news-rail {
  display: flex;
  min-height: 380px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
}

.news-rail__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--line);
}

.news-rail__kicker {
  display: block;
  margin-bottom: 4px;
  font-family: var(--font-display);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--brand-700);
}

.news-rail__head strong {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-900);
}

.news-rail__head > span {
  padding-bottom: 2px;
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
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 11px;
  align-content: center;
  min-height: 110px;
  padding: 18px 20px;
  border-top: 1px solid var(--line);
  transition: background-color 0.18s ease;
}

.rail-item:first-child {
  border-top: none;
}

.rail-item:hover {
  background: var(--brand-50);
}

.rail-item--with-cover {
  grid-template-columns: 26px minmax(0, 1fr) 72px;
}

.rail-item__no {
  padding-top: 2px;
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--brand-500);
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
  gap: 9px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.rail-item__type {
  font-weight: 600;
  color: var(--brand-700);
}

.rail-item__type.is-highlight {
  color: #6c8f1c;
}

.rail-item__type.is-lineup {
  color: var(--whistle);
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
  line-height: 1.68;
  color: var(--ink-500);
}

.rail-item__thumb {
  align-self: center;
  width: 72px;
  height: 62px;
  overflow: hidden;
  border-radius: 7px;
  background: var(--brand-50);
}

.rail-item__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ---------- 类型标签 ---------- */
.story-type {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  padding: 4px 9px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-800);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.story-type.is-highlight {
  background: var(--lime);
  color: var(--brand-900);
}

.story-type.is-lineup {
  background: var(--whistle-soft);
  color: var(--whistle);
}

.story-type--overlay {
  position: absolute;
  left: 12px;
  top: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--brand-800);
}

/* ---------- 更多资讯 ---------- */
.more-news {
  margin-top: 34px;
}

.more-news__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  padding-top: 22px;
  border-top: 1px solid var(--line);
}

.more-news__head h2 {
  font-size: 20px;
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
  gap: 18px;
}

.news-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  transition: border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.news-card:hover {
  border-color: var(--brand-500);
  box-shadow: 0 10px 28px rgba(24, 53, 43, 0.07);
  transform: translateY(-3px);
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
  transition: transform 0.38s ease;
}

.news-card:hover .news-card__cover img {
  transform: scale(1.04);
}

.news-card__banner {
  position: relative;
  display: flex;
  aspect-ratio: 16 / 9;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  overflow: hidden;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--line);
  background:
    radial-gradient(circle at 88% -10%, rgba(200, 243, 106, 0.32), transparent 36%),
    linear-gradient(135deg, var(--brand-50), #fff 66%);
}

.news-card__banner::after {
  content: '';
  position: absolute;
  right: -34px;
  bottom: -50px;
  width: 128px;
  height: 128px;
  border: 1px solid rgba(8, 127, 91, 0.12);
  border-radius: 50%;
  pointer-events: none;
}

.news-card__banner-foot {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}

.news-card__banner-label {
  font-family: var(--font-display);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--brand-500);
}

.news-card__banner-date {
  font-family: var(--font-display);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--ink-300);
}

.news-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 16px 18px 18px;
}

.news-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.news-card__body h3 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 17.5px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--ink-900);
}

.news-card__body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 7px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.news-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 15px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.news-card__more {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-700);
}

.news-card__more .el-icon {
  transition: transform 0.16s ease;
}

.news-card:hover .news-card__more .el-icon {
  transform: translateX(3px);
}

/* 三列网格只剩一张时，最后一张横跨整行，避免右侧留下大面积空白。 */
.news-card--wide {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: 320px minmax(0, 1fr);
}

.news-card--wide .news-card__cover,
.news-card--wide .news-card__banner {
  height: 100%;
  min-height: 200px;
  aspect-ratio: auto;
  border-right: 1px solid var(--line);
  border-bottom: none;
}

.news-card--wide .news-card__cover {
  position: relative;
}

.news-card--wide .news-card__cover img {
  position: absolute;
  inset: 0;
}

.news-card--wide .news-card__body {
  justify-content: center;
  padding: 26px 30px;
}

.news-card--wide .news-card__body h3 {
  font-size: 22px;
}

.news-card--wide .news-card__body p {
  max-width: 700px;
  font-size: 13px;
}

.empty {
  padding: 70px 0;
}

@media (max-width: 1100px) {
  .opening--duo,
  .opening--lead {
    grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.9fr);
  }

  .lead-story--text {
    padding: 24px 28px 26px;
  }
}

@media (max-width: 1020px) {
  .opening--duo,
  .opening--lead {
    grid-template-columns: minmax(0, 1fr);
  }

  .news-rail {
    min-height: 0;
  }

  .rail-item {
    min-height: 104px;
  }
}

@media (max-width: 900px) {
  .news-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .page-hero {
    padding: 24px 0 26px;
  }

  .hero-grid {
    align-items: flex-start;
    flex-direction: column;
    gap: 18px;
  }

  .hero-meta {
    align-items: flex-start;
    padding: 0;
    border-left: none;
  }

  .hero-meta strong {
    font-size: 17px;
  }

  .toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }

  .tabs {
    overflow-x: auto;
  }

  .tab {
    flex: 1;
    padding: 0 12px;
  }

  .search {
    width: 100%;
  }

  .lead-story,
  .side-story {
    min-height: 0;
  }

  /* 封面版内容全部绝对定位，移动端不能把高度也压成 0。 */
  .lead-story--cover {
    min-height: 340px;
  }

  .lead-story--text {
    padding: 22px;
  }

  .lead-story__text-body h2 {
    font-size: 24px;
  }

  .opening--single .lead-story__text-body h2 {
    font-size: 27px;
  }

  .lead-story__meta {
    margin-top: 20px;
  }

  .lead-story__more {
    width: 100%;
    margin-left: 0;
    padding-top: 6px;
  }

  .lead-story__cover-body {
    left: 22px;
    right: 22px;
    bottom: 22px;
  }

  .lead-story__cover-top {
    left: 22px;
    right: 22px;
    top: 20px;
  }

  .side-story__body {
    padding: 24px 22px;
  }

  .more-news {
    margin-top: 28px;
  }

  .news-card--wide {
    grid-template-columns: minmax(0, 1fr);
  }

  .news-card--wide .news-card__cover,
  .news-card--wide .news-card__banner {
    min-height: 158px;
    border-right: none;
    border-bottom: 1px solid var(--line);
  }

  .news-card--wide .news-card__body {
    padding: 20px 22px;
  }

  .news-card--wide .news-card__body h3 {
    font-size: 19px;
  }
}

@media (max-width: 620px) {
  .news-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
