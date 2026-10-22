<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  ArrowRight,
  ChatDotRound,
  Close,
  Document,
  Promotion,
  Reading,
  RefreshLeft,
} from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { PolicyAnswer } from '../../api/types'
import {
  registerPolicyAssistant,
  type PolicyAssistantContext,
  type PolicyAssistantRequest,
} from '../../composables/usePolicyAssistant'

interface Exchange {
  question: string
  answer?: PolicyAnswer
  loading: boolean
}

const open = ref(false)
const question = ref('')
const context = ref<PolicyAssistantContext | null>(null)
const exchanges = ref<Exchange[]>([])
const threadRef = ref<HTMLElement | null>(null)
let unregister: (() => void) | undefined

const quickQuestions = [
  '报名需要提交哪些材料？',
  '小学组参赛年龄有什么要求？',
  '比赛名次和奖励如何评定？',
  '雨天比赛如何安排？',
]

async function ask(text?: string) {
  const content = (text ?? question.value).trim()
  if (!content) return
  // 必须使用响应式对象，否则 await 后修改 loading/answer 不会触发界面更新。
  const item = reactive<Exchange>({ question: content, loading: true })
  exchanges.value.push(item)
  question.value = ''
  scrollToBottom()
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
    scrollToBottom()
  }
}

function scrollToBottom() {
  nextTick(() => {
    const el = threadRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function resetThread() {
  exchanges.value = []
  question.value = ''
}

function handleRequest(request: PolicyAssistantRequest) {
  open.value = true
  // 从另一份文件发起提问时清空旧对话，避免回答被误认为针对当前文件。
  if (request.context && request.context.contentId !== context.value?.contentId) {
    exchanges.value = []
  }
  context.value = request.context || null
  if (request.question) ask(request.question)
  else scrollToBottom()
}

watch(
  () => [exchanges.value.length, exchanges.value.some((item) => item.loading)],
  () => scrollToBottom(),
)

onMounted(() => {
  unregister = registerPolicyAssistant(handleRequest)
})

onBeforeUnmount(() => {
  unregister?.()
})
</script>

<template>
  <button
    class="policy-fab"
    type="button"
    aria-label="打开政策问答"
    @click="open = true"
  >
    <span class="policy-fab__orb" aria-hidden="true">
      <span class="policy-fab__halo" />
      <span class="policy-fab__orbit"><i /></span>
      <span class="policy-fab__core">
        <svg class="policy-fab__ball" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <radialGradient id="policyBallFill" cx="34%" cy="28%" r="78%">
              <stop offset="0%" stop-color="#fbffe9" />
              <stop offset="42%" stop-color="#e6f9ad" />
              <stop offset="76%" stop-color="#b3e673" />
              <stop offset="100%" stop-color="#5fb269" />
            </radialGradient>
            <radialGradient id="policyBallShade" cx="70%" cy="80%" r="70%">
              <stop offset="0%" stop-color="#0a4a37" stop-opacity=".2" />
              <stop offset="68%" stop-color="#0a4a37" stop-opacity="0" />
            </radialGradient>
            <clipPath id="policyBallClip">
              <circle cx="32" cy="32" r="30" />
            </clipPath>
          </defs>

          <circle cx="32" cy="32" r="30" fill="url(#policyBallFill)" />

          <g clip-path="url(#policyBallClip)">
            <g fill="#0a4a37">
              <polygon points="0,-7 6.7,-2.2 4.1,5.7 -4.1,5.7 -6.7,-2.2" transform="translate(32 5)" />
              <polygon points="0,-7 6.7,-2.2 4.1,5.7 -4.1,5.7 -6.7,-2.2" transform="translate(57.7 23.7) rotate(72)" />
              <polygon points="0,-7 6.7,-2.2 4.1,5.7 -4.1,5.7 -6.7,-2.2" transform="translate(47.9 53.8) rotate(144)" />
              <polygon points="0,-7 6.7,-2.2 4.1,5.7 -4.1,5.7 -6.7,-2.2" transform="translate(16.1 53.8) rotate(216)" />
              <polygon points="0,-7 6.7,-2.2 4.1,5.7 -4.1,5.7 -6.7,-2.2" transform="translate(6.3 23.7) rotate(288)" />
            </g>

            <g stroke="#0a4a37" stroke-opacity=".32" stroke-width="1.2" stroke-linecap="round">
              <path d="M32 21.5V2" />
              <path d="M41.3 28.3 60.5 22.7" />
              <path d="M37.8 39.2 49.6 56.3" />
              <path d="M26.2 39.2 14.4 56.3" />
              <path d="M22.7 28.3 3.5 22.7" />
            </g>

            <polygon points="32,21.5 41.3,28.3 37.8,39.2 26.2,39.2 22.7,28.3" fill="#0a4a37" />

            <g class="policy-fab__eyes" fill="#eaffb0">
              <circle cx="29.2" cy="30.2" r="2.1" />
              <circle cx="34.8" cy="30.2" r="2.1" />
            </g>
            <path
              d="M28.8 34.2c1.9 2.1 4.5 2.1 6.4 0"
              fill="none"
              stroke="#eaffb0"
              stroke-width="1.5"
              stroke-linecap="round"
            />

            <ellipse cx="21" cy="17" rx="9" ry="5.5" fill="#fff" opacity=".32" transform="rotate(-28 21 17)" />
            <circle cx="32" cy="32" r="30" fill="url(#policyBallShade)" />
          </g>

          <circle cx="32" cy="32" r="29.4" fill="none" stroke="#0a4a37" stroke-opacity=".2" stroke-width="1.4" />
        </svg>
      </span>
      <svg class="policy-fab__spark" viewBox="0 0 24 24">
        <path d="M12 1.6c.8 5.7 3.1 8 8.8 8.8-5.7.8-8 3.1-8.8 8.8-.8-5.7-3.1-8-8.8-8.8 5.7-.8 8-3.1 8.8-8.8Z" />
      </svg>
    </span>
    <span class="policy-fab__copy">
      <strong>问政策</strong>
      <small>依据正式文件回答</small>
    </span>
  </button>

  <el-drawer v-model="open" direction="rtl" size="460px" :with-header="false" class="policy-drawer">
    <div class="assistant">
      <header class="assistant__head">
        <div class="assistant__topline">
          <span class="assistant__brand">
            <span class="assistant__brand-dot" />
            政策问答
          </span>
          <div class="assistant__head-actions">
            <button
              v-if="exchanges.length"
              class="assistant__reset"
              type="button"
              title="重新提问"
              @click="resetThread"
            >
              <el-icon><RefreshLeft /></el-icon>
            </button>
            <button class="assistant__close" type="button" aria-label="关闭" @click="open = false">
              <el-icon><Close /></el-icon>
            </button>
          </div>
        </div>
        <span class="assistant__kicker">POLICY DESK</span>
        <h3>在正式文件里，<br />找得到答案</h3>
        <p>覆盖竞赛规程、报名办法与资格要求。每条回答都标注政策出处，可回到原文核对。</p>
        <div class="assistant__promises">
          <span>来源可追溯</span>
          <span>仅回答赛事政策</span>
        </div>
      </header>

      <div ref="threadRef" class="assistant__body">
        <div v-if="context" class="context-card">
          <span class="context-card__icon"><el-icon><Document /></el-icon></span>
          <div class="context-card__copy">
            <small>正在围绕这份文件提问</small>
            <strong>{{ context.title }}</strong>
          </div>
        </div>

        <div v-if="!exchanges.length" class="assistant__intro">
          <div class="intro-heading">
            <span class="intro-heading__no num">01</span>
            <div>
              <h4>可以从这些问题开始</h4>
              <p>点击问题直接提问，也可以在下方向输入框描述你的情况。</p>
            </div>
          </div>

          <div class="quick-list">
            <button
              v-if="context"
              type="button"
              class="quick-card quick-card--context"
              @click="ask(`《${context.title}》的主要规定和办理要求是什么？`)"
            >
              <span class="quick-card__no num">00</span>
              <span class="quick-card__text">这份文件的主要规定和办理要求</span>
              <el-icon><ArrowRight /></el-icon>
            </button>
            <button
              v-for="(q, index) in quickQuestions"
              :key="q"
              type="button"
              class="quick-card"
              @click="ask(q)"
            >
              <span class="quick-card__no num">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="quick-card__text">{{ q }}</span>
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>

          <div class="intro-note">
            <el-icon><Reading /></el-icon>
            回答只取自已发布的政策文件；涉及个人隐私的问题不会被处理。
          </div>
        </div>

        <div v-for="(item, index) in exchanges" :key="index" class="exchange">
          <div class="user-row">
            <div class="user-bubble">{{ item.question }}</div>
          </div>

          <div class="bot-row">
            <span class="bot-avatar"><el-icon><ChatDotRound /></el-icon></span>
            <div class="bot-card">
              <div v-if="item.loading" class="typing">
                <span class="typing__dots"><i /><i /><i /></span>
                正在检索政策原文…
              </div>

              <template v-else-if="item.answer">
                <div class="answer-head">
                  <span>{{ item.answer.aiGenerated ? '综合政策原文整理' : '政策知识库回答' }}</span>
                  <span
                    class="answer-status"
                    :class="{ 'is-limited': item.answer.status !== 'ANSWERED' }"
                  >
                    {{ item.answer.status === 'ANSWERED' ? '已找到依据' : '依据有限' }}
                  </span>
                </div>

                <p class="answer-text">{{ item.answer.answer }}</p>

                <div v-if="item.answer.citations.length" class="sources">
                  <span class="sources__label">原文依据 · {{ item.answer.citations.length }}</span>
                  <router-link
                    v-for="(citation, sourceIndex) in item.answer.citations"
                    :key="citation.contentId"
                    :to="citation.publicUrl"
                    class="source-card"
                    @click="open = false"
                  >
                    <span class="source-card__no num">{{ sourceIndex + 1 }}</span>
                    <span class="source-card__body">
                      <strong>{{ citation.title }}</strong>
                      <span>{{ citation.excerpt }}</span>
                      <small>第 {{ citation.revision }} 版 · 查看原文</small>
                    </span>
                    <el-icon><ArrowRight /></el-icon>
                  </router-link>
                </div>

                <div v-if="item.answer.fallbackPolicies.length" class="sources sources--soft">
                  <span class="sources__label">还可以参考</span>
                  <router-link
                    v-for="citation in item.answer.fallbackPolicies"
                    :key="citation.contentId"
                    :to="citation.publicUrl"
                    class="source-link"
                    @click="open = false"
                  >
                    {{ citation.title }}
                    <el-icon><ArrowRight /></el-icon>
                  </router-link>
                </div>

                <span class="ai-note">
                  {{ item.answer.aiGenerated ? 'AI 辅助生成，最终以正式文件为准' : '回答来自政策知识库，最终以正式文件为准' }}
                </span>
              </template>
            </div>
          </div>
        </div>
      </div>

      <footer class="assistant__foot">
        <div class="composer">
          <el-input
            v-model="question"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 3 }"
            resize="none"
            placeholder="描述你的问题，如：报名截止到什么时候？"
            @keydown.enter.exact.prevent="ask()"
          />
          <button
            type="button"
            class="composer__send"
            :disabled="!question.trim() || exchanges.some((item) => item.loading)"
            aria-label="发送问题"
            @click="ask()"
          >
            <el-icon :size="18"><Promotion /></el-icon>
          </button>
        </div>
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
  gap: 10px;
  padding: 7px 16px 7px 8px;
  border: 1px solid rgba(200, 243, 106, 0.18);
  border-radius: 999px;
  background:
    radial-gradient(120% 180% at 14% 0%, rgba(200, 243, 106, 0.14), transparent 48%),
    var(--brand-900);
  color: #fff;
  box-shadow: 0 10px 28px rgba(7, 59, 44, 0.26);
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.policy-fab:hover {
  transform: translateY(-2px);
  border-color: rgba(200, 243, 106, 0.38);
  box-shadow: 0 14px 34px rgba(7, 59, 44, 0.32);
}

.policy-fab:hover .policy-fab__orbit {
  animation-duration: 4s;
}

/* ---------- 政策光球 ---------- */

.policy-fab__orb {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.policy-fab__halo {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(200, 243, 106, 0.32) 0%, rgba(200, 243, 106, 0) 68%);
  animation: orb-halo 4.5s ease-in-out infinite;
}

.policy-fab__orbit {
  position: absolute;
  inset: 0;
  border: 1px dashed rgba(200, 243, 106, 0.34);
  border-radius: 50%;
  animation: orb-spin 14s linear infinite;
}

.policy-fab__orbit i {
  position: absolute;
  top: -2px;
  left: 50%;
  width: 5px;
  height: 5px;
  margin-left: -2.5px;
  border-radius: 50%;
  background: var(--lime);
  box-shadow: 0 0 8px rgba(200, 243, 106, 0.9);
}

.policy-fab__core {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 34% 28%,
    rgba(244, 255, 206, 0.95) 0%,
    rgba(167, 230, 79, 0.65) 58%,
    rgba(29, 122, 82, 0.9) 100%
  );
  box-shadow:
    0 0 16px rgba(200, 243, 106, 0.5),
    inset 0 0 8px rgba(255, 255, 255, 0.35);
  animation: orb-float 4s ease-in-out infinite;
}

.policy-fab__ball {
  display: block;
  width: 100%;
  height: 100%;
}

.policy-fab__eyes {
  transform-box: fill-box;
  transform-origin: center;
  animation: orb-blink 5.6s ease-in-out infinite;
}

.policy-fab__spark {
  position: absolute;
  top: -3px;
  right: -4px;
  width: 13px;
  height: 13px;
  fill: var(--lime);
  filter: drop-shadow(0 0 4px rgba(200, 243, 106, 0.8));
  transform-origin: center;
  animation: orb-spark 3.4s ease-in-out infinite;
}

@keyframes orb-halo {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.92);
  }
  50% {
    opacity: 1;
    transform: scale(1.06);
  }
}

@keyframes orb-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes orb-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}

@keyframes orb-blink {
  0%,
  91%,
  100% {
    transform: scaleY(1);
  }
  94%,
  96% {
    transform: scaleY(0.12);
  }
}

@keyframes orb-spark {
  0%,
  100% {
    opacity: 0.5;
    transform: scale(0.8) rotate(0deg);
  }
  50% {
    opacity: 1;
    transform: scale(1.12) rotate(18deg);
  }
}

.policy-fab__copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  line-height: 1.25;
}

.policy-fab__copy strong {
  font-size: 13px;
  font-weight: 600;
}

.policy-fab__copy small {
  font-size: 9.5px;
  color: rgba(255, 255, 255, 0.5);
}

.assistant {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -20px;
}

.assistant__head {
  position: relative;
  overflow: hidden;
  padding: 18px 22px 20px;
  background:
    radial-gradient(120% 100% at 100% 0%, rgba(200, 243, 106, 0.13) 0%, transparent 52%),
    var(--brand-900);
  color: #fff;
}

.assistant__head::after {
  content: '';
  position: absolute;
  right: -48px;
  bottom: -72px;
  width: 190px;
  height: 190px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 50%;
  pointer-events: none;
}

.assistant__topline {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.assistant__brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}

.assistant__brand-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--lime);
}

.assistant__head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.assistant__reset,
.assistant__close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 50%;
  background: transparent;
  color: rgba(255, 255, 255, 0.76);
  cursor: pointer;
  transition: 0.15s;
}

.assistant__reset:hover,
.assistant__close:hover {
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
}

.assistant__kicker {
  position: relative;
  z-index: 1;
  display: block;
  margin-top: 20px;
  font-family: var(--font-display);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--lime);
}

.assistant__head h3 {
  position: relative;
  z-index: 1;
  margin-top: 7px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.35;
}

.assistant__head > p {
  position: relative;
  z-index: 1;
  max-width: 360px;
  margin-top: 9px;
  font-size: 12px;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.56);
}

.assistant__promises {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
}

.assistant__promises span {
  padding: 3px 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
}

.assistant__body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 22px;
  background: var(--paper);
  scroll-behavior: smooth;
}

.context-card {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 11px 12px;
  border: 1px solid var(--brand-100);
  border-radius: 8px;
  background: #fff;
}

.context-card__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 7px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.context-card__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.context-card__copy small {
  font-size: 10px;
  color: var(--ink-300);
}

.context-card__copy strong {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--brand-800);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.assistant__intro {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}

.intro-heading {
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.intro-heading__no {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-900);
  color: var(--lime);
  font-size: 10.5px;
  font-weight: 700;
}

.intro-heading h4 {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-900);
}

.intro-heading p {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--ink-500);
}

.quick-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 15px;
}

.quick-card {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--paper);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
}

.quick-card:hover {
  border-color: var(--brand-500);
  background: var(--brand-50);
}

.quick-card--context {
  border-color: var(--brand-100);
  background: var(--brand-50);
}

.quick-card__no {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  color: var(--ink-300);
}

.quick-card--context .quick-card__no {
  color: var(--brand-600);
}

.quick-card__text {
  flex: 1;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--ink-700);
}

.quick-card .el-icon {
  flex-shrink: 0;
  color: var(--ink-300);
}

.quick-card:hover .el-icon {
  color: var(--brand-600);
}

.intro-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--ink-300);
}

.intro-note .el-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.exchange {
  margin-bottom: 20px;
}

.user-row {
  display: flex;
  justify-content: flex-end;
}

.user-bubble {
  max-width: 84%;
  padding: 10px 14px;
  border-radius: 12px 12px 3px 12px;
  background: var(--brand-800);
  color: #fff;
  font-size: 13px;
  line-height: 1.65;
}

.bot-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 10px;
}

.bot-avatar {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  margin-top: 2px;
  border-radius: 50%;
  background: var(--brand-900);
  color: var(--lime);
  font-size: 13px;
}

.bot-card {
  flex: 1;
  min-width: 0;
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: 3px 12px 12px 12px;
  background: #fff;
}

.typing {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-500);
}

.typing__dots {
  display: inline-flex;
  gap: 3px;
}

.typing__dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--brand-500);
  animation: typing-bounce 1.1s infinite ease-in-out;
}

.typing__dots i:nth-child(2) {
  animation-delay: 0.15s;
}

.typing__dots i:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes typing-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

.answer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 10.5px;
  color: var(--ink-300);
}

.answer-status {
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9.5px;
}

.answer-status.is-limited {
  background: var(--live-soft);
  color: var(--live);
}

.answer-text {
  margin-top: 9px;
  font-size: 13px;
  line-height: 1.85;
  color: var(--ink-700);
  white-space: pre-line;
}

.sources {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 13px;
  padding-top: 11px;
  border-top: 1px dashed var(--line);
}

.sources__label {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-300);
}

.source-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  transition: border-color 0.15s, background-color 0.15s;
}

.source-card:hover {
  border-color: var(--brand-400, var(--brand-500));
  background: var(--brand-50);
}

.source-card__no {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--brand-900);
  color: var(--lime);
  font-size: 9px;
  font-weight: 700;
}

.source-card__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.source-card__body strong {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--brand-800);
}

.source-card__body span {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ink-500);
}

.source-card__body small {
  font-size: 9.5px;
  color: var(--brand-600);
}

.source-card > .el-icon {
  flex-shrink: 0;
  margin-top: 3px;
  font-size: 12px;
  color: var(--ink-300);
}

.sources--soft {
  gap: 5px;
}

.source-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 11.5px;
  color: var(--brand-700);
}

.source-link:hover {
  background: var(--brand-50);
}

.ai-note {
  display: block;
  margin-top: 10px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.assistant__foot {
  padding: 13px 18px 15px;
  background: #fff;
  border-top: 1px solid var(--line);
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 5px 5px 5px 6px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.composer:focus-within {
  border-color: var(--brand-500);
  box-shadow: 0 0 0 3px rgba(26, 167, 122, 0.08);
}

.composer :deep(.el-textarea__inner) {
  padding: 7px 6px;
  border: none;
  background: transparent;
  box-shadow: none;
  font-size: 13px;
  line-height: 1.6;
}

.composer__send {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: none;
  border-radius: 7px;
  background: var(--brand-700);
  color: #fff;
  cursor: pointer;
  transition: background-color 0.15s, opacity 0.15s;
}

.composer__send:hover:not(:disabled) {
  background: var(--brand-800);
}

.composer__send:disabled {
  background: var(--line-strong);
  cursor: not-allowed;
}

.assistant__foot > p {
  margin-top: 7px;
  font-size: 10px;
  color: var(--ink-300);
  text-align: center;
}

@media (max-width: 520px) {
  .policy-fab {
    right: 16px;
    bottom: 18px;
    padding: 6px;
    gap: 0;
  }

  .policy-fab__copy {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .policy-fab__halo,
  .policy-fab__orbit,
  .policy-fab__core,
  .policy-fab__eyes,
  .policy-fab__spark {
    animation: none;
  }
}
</style>
