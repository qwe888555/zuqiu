<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { Bell, Message, Refresh } from '@element-plus/icons-vue'
import { meApi } from '../../api'
import type { Message as MessageItem } from '../../api/types'
import { useAppStore } from '../../stores/app'
import PageHeader from '../../components/common/PageHeader.vue'

const app = useAppStore()
const loading = ref(false)
const rows = ref<MessageItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const unreadOnly = ref(false)
const activeId = ref('')
const detailLoading = ref(false)

const activeMessage = computed(() => rows.value.find((item) => item.id === activeId.value) || null)
const unreadCount = computed(() => rows.value.filter((item) => !item.read).length)

const businessLabel: Record<string, string> = {
  ENROLLMENT: '报名',
  REVIEW: '审核',
  IDENTITY: '身份核验',
  SELECTION: '遴选',
  MATCH: '比赛',
  SYSTEM: '系统',
}

async function load(keepActive = false) {
  loading.value = true
  try {
    const res = await meApi.messages({
      page: page.value,
      pageSize: pageSize.value,
      unreadOnly: unreadOnly.value || undefined,
    })
    rows.value = res.items
    total.value = res.total
    if (!keepActive || !rows.value.some((item) => item.id === activeId.value)) {
      activeId.value = rows.value[0]?.id || ''
      if (activeId.value) await markRead(rows.value[0])
    }
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function markRead(item: MessageItem) {
  if (item.read) return
  try {
    detailLoading.value = true
    await meApi.readMessage(item.id)
    item.read = true
    item.readAt = new Date().toISOString()
    app.unreadCount = Math.max(0, app.unreadCount - 1)
  } catch {
    // 拦截器提示
  } finally {
    detailLoading.value = false
  }
}

async function selectMessage(item: MessageItem) {
  activeId.value = item.id
  await markRead(item)
}

function toggleUnreadOnly(value: boolean) {
  unreadOnly.value = value
  page.value = 1
  load()
}

async function refresh() {
  await load(true)
  ElMessage.success('消息已刷新')
}

onMounted(() => load())
</script>

<template>
  <div class="page">
    <PageHeader
      title="我的消息"
      eyebrow="MESSAGE CENTER"
      description="报名审核、身份核验与遴选结果等通知集中在此展示。消息已读状态与顶部铃铛未读数实时同步。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="refresh">刷新</el-button>
      </template>
    </PageHeader>

    <section class="page-card mailbox">
      <aside class="mailbox-side">
        <div class="mailbox-side__head">
          <div>
            <strong>消息列表</strong>
            <small>共 {{ total }} 条 · 未读 {{ unreadCount }}</small>
          </div>
          <el-switch
            :model-value="unreadOnly"
            size="small"
            active-text="仅未读"
            @update:model-value="(value: string | number | boolean) => toggleUnreadOnly(Boolean(value))"
          />
        </div>

        <div v-loading="loading" class="message-list">
          <button
            v-for="item in rows"
            :key="item.id"
            type="button"
            class="message-item"
            :class="{ 'is-active': item.id === activeId, 'is-unread': !item.read }"
            @click="selectMessage(item)"
          >
            <span class="message-item__dot" :class="{ 'is-unread': !item.read }" />
            <span class="message-item__body">
              <span class="message-item__top">
                <strong>{{ item.title }}</strong>
                <small>{{ dayjs(item.createdAt).format('MM-DD HH:mm') }}</small>
              </span>
              <span class="message-item__preview">{{ item.body || '无详细内容' }}</span>
              <span class="message-item__tag">{{ businessLabel[item.businessType || 'SYSTEM'] || '系统' }}</span>
            </span>
          </button>
          <el-empty v-if="!loading && !rows.length" description="暂无消息" :image-size="70" />
        </div>

        <el-pagination
          v-if="total > pageSize"
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          small
          background
          @current-change="load(true)"
        />
      </aside>

      <section v-loading="detailLoading" class="mailbox-detail">
        <template v-if="activeMessage">
          <header class="detail-head">
            <div class="detail-head__icon"><el-icon :size="19"><Bell /></el-icon></div>
            <div>
              <span class="detail-head__tag">
                {{ businessLabel[activeMessage.businessType || 'SYSTEM'] || '系统通知' }}
              </span>
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
          <footer class="detail-foot">
            <span class="muted">消息编号 {{ activeMessage.id }}</span>
            <el-button v-if="activeMessage.businessId" type="primary" plain size="small">
              查看相关业务
            </el-button>
          </footer>
        </template>
        <div v-else class="detail-empty">
          <div class="detail-empty__icon"><el-icon :size="28"><Message /></el-icon></div>
          <p>选择左侧消息查看详情</p>
        </div>
      </section>
    </section>
  </div>
</template>

<style scoped>
.mailbox {
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  padding: 0;
  overflow: hidden;
  min-height: 520px;
}

.mailbox-side {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  background: #fbfdfc;
}

.mailbox-side__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}

.mailbox-side__head strong {
  display: block;
  font-size: 13px;
}

.mailbox-side__head small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.message-list {
  flex: 1;
  overflow-y: auto;
  max-height: 620px;
}

.message-item {
  display: flex;
  gap: 9px;
  width: 100%;
  padding: 13px 16px;
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

.message-item__dot {
  width: 7px;
  height: 7px;
  margin-top: 6px;
  flex-shrink: 0;
  border-radius: 50%;
  background: transparent;
}

.message-item__dot.is-unread {
  background: #e2806b;
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

.message-item__tag {
  display: inline-block;
  margin-top: 5px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #fff;
  border: 1px solid var(--line);
  font-size: 8.5px;
  color: var(--ink-500);
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
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 12px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.detail-head__tag {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--brand-600);
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

.detail-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
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
  width: 60px;
  height: 60px;
  border-radius: 18px;
  background: var(--paper);
}

.detail-empty p {
  margin-top: 12px;
  font-size: 11px;
}

@media (max-width: 900px) {
  .mailbox {
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
