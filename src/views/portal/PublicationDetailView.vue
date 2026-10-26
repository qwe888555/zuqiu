<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Search } from '@element-plus/icons-vue'
import { publicityApi } from '../../api/selection'
import type { PublicityRecord } from '../../api/types'
import PaginationBar from '../../components/common/PaginationBar.vue'
import {
  groupPublications,
  publicationCountUnit,
  publicationSubtitle,
} from '../../utils/publications'

const route = useRoute()

const loading = ref(false)
const allItems = ref<PublicityRecord[]>([])
const keyword = ref('')
const objectType = ref('')
const cityFilter = ref('')
const page = ref(1)
const pageSize = 12

const noticeKey = computed(() => {
  const raw = String(route.params.id || '')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
})

const [noticeEventId, noticeType, noticeGroupType] = noticeKey.value.split('|')

const notices = computed(() => groupPublications(allItems.value))
const notice = computed(() => notices.value.find((item) => item.key === noticeKey.value) || null)

const objectTabs = computed(() => {
  if (notice.value?.type === 'ENROLLMENT') {
    return [{ label: '参赛球队', value: 'TEAM' }]
  }
  return [
    { label: '全部对象', value: '' },
    { label: '运动员', value: 'ATHLETE' },
    { label: '教练员', value: 'COACH' },
  ]
})

const cityOptions = computed(() => [
  ...new Set(notice.value?.items.map((item) => item.city).filter(Boolean) as string[]),
])

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return (notice.value?.items || [])
    .filter((item) => {
      if (objectType.value && item.publicityType !== objectType.value) return false
      if (cityFilter.value && item.city !== cityFilter.value) return false
      if (kw) {
        const haystack = `${item.name} ${item.teamName || ''} ${item.city || ''}`
        if (!haystack.toLowerCase().includes(kw)) return false
      }
      return true
    })
    .slice()
    .sort((a, b) => {
      const left = `${a.city || ''}${a.teamName || ''}${a.name}`
      const right = `${b.city || ''}${b.teamName || ''}${b.name}`
      return left.localeCompare(right, 'zh-Hans-CN')
    })
})

const total = computed(() => filtered.value.length)
const items = computed(() =>
  filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)

function typeLabel(type: string) {
  return type === 'ATHLETE' ? '运动员' : type === 'COACH' ? '教练员' : '参赛球队'
}

function clearFilters() {
  objectType.value = ''
  cityFilter.value = ''
  keyword.value = ''
  page.value = 1
}

function resetPage() {
  page.value = 1
}

onMounted(async () => {
  if (!noticeEventId) return
  loading.value = true
  try {
    const res = await publicityApi.list({
      eventId: noticeEventId,
      publicityType: (noticeType as 'ATHLETE' | 'COACH' | 'TEAM') || undefined,
      groupType: (noticeGroupType as PublicityRecord['groupType']) || undefined,
      page: 1,
      size: 500,
    })
    allItems.value = res.items
  } catch {
    allItems.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="publication-detail">
    <section class="detail-hero">
      <div class="container">
        <nav class="crumbs" aria-label="面包屑">
          <router-link to="/">首页</router-link>
          <span>/</span>
          <router-link to="/publications">公示查询</router-link>
          <span>/</span>
          <span class="crumbs__current">{{ notice?.title || '公示详情' }}</span>
        </nav>

        <div v-if="notice" class="hero-main">
          <div class="hero-copy">
            <div class="hero-tags">
              <span class="type-tag">{{ notice.typeLabel }}</span>
              <span class="group-tag">{{ notice.groupName }}</span>
            </div>
            <h1>{{ notice.title }}</h1>
            <p>
              本页展示该组别下经审核确认可公开的{{ notice.type === 'ENROLLMENT' ? '参赛球队' : '人员' }}信息。
              公示期、批次及入选依据以组委会正式发布的公告为准。
            </p>
            <router-link to="/publications" class="back-link">
              <el-icon><ArrowLeft /></el-icon>
              返回公示查询
            </router-link>
          </div>

          <div class="hero-stats">
            <div>
              <strong class="num">{{ notice.items.length }}</strong>
              <span>{{ publicationCountUnit(notice.type) }}</span>
            </div>
            <div>
              <strong class="num">{{ notice.cities.length }}</strong>
              <span>个市州</span>
            </div>
            <div>
              <strong class="num">{{ notice.groupName }}</strong>
              <span>所属组别</span>
            </div>
          </div>
        </div>

        <div v-else-if="!loading" class="hero-main hero-main--empty">
          <h1>未找到该公示事项</h1>
          <p>该公示可能已撤回或调整，请返回公示查询查看当前有效事项。</p>
          <router-link to="/publications" class="back-link">
            <el-icon><ArrowLeft /></el-icon>
            返回公示查询
          </router-link>
        </div>
      </div>
    </section>

    <div v-if="notice" class="container detail-body">
      <section class="list-panel">
        <header class="list-head">
          <div>
            <h2>{{ notice.type === 'ENROLLMENT' ? '参赛球队名单' : '公示人员名单' }}</h2>
            <p>共 {{ notice.items.length }} 条公开信息，可按对象、市州或名称筛选。</p>
          </div>
          <span class="result-count">筛选结果 {{ total }} 条</span>
        </header>

        <div class="toolbar">
          <div class="object-tabs">
            <button
              v-for="tab in objectTabs"
              :key="tab.value"
              type="button"
              class="object-tab"
              :class="{ 'is-active': objectType === tab.value }"
              @click="objectType = tab.value; resetPage()"
            >
              {{ tab.label }}
            </button>
          </div>

          <div class="filters">
            <el-select
              v-model="cityFilter"
              size="large"
              placeholder="全部市州"
              clearable
              class="filter-select"
              @change="resetPage"
            >
              <el-option v-for="city in cityOptions" :key="city" :label="city" :value="city" />
            </el-select>
            <el-input
              v-model="keyword"
              size="large"
              placeholder="搜索姓名或球队"
              :prefix-icon="Search"
              clearable
              class="filter-search"
              @input="resetPage"
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
          </div>

          <div v-for="item in items" :key="item.id" class="list-row">
            <span class="person">
              <span class="person__avatar">{{ item.name.slice(0, 1) }}</span>
              <strong>{{ item.name }}</strong>
            </span>
            <span><span class="row-type">{{ typeLabel(item.publicityType) }}</span></span>
            <span class="row-sub">{{ publicationSubtitle(item) }}</span>
            <span>{{ item.groupTypeLabel || '—' }}</span>
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
      </section>

      <aside class="detail-aside">
        <div class="aside-card">
          <span class="aside-kicker">NOTICE GUIDE</span>
          <h3>怎么看这份公示</h3>
          <ol>
            <li>先确认组别与公示类型是否与参赛项目一致。</li>
            <li>用姓名、球队或市州筛选，核对名单中的信息。</li>
            <li>如需申诉或更正，按正式公告中的渠道联系组委会。</li>
          </ol>
        </div>
        <div class="aside-note">
          <strong>信息公开说明</strong>
          <p>仅展示经审核确认可公开的内容，身份证号、联系方式等个人信息不会对外展示。</p>
        </div>
      </aside>

    </div>

    <div v-else-if="loading" class="container detail-loading" v-loading="loading" />
  </div>
</template>

<style scoped>
.publication-detail {
  min-height: 70vh;
  padding-bottom: 64px;
  background: var(--paper);
}

.detail-hero {
  padding: 20px 0 30px;
  background: var(--brand-900);
  color: #fff;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.45);
}

.crumbs a:hover {
  color: #fff;
}

.crumbs__current {
  overflow: hidden;
  max-width: 50vw;
  color: rgba(255, 255, 255, 0.72);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero-main {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 36px;
  margin-top: 28px;
}

.hero-copy {
  min-width: 0;
}

.hero-tags {
  display: flex;
  align-items: center;
  gap: 7px;
}

.type-tag {
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--lime);
  color: var(--brand-900);
  font-size: 10.5px;
  font-weight: 700;
}

.group-tag {
  padding: 3px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.7);
}

.hero-copy h1 {
  margin-top: 14px;
  font-size: clamp(25px, 3vw, 36px);
  font-weight: 700;
  line-height: 1.35;
}

.hero-copy p {
  max-width: 700px;
  margin-top: 12px;
  font-size: 13.5px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.6);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 18px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lime);
}

.hero-stats {
  display: flex;
  gap: 34px;
  flex-shrink: 0;
}

.hero-stats div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hero-stats strong {
  font-size: 21px;
  font-weight: 700;
  line-height: 1.1;
  color: #fff;
}

.hero-stats span {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
}

.hero-main--empty {
  align-items: flex-start;
  flex-direction: column;
  gap: 10px;
  padding: 16px 0 8px;
}

.hero-main--empty p {
  font-size: 13.5px;
  color: rgba(255, 255, 255, 0.6);
}

.detail-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  align-items: start;
  gap: 20px;
  margin-top: 22px;
}

.list-panel {
  min-width: 0;
  padding: 20px 22px 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}

.list-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.list-head h2 {
  font-size: 20px;
  font-weight: 700;
  color: var(--ink-900);
}

.list-head p {
  margin-top: 5px;
  font-size: 12.5px;
  color: var(--ink-500);
}

.result-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--ink-500);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.object-tabs {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 6px;
  background: var(--paper);
}

.object-tab {
  min-height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 12.5px;
  color: var(--ink-500);
  cursor: pointer;
}

.object-tab.is-active {
  background: #fff;
  color: var(--brand-800);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(24, 53, 43, 0.1);
}

.filters {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.filter-select {
  width: 150px;
}

.filter-search {
  width: 220px;
}

.list-card {
  min-height: 180px;
}

.list-row {
  display: grid;
  grid-template-columns: minmax(160px, 1.2fr) 100px minmax(180px, 1.4fr) 120px;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  color: var(--ink-700);
}

.list-row:last-child {
  border-bottom: none;
}

.list-row--head {
  min-height: 38px;
  margin-top: 4px;
  border-bottom: 1px solid var(--line-strong);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-300);
}

.person {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.person__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 11px;
  font-weight: 700;
}

.person strong {
  overflow: hidden;
  color: var(--ink-900);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.row-type {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 3px;
  background: var(--paper);
  font-size: 11px;
  color: var(--ink-500);
}

.row-sub {
  overflow: hidden;
  font-size: 12.5px;
  color: var(--ink-500);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.detail-aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.aside-card {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}

.aside-kicker {
  font-family: var(--font-display);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--brand-600);
}

.aside-card h3 {
  margin-top: 8px;
  font-size: 15px;
  color: var(--ink-900);
}

.aside-card ol {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 12px 0 0;
  padding-left: 17px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-500);
}

.aside-card li::marker {
  color: var(--brand-500);
  font-weight: 700;
}

.aside-note {
  padding: 16px;
  border-radius: 10px;
  background: var(--brand-50);
}

.aside-note strong {
  font-size: 12px;
  color: var(--brand-800);
}

.aside-note p {
  margin-top: 6px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.detail-loading {
  min-height: 240px;
}

@media (max-width: 1020px) {
  .detail-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .detail-aside {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero-main {
    align-items: flex-start;
    flex-direction: column;
    gap: 22px;
  }
}

@media (max-width: 760px) {
  .detail-hero {
    padding-bottom: 24px;
  }

  .hero-stats {
    gap: 24px;
  }

  .hero-stats strong {
    font-size: 19px;
  }

  .list-panel {
    padding: 16px 14px 4px;
  }

  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .object-tabs {
    width: fit-content;
  }

  .filters {
    width: 100%;
    margin-left: 0;
  }

  .filter-select {
    width: 120px;
  }

  .filter-search {
    flex: 1;
    width: auto;
  }

  .list-row--head {
    display: none;
  }

  .list-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px 10px;
    padding: 12px 2px;
  }

  .person {
    grid-column: 1;
  }

  .list-row > span:nth-child(2) {
    grid-column: 2;
    justify-self: end;
  }

  .row-sub {
    grid-column: 1 / -1;
    padding-left: 42px;
  }

  .list-row > span:nth-child(4) {
    display: none;
  }

  .detail-aside {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
