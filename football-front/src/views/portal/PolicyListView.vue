<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ArrowRight, ChatDotRound, Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicContent } from '../../api/types'
import PaginationBar from '../../components/common/PaginationBar.vue'
import { openPolicyAssistant } from '../../composables/usePolicyAssistant'
import { policyKind } from '../../utils/portal'

const loading = ref(false)
const keyword = ref('')
const page = ref(1)
const total = ref(0)
const items = ref<PublicContent[]>([])

async function load() {
  loading.value = true
  try {
    const res = await publicApi.contents({
      page: page.value,
      pageSize: 10,
      contentType: 'POLICY',
      keyword: keyword.value || undefined,
    })
    items.value = res.items
    total.value = res.total
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function askPolicy() {
  openPolicyAssistant()
}

function kindTone(title: string) {
  const kind = policyKind(title)
  if (kind === '竞赛规程') return 'rule'
  if (kind === '报名指南') return 'entry'
  if (kind === '资格要求') return 'eligibility'
  if (kind === '赛事保障') return 'safety'
  return 'default'
}

onMounted(load)
</script>

<template>
  <div class="policy-page">
    <section class="page-hero">
      <div class="container hero-grid">
        <div>
          <h1>政策公告</h1>
          <p>竞赛规程、报名办法与资格审查要求，均以本栏目发布的正式文件为准。</p>
        </div>
        <button type="button" class="hero-note" @click="askPolicy">
          <span class="hero-note__icon"><el-icon :size="20"><ChatDotRound /></el-icon></span>
          <span class="hero-note__body">
            <strong>政策问答</strong>
            <span>从已发布文件中检索答案，并附原文出处。</span>
          </span>
          <el-icon class="hero-note__arrow"><ArrowRight /></el-icon>
        </button>
      </div>
    </section>

    <div class="container policy-body">
      <div class="policy-toolbar">
        <div>
          <h2>正式文件</h2>
          <span class="muted">共 {{ total }} 份已发布文件</span>
        </div>
        <el-input
          v-model="keyword"
          size="large"
          placeholder="搜索政策标题"
          :prefix-icon="Search"
          clearable
          class="search"
          @keyup.enter="search"
          @clear="search"
        />
      </div>

      <div v-loading="loading" class="policy-list">
        <router-link
          v-for="(item, index) in items"
          :key="item.id"
          :to="`/policies/${item.id}`"
          class="policy-item"
        >
          <div class="policy-item__mark">
            <span class="num">{{ String(index + 1 + (page - 1) * 10).padStart(2, '0') }}</span>
          </div>
          <div class="policy-item__body">
            <div class="policy-item__meta">
              <span class="policy-item__doc" :class="`policy-item__doc--${kindTone(item.title)}`">
                {{ policyKind(item.title) }}
              </span>
              <span>{{ dayjs(item.publishedAt).format('YYYY-MM-DD') }}</span>
              <span>第 {{ item.revision }} 版</span>
            </div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.summary }}</p>
          </div>
          <span class="policy-item__action">查看原文</span>
        </router-link>

        <el-empty v-if="!loading && !items.length" description="暂无政策文件" />
      </div>

      <PaginationBar
        v-model:page="page"
        :page-size="10"
        :total="total"
        layout="prev, pager, next"
        hide-when-single
        @current-change="load"
      />
    </div>
  </div>
</template>

<style scoped>
.policy-page {
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
  gap: 30px;
}

.page-hero h1 {
  font-size: 27px;
  font-weight: 600;
}

.page-hero p {
  max-width: 620px;
  margin-top: 7px;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.66);
}

.hero-note {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 360px;
  padding: 13px 15px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #fff;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.16s, border-color 0.16s;
}

.hero-note:hover {
  background: rgba(255, 255, 255, 0.11);
  border-color: rgba(255, 255, 255, 0.28);
}

.hero-note__icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 6px;
  background: rgba(200, 243, 106, 0.14);
  color: var(--lime);
}

.hero-note__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.hero-note strong {
  font-size: 14px;
}

.hero-note__body span {
  font-size: 12.5px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.68);
}

.hero-note__arrow {
  margin-left: auto;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.6);
}

.policy-body {
  margin-top: 24px;
}

.policy-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.policy-toolbar h2 {
  font-size: 22px;
}

.policy-toolbar .muted {
  margin-left: 8px;
  font-size: 13px;
  color: var(--ink-500);
}

.search {
  width: 250px;
}

.policy-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.policy-item {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 20px 22px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line);
  transition: border-color 0.16s, box-shadow 0.16s;
}

.policy-item:hover {
  border-color: var(--brand-500);
  box-shadow: var(--shadow-card);
}

.policy-item__mark {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 16px;
  font-weight: 600;
}

.policy-item__body {
  min-width: 0;
}

.policy-item__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 13px;
  color: var(--ink-500);
}

.policy-item__doc {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--lime-soft);
  color: #4f6808;
  font-weight: 600;
}

.policy-item__doc--entry {
  background: #eaf2fc;
  color: #245ea8;
}

.policy-item__doc--eligibility {
  background: #fdf3e7;
  color: #8a5308;
}

.policy-item__doc--safety {
  background: #e8f4f1;
  color: #0b6b5a;
}

.policy-item__body h3 {
  margin-top: 7px;
  font-size: 19px;
  line-height: 1.45;
}

.policy-item__body p {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 6px;
  font-size: 14.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.policy-item__action {
  margin-left: auto;
  flex-shrink: 0;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--brand-700);
  background: #fff;
  transition: border-color 0.16s, background-color 0.16s;
}

.policy-item:hover .policy-item__action {
  border-color: var(--brand-700);
  background: var(--brand-50);
}

@media (max-width: 760px) {
  .page-hero {
    padding: 22px 0 20px;
  }

  .page-hero h1 {
    font-size: 23px;
  }

  .hero-grid {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-note {
    width: 100%;
    max-width: 100%;
  }

  .policy-item {
    align-items: flex-start;
    padding: 16px;
    gap: 12px;
  }

  .policy-item__mark {
    width: 38px;
    height: 38px;
    font-size: 14px;
  }

  .policy-item__body h3 {
    font-size: 17px;
  }

  .policy-item__body p {
    font-size: 14px;
  }

  .policy-item__action {
    display: none;
  }

  .search {
    width: 100%;
  }
}
</style>
