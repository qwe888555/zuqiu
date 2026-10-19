<script setup lang="ts">
import { ref } from 'vue'
import { ChatDotRound, Close, Promotion, Search } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PolicyAnswer } from '../../api/types'

interface Exchange {
  question: string
  answer?: PolicyAnswer
  loading: boolean
}

const open = ref(false)
const question = ref('')
const exchanges = ref<Exchange[]>([])

const quickQuestions = [
  '报名需要提交哪些材料？',
  '小学组参赛年龄有什么要求？',
  '比赛名次和奖励如何评定？',
  '雨天比赛如何安排？',
]

async function ask(text?: string) {
  const content = (text ?? question.value).trim()
  if (!content) return
  const item: Exchange = { question: content, loading: true }
  exchanges.value.push(item)
  question.value = ''
  try {
    item.answer = await publicApi.askPolicy(content)
  } catch {
    item.answer = {
      status: 'UNAVAILABLE',
      answer: '政策问答服务暂时不可用，请稍后重试，或前往“政策公告”查看原文。',
      citations: [],
      fallbackPolicies: [],
      aiGenerated: false,
      requestId: '',
    }
  } finally {
    item.loading = false
  }
}
</script>

<template>
  <button class="policy-fab" type="button" aria-label="政策问答" @click="open = true">
    <span class="policy-fab__icon"><el-icon :size="20"><ChatDotRound /></el-icon></span>
    <span class="policy-fab__label">政策问答</span>
  </button>

  <el-drawer v-model="open" direction="rtl" size="440px" :with-header="false" class="policy-drawer">
    <div class="assistant">
      <header class="assistant__head">
        <div>
          <span class="assistant__eyebrow">POLICY ASSISTANT</span>
          <h3>政策问答助手</h3>
        </div>
        <button class="assistant__close" type="button" @click="open = false">
          <el-icon><Close /></el-icon>
        </button>
      </header>

      <div class="assistant__body">
        <div v-if="!exchanges.length" class="assistant__intro">
          <div class="assistant__badge"><el-icon :size="22"><Search /></el-icon></div>
          <h4>从已发布政策中找依据</h4>
          <p>
            基于赛事规程、报名办法等正式文件回答，并附上政策出处。涉及个人隐私的问题不会被处理。
          </p>
          <div class="quick-list">
            <button
              v-for="q in quickQuestions"
              :key="q"
              type="button"
              class="quick-chip"
              @click="ask(q)"
            >
              {{ q }}
            </button>
          </div>
        </div>

        <div v-for="(item, index) in exchanges" :key="index" class="exchange">
          <div class="bubble bubble--user">{{ item.question }}</div>
          <div class="bubble bubble--bot">
            <div v-if="item.loading" class="typing">正在检索政策原文…</div>
            <template v-else-if="item.answer">
              <p class="answer-text">{{ item.answer.answer }}</p>

              <div v-if="item.answer.citations.length" class="citations">
                <span class="citations__label">政策依据</span>
                <router-link
                  v-for="citation in item.answer.citations"
                  :key="citation.contentId"
                  :to="citation.publicUrl"
                  class="citation"
                  @click="open = false"
                >
                  <strong>{{ citation.title }}</strong>
                  <span>{{ citation.excerpt }}</span>
                </router-link>
              </div>

              <div v-if="item.answer.fallbackPolicies.length" class="citations">
                <span class="citations__label">你可能还需要</span>
                <router-link
                  v-for="citation in item.answer.fallbackPolicies"
                  :key="citation.contentId"
                  :to="citation.publicUrl"
                  class="citation"
                  @click="open = false"
                >
                  <strong>{{ citation.title }}</strong>
                </router-link>
              </div>

              <span class="ai-note">
                {{ item.answer.aiGenerated ? 'AI 辅助生成，最终以正式文件为准' : '来自政策知识库' }}
              </span>
            </template>
          </div>
        </div>
      </div>

      <footer class="assistant__foot">
        <el-input
          v-model="question"
          placeholder="输入你的问题，如：报名截止时间？"
          size="large"
          @keyup.enter="ask()"
        >
          <template #append>
            <el-button :icon="Promotion" :loading="exchanges.some((e) => e.loading)" @click="ask()" />
          </template>
        </el-input>
        <p>请勿输入身份证号、手机号等个人信息。</p>
      </footer>
    </div>
  </el-drawer>
</template>

<style scoped>
.policy-fab {
  position: fixed;
  right: 26px;
  bottom: 28px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 17px 11px 12px;
  border: none;
  border-radius: 999px;
  background: var(--brand-700);
  color: #fff;
  box-shadow: 0 14px 32px rgba(7, 92, 64, 0.32);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.policy-fab:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 38px rgba(7, 92, 64, 0.38);
}

.policy-fab__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--lime);
  color: var(--brand-900);
}

.policy-fab__label {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.assistant {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -20px;
}

.assistant__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 24px 18px;
  background: linear-gradient(150deg, var(--brand-800), var(--brand-700));
  color: #fff;
}

.assistant__eyebrow {
  font-size: 9px;
  letter-spacing: 0.22em;
  color: rgba(255, 255, 255, 0.5);
}

.assistant__head h3 {
  margin-top: 5px;
  font-size: 19px;
  letter-spacing: 0.02em;
}

.assistant__close {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
}

.assistant__body {
  flex: 1;
  overflow-y: auto;
  padding: 22px 24px;
  background: var(--paper);
}

.assistant__intro {
  padding: 22px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
}

.assistant__badge {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 13px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.assistant__intro h4 {
  margin-top: 14px;
  font-size: 15px;
}

.assistant__intro p {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ink-500);
}

.quick-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.quick-chip {
  padding: 7px 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-800);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: 0.15s;
}

.quick-chip:hover {
  border-color: var(--brand-500);
  background: var(--brand-100);
}

.exchange {
  margin-bottom: 22px;
}

.bubble {
  max-width: 88%;
  padding: 12px 15px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.7;
}

.bubble--user {
  margin-left: auto;
  background: var(--brand-700);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.bubble--bot {
  margin-top: 10px;
  background: #fff;
  border: 1px solid var(--line);
  border-bottom-left-radius: 4px;
}

.answer-text {
  white-space: pre-line;
  color: var(--ink-700);
}

.typing {
  color: var(--ink-500);
  font-size: 12.5px;
}

.citations {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.citations__label {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ink-300);
}

.citation {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 11px;
  border-radius: 9px;
  background: var(--brand-50);
  border: 1px solid transparent;
  transition: 0.15s;
}

.citation:hover {
  border-color: var(--brand-500);
}

.citation strong {
  font-size: 12px;
  color: var(--brand-800);
}

.citation span {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ink-500);
}

.ai-note {
  display: block;
  margin-top: 10px;
  font-size: 10px;
  color: var(--ink-300);
}

.assistant__foot {
  padding: 16px 24px 18px;
  background: #fff;
  border-top: 1px solid var(--line);
}

.assistant__foot p {
  margin-top: 8px;
  font-size: 10px;
  color: var(--ink-300);
  text-align: center;
}

@media (max-width: 520px) {
  .policy-fab__label {
    display: none;
  }

  .policy-fab {
    padding: 10px;
  }
}
</style>
