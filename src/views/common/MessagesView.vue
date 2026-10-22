<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { ArrowDown, ArrowRight, Refresh } from '@element-plus/icons-vue'
import { meApi } from '../../api'
import type { Message as MessageItem } from '../../api/types'
import { useAppStore } from '../../stores/app'
import { useMessageLink } from '../../composables/useMessageLink'
import PageHeader from '../../components/common/PageHeader.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'

type CategoryKey = 'ALL' | 'REVIEW' | 'MATERIAL' | 'MATCH' | 'PUBLICATION' | 'SYSTEM'

interface Category {
  key: CategoryKey
  label: string
  hint: string
}

const categories: Category[] = [
  { key: 'ALL', label: '全部', hint: '所有业务通知' },
  { key: 'REVIEW', label: '审核结果', hint: '报名审核、终审结论与退回原因' },
  { key: 'MATERIAL', label: '材料提醒', hint: '材料缺失、补交与退回提醒' },
  { key: 'MATCH', label: '赛程变更', hint: '比赛时间、场地与开赛状态调整' },
  { key: 'PUBLICATION', label: '公示通知', hint: '公示发布、异议与结果提醒' },
  { key: 'SYSTEM', label: '系统', hint: '身份核验、遴选及平台通知' },
]

const router = useRouter()
const app = useAppStore()
const { linkFor } = useMessageLink()

const loading = ref(false)
const rows = ref<MessageItem[]>([])
const activeCategory = ref<CategoryKey>('ALL')
const unreadOnly = ref(false)
const page = ref(1)
const pageSize = 12
const expandedId = ref('')

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

const activeCategoryMeta = computed(
  () => categories.find((item) => item.key === activeCategory.value) || categories[0],
)

const categoryCounts = computed(() => {
  const counts: Record<CategoryKey, number> = {
    ALL: rows.value.length,
    REVIEW: 0,
    MATERIAL: 0,
    MATCH: 0,
    PUBLICATION: 0,
    SYSTEM: 0,
  }
  rows.value.forEach((item) => {
    counts[categoryOf(item.businessType)] += 1
  })
  return counts
})

const categoryUnread = computed(() => {
  const counts: Record<CategoryKey, number> = {
    ALL: 0,
    REVIEW: 0,
    MATERIAL: 0,
    MATCH: 0,
    PUBLICATION: 0,
    SYSTEM: 0,
  }
  rows.value.forEach((item) => {
    if (item.read) return
    counts.ALL += 1
    counts[categoryOf(item.businessType)] += 1
  })
  return counts
})

const unreadCount = computed(() => rows.value.filter((item) => !item.read).length)
const actionableUnread = computed(
  () => rows.value.filter((item) => !item.read && Boolean(linkFor(item))).length,
)

const filteredRows = computed(() =>
  rows.value.filter(
    (item) =>
      (activeCategory.value === 'ALL' || categoryOf(item.businessType) === activeCategory.value) &&
      // 展开中的消息即使刚刚标为已读也保留在“仅看未读”列表里，收起后才移除。
      (!unreadOnly.value || !item.read || item.id === expandedId.value),
  ),
)

const pagedRows = computed(() =>
  filteredRows.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)

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

    rows.value = collected.sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''),
    )
    app.unreadCount = rows.value.filter((item) => !item.read).length

    if (expandedId.value && !rows.value.some((item) => item.id === expandedId.value)) {
      expandedId.value = ''
    }
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

    // 读完后当前消息可能从“仅未读”列表消失，但详情保持打开，避免阅读被打断。
    const maxPage = Math.max(1, Math.ceil(filteredRows.value.length / pageSize))
    if (page.value > maxPage) page.value = maxPage
  } catch {
    // 拦截器提示
  }
}

async function toggleMessage(item: MessageItem) {
  if (expandedId.value === item.id) {
    expandedId.value = ''
    return
  }
  expandedId.value = item.id
  await markRead(item)
}

function selectCategory(key: CategoryKey) {
  activeCategory.value = key
  page.value = 1
  expandedId.value = ''
}

function toggleUnreadOnly(value: boolean) {
  unreadOnly.value = value
  page.value = 1
  expandedId.value = ''
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
      description="审核结果、材料退回、赛程变更与公示通知统一汇总。点击消息查看详情，可直接进入对应业务页面处理。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="refresh">刷新</el-button>
      </template>
    </PageHeader>

    <section class="page-card mailbox">
      <header class="mailbox-head">
        <div class="mailbox-toolbar">
          <div class="filter-field">
            <span class="filter-field__label">消息分类</span>
            <el-select
              v-model="activeCategory"
              size="large"
              class="category-select"
              aria-label="消息分类"
              @change="selectCategory"
            >
              <el-option
                v-for="category in categories"
                :key="category.key"
                :label="`${category.label}（${categoryCounts[category.key]} 条${
                  categoryUnread[category.key] ? ` · ${categoryUnread[category.key]} 未读` : ''
                }）`"
                :value="category.key"
              />
            </el-select>
          </div>
          <span class="category-hint">{{ activeCategoryMeta.hint }}</span>

          <div class="mailbox-head__filters">
            <span class="mailbox-summary">
              共 {{ rows.length }} 条 · <em>{{ unreadCount }}</em> 条未读
              <template v-if="actionableUnread"> · {{ actionableUnread }} 条可处理</template>
            </span>
            <el-switch
              :model-value="unreadOnly"
              active-text="仅看未读"
              @update:model-value="(value: string | number | boolean) => toggleUnreadOnly(Boolean(value))"
            />
          </div>
        </div>
      </header>

      <div class="mailbox-body">
        <div v-loading="loading" class="message-list">
          <article
            v-for="item in pagedRows"
            :key="item.id"
            class="message-item"
            :class="{ 'is-expanded': expandedId === item.id, 'is-unread': !item.read }"
          >
            <button type="button" class="message-item__main" @click="toggleMessage(item)">
              <span class="message-item__dot" :class="{ 'is-unread': !item.read }" />
              <span class="message-item__body">
                <span class="message-item__top">
                  <span
                    class="message-item__tag"
                    :class="`is-${categoryOf(item.businessType).toLowerCase()}`"
                  >
                    {{ typeLabel[(item.businessType || 'SYSTEM').toUpperCase()] || '系统' }}
                  </span>
                  <small>{{ dayjs(item.createdAt).format('YYYY-MM-DD HH:mm') }}</small>
                </span>
                <strong class="message-item__title">{{ item.title }}</strong>
                <span class="message-item__preview">{{ item.body || '无详细内容' }}</span>
                <span v-if="!item.read || linkFor(item)" class="message-item__meta">
                  <span v-if="!item.read" class="message-item__unread">未读</span>
                  <span v-if="linkFor(item)" class="message-item__jump">
                    可处理
                    <el-icon><ArrowRight /></el-icon>
                  </span>
                </span>
              </span>
              <el-icon class="message-item__chevron"><ArrowDown /></el-icon>
            </button>

            <div v-if="expandedId === item.id" class="message-item__detail">
              <p>{{ item.body || '该消息暂无详细内容。' }}</p>
              <footer v-if="linkFor(item)" class="message-item__actions">
                <el-button type="primary" @click="openBusiness(item)">
                  {{ linkFor(item)?.label }}
                  <el-icon class="el-icon--right"><ArrowRight /></el-icon>
                </el-button>
              </footer>
            </div>
          </article>

          <el-empty
            v-if="!loading && !pagedRows.length"
            :description="unreadOnly ? '没有未读消息' : '该分类暂无消息'"
            :image-size="70"
          >
            <el-button v-if="unreadOnly" plain size="small" @click="toggleUnreadOnly(false)">
              查看全部消息
            </el-button>
            <el-button
              v-else-if="activeCategory !== 'ALL'"
              plain
              size="small"
              @click="selectCategory('ALL')"
            >
              查看全部消息
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
  padding: 14px 20px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.mailbox-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.filter-field__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-700);
  white-space: nowrap;
}

.category-select {
  width: 210px;
}

.category-hint {
  font-size: 11px;
  color: var(--ink-300);
}

.mailbox-head__filters {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-left: auto;
  flex-wrap: wrap;
}

.mailbox-summary {
  font-size: 11.5px;
  color: var(--ink-500);
}

.mailbox-summary em {
  font-style: normal;
  font-weight: 700;
  color: var(--live);
}

.mailbox-body {
  padding: 16px 20px 18px;
}

.message-list {
  display: flex;
  flex-direction: column;
  min-height: 180px;
}

.message-item {
  overflow: hidden;
  border-bottom: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
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
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 15px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.message-item__chevron {
  flex-shrink: 0;
  align-self: center;
  margin-left: 4px;
  color: var(--ink-300);
  transition: transform 0.16s;
}

.message-item.is-expanded .message-item__chevron {
  transform: rotate(180deg);
}

.message-item__dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  margin-top: 7px;
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
  gap: 4px;
  min-width: 0;
}

.message-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.message-item__tag {
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--paper);
  font-size: 9.5px;
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

.message-item__top small {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--ink-300);
}

.message-item__title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--ink-700);
}

.message-item.is-unread .message-item__title {
  font-weight: 700;
  color: var(--ink-900);
}

.message-item__preview {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--ink-300);
}

.message-item__meta {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 2px;
}

.message-item__unread {
  font-size: 10px;
  font-weight: 700;
  color: var(--live);
}

.message-item__jump {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  font-size: 9.5px;
  color: var(--brand-600);
}

.message-item.is-expanded .message-item__preview {
  display: none;
}

.message-item__detail {
  padding: 0 12px 16px 29px;
}

.message-item__detail p {
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--paper);
  font-size: 14px;
  line-height: 1.9;
  color: var(--ink-700);
  white-space: pre-wrap;
}

.message-item__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

@media (max-width: 640px) {
  .mailbox-head {
    padding: 14px;
  }

  .category-hint {
    display: none;
  }

  .filter-field {
    width: 100%;
  }

  .category-select {
    flex: 1;
    width: auto;
  }

  .mailbox-head__filters {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
