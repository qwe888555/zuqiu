<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { Bell, Message, Refresh } from '@element-plus/icons-vue'
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
const marking = ref(false)
const rows = ref<MessageItem[]>([])
const activeCategory = ref<CategoryKey>('ALL')
const unreadOnly = ref(false)
const page = ref(1)
const pageSize = 12
const activeId = ref('')

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

const categoryLabel: Record<CategoryKey, string> = {
  ALL: '全部消息',
  REVIEW: '审核结果',
  MATERIAL: '材料提醒',
  MATCH: '赛程变更',
  PUBLICATION: '公示通知',
  SYSTEM: '系统通知',
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

const unreadCount = computed(() => rows.value.filter((item) => !item.read).length)

const filteredRows = computed(() =>
  rows.value.filter(
    (item) =>
      (activeCategory.value === 'ALL' || categoryOf(item.businessType) === activeCategory.value) &&
      (!unreadOnly.value || !item.read),
  ),
)

const pagedRows = computed(() =>
  filteredRows.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)

const activeMessage = computed(
  () => rows.value.find((item) => item.id === activeId.value) || null,
)

const activeLink = computed(() => (activeMessage.value ? linkFor(activeMessage.value) : null))

const activeType = computed(() =>
  typeLabel[(activeMessage.value?.businessType || 'SYSTEM').toUpperCase()] || '系统',
)

const activeCategoryKey = computed<CategoryKey>(() =>
  activeMessage.value ? categoryOf(activeMessage.value.businessType) : 'SYSTEM',
)

const activeCategoryHint = computed(
  () => categories.find((item) => item.key === activeCategoryKey.value)?.hint || '',
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

    if (!rows.value.some((item) => item.id === activeId.value)) {
      activeId.value = pagedRows.value[0]?.id || ''
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
  marking.value = true
  try {
    await meApi.readMessage(item.id)
    item.read = true
    item.readAt = new Date().toISOString()
    app.unreadCount = Math.max(0, app.unreadCount - 1)

    // “仅未读”筛选下读完当前页后，可能需要回退页码。
    const maxPage = Math.max(1, Math.ceil(filteredRows.value.length / pageSize))
    if (page.value > maxPage) page.value = maxPage
    if (!filteredRows.value.some((row) => row.id === activeId.value)) {
      activeId.value = pagedRows.value[0]?.id || ''
    }
  } catch {
    // 拦截器提示
  } finally {
    marking.value = false
  }
}

async function selectMessage(item: MessageItem) {
  activeId.value = item.id
  await markRead(item)
}

function selectCategory(key: CategoryKey) {
  activeCategory.value = key
  page.value = 1
  if (!filteredRows.value.some((item) => item.id === activeId.value)) {
    activeId.value = filteredRows.value[0]?.id || ''
  }
}

function toggleUnreadOnly(value: boolean) {
  unreadOnly.value = value
  page.value = 1
  if (!filteredRows.value.some((item) => item.id === activeId.value)) {
    activeId.value = filteredRows.value[0]?.id || ''
  }
}

async function refresh() {
  await load()
  ElMessage.success('消息已刷新')
}

async function openBusiness() {
  if (!activeLink.value || !activeMessage.value) return
  if (!activeMessage.value.read) await markRead(activeMessage.value)
  router.push(activeLink.value.path)
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="消息中心"
      description="审核结果、材料退回、赛程变更与公示通知统一汇总，点击消息即可跳转到对应业务页面处理。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="refresh">刷新</el-button>
      </template>
    </PageHeader>

    <section class="page-card mailbox">
      <header class="mailbox-head">
        <div class="mailbox-head__intro">
          <strong>收件箱</strong>
          <small>未读 {{ unreadCount }} 条 · 共 {{ rows.length }} 条</small>
        </div>

        <nav class="category-tabs">
          <button
            v-for="category in categories"
            :key="category.key"
            type="button"
            class="category-tab"
            :class="[`is-${category.key.toLowerCase()}`, { 'is-active': activeCategory === category.key }]"
            @click="selectCategory(category.key)"
          >
            <span class="category-tab__dot" />
            {{ category.label }}
            <b v-if="categoryCounts[category.key]" class="num">{{ categoryCounts[category.key] }}</b>
          </button>
        </nav>

        <el-switch
          :model-value="unreadOnly"
          size="small"
          active-text="仅未读"
          @update:model-value="(value: string | number | boolean) => toggleUnreadOnly(Boolean(value))"
        />
      </header>

      <div class="mailbox-body">
        <aside class="mailbox-side">
          <div class="mailbox-side__head">
            <div>
              <strong>{{ categoryLabel[activeCategory] }}</strong>
              <small>{{ activeCategoryMeta.hint }}</small>
            </div>
            <span class="mailbox-side__count">{{ filteredRows.length }} 条</span>
          </div>

          <div v-loading="loading" class="message-list">
            <button
              v-for="item in pagedRows"
              :key="item.id"
              type="button"
              class="message-item"
              :class="{ 'is-active': item.id === activeId, 'is-unread': !item.read }"
              @click="selectMessage(item)"
            >
              <span
                class="message-item__bar"
                :class="`is-${categoryOf(item.businessType).toLowerCase()}`"
              />
              <span class="message-item__dot" :class="{ 'is-unread': !item.read }" />
              <span class="message-item__body">
                <span class="message-item__top">
                  <strong>{{ item.title }}</strong>
                  <small>{{ dayjs(item.createdAt).format('MM-DD HH:mm') }}</small>
                </span>
                <span class="message-item__preview">{{ item.body || '无详细内容' }}</span>
                <span class="message-item__meta">
                  <span class="message-item__tag">
                    {{ typeLabel[(item.businessType || 'SYSTEM').toUpperCase()] || '系统' }}
                  </span>
                  <span v-if="!item.read" class="message-item__unread">未读</span>
                  <span v-if="linkFor(item)" class="message-item__jump">可跳转</span>
                </span>
              </span>
            </button>

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

          <PaginationBar
            v-model:page="page"
            :page-size="pageSize"
            :total="filteredRows.length"
            layout="prev, pager, next"
            small
            hide-when-single
          />
        </aside>

        <section v-loading="marking" class="mailbox-detail">
          <template v-if="activeMessage">
            <header class="detail-head">
              <div
                class="detail-head__icon"
                :class="`is-${categoryOf(activeMessage.businessType).toLowerCase()}`"
              >
                <el-icon :size="19"><Bell /></el-icon>
              </div>
              <div>
                <span class="detail-head__tag">{{ activeType }}</span>
                <h2>{{ activeMessage.title }}</h2>
                <p>
                  {{ dayjs(activeMessage.createdAt).format('YYYY-MM-DD HH:mm') }}
                  <template v-if="activeMessage.readAt">
                    · 已读于 {{ dayjs(activeMessage.readAt).format('MM-DD HH:mm') }}
                  </template>
                </p>
              </div>
            </header>

            <div class="detail-body">
              <p>{{ activeMessage.body || '该消息暂无详细内容。' }}</p>
            </div>

            <div class="detail-context" :class="`is-${activeCategoryKey.toLowerCase()}`">
              <span class="detail-context__mark" />
              <div>
                <strong>{{ categoryLabel[activeCategoryKey] }}</strong>
                <small>{{ activeCategoryHint }}</small>
              </div>
              <small v-if="activeMessage.businessId" class="detail-context__id">
                {{ activeMessage.businessId }}
              </small>
            </div>

            <footer class="detail-foot">
              <span class="muted">消息编号 {{ activeMessage.id }}</span>
              <div class="detail-foot__actions">
                <el-button
                  v-if="!activeMessage.read"
                  size="small"
                  :loading="marking"
                  @click="markRead(activeMessage)"
                >
                  标记为已读
                </el-button>
                <el-button
                  v-if="activeLink"
                  type="primary"
                  plain
                  size="small"
                  @click="openBusiness"
                >
                  {{ activeLink.label }}
                </el-button>
              </div>
            </footer>
          </template>

          <div v-else class="detail-empty">
            <div class="detail-empty__icon"><el-icon :size="28"><Message /></el-icon></div>
            <p>选择左侧消息查看详情</p>
            <small>审核结论、材料退回与赛程调整都可以从消息直接跳转处理。</small>
          </div>
        </section>
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
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  background: #fff;
}

.mailbox-head__intro strong {
  display: block;
  font-size: 14px;
}

.mailbox-head__intro small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.category-tabs {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  flex: 1;
}

.category-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  font-size: 11px;
  color: var(--ink-500);
  cursor: pointer;
  transition: 0.16s;
}

.category-tab:hover {
  background: var(--brand-50);
}

.category-tab.is-active {
  border-color: var(--line);
  background: var(--brand-50);
  color: var(--brand-800);
  font-weight: 600;
}

.category-tab b {
  padding: 0 5px;
  border-radius: 3px;
  background: var(--paper);
  font-size: 8.5px;
  font-weight: 700;
  color: var(--ink-300);
}

.category-tab.is-active b {
  background: var(--brand-700);
  color: #fff;
}

.category-tab__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand-500);
}

.category-tab.is-review .category-tab__dot {
  background: #e2a23c;
}

.category-tab.is-material .category-tab__dot {
  background: #d97757;
}

.category-tab.is-match .category-tab__dot {
  background: var(--live);
}

.category-tab.is-publication .category-tab__dot {
  background: #5b8def;
}

.category-tab.is-system .category-tab__dot {
  background: var(--ink-300);
}

.mailbox-body {
  display: grid;
  grid-template-columns: 390px minmax(0, 1fr);
  min-height: 520px;
}

.mailbox-side {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  background: #fff;
}

.mailbox-side__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
}

.mailbox-side__head strong {
  display: block;
  font-size: 12.5px;
}

.mailbox-side__head small {
  display: block;
  margin-top: 2px;
  font-size: 9px;
  color: var(--ink-300);
}

.mailbox-side__count {
  flex-shrink: 0;
  font-size: 9.5px;
  color: var(--ink-300);
}

.message-list {
  flex: 1;
  overflow-y: auto;
  max-height: 620px;
}

.message-item {
  position: relative;
  display: flex;
  gap: 9px;
  width: 100%;
  padding: 13px 16px 13px 19px;
  border: none;
  border-bottom: 1px solid var(--line);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.message-item:hover {
  background: var(--paper);
}

.message-item.is-active {
  background: var(--brand-50);
}

.message-item__bar {
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--brand-500);
  opacity: 0;
}

.message-item.is-active .message-item__bar {
  opacity: 1;
}

.message-item__bar.is-review {
  background: #e2a23c;
}

.message-item__bar.is-material {
  background: #d97757;
}

.message-item__bar.is-match {
  background: var(--live);
}

.message-item__bar.is-publication {
  background: #5b8def;
}

.message-item__bar.is-system {
  background: var(--ink-300);
}

.message-item__dot {
  width: 7px;
  height: 7px;
  margin-top: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: transparent;
}

.message-item__dot.is-unread {
  background: var(--live);
}

.message-item__body {
  flex: 1;
  min-width: 0;
}

.message-item__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.message-item__top strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ink-700);
}

.message-item.is-unread .message-item__top strong {
  font-weight: 700;
  color: var(--ink-900);
}

.message-item__top small {
  flex-shrink: 0;
  font-size: 9px;
  color: var(--ink-300);
}

.message-item__preview {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--ink-300);
}

.message-item__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.message-item__tag {
  padding: 1px 6px;
  border-radius: 4px;
  background: #fff;
  border: 1px solid var(--line);
  font-size: 8.5px;
  color: var(--ink-500);
}

.message-item__unread {
  font-size: 8.5px;
  font-weight: 700;
  color: var(--live);
}

.message-item__jump {
  margin-left: auto;
  font-size: 8.5px;
  color: var(--brand-600);
}

.mailbox-detail {
  display: flex;
  flex-direction: column;
  padding: 26px 30px;
}

.detail-head {
  display: flex;
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.detail-head__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.detail-head__icon.is-review {
  background: var(--whistle-soft);
  color: #b37a18;
}

.detail-head__icon.is-material {
  background: #fbeee9;
  color: #c2603f;
}

.detail-head__icon.is-match {
  background: var(--live-soft);
  color: #cf4744;
}

.detail-head__icon.is-publication {
  background: #edf3fe;
  color: #3f6fce;
}

.detail-head__icon.is-system {
  background: var(--paper);
  color: var(--ink-500);
}

.detail-head__tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--brand-700);
}

.detail-head h2 {
  margin-top: 5px;
  font-size: 19px;
  line-height: 1.4;
}

.detail-head p {
  margin-top: 5px;
  font-size: 10px;
  color: var(--ink-300);
}

.detail-body {
  flex: 1;
  padding: 22px 0;
}

.detail-body p {
  font-size: 12.5px;
  line-height: 2;
  color: var(--ink-700);
  white-space: pre-wrap;
}

.detail-context {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-radius: 6px;
  background: var(--paper);
  border: 1px solid var(--line);
}

.detail-context__mark {
  width: 2px;
  height: 26px;
  border-radius: 1px;
  background: var(--brand-500);
}

.detail-context.is-review .detail-context__mark {
  background: #e2a23c;
}

.detail-context.is-material .detail-context__mark {
  background: #d97757;
}

.detail-context.is-match .detail-context__mark {
  background: var(--live);
}

.detail-context.is-publication .detail-context__mark {
  background: #5b8def;
}

.detail-context.is-system .detail-context__mark {
  background: var(--ink-300);
}

.detail-context strong {
  display: block;
  font-size: 11px;
  color: var(--ink-900);
}

.detail-context small {
  display: block;
  margin-top: 1px;
  font-size: 9px;
  color: var(--ink-300);
}

.detail-context__id {
  margin-left: auto;
  font-family: var(--font-num, monospace);
  font-size: 9px !important;
  color: var(--ink-300);
}

.detail-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
}

.detail-foot__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--ink-300);
}

.detail-empty__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 8px;
  background: var(--paper);
}

.detail-empty p {
  margin-top: 12px;
  font-size: 11px;
}

.detail-empty small {
  margin-top: 5px;
  font-size: 9.5px;
}

@media (max-width: 900px) {
  .mailbox-head {
    align-items: flex-start;
  }

  .mailbox-body {
    grid-template-columns: 1fr;
  }

  .mailbox-side {
    border-right: none;
    border-bottom: 1px solid var(--line);
  }

  .message-list {
    max-height: 360px;
  }

  .mailbox-detail {
    min-height: 320px;
  }
}
</style>
