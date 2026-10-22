<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ArrowRight, Document, Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicContent } from '../../api/types'
import PaginationBar from '../../components/common/PaginationBar.vue'
import { policyKind } from '../../utils/portal'

const loading = ref(false)
const keyword = ref('')
const kindFilter = ref('')
const page = ref(1)
const pageSize = 10
const allItems = ref<PublicContent[]>([])

const kinds = computed(() => {
  const counts = new Map<string, number>()
  allItems.value.forEach((item) => {
    const kind = policyKind(item.title)
    counts.set(kind, (counts.get(kind) || 0) + 1)
  })
  return [
    { label: '全部文件', value: '', count: allItems.value.length },
    ...Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, value: label, count })),
  ]
})

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return allItems.value
    .filter((item) => {
      if (kindFilter.value && policyKind(item.title) !== kindFilter.value) return false
      if (kw) {
        const haystack = `${item.title} ${item.summary || ''}`
        if (!haystack.toLowerCase().includes(kw)) return false
      }
      return true
    })
    .slice()
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
})

const total = computed(() => filtered.value.length)
const items = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)

const latestDate = computed(() => {
  const dates = allItems.value.map((item) => item.publishedAt).filter(Boolean) as string[]
  if (!dates.length) return '—'
  return dayjs(dates.sort((a, b) => b.localeCompare(a))[0]).format('YYYY.MM.DD')
})

const categoryCount = computed(() => Math.max(0, kinds.value.length - 1))

function selectKind(value: string) {
  kindFilter.value = value
  page.value = 1
}

function search() {
  page.value = 1
}

function resetFilters() {
  keyword.value = ''
  kindFilter.value = ''
  page.value = 1
}

function kindTone(title: string) {
  const kind = policyKind(title)
  if (kind === '竞赛规程') return 'rule'
  if (kind === '报名指南') return 'entry'
  if (kind === '资格要求') return 'eligibility'
  if (kind === '赛事保障') return 'safety'
  return 'default'
}

onMounted(async () => {
  loading.value = true
  try {
    // 政策文件数量有限，一次取回后在前端完成分类、检索和分页。
    const res = await publicApi.contents({ page: 1, pageSize: 100, contentType: 'POLICY' })
    allItems.value = res.items
  } catch {
    allItems.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="policy-page">
    <section class="page-hero">
      <div class="container">
        <div class="hero-main">
          <div class="hero-copy">
            <span class="hero-kicker">POLICY &amp; REGULATIONS · 政策文件</span>
            <h1>政策公告</h1>
            <p>
              竞赛规程、报名办法与资格审查要求，均以本栏目发布的正式文件为准。
              每份文件均标注当前版本，点击条目可查看完整正文。
            </p>
          </div>
          <div class="hero-stats">
            <div>
              <strong class="num">{{ allItems.length }}</strong>
              <span>已发布文件</span>
            </div>
            <div>
              <strong class="num">{{ categoryCount }}</strong>
              <span>政策分类</span>
            </div>
            <div>
              <strong class="num hero-stats__date">{{ latestDate }}</strong>
              <span>最近更新</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="container policy-body">
      <main class="policy-main">
        <div class="policy-toolbar">
          <div class="toolbar-title">
            <h2>{{ kindFilter || '全部文件' }}</h2>
            <span>共 {{ total }} 份</span>
          </div>
          <el-input
            v-model="keyword"
            size="large"
            placeholder="搜索标题或内容摘要"
            :prefix-icon="Search"
            clearable
            class="search"
            @keyup.enter="search"
            @clear="search"
            @input="page = 1"
          />
        </div>

        <div v-loading="loading" class="policy-list">
          <router-link
            v-for="(item, index) in items"
            :key="item.id"
            :to="`/policies/${item.id}`"
            class="policy-item"
          >
            <span class="policy-item__mark" :class="`policy-item__mark--${kindTone(item.title)}`">
              <el-icon :size="19"><Document /></el-icon>
            </span>

            <span class="policy-item__body">
              <span class="policy-item__meta">
                <span class="policy-item__kind" :class="`policy-item__kind--${kindTone(item.title)}`">
                  {{ policyKind(item.title) }}
                </span>
                <span>{{ dayjs(item.publishedAt).format('YYYY-MM-DD') }}</span>
                <span>第 {{ item.revision }} 版</span>
              </span>
              <strong class="policy-item__title">{{ item.title }}</strong>
              <span class="policy-item__summary">{{ item.summary }}</span>
            </span>

            <span class="policy-item__action" aria-hidden="true">
              <el-icon><ArrowRight /></el-icon>
            </span>
            <span class="policy-item__no num">{{ String(index + 1 + (page - 1) * pageSize).padStart(2, '0') }}</span>
          </router-link>

          <el-empty v-if="!loading && !items.length" description="没有符合条件的政策文件">
            <el-button v-if="keyword || kindFilter" @click="resetFilters">清除筛选</el-button>
          </el-empty>
        </div>

        <PaginationBar
          v-model:page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          hide-when-single
        />

        <p class="policy-footnote">
          文件版本以页面标注为准；如遇内容调整，组委会将发布新版本并保留版本号。
        </p>
      </main>

      <aside class="policy-aside">
        <div class="aside-card">
          <span class="aside-kicker">CATEGORIES</span>
          <h3>政策分类</h3>
          <button
            v-for="kind in kinds"
            :key="kind.value || 'ALL'"
            type="button"
            class="kind-row"
            :class="{ 'is-active': kindFilter === kind.value }"
            @click="selectKind(kind.value)"
          >
            <span>{{ kind.label }}</span>
            <span class="kind-row__count num">{{ kind.count }}</span>
          </button>
        </div>

        <div class="aside-note">
          <span class="aside-kicker">HOW TO READ</span>
          <h3>阅读提示</h3>
          <p>
            报名与资格审查以最新版本文件为准。点击文件条目可查看完整条款、生效时间和政策依据。
          </p>
          <router-link to="/publications" class="aside-link">
            查看公示结果
            <el-icon><ArrowRight /></el-icon>
          </router-link>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.policy-page {
  min-height: 70vh;
  padding-bottom: 64px;
  background: var(--paper);
}

.page-hero {
  padding: 20px 0 34px;
  background: var(--brand-900);
  color: #fff;
}

.hero-main {
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

.hero-copy h1 {
  font-size: clamp(30px, 3.4vw, 42px);
  font-weight: 700;
  line-height: 1.2;
}

.hero-copy p {
  max-width: 660px;
  margin-top: 11px;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.6);
}

.hero-stats {
  display: flex;
  flex-shrink: 0;
  gap: 32px;
}

.hero-stats div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hero-stats strong {
  font-size: 29px;
  font-weight: 800;
  line-height: 1;
  color: var(--lime);
}

.hero-stats__date {
  font-size: 18px !important;
  padding-top: 6px;
}

.hero-stats span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.48);
}

.policy-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  align-items: start;
  gap: 22px;
  margin-top: 24px;
}

.policy-main {
  min-width: 0;
}

.policy-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}

.toolbar-title {
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.toolbar-title h2 {
  font-size: 21px;
  font-weight: 700;
  color: var(--ink-900);
}

.toolbar-title span {
  font-size: 12px;
  color: var(--ink-500);
}

.search {
  width: 258px;
}

.policy-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-height: 200px;
}

.policy-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 15px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  transition: border-color 0.16s, box-shadow 0.16s, transform 0.16s;
}

.policy-item:hover {
  border-color: var(--brand-500);
  box-shadow: 0 8px 24px rgba(24, 53, 43, 0.06);
  transform: translateY(-1px);
}

.policy-item__mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.policy-item__mark--entry {
  background: #eaf2fc;
  color: #245ea8;
}

.policy-item__mark--eligibility {
  background: #fdf3e7;
  color: #8a5308;
}

.policy-item__mark--safety {
  background: #e8f4f1;
  color: #0b6b5a;
}

.policy-item__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding-right: 88px;
}

.policy-item__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.policy-item__kind {
  padding: 2px 7px;
  border-radius: 3px;
  background: var(--lime-soft);
  color: #4f6808;
  font-weight: 600;
}

.policy-item__kind--entry {
  background: #eaf2fc;
  color: #245ea8;
}

.policy-item__kind--eligibility {
  background: #fdf3e7;
  color: #8a5308;
}

.policy-item__kind--safety {
  background: #e8f4f1;
  color: #0b6b5a;
}

.policy-item__title {
  overflow: hidden;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--ink-900);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.policy-item__summary {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.policy-item__action {
  position: absolute;
  right: 20px;
  top: 50%;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-700);
  transform: translateY(-50%);
  transition: 0.16s;
}

.policy-item:hover .policy-item__action {
  border-color: var(--brand-700);
  background: var(--brand-50);
}

.policy-item__no {
  position: absolute;
  right: 22px;
  top: 12px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.policy-footnote {
  margin-top: 16px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-300);
}

.policy-aside {
  position: sticky;
  top: 92px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.aside-card,
.aside-note {
  padding: 17px 16px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
}

.aside-kicker {
  font-family: var(--font-display);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--brand-600);
}

.aside-card h3,
.aside-note h3 {
  margin-top: 6px;
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-900);
}

.kind-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  margin-top: 5px;
  padding: 0 9px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-size: 12.5px;
  color: var(--ink-500);
  text-align: left;
  cursor: pointer;
}

.kind-row:first-of-type {
  margin-top: 12px;
}

.kind-row:hover {
  background: var(--paper);
  color: var(--ink-900);
}

.kind-row.is-active {
  background: var(--brand-50);
  color: var(--brand-800);
  font-weight: 600;
}

.kind-row__count {
  min-width: 19px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--paper);
  font-size: 9.5px;
  color: var(--ink-300);
  text-align: center;
}

.kind-row.is-active .kind-row__count {
  background: #fff;
  color: var(--brand-700);
}

.aside-note {
  background: linear-gradient(160deg, #fff 0%, #f4faf5 100%);
}

.aside-note p {
  margin-top: 8px;
  font-size: 11.5px;
  line-height: 1.75;
  color: var(--ink-500);
}

.aside-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 12px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-700);
}

@media (max-width: 1020px) {
  .policy-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .policy-aside {
    position: static;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .hero-main {
    align-items: flex-start;
    flex-direction: column;
    gap: 22px;
  }

  .hero-stats strong {
    font-size: 24px;
  }

  .policy-toolbar {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .search {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .page-hero {
    padding: 18px 0 26px;
  }

  .hero-stats {
    gap: 24px;
  }

  .policy-item {
    padding: 14px;
    gap: 11px;
  }

  .policy-item__mark {
    width: 36px;
    height: 36px;
  }

  .policy-item__body {
    padding-right: 0;
  }

  .policy-item__title {
    font-size: 15.5px;
    white-space: normal;
  }

  .policy-item__action {
    position: static;
    align-self: flex-end;
    margin-top: 2px;
    transform: none;
  }

  .policy-item__no {
    display: none;
  }

  .policy-aside {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
