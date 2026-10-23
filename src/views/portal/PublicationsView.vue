<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowRight, InfoFilled, Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicCard } from '../../api/types'
import {
  GROUP_TABS,
  groupCategoryLabel,
  groupCategoryOf,
  groupPublications,
  publicationCountUnit,
} from '../../utils/publications'

const loading = ref(false)
const allItems = ref<PublicCard[]>([])
const groupFilter = ref<(typeof GROUP_TABS)[number]['value']>('')
const typeFilter = ref<'' | 'ENROLLMENT' | 'PERSON'>('')
const keyword = ref('')

const groups = computed(() => groupPublications(allItems.value))

const groupTabs = computed(() =>
  GROUP_TABS.map((tab) => ({
    ...tab,
    count: tab.value
      ? groups.value.filter((group) => groupCategoryOf(group.groupName) === tab.value).length
      : groups.value.length,
  })),
)

const visibleGroups = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return groups.value.filter((group) => {
    if (groupFilter.value && groupCategoryOf(group.groupName) !== groupFilter.value) return false
    if (typeFilter.value && group.type !== typeFilter.value) return false
    if (kw) {
      const haystack = `${group.title} ${group.cities.join(' ')}`
      if (!haystack.toLowerCase().includes(kw)) return false
    }
    return true
  })
})

const cityCount = computed(
  () => new Set(allItems.value.map((item) => item.cityName).filter(Boolean)).size,
)

const typeOptions = [
  { label: '全部公示', value: '' as const },
  { label: '参赛资格', value: 'ENROLLMENT' as const },
  { label: '人员名单', value: 'PERSON' as const },
]

function detailLink(key: string) {
  return `/publications/${encodeURIComponent(key)}`
}

onMounted(async () => {
  loading.value = true
  try {
    // 公开接口不返回批次和发布日期，一次取回后在本地按“类型 + 组别”归集。
    const res = await publicApi.publications({ page: 1, pageSize: 100 })
    allItems.value = res.items
  } catch {
    allItems.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="publication-page">
    <section class="page-hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          <span class="hero-kicker">PUBLIC NOTICE · 信息公开</span>
          <h1>公示查询</h1>
          <p>
            按公示类型与组别查看参赛资格和人员名单。每一项公示独立成页，名单内可按姓名、球队或市州核对。
          </p>
        </div>
        <div v-if="!loading" class="hero-stats">
          <div>
            <strong class="num">{{ groups.length }}</strong>
            <span>公示事项</span>
          </div>
          <div>
            <strong class="num">{{ allItems.length }}</strong>
            <span>公开对象</span>
          </div>
          <div>
            <strong class="num">{{ cityCount }}</strong>
            <span>覆盖市州</span>
          </div>
        </div>
      </div>
    </section>

    <div class="container publication-body">
      <section class="filter-panel">
        <div class="group-tabs" role="tablist" aria-label="按组别筛选">
          <button
            v-for="tab in groupTabs"
            :key="tab.value || 'ALL'"
            type="button"
            role="tab"
            class="group-tab"
            :class="{ 'is-active': groupFilter === tab.value, 'is-empty': tab.count === 0 }"
            :aria-selected="groupFilter === tab.value"
            @click="groupFilter = tab.value"
          >
            {{ tab.label }}
            <span class="group-tab__count num">{{ tab.count }}</span>
          </button>
        </div>

        <div class="filter-row">
          <div class="type-tabs">
            <button
              v-for="option in typeOptions"
              :key="option.value || 'ALL'"
              type="button"
              class="type-tab"
              :class="{ 'is-active': typeFilter === option.value }"
              @click="typeFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          <el-input
            v-model="keyword"
            size="large"
            placeholder="搜索公示事项或市州"
            :prefix-icon="Search"
            clearable
            class="notice-search"
          />
        </div>
      </section>

      <section class="notice-section">
        <div class="section-head">
          <div>
            <h2>公示事项</h2>
            <p>点击事项进入独立页面查看完整名单；公示期与批次以组委会正式公告为准。</p>
          </div>
          <span class="result-count">共 {{ visibleGroups.length }} 项</span>
        </div>

        <div v-loading="loading" class="notice-grid">
          <router-link
            v-for="notice in visibleGroups"
            :key="notice.key"
            :to="detailLink(notice.key)"
            class="notice-card"
          >
            <header class="notice-card__head">
              <span class="notice-card__type">{{ notice.typeLabel }}</span>
              <span class="notice-card__group">{{ groupCategoryLabel(notice.groupName) }}</span>
            </header>

            <h3>{{ notice.title }}</h3>

            <p class="notice-card__meta">
              涉及 {{ notice.items.length }} {{ publicationCountUnit(notice.type) }} ·
              {{ notice.cities.length }} 个市州
            </p>

            <div class="notice-card__cities">
              <span v-for="city in notice.cities.slice(0, 3)" :key="city">{{ city }}</span>
              <span v-if="notice.cities.length > 3" class="more-city">
                +{{ notice.cities.length - 3 }}
              </span>
              <span v-if="!notice.cities.length" class="more-city">市州待补充</span>
            </div>

            <footer class="notice-card__foot">
              <span>查看完整名单</span>
              <el-icon><ArrowRight /></el-icon>
            </footer>
          </router-link>

          <el-empty
            v-if="!loading && !visibleGroups.length"
            class="notice-empty"
            description="该筛选条件下暂无公示事项"
          />
        </div>
      </section>

      <section class="notice-guide">
        <span class="notice-guide__icon">
          <el-icon><InfoFilled /></el-icon>
        </span>
        <div>
          <strong>关于公示信息</strong>
          <p>
            本页仅展示经审核确认可公开的内容，身份证号、联系方式等个人信息不会对外展示。
            名单按“公示类型 + 组别”归集；具体公示起止日期、批次和申诉渠道，请以组委会正式发布的公告为准。
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.publication-page {
  min-height: 70vh;
  padding-bottom: 64px;
  background: var(--paper);
}

.page-hero {
  padding: 44px 0 38px;
  background: var(--brand-900);
  color: #fff;
}

.hero-grid {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 40px;
}

.hero-copy {
  min-width: 0;
}

.hero-kicker {
  display: block;
  margin-bottom: 10px;
  font-family: var(--font-display);
  font-size: 10.5px;
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
  max-width: 680px;
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.62);
}

.hero-stats {
  display: flex;
  flex-shrink: 0;
  gap: 28px;
  padding-bottom: 4px;
}

.hero-stats div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hero-stats strong {
  font-size: 21px;
  font-weight: 700;
  line-height: 1;
  color: var(--lime);
}

.hero-stats span {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
}

.publication-body {
  margin-top: 22px;
}

.filter-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}

.group-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.group-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-size: 13px;
  color: var(--ink-500);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.group-tab:hover {
  background: var(--paper);
  color: var(--ink-900);
}

.group-tab.is-active {
  background: var(--brand-900);
  color: #fff;
  font-weight: 600;
}

.group-tab.is-empty {
  color: var(--ink-300);
}

.group-tab__count {
  padding: 0 4px;
  border-radius: 3px;
  background: var(--paper);
  font-size: 10px;
  color: var(--ink-500);
}

.group-tab.is-active .group-tab__count {
  background: rgba(255, 255, 255, 0.14);
  color: var(--lime);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.type-tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 6px;
  background: var(--paper);
}

.type-tab {
  min-height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 11.5px;
  color: var(--ink-500);
  cursor: pointer;
}

.type-tab.is-active {
  background: #fff;
  color: var(--brand-800);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(24, 53, 43, 0.1);
}

.notice-search {
  width: 200px;
}

.notice-section {
  margin-top: 28px;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 18px;
}

.section-head h2 {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink-900);
}

.section-head p {
  margin-top: 5px;
  font-size: 12.5px;
  color: var(--ink-500);
}

.result-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ink-500);
}

.notice-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  min-height: 180px;
}

.notice-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
  transition: border-color 0.16s, box-shadow 0.16s, transform 0.16s;
}

.notice-card:hover {
  border-color: var(--brand-500);
  box-shadow: 0 8px 24px rgba(24, 53, 43, 0.07);
  transform: translateY(-2px);
}

.notice-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.notice-card__type {
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 10.5px;
  font-weight: 600;
}

.notice-card__group {
  font-size: 11px;
  color: var(--ink-300);
}

.notice-card h3 {
  margin-top: 13px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--ink-900);
}

.notice-card__meta {
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-500);
}

.notice-card__cities {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 13px;
}

.notice-card__cities span {
  padding: 2px 7px;
  border-radius: 3px;
  background: var(--paper);
  font-size: 10.5px;
  color: var(--ink-500);
}

.notice-card__cities .more-city {
  background: transparent;
  color: var(--ink-300);
}

.notice-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 16px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--brand-700);
}

.notice-card__foot .el-icon {
  transition: transform 0.16s;
}

.notice-card:hover .notice-card__foot .el-icon {
  transform: translateX(3px);
}

.notice-empty {
  grid-column: 1 / -1;
}

.notice-guide {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 24px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fbfcf9;
}

.notice-guide__icon {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 14px;
}

.notice-guide strong {
  font-size: 13px;
  color: var(--ink-900);
}

.notice-guide p {
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--ink-500);
}

@media (max-width: 1100px) {
  .filter-panel {
    align-items: flex-start;
    flex-direction: column;
  }

  .filter-row {
    width: 100%;
  }

  .notice-search {
    margin-left: auto;
  }

  .notice-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .hero-grid {
    align-items: flex-start;
    flex-direction: column;
    gap: 24px;
  }

  .hero-stats {
    gap: 28px;
  }

  .hero-stats strong {
    font-size: 19px;
  }
}

@media (max-width: 640px) {
  .page-hero {
    padding: 32px 0 28px;
  }

  .filter-panel {
    padding: 12px;
  }

  .group-tabs {
    width: 100%;
  }

  .group-tab {
    min-height: 32px;
    padding: 0 9px;
    font-size: 12px;
  }

  .filter-row {
    align-items: stretch;
    flex-direction: column;
  }

  .type-tabs {
    width: fit-content;
  }

  .notice-search {
    width: 100%;
    margin-left: 0;
  }

  .notice-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .section-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }
}
</style>
