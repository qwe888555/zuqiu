<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { ArrowRight, Calendar, Tickets } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicEvent } from '../../api/types'
import { useAuthStore } from '../../stores/auth'
import { openLoginDialog } from '../../composables/useLoginDialog'
import { canEnroll } from '../../utils/roles'
import {
  EVENT_CATEGORIES,
  eventCategoryLabel,
  normalizeEventCategory,
  type EventCategory,
} from '../../config/labels'
import { fetchAllPages } from '../../utils/asyncPool'

type RegisterState = 'OPEN' | 'UPCOMING' | 'CLOSED' | 'NOT_OPEN'
type CategoryKey = EventCategory | 'UNCATEGORIZED'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const events = ref<PublicEvent[]>([])
const categoryFilter = ref<'' | CategoryKey>('')
const loadError = ref(false)

const lastUpdated = ref('')
const highlightId = computed(() => String(route.query.eventId || ''))

function registrationState(event: PublicEvent): RegisterState {
  if (event.status === 'DRAFT') return 'NOT_OPEN'
  const now = dayjs()
  const opens = event.registrationOpensAt ? dayjs(event.registrationOpensAt) : null
  if (event.status === 'REGISTRATION_OPEN') {
    if (opens && opens.isAfter(now)) return 'UPCOMING'
    if (event.registrationClosesAt && dayjs(event.registrationClosesAt).isBefore(now)) return 'CLOSED'
    return 'OPEN'
  }
  if (event.status === 'REGISTRATION_CLOSED') return 'CLOSED'
  if (event.status === 'RUNNING' || event.status === 'FINISHED') return 'CLOSED'
  return 'NOT_OPEN'
}

const stateMeta: Record<RegisterState, { label: string; tone: string }> = {
  OPEN: { label: '报名中', tone: 'open' },
  UPCOMING: { label: '即将开放', tone: 'upcoming' },
  CLOSED: { label: '已截止', tone: 'closed' },
  NOT_OPEN: { label: '未开放', tone: 'closed' },
}

function categoryKeyOf(event: PublicEvent): CategoryKey {
  return normalizeEventCategory(event.eventCategory) || 'UNCATEGORIZED'
}

/** 展示全部赛事类别，数量全部来自接口数据，未出现的类别显示为 0。 */
const categoryTabs = computed(() => {
  const counts = new Map<CategoryKey, number>()
  for (const event of events.value) {
    const key = categoryKeyOf(event)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const tabs: { value: '' | CategoryKey; label: string; count: number }[] = [
    { value: '', label: '全部赛事', count: events.value.length },
    ...EVENT_CATEGORIES.map((category) => ({
      value: category.value,
      label: category.label,
      count: counts.get(category.value) || 0,
    })),
  ]
  const uncategorized = counts.get('UNCATEGORIZED') || 0
  if (uncategorized) tabs.push({ value: 'UNCATEGORIZED', label: '未分类', count: uncategorized })
  return tabs
})

/** 头部统计只计当前赛事实际出现的类别，不把固定选项数量当成数据。 */
const activeCategoryCount = computed(() => {
  const keys = new Set(events.value.map(categoryKeyOf))
  return (
    EVENT_CATEGORIES.filter((category) => keys.has(category.value)).length +
    (keys.has('UNCATEGORIZED') ? 1 : 0)
  )
})

const visibleEvents = computed(() => {
  const order: Record<RegisterState, number> = { OPEN: 0, UPCOMING: 1, CLOSED: 2, NOT_OPEN: 3 }
  return events.value
    .filter((event) => !categoryFilter.value || categoryKeyOf(event) === categoryFilter.value)
    .slice()
    .sort((a, b) => {
      const stateDiff = order[registrationState(a)] - order[registrationState(b)]
      if (stateDiff !== 0) return stateDiff
      if (a.id === highlightId.value) return -1
      if (b.id === highlightId.value) return 1
      return (a.registrationOpensAt || '').localeCompare(b.registrationOpensAt || '')
    })
})

const openCount = computed(
  () => events.value.filter((event) => registrationState(event) === 'OPEN').length,
)

function formatRange(event: PublicEvent) {
  const start = event.registrationOpensAt
    ? dayjs(event.registrationOpensAt).format('YYYY-MM-DD HH:mm')
    : '待定'
  const end = event.registrationClosesAt
    ? dayjs(event.registrationClosesAt).format('YYYY-MM-DD HH:mm')
    : '待定'
  return `${start} 至 ${end}`
}

async function load() {
  loading.value = true
  loadError.value = false
  try {
    const result = await fetchAllPages(
      (page, pageSize) => publicApi.events({ page, pageSize }),
      100,
      20,
    )
    events.value = result.items
    lastUpdated.value = dayjs().format('HH:mm:ss')
  } catch {
    events.value = []
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function enroll(event: PublicEvent) {
  const redirect = `/console/enrollments/create?eventId=${encodeURIComponent(event.id)}`
  if (!auth.token) {
    openLoginDialog({ redirect, intent: 'enroll' })
    return
  }
  if (canEnroll(auth.roles)) {
    router.push({ name: 'enrollment-create', query: { eventId: event.id } })
    return
  }
  if (auth.roles.some((role) => ['CITY', 'ADMIN'].includes(role))) {
    ElMessage.info('报名由学校端或球队端提交，已为你打开报名单列表')
    router.push({ name: 'enrollments', query: { eventId: event.id } })
    return
  }
  ElMessage.warning('当前账号没有报名权限，请使用学校端或球队端账号报名')
}

onMounted(load)
</script>

<template>
  <div class="registration-page">
    <section class="page-hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          <span class="hero-kicker">REGISTRATION · 赛事报名</span>
          <h1>赛事报名</h1>
          <p>
            按赛事类别查看当前开放的足球赛事。学校端可为本校及分校区球队报名，球队端可直接为本队报名，提交后依次经市州初审、省级终审。
          </p>
        </div>
        <div v-if="!loading" class="hero-stats">
          <div>
            <strong class="num">{{ events.length }}</strong>
            <span>公开赛事</span>
          </div>
          <div>
            <strong class="num">{{ openCount }}</strong>
            <span>报名中</span>
          </div>
          <div>
            <strong class="num">{{ activeCategoryCount }}</strong>
            <span>赛事类别</span>
          </div>
        </div>
      </div>
    </section>

    <div class="container registration-body">
      <section class="flow-card">
        <div class="flow-card__head">
          <h2>报名流程</h2>
          <span v-if="lastUpdated">数据更新于 {{ lastUpdated }}</span>
        </div>
        <ol class="flow-steps">
          <li><strong>选择赛事</strong><span>确认类别、组别与报名开放期</span></li>
          <li><strong>学校 / 球队登录</strong><span>学校端报本校及校区球队，球队端报本队</span></li>
          <li><strong>填报材料</strong><span>球队信息、球员名单与盖章材料</span></li>
          <li><strong>提交审核</strong><span>市州初审通过后进入省级终审</span></li>
        </ol>
        <p class="flow-note">
          报送主体为学校球队：学校端可为本校及分校区球队报名，球队端可直接为本队报名；市州初审、省级终审后生效。
        </p>
      </section>

      <section class="filter-panel">
        <div class="group-tabs" role="tablist" aria-label="按赛事类别筛选">
          <button
            v-for="tab in categoryTabs"
            :key="tab.value || 'ALL'"
            type="button"
            role="tab"
            class="group-tab"
            :class="{ 'is-active': categoryFilter === tab.value, 'is-empty': tab.count === 0 }"
            :aria-selected="categoryFilter === tab.value"
            @click="categoryFilter = tab.value"
          >
            {{ tab.label }}
            <span class="group-tab__count num">{{ tab.count }}</span>
          </button>
        </div>
      </section>

      <section v-loading="loading" class="event-list">
        <article
          v-for="event in visibleEvents"
          :key="event.id"
          class="event-card"
          :class="{ 'is-highlight': event.id === highlightId }"
        >
          <div class="event-card__head">
            <div class="event-card__mark">{{ event.name.slice(0, 1) }}</div>
            <div class="event-card__title">
              <div class="event-card__tags">
                <el-tag size="small" effect="plain">
                  {{ eventCategoryLabel(event.eventCategory, event.eventCategoryLabel) }}
                </el-tag>
                <span class="state-pill" :class="`is-${stateMeta[registrationState(event)].tone}`">
                  {{ stateMeta[registrationState(event)].label }}
                </span>
                <span v-if="event.id === highlightId" class="state-pill is-highlight">来自赛事配置</span>
              </div>
              <h3>{{ event.name }}</h3>
              <p>{{ event.season }}<template v-if="event.description"> · {{ event.description }}</template></p>
            </div>
            <el-button
              type="primary"
              size="large"
              class="event-card__cta"
              :disabled="registrationState(event) !== 'OPEN'"
              @click="enroll(event)"
            >
              <el-icon><Tickets /></el-icon>
              {{ registrationState(event) === 'OPEN' ? '立即报名' : stateMeta[registrationState(event)].label }}
            </el-button>
          </div>

          <div class="event-card__meta">
            <span>
              <el-icon><Calendar /></el-icon>
              报名期：{{ formatRange(event) }}
            </span>
            <span class="event-card__link" @click="router.push(`/matches?eventId=${event.id}`)">
              查看赛程
              <el-icon><ArrowRight /></el-icon>
            </span>
          </div>
        </article>

        <el-empty
          v-if="!loading && !visibleEvents.length"
          :description="loadError ? '赛事信息加载失败，请稍后重试' : '当前类别暂无公开赛事'"
        >
          <el-button v-if="loadError" @click="load">重新加载</el-button>
        </el-empty>
      </section>
    </div>
  </div>
</template>

<style scoped>
.registration-page {
  min-height: 70vh;
  padding-bottom: 56px;
  background: var(--paper);
}

.page-hero {
  padding: 34px 0 38px;
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

.hero-stats {
  display: flex;
  gap: 26px;
  flex-shrink: 0;
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
  color: rgba(255, 255, 255, 0.48);
}

.registration-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-top: 24px;
}

.flow-card {
  padding: 22px 24px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: #fff;
}

.flow-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.flow-card__head h2 {
  font-size: 16px;
  color: var(--ink-900);
}

.flow-card__head span {
  font-size: 11px;
  color: var(--ink-300);
}

.flow-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
  counter-reset: step;
}

.flow-steps li {
  position: relative;
  padding: 12px 14px 12px 42px;
  border-radius: 10px;
  background: var(--paper);
  counter-increment: step;
}

.flow-steps li::before {
  content: counter(step);
  position: absolute;
  left: 13px;
  top: 13px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--brand-700);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.flow-steps strong {
  display: block;
  font-size: 12.5px;
  color: var(--ink-900);
}

.flow-steps span {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ink-500);
}

.flow-note {
  margin-top: 12px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-300);
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

.event-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 180px;
}

.event-card {
  padding: 20px 22px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.event-card:hover {
  border-color: var(--brand-300);
  box-shadow: 0 8px 22px rgba(24, 53, 43, 0.06);
}

.event-card.is-highlight {
  border-color: var(--brand-500);
  box-shadow: 0 0 0 3px var(--brand-50);
}

.event-card__head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.event-card__mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 12px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 16px;
  font-weight: 700;
}

.event-card__title {
  flex: 1;
  min-width: 0;
}

.event-card__tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.state-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
}

.state-pill.is-open {
  background: var(--brand-50);
  color: var(--brand-700);
}

.state-pill.is-upcoming {
  background: #fff6e5;
  color: #a56b00;
}

.state-pill.is-closed {
  background: var(--paper);
  color: var(--ink-300);
}

.state-pill.is-highlight {
  background: #f0f7ff;
  color: #2f6fb0;
}

.event-card__title h3 {
  margin-top: 7px;
  font-size: 17px;
  line-height: 1.4;
  color: var(--ink-900);
}

.event-card__title p {
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-500);
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.event-card__cta {
  flex-shrink: 0;
}

.event-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
  font-size: 11.5px;
  color: var(--ink-500);
}

.event-card__meta > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.event-card__link {
  color: var(--brand-700);
  cursor: pointer;
}

@media (max-width: 900px) {
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

  .flow-steps {
    grid-template-columns: 1fr 1fr;
  }

  .event-card__head {
    flex-wrap: wrap;
  }

  .event-card__cta {
    width: 100%;
  }
}

@media (max-width: 540px) {
  .page-hero {
    padding: 28px 0 26px;
  }

  .hero-stats {
    width: 100%;
    justify-content: space-between;
    gap: 12px;
  }

  .group-tabs {
    width: 100%;
  }

  .group-tab {
    min-height: 32px;
    padding: 0 9px;
    font-size: 12px;
  }

  .flow-steps {
    grid-template-columns: 1fr;
  }

  .event-card__meta {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
