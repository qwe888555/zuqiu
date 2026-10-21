<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { ArrowRight, Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import StatusTag from '../../components/common/StatusTag.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'

interface PublicCard {
  publicationId: string
  targetType: string
  displayName: string
  teamName?: string
  cityName?: string
  groupName?: string
  publicPhotoUrl?: string
}

interface NoticeGroup {
  key: string
  groupName: string
  type: 'ENROLLMENT' | 'PERSON'
  typeLabel: string
  title: string
  items: PublicCard[]
  cities: string[]
}

const loading = ref(false)
const allItems = ref<PublicCard[]>([])
const page = ref(1)
const pageSize = 10
const keyword = ref('')
const objectType = ref('')
const cityFilter = ref('')
const selectedNotice = ref('')

const typeLabel = (type: string) =>
  type === 'ATHLETE' ? '运动员' : type === 'COACH' ? '教练员' : '参赛球队'

const objectTabs = [
  { label: '全部对象', value: '' },
  { label: '运动员', value: 'ATHLETE' },
  { label: '教练员', value: 'COACH' },
  { label: '参赛球队', value: 'ENROLLMENT' },
]

/**
 * 公开接口以人员/球队为粒度返回，没有“公示批次”和“发布日期”字段。
 * 页面按“公示类型 + 组别”归集成公示事项，不虚构批次、年份和截止日期。
 */
const noticeGroups = computed<NoticeGroup[]>(() => {
  const map = new Map<string, PublicCard[]>()
  allItems.value.forEach((item) => {
    const type: NoticeGroup['type'] = item.targetType === 'ENROLLMENT' ? 'ENROLLMENT' : 'PERSON'
    const groupName = item.groupName || '未标注组别'
    const key = `${type}|${groupName}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)?.push(item)
  })

  return Array.from(map.entries())
    .map(([key, items]) => {
      const type: NoticeGroup['type'] = key.startsWith('ENROLLMENT') ? 'ENROLLMENT' : 'PERSON'
      const groupName = key.split('|')[1] || '未标注组别'
      const typeLabelText = type === 'ENROLLMENT' ? '参赛资格公示' : '人员名单公示'
      const cities = [...new Set(items.map((item) => item.cityName).filter(Boolean) as string[])]
      return {
        key,
        groupName,
        type,
        typeLabel: typeLabelText,
        title: `${groupName}${typeLabelText}`,
        items,
        cities,
      }
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'ENROLLMENT' ? -1 : 1
      return a.groupName.localeCompare(b.groupName, 'zh-Hans-CN')
    })
})

const activeNotice = computed(
  () => noticeGroups.value.find((notice) => notice.key === selectedNotice.value) || null,
)

const scopeItems = computed(() => activeNotice.value?.items || allItems.value)

const cityOptions = computed(() => [
  ...new Set(scopeItems.value.map((item) => item.cityName).filter(Boolean) as string[]),
])

const filteredItems = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return scopeItems.value
    .filter((item) => {
      if (objectType.value && item.targetType !== objectType.value) return false
      if (cityFilter.value && item.cityName !== cityFilter.value) return false
      if (kw) {
        const haystack = `${item.displayName} ${item.teamName || ''} ${item.cityName || ''}`
        if (!haystack.toLowerCase().includes(kw)) return false
      }
      return true
    })
    .slice()
    .sort((a, b) => {
      const left = `${a.cityName || ''}${a.teamName || ''}${a.displayName}`
      const right = `${b.cityName || ''}${b.teamName || ''}${b.displayName}`
      return left.localeCompare(right, 'zh-Hans-CN')
    })
})

const total = computed(() => filteredItems.value.length)
const items = computed(() =>
  filteredItems.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)

function selectNotice(notice: NoticeGroup) {
  selectedNotice.value = selectedNotice.value === notice.key ? '' : notice.key
  objectType.value = ''
  cityFilter.value = ''
  keyword.value = ''
  page.value = 1
  if (selectedNotice.value) {
    nextTick(() => {
      document.getElementById('publication-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

function clearNotice() {
  selectedNotice.value = ''
  objectType.value = ''
  cityFilter.value = ''
  keyword.value = ''
  page.value = 1
}

function switchObjectType(value: string) {
  objectType.value = value
  cityFilter.value = ''
  page.value = 1
}

function clearFilters() {
  objectType.value = ''
  cityFilter.value = ''
  keyword.value = ''
  page.value = 1
}

function subtitle(item: PublicCard) {
  if (item.targetType === 'ENROLLMENT') {
    return [item.cityName, item.groupName].filter(Boolean).join(' · ') || '参赛球队'
  }
  return [item.teamName, item.cityName].filter(Boolean).join(' · ') || '—'
}

function countUnit(type: NoticeGroup['type']) {
  return type === 'ENROLLMENT' ? '支球队' : '人'
}

async function load() {
  loading.value = true
  try {
    // 公共接口不返回组别/市州 ID，一次取回后在本地按事项归集、筛选和分页。
    const res = await publicApi.publications({ page: 1, pageSize: 100 })
    allItems.value = res.items
    if (selectedNotice.value && !noticeGroups.value.some((notice) => notice.key === selectedNotice.value)) {
      selectedNotice.value = ''
    }
  } catch {
    allItems.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="publication-page">
    <section class="page-hero">
      <div class="container hero-grid">
        <div>
          <h1>公示查询</h1>
          <p>按公示事项查看参赛资格与人员名单，名单内可按姓名、球队、市州筛选。</p>
        </div>
        <div v-if="!loading" class="hero-stats">
          <div>
            <strong class="num">{{ noticeGroups.length }}</strong>
            <span>正在公示事项</span>
          </div>
          <div>
            <strong class="num">{{ allItems.length }}</strong>
            <span>涉及对象</span>
          </div>
        </div>
      </div>
    </section>

    <div class="container publication-body">
      <section class="notice-section">
        <div class="section-head">
          <div>
            <h2>公示事项</h2>
            <p>按公示类型与组别归集；公示期、批次及依据以组委会正式公告为准。</p>
          </div>
          <span v-if="selectedNotice" class="notice-clear" @click="clearNotice">
            查看全部事项
          </span>
        </div>

        <div v-loading="loading" class="notice-grid">
          <button
            v-for="notice in noticeGroups"
            :key="notice.key"
            type="button"
            class="notice-card"
            :class="{ 'is-active': selectedNotice === notice.key }"
            @click="selectNotice(notice)"
          >
            <span class="notice-card__type">{{ notice.typeLabel }}</span>
            <strong class="notice-card__title">{{ notice.title }}</strong>
            <span class="notice-card__meta">
              正在公示 · 涉及 {{ notice.items.length }} {{ countUnit(notice.type) }} ·
              {{ notice.cities.length }} 个市州
            </span>
            <span class="notice-card__action">
              {{ selectedNotice === notice.key ? '正在查看名单' : '查看名单' }}
              <el-icon><ArrowRight /></el-icon>
            </span>
          </button>

          <el-empty
            v-if="!loading && !noticeGroups.length"
            description="暂无公示事项"
            class="notice-empty"
          />
        </div>
      </section>

      <section id="publication-list" class="list-section">
        <div class="list-head">
          <div>
            <h2>{{ activeNotice ? activeNotice.title : '全部公示名单' }}</h2>
            <p v-if="activeNotice" class="list-sub">
              {{ activeNotice.type === 'ENROLLMENT' ? '参赛球队名单' : '人员名单' }} ·
              共 {{ activeNotice.items.length }} 条
            </p>
          </div>
          <span class="list-count">筛选结果 {{ total }} 条</span>
        </div>

        <div class="list-toolbar">
          <div v-if="!activeNotice" class="object-tabs">
            <button
              v-for="tab in objectTabs"
              :key="tab.value"
              type="button"
              class="object-tab"
              :class="{ 'is-active': objectType === tab.value }"
              @click="switchObjectType(tab.value)"
            >
              {{ tab.label }}
            </button>
          </div>
          <span v-else class="scope-chip">
            公示对象：{{ activeNotice.typeLabel }}
            <button type="button" @click="clearNotice">清除</button>
          </span>

          <div class="list-filters">
            <el-select
              v-model="cityFilter"
              size="large"
              placeholder="全部市州"
              clearable
              class="filter-select"
              @change="page = 1"
            >
              <el-option v-for="city in cityOptions" :key="city" :label="city" :value="city" />
            </el-select>
            <el-input
              v-model="keyword"
              size="large"
              placeholder="搜索姓名或球队"
              :prefix-icon="Search"
              clearable
              class="search"
              @input="page = 1"
            />
            <el-button
              v-if="objectType || cityFilter || keyword"
              link
              type="primary"
              @click="clearFilters"
            >
              清除筛选
            </el-button>
          </div>
        </div>

        <div v-loading="loading" class="list-card">
          <div class="list-row list-row--head">
            <span>名称</span>
            <span>公示对象</span>
            <span>所属球队 / 市州</span>
            <span>组别</span>
            <span>公示状态</span>
          </div>

          <div v-for="item in items" :key="item.publicationId" class="list-row">
            <span class="list-row__person">
              <span class="list-row__avatar">{{ item.displayName.slice(0, 1) }}</span>
              <strong>{{ item.displayName }}</strong>
            </span>
            <span><span class="type-tag">{{ typeLabel(item.targetType) }}</span></span>
            <span class="list-row__sub">{{ subtitle(item) }}</span>
            <span>{{ item.groupName || '—' }}</span>
            <span><StatusTag kind="publication" :status="true" /></span>
          </div>

          <el-empty v-if="!loading && !items.length" description="没有符合条件的公示信息" />
        </div>

        <PaginationBar
          v-model:page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          hide-when-single
        />

        <p class="notice">
          说明：公示信息仅展示经审核确认可公开的内容，身份证号、联系方式等个人信息不会对外展示。
          公示起止日期、批次和对应公告以组委会正式发布文件为准。
        </p>
      </section>
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
  max-width: 680px;
  margin-top: 7px;
  font-size: 14px;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.66);
}

.hero-stats {
  display: flex;
  gap: 26px;
}

.hero-stats div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hero-stats strong {
  font-size: 26px;
  line-height: 1;
  color: var(--lime);
}

.hero-stats span {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.62);
}

.publication-body {
  margin-top: 22px;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.section-head h2,
.list-head h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--ink-900);
}

.section-head p {
  margin-top: 5px;
  font-size: 13px;
  color: var(--ink-500);
}

.notice-clear {
  flex-shrink: 0;
  font-size: 13.5px;
  color: var(--brand-700);
  cursor: pointer;
}

.notice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-height: 120px;
}

.notice-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s, background-color 0.16s;
}

.notice-card:hover {
  border-color: var(--brand-500);
}

.notice-card.is-active {
  border-color: var(--brand-700);
  background: var(--brand-50);
  box-shadow: inset 0 0 0 1px var(--brand-700);
}

.notice-card__type {
  padding: 2px 7px;
  border-radius: 3px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 600;
}

.notice-card.is-active .notice-card__type {
  background: #fff;
}

.notice-card__title {
  font-size: 18px;
  line-height: 1.45;
  color: var(--ink-900);
}

.notice-card__meta {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink-500);
}

.notice-card__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--brand-700);
}

.notice-empty {
  grid-column: 1 / -1;
}

.list-section {
  margin-top: 30px;
  scroll-margin-top: 16px;
}

.list-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.list-sub {
  margin-top: 5px;
  font-size: 13px;
  color: var(--ink-500);
}

.list-count {
  font-size: 13px;
  color: var(--ink-500);
}

.list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 10px 12px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line);
}

.object-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.object-tab {
  min-height: 34px;
  padding: 6px 12px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-size: 13.5px;
  color: var(--ink-500);
  cursor: pointer;
}

.object-tab.is-active {
  background: var(--brand-700);
  color: #fff;
  font-weight: 600;
}

.scope-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 4px;
  background: var(--brand-50);
  font-size: 13px;
  color: var(--brand-800);
}

.scope-chip button {
  border: none;
  background: transparent;
  color: var(--brand-700);
  font-size: 12.5px;
  cursor: pointer;
}

.list-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-select {
  width: 140px;
}

.search {
  width: 210px;
}

.list-card {
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line);
  overflow: hidden;
  min-height: 120px;
}

.list-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) 90px minmax(0, 1.3fr) 100px 110px;
  align-items: center;
  gap: 12px;
  min-height: 62px;
  padding: 10px 20px;
  border-top: 1px solid var(--line);
}

.list-row--head {
  min-height: 44px;
  padding-top: 0;
  padding-bottom: 0;
  border-top: none;
  background: #f7f9f8;
  font-size: 12.5px;
  color: var(--ink-500);
}

.list-row__person {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.list-row__person strong {
  font-size: 16px;
  line-height: 1.45;
  color: var(--ink-900);
}

.list-row__avatar {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-800);
  font-size: 13px;
  font-weight: 700;
}

.type-tag {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 3px;
  background: var(--paper);
  color: var(--ink-700);
  font-size: 12.5px;
}

.list-row__sub {
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink-700);
}

.list-row > span {
  min-width: 0;
}

.list-row > span:not(.list-row__person) {
  font-size: 13.5px;
  color: var(--ink-500);
}

.notice {
  margin-top: 24px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ink-500);
}

@media (max-width: 900px) {
  .notice-grid {
    grid-template-columns: 1fr;
  }

  .list-row {
    grid-template-columns: minmax(0, 1.2fr) 86px minmax(0, 1.2fr) 92px 100px;
    padding: 10px 14px;
  }
}

@media (max-width: 720px) {
  .page-hero {
    padding: 22px 0 20px;
  }

  .page-hero h1 {
    font-size: 23px;
  }

  .hero-grid {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }

  .list-toolbar,
  .list-filters,
  .search {
    width: 100%;
  }

  .filter-select {
    flex: 1;
    width: auto;
  }

  .list-row--head {
    display: none;
  }

  .list-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px 10px;
    padding: 14px;
  }

  .list-row__person {
    grid-column: 1 / 2;
  }

  .list-row > span:nth-child(2) {
    grid-column: 2 / 3;
    text-align: right;
  }

  .list-row__sub {
    grid-column: 1 / -1;
  }

  .list-row > span:nth-child(4) {
    font-size: 12.5px;
  }

  .list-row > span:nth-child(5) {
    grid-column: 2 / 3;
    text-align: right;
  }
}
</style>
