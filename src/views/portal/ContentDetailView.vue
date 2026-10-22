<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { ArrowLeft, ChatDotRound, Document } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicContent } from '../../api/types'
import { openPolicyAssistant } from '../../composables/usePolicyAssistant'

const route = useRoute()
const loading = ref(false)
const content = ref<PublicContent | null>(null)
const related = ref<PublicContent[]>([])
const relatedIsRelevant = ref(false)

const isPolicy = computed(() => content.value?.contentType === 'POLICY')
const categoryLabel = computed(() => {
  const type = content.value?.contentType
  if (type === 'POLICY') return '政策文件'
  if (type === 'HIGHLIGHT') return '精彩瞬间'
  if (type === 'BEST_LINEUP') return '最佳阵容'
  return '赛事资讯'
})
const relatedTitle = computed(() => (relatedIsRelevant.value ? '相关阅读' : '同类内容'))

/** 标题二元组重合度：不求语义模型，只在前端做可解释的同主题判断。 */
function titleBigrams(text: string): Set<string> {
  const normalized = text.replace(/[\s，。、“”《》：:；;！!？?（）()·\-—]/g, '')
  const result = new Set<string>()
  for (let i = 0; i < normalized.length - 1; i += 1) {
    result.add(normalized.slice(i, i + 2))
  }
  return result
}

function relevanceScore(candidate: PublicContent): number {
  if (!content.value) return 0
  let score = 0
  if (content.value.eventId && candidate.eventId === content.value.eventId) score += 5
  if (content.value.groupId && candidate.groupId === content.value.groupId) score += 4
  const current = titleBigrams(content.value.title)
  const target = titleBigrams(candidate.title)
  let overlap = 0
  target.forEach((gram) => {
    if (current.has(gram)) overlap += 1
  })
  score += overlap * 1.5
  if (overlap >= 3) score += 2
  return score
}

async function load() {
  const id = String(route.params.id)
  loading.value = true
  try {
    content.value = await publicApi.content(id)
    const res = await publicApi.contents({
      page: 1,
      pageSize: 20,
      contentType: content.value.contentType,
    })
    const scored = res.items
      .filter((item) => item.id !== id)
      .map((item) => ({ item, score: relevanceScore(item) }))
      .sort((a, b) => b.score - a.score || (b.item.publishedAt || '').localeCompare(a.item.publishedAt || ''))
    const relevant = scored.filter((entry) => entry.score >= 3).slice(0, 4)
    relatedIsRelevant.value = relevant.length > 0
    // 没有主题关联时不硬凑“相关阅读”，退回同栏目内容并如实标注。
    related.value = (relevant.length ? relevant : scored.slice(0, 4)).map((entry) => entry.item)
  } catch {
    content.value = null
    related.value = []
  } finally {
    loading.value = false
  }
}

function askThisPolicy() {
  if (!content.value) return
  openPolicyAssistant({
    context: { contentId: content.value.id, title: content.value.title },
    question: `《${content.value.title}》的主要规定和办理要求是什么？`,
  })
}

onMounted(load)
watch(() => route.params.id, load)
</script>

<template>
  <div class="detail-page">
    <div class="container">
      <div class="breadcrumb">
        <router-link to="/">首页</router-link>
        <span>/</span>
        <router-link :to="isPolicy ? '/policies' : '/news'">
          {{ isPolicy ? '政策公告' : '赛事资讯' }}
        </router-link>
        <span>/</span>
        <span class="breadcrumb__current">正文</span>
      </div>

      <div v-loading="loading" class="detail-layout">
        <article v-if="content" class="article">
          <header class="article__head">
            <span class="article__category">
              <el-icon><Document /></el-icon>
              {{ categoryLabel }}
            </span>
            <h1>{{ content.title }}</h1>
            <div class="article__meta">
              <span>{{ dayjs(content.publishedAt).format('YYYY年MM月DD日 HH:mm') }}</span>
              <span class="dot" />
              <span>赛事组委会</span>
              <span class="dot" />
              <span>第 {{ content.revision }} 版</span>
            </div>
            <p v-if="content.summary" class="article__summary">{{ content.summary }}</p>
          </header>

          <div v-if="content.publicCoverUrl" class="article__cover">
            <img :src="content.publicCoverUrl" :alt="content.title" />
          </div>

          <div class="article__body rich-text" v-html="content.bodyHtml" />

          <footer class="article__foot">
            <router-link :to="isPolicy ? '/policies' : '/news'" class="back-link">
              <el-icon><ArrowLeft /></el-icon>
              返回{{ isPolicy ? '政策公告' : '赛事资讯' }}
            </router-link>
            <span class="article__source">来源：省级中小学足球联赛组委会</span>
          </footer>
        </article>

        <el-result
          v-else-if="!loading"
          icon="warning"
          title="内容不存在或尚未发布"
          sub-title="该内容可能已被下线，请返回列表查看其他资讯。"
        >
          <template #extra>
            <router-link to="/news">
              <el-button type="primary">返回资讯列表</el-button>
            </router-link>
          </template>
        </el-result>

        <aside class="sidebar">
          <button v-if="isPolicy" type="button" class="assist-card" @click="askThisPolicy">
            <span class="assist-card__icon"><el-icon><ChatDotRound /></el-icon></span>
            <span class="assist-card__kicker">POLICY Q&amp;A</span>
            <h3>没读懂某一条？</h3>
            <p>围绕当前文件提问，回答会附上政策原文与版本出处。</p>
            <span class="assist-card__hint">
              围绕这份文件提问
              <el-icon><ChatDotRound /></el-icon>
            </span>
          </button>

          <div class="related-card">
            <h3>{{ relatedTitle }}</h3>
            <p v-if="!relatedIsRelevant && related.length" class="related-card__note">
              当前没有找到同主题内容，以下为同栏目其他文件。
            </p>
            <router-link
              v-for="item in related"
              :key="item.id"
              :to="`${isPolicy ? '/policies' : '/news'}/${item.id}`"
              class="related-row"
            >
              <span class="related-row__date">{{ dayjs(item.publishedAt).format('MM-DD') }}</span>
              <span class="related-row__title">{{ item.title }}</span>
            </router-link>
            <el-empty v-if="!related.length && !loading" description="暂无相关内容" :image-size="60" />
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  min-height: 70vh;
  padding: 26px 0 64px;
  background: var(--paper);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  font-size: 11.5px;
  color: var(--ink-300);
}

.breadcrumb a:hover {
  color: var(--brand-700);
}

.breadcrumb__current {
  color: var(--ink-500);
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 24px;
  align-items: start;
}

.article {
  padding: 34px 40px 28px;
  border-radius: var(--radius-lg);
  background: #fff;
  border: 1px solid var(--line);
}

.article__category {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.article__head h1 {
  margin-top: 14px;
  font-size: clamp(25px, 3vw, 34px);
  line-height: 1.4;
  letter-spacing: 0.01em;
}

.article__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 15px;
  font-size: 13px;
  color: var(--ink-500);
}

.article__meta .dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
}

.article__summary {
  margin-top: 20px;
  padding: 14px 16px;
  border: 1px solid var(--brand-100);
  background: #f5faf7;
  border-radius: var(--radius-sm);
  font-size: 14.5px;
  line-height: 1.8;
  color: var(--ink-700);
}

.article__cover {
  margin-top: 26px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--paper);
}

.article__cover img {
  width: 100%;
  max-height: 440px;
  object-fit: cover;
}

.article__body {
  margin-top: 28px;
}

.article__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 36px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13.5px;
  color: var(--brand-700);
}

.article__source {
  font-size: 12.5px;
  color: var(--ink-500);
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.assist-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 18px;
  border: none;
  border-radius: 8px;
  background: var(--brand-900);
  color: #fff;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.16s;
}

.assist-card:hover {
  background: var(--brand-800);
}

.assist-card__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--lime);
}

.assist-card__kicker {
  margin-top: 12px;
  font-family: var(--font-display);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--lime);
}

.assist-card h3 {
  margin-top: 5px;
  font-size: 17px;
}

.assist-card p {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.72);
}

.assist-card__hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--lime);
}

.related-card {
  padding: 20px;
  border-radius: var(--radius-lg);
  background: #fff;
  border: 1px solid var(--line);
}

.related-card h3 {
  font-size: 16px;
  margin-bottom: 12px;
}

.related-card__note {
  margin: -4px 0 8px;
  font-size: 11px;
  line-height: 1.65;
  color: var(--ink-300);
}

.related-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}

.related-row:last-child {
  border-bottom: none;
}

.related-row__date {
  font-size: 12px;
  color: var(--brand-600);
}

.related-row__title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ink-700);
}

.related-row:hover .related-row__title {
  color: var(--brand-700);
}

@media (max-width: 900px) {
  .detail-layout {
    grid-template-columns: 1fr;
  }

  .article {
    padding: 26px 22px;
  }
}
</style>
