<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { ArrowLeft, ChatDotRound, Document } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PublicContent } from '../../api/types'

const route = useRoute()
const loading = ref(false)
const content = ref<PublicContent | null>(null)
const related = ref<PublicContent[]>([])

const isPolicy = computed(() => content.value?.contentType === 'POLICY')
const categoryLabel = computed(() => {
  const type = content.value?.contentType
  if (type === 'POLICY') return '政策文件'
  if (type === 'HIGHLIGHT') return '精彩瞬间'
  if (type === 'BEST_LINEUP') return '最佳阵容'
  return '赛事资讯'
})

async function load() {
  const id = String(route.params.id)
  loading.value = true
  try {
    content.value = await publicApi.content(id)
    const res = await publicApi.contents({
      page: 1,
      pageSize: 5,
      contentType: content.value.contentType,
    })
    related.value = res.items.filter((item) => item.id !== id).slice(0, 4)
  } catch {
    content.value = null
  } finally {
    loading.value = false
  }
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
          {{ isPolicy ? '政策公告' : '新闻资讯' }}
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
              返回{{ isPolicy ? '政策公告' : '新闻资讯' }}
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
          <div v-if="isPolicy" class="assist-card">
            <span class="assist-card__icon"><el-icon><ChatDotRound /></el-icon></span>
            <h3>还有疑问？</h3>
            <p>政策问答助手可以从已发布文件中检索答案，并附上原文出处。</p>
            <span class="assist-card__hint">使用页面右下角「政策问答」</span>
          </div>

          <div class="related-card">
            <h3>相关阅读</h3>
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
  padding: 38px 44px 30px;
  border-radius: 18px;
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
  font-size: 10px;
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
  font-size: 10.5px;
  color: var(--ink-300);
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
  border-left: 3px solid var(--lime);
  background: var(--brand-50);
  border-radius: 0 10px 10px 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-700);
}

.article__cover {
  margin-top: 26px;
  border-radius: 12px;
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
  font-size: 12px;
  color: var(--brand-700);
}

.article__source {
  font-size: 10.5px;
  color: var(--ink-300);
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.assist-card {
  padding: 20px;
  border-radius: 16px;
  background: linear-gradient(155deg, var(--brand-800), var(--brand-700));
  color: #fff;
}

.assist-card__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: rgba(200, 241, 105, 0.16);
  color: var(--lime);
}

.assist-card h3 {
  margin-top: 12px;
  font-size: 15px;
}

.assist-card p {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.58);
}

.assist-card__hint {
  display: block;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 10px;
  color: var(--lime);
}

.related-card {
  padding: 20px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--line);
}

.related-card h3 {
  font-size: 14px;
  margin-bottom: 12px;
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
  font-size: 9.5px;
  color: var(--brand-600);
}

.related-row__title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
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
