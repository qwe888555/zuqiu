<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { ArrowRight, Refresh } from '@element-plus/icons-vue'
import { meApi } from '../../api'
import type { Message as MessageItem } from '../../api/types'
import { useAppStore } from '../../stores/app'
import { useMessageLink } from '../../composables/useMessageLink'
import PageHeader from '../../components/common/PageHeader.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'

type CategoryKey = 'ALL' | 'REVIEW' | 'MATERIAL' | 'MATCH' | 'PUBLICATION' | 'SYSTEM'
type ViewKey = 'PENDING' | 'UNREAD' | 'ALL'

interface Category {
  key: CategoryKey
  label: string
}

const categories: Category[] = [
  { key: 'ALL', label: '全部分类' },
  { key: 'REVIEW', label: '审核结果' },
  { key: 'MATERIAL', label: '材料提醒' },
  { key: 'MATCH', label: '赛程变更' },
  { key: 'PUBLICATION', label: '公示通知' },
  { key: 'SYSTEM', label: '系统' },
]

const router = useRouter()
const app = useAppStore()
const { linkFor } = useMessageLink()

const loading = ref(false)
const rows = ref<MessageItem[]>([])
const activeCategory = ref<CategoryKey>('ALL')
const activeView = ref<ViewKey>('PENDING')
const page = ref(1)
const pageSize = 12

function categoryOf(type?: string): CategoryKey {
  switch ((type || 'SYSTEM').toUpperCase()) {
    case 'ENROLLMENT':
    case 'REVIEW':
      return 'REVIEW'
    case 'MATERIAL':
      return 'MATERIAL'
    case 'MATCH':
      return 'MATCH'
    case 'PUBLICATION':
      return 'PUBLICATION'
    default:
      return 'SYSTEM'
  }
}

const typeLabel: Record<string, string> = {
  ENROLLMENT: '报名',
  REVIEW: '审核',
  MATERIAL: '材料',
  MATCH: '赛程',
  PUBLICATION: '公示',
  IDENTITY: '身份核验',
  SELECTION: '遴选',
  SYSTEM: '系统',
}

/** 当前视图下一条消息是否应出现；分类计数和列表共用同一口径。 */
function matchesActiveView(item: MessageItem) {
  if (activeView.value === 'PENDING') return Boolean(linkFor(item))
  if (activeView.value === 'UNREAD') return !item.read
  return true
}

// 分类计数跟随当前视图，避免在“未读”里看到“全部”的数量。
const categoryCounts = computed(() => {
  const counts: Record<CategoryKey, number> = {
    ALL: 0,
    REVIEW: 0,
    MATERIAL: 0,
    MATCH: 0,
    PUBLICATION: 0,
    SYSTEM: 0,
  }
  rows.value.forEach((item) => {
    if (!matchesActiveView(item)) return
    counts.ALL += 1
    counts[categoryOf(item.businessType)] += 1
  })
  return counts
})

const unreadCount = computed(() => rows.value.filter((item) => !item.read).length)
const pendingCount = computed(() => rows.value.filter((item) => Boolean(linkFor(item))).length)

const views = computed(() => [
  { key: 'PENDING' as ViewKey, label: '待处理', count: pendingCount.value },
  { key: 'UNREAD' as ViewKey, label: '未读', count: unreadCount.value },
  { key: 'ALL' as ViewKey, label: '全部', count: rows.value.length },
])

function inCategory(item: MessageItem) {
  return activeCategory.value === 'ALL' || categoryOf(item.businessType) === activeCategory.value
}

function dueAtOf(item: MessageItem) {
  return item.dueAt && Boolean(linkFor(item)) ? dayjs(item.dueAt) : null
}

function dueInfo(item: MessageItem) {
  const due = dueAtOf(item)
  if (!due) return null
  const diffDays = due.startOf('day').diff(dayjs().startOf('day'), 'day')
  const overdue = diffDays < 0
  return {
    overdue,
    urgent: overdue || diffDays <= 1,
    text: overdue
      ? `已逾期 ${Math.abs(diffDays)} 天`
      : diffDays === 0
        ? '今日截止'
        : `剩余 ${diffDays} 天`,
    date: due.format('MM-DD HH:mm'),
  }
}

const filteredRows = computed(() => {
  const list = rows.value.filter((item) => {
    if (!inCategory(item)) return false
    return matchesActiveView(item)
  })

  // 待处理按截止时间升序，未设截止时间的排在后面；其余视图按时间倒序。
  if (activeView.value === 'PENDING') {
    return [...list].sort((a, b) => {
      const aDue = a.dueAt ? dayjs(a.dueAt).valueOf() : Number.MAX_SAFE_INTEGER
      const bDue = b.dueAt ? dayjs(b.dueAt).valueOf() : Number.MAX_SAFE_INTEGER
      if (aDue !== bDue) return aDue - bDue
      return (b.createdAt || '').localeCompare(a.createdAt || '')
    })
  }
  return [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
})

const pagedRows = computed(() =>
  filteredRows.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)

const emptyText = computed(() => {
  if (activeView.value === 'UNREAD') return '没有未读消息'
  if (activeView.value === 'PENDING') return '当前没有需要处理的消息'
  return activeCategory.value === 'ALL' ? '暂无消息' : '该分类暂无消息'
})

async function load() {
  loading.value = true
  try {
    // 收件箱需要跨分类统计与本地分页，因此按页拉全量，最多 5 页（500 条）。
    const collected: MessageItem[] = []
    let currentPage = 1
    let total = 0
    do {
      const res = await meApi.messages({ page: currentPage, pageSize: 100 })
      collected.push(...res.items)
      total = res.total
      currentPage += 1
      if (!res.items.length) break
    } while (collected.length < total && currentPage <= 5)

    rows.value = collected
    app.unreadCount = rows.value.filter((item) => !item.read).length

    if (page.value > 1 && !pagedRows.value.length) page.value = 1
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function markRead(item: MessageItem) {
  if (item.read) return
  try {
    await meApi.readMessage(item.id)
    item.read = true
    item.readAt = new Date().toISOString()
    app.unreadCount = Math.max(0, app.unreadCount - 1)

    const maxPage = Math.max(1, Math.ceil(filteredRows.value.length / pageSize))
    if (page.value > maxPage) page.value = maxPage
  } catch {
    // 拦截器提示
  }
}

function selectCategory(key: CategoryKey) {
  activeCategory.value = key
  page.value = 1
}

function selectView(key: ViewKey) {
  if (activeView.value === key) return
  activeView.value = key
  page.value = 1
}

async function refresh() {
  await load()
  ElMessage.success('消息已刷新')
}

async function openBusiness(item: MessageItem) {
  const link = linkFor(item)
  if (!link) return
  if (!item.read) await markRead(item)
  router.push(link.path)
}

onMounted(load)
</script>

<template>
  <div class="page message-page">
    <PageHeader
      title="消息中心"
      description="审核结果、材料提醒、赛程变更与公示通知统一汇总。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="refresh">刷新</el-button>
      </template>
    </PageHeader>

    <section class="page-card mailbox">
      <header class="mailbox-head">
        <div class="view-tabs" role="tablist" aria-label="消息视图">
          <button
            v-for="view in views"
            :key="view.key"
            type="button"
            role="tab"
            class="view-tab"
            :class="{ 'is-active': activeView === view.key }"
            :aria-selected="activeView === view.key"
            @click="selectView(view.key)"
          >
            {{ view.label }}
            <span class="view-tab__count num">{{ view.count }}</span>
          </button>
        </div>

        <nav class="category-nav" aria-label="消息分类">
          <button
            v-for="category in categories"
            :key="category.key"
            type="button"
            class="category-link"
            :class="{
              'is-active': activeCategory === category.key,
              'is-empty': categoryCounts[category.key] === 0,
            }"
            :aria-pressed="activeCategory === category.key"
            @click="selectCategory(category.key)"
          >
            {{ category.label }}
            <span class="category-link__count num">{{ categoryCounts[category.key] }}</span>
          </button>
        </nav>
      </header>

      <div class="mailbox-body">
        <div v-loading="loading" class="message-list">
          <article
            v-for="item in pagedRows"
            :key="item.id"
            class="message-item"
            :class="{ 'is-unread': !item.read }"
          >
            <div
              class="message-item__main"
              :role="item.read ? undefined : 'button'"
              :tabindex="item.read ? undefined : 0"
              :aria-label="item.read ? undefined : `标记为已读：${item.title}`"
              @click="item.read ? undefined : markRead(item)"
              @keydown.enter.prevent="item.read ? undefined : markRead(item)"
              @keydown.space.prevent="item.read ? undefined : markRead(item)"
            >
              <span class="message-item__dot" :class="{ 'is-unread': !item.read }" aria-hidden="true" />
              <span class="message-item__body">
                <span class="message-item__top">
                  <span
                    class="message-item__tag"
                    :class="`is-${categoryOf(item.businessType).toLowerCase()}`"
                  >
                    {{ typeLabel[(item.businessType || 'SYSTEM').toUpperCase()] || '系统' }}
                  </span>
                  <small class="message-item__time">
                    {{ dayjs(item.createdAt).format('MM-DD HH:mm') }}
                  </small>
                </span>
                <strong class="message-item__title">{{ item.title }}</strong>
                <span class="message-item__text">{{ item.body || '无详细内容' }}</span>
                <span
                  v-if="dueInfo(item)"
                  class="message-item__due"
                  :class="{ 'is-urgent': dueInfo(item)?.urgent }"
                >
                  <span v-if="dueInfo(item)?.overdue" class="message-item__due-flag">已逾期</span>
                  截止 {{ dueInfo(item)?.date }} · {{ dueInfo(item)?.text }}
                </span>
              </span>
            </div>

            <div v-if="linkFor(item)" class="message-item__side">
              <button
                type="button"
                class="message-item__action"
                :class="{ 'is-primary': Boolean(dueAtOf(item)) }"
                @click.stop="openBusiness(item)"
              >
                {{ linkFor(item)?.label }}
                <el-icon><ArrowRight /></el-icon>
              </button>
            </div>
          </article>

          <el-empty v-if="!loading && !pagedRows.length" :description="emptyText" :image-size="70">
            <el-button v-if="activeView !== 'ALL'" plain size="small" @click="selectView('ALL')">
              查看全部消息
            </el-button>
            <el-button
              v-else-if="activeCategory !== 'ALL'"
              plain
              size="small"
              @click="selectCategory('ALL')"
            >
              查看全部分类
            </el-button>
          </el-empty>
        </div>

        <div class="mailbox-pagination">
          <PaginationBar
            v-model:page="page"
            :page-size="pageSize"
            :total="filteredRows.length"
            layout="prev, pager, next"
            small
            hide-when-single
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mailbox {
  padding: 0;
  overflow: hidden;
}

.mailbox-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 14px 20px 12px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.view-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--paper);
}

.view-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ink-500);
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.view-tab:hover {
  color: var(--ink-700);
}

.view-tab.is-active {
  background: #fff;
  color: var(--brand-800);
  box-shadow: 0 1px 3px rgba(20, 42, 30, 0.1);
}

.view-tab__count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(20, 42, 30, 0.06);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  color: var(--ink-500);
}

.view-tab.is-active .view-tab__count {
  background: var(--brand-50);
  color: var(--brand-800);
}

.category-nav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  width: 100%;
  min-width: 0;
}

.category-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 12.5px;
  color: var(--ink-500);
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.category-link:hover {
  background: var(--paper);
  color: var(--ink-900);
}

.category-link.is-active {
  background: var(--brand-50);
  color: var(--brand-800);
  font-weight: 600;
}

.category-link.is-empty {
  color: var(--ink-300);
}

.category-link__count {
  font-size: 10.5px;
  font-weight: 400;
  color: var(--ink-300);
}

.category-link.is-active .category-link__count {
  color: var(--brand-600);
}

.mailbox-body {
  padding: 12px 20px 18px;
}

.message-list {
  display: flex;
  flex-direction: column;
  min-height: 180px;
}

.message-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 13px 12px;
  border-bottom: 1px solid var(--line);
  border-radius: 8px;
  transition: background 0.15s;
}

.message-item:last-of-type {
  border-bottom: none;
}

.message-item:hover {
  background: var(--paper);
}

.message-item__main {
  display: flex;
  flex: 1;
  gap: 10px;
  min-width: 0;
}

.message-item.is-unread .message-item__main {
  cursor: pointer;
}

.message-item__main:focus-visible {
  outline: 2px solid var(--brand-500);
  outline-offset: 3px;
  border-radius: 6px;
}

.message-item__dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  margin-top: 8px;
  border-radius: 50%;
  background: transparent;
}

.message-item__dot.is-unread {
  background: var(--live);
  box-shadow: 0 0 0 3px rgba(181, 71, 8, 0.1);
}

.message-item__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.message-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.message-item__tag {
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--paper);
  font-size: 10px;
  font-weight: 600;
  color: var(--ink-500);
}

.message-item__tag.is-review {
  background: #fdf5e7;
  color: #9a6a12;
}

.message-item__tag.is-material {
  background: #fbeee9;
  color: #a94f34;
}

.message-item__tag.is-match {
  background: var(--live-soft);
  color: var(--live);
}

.message-item__tag.is-publication {
  background: #edf3fe;
  color: #3f6fce;
}

.message-item__time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--ink-300);
}

.message-item__title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--ink-700);
}

.message-item.is-unread .message-item__title {
  font-weight: 600;
  color: var(--ink-900);
}

.message-item__text {
  font-size: 12px;
  line-height: 1.65;
  color: var(--ink-500);
  overflow-wrap: anywhere;
}

.message-item__due {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 1px;
  font-size: 11px;
  color: var(--ink-500);
}

.message-item__due.is-urgent {
  color: #a94f34;
  font-weight: 600;
}

.message-item__due-flag {
  padding: 0 5px;
  border-radius: 4px;
  background: rgba(169, 79, 52, 0.1);
  font-size: 10px;
  line-height: 16px;
}

.message-item__side {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.message-item__action {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 5px 7px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--brand-700);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.message-item__action:hover {
  background: var(--brand-50);
  color: var(--brand-800);
}

/* 有截止时间的待办才使用实心按钮，纯通知保持文字链接的轻量层级 */
.message-item__action.is-primary {
  padding: 5px 12px;
  border-color: var(--brand-100);
  background: var(--brand-50);
  color: var(--brand-800);
}

.message-item__action.is-primary:hover {
  border-color: var(--brand-500);
  background: #fff;
}

@media (max-width: 760px) {
  .mailbox-head {
    padding: 12px 14px 10px;
  }

  .mailbox-body {
    padding: 10px 14px 16px;
  }

  .message-item {
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 10px;
  }

  .message-item__side {
    width: 100%;
    padding-left: 17px;
    justify-content: flex-end;
  }

  .message-item__action {
    min-height: 30px;
  }
}
</style>
