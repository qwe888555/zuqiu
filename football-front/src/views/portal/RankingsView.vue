<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Medal, Trophy } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { GoalRankingRow } from '../../api/types'

const loading = ref(false)
const rows = ref<GoalRankingRow[]>([])
const category = ref('')
const generatedAt = ref('')

const categories = [
  { label: '全部组别', value: '' },
  { label: '小学组', value: 'PRIMARY' },
  { label: '初中组', value: 'MIDDLE' },
  { label: '高校组', value: 'UNIVERSITY' },
]

const podium = computed(() => rows.value.slice(0, 3))
const rest = computed(() => rows.value.slice(3))

async function load() {
  loading.value = true
  try {
    const res = await publicApi.goals({ groupCategory: category.value || undefined })
    rows.value = [...res.rows].sort((a, b) => a.rank - b.rank)
    generatedAt.value = res.generatedAt
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function switchCategory(value: string) {
  category.value = value
  load()
}

onMounted(load)
</script>

<template>
  <div class="ranking-page">
    <section class="page-hero">
      <div class="container hero-grid">
        <div>
          <span class="eyebrow">TOP SCORERS · 2026</span>
          <h1>射手榜</h1>
          <p>统计全部已发布赛果中的进球数据，同一球员按总进球数排名。</p>
        </div>
        <div class="hero-badge">
          <el-icon :size="26"><Trophy /></el-icon>
          <div>
            <strong>{{ rows.length }}</strong>
            <span>上榜球员</span>
          </div>
        </div>
      </div>
    </section>

    <div class="container ranking-body">
      <div class="ranking-toolbar">
        <div class="tabs">
          <button
            v-for="item in categories"
            :key="item.value"
            type="button"
            class="tab"
            :class="{ 'is-active': category === item.value }"
            @click="switchCategory(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
        <span v-if="generatedAt" class="updated">数据更新于 {{ new Date(generatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
      </div>

      <div v-loading="loading" class="ranking-content">
        <div v-if="podium.length" class="podium">
          <div
            v-for="(row, index) in podium"
            :key="row.athleteId"
            class="podium-card"
            :class="`podium-card--${index + 1}`"
          >
            <span class="podium-card__rank num">{{ index + 1 }}</span>
            <span class="podium-card__avatar">{{ row.athleteName.slice(0, 1) }}</span>
            <strong>{{ row.athleteName }}</strong>
            <small>{{ row.teamName }}</small>
            <span class="podium-card__goals num">{{ row.goals }}<i>球</i></span>
          </div>
        </div>

        <div class="table-card">
          <div class="table-head">
            <span>排名</span>
            <span>球员</span>
            <span>所属球队</span>
            <span class="align-right">进球数</span>
          </div>
          <div v-for="row in rest" :key="row.athleteId" class="table-row">
            <span class="table-row__rank num">{{ row.rank }}</span>
            <span class="table-row__player">
              <span class="table-row__avatar">{{ row.athleteName.slice(0, 1) }}</span>
              <strong>{{ row.athleteName }}</strong>
            </span>
            <span class="table-row__team">{{ row.teamName }}</span>
            <span class="table-row__goals num">{{ row.goals }}</span>
          </div>
          <el-empty v-if="!loading && !rows.length" description="暂无进球数据" />
          <div v-if="!loading && rows.length && !rest.length" class="table-foot">仅展示前 {{ rows.length }} 名球员</div>
        </div>
      </div>

      <p class="ranking-note">
        <el-icon><Medal /></el-icon>
        射手榜数据来源于比赛记录台提交的进球事件；如对统计有异议，请由参赛单位向组委会书面申诉。
      </p>
    </div>
  </div>
</template>

<style scoped>
.ranking-page {
  min-height: 70vh;
  padding-bottom: 60px;
  background: var(--paper);
}

.page-hero {
  padding: 54px 0 44px;
  background:
    radial-gradient(circle at 84% 10%, rgba(200, 241, 105, 0.15), transparent 34%),
    linear-gradient(150deg, #075c40, #054331);
  color: #fff;
}

.hero-grid {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.eyebrow {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.24em;
  color: var(--lime);
}

.page-hero h1 {
  margin-top: 9px;
  font-size: 36px;
}

.page-hero p {
  margin-top: 9px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.56);
}

.hero-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 20px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--lime);
}

.hero-badge strong {
  display: block;
  font-size: 24px;
  line-height: 1;
  font-family: var(--font-display);
}

.hero-badge span {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.45);
}

.ranking-body {
  margin-top: -16px;
  position: relative;
}

.ranking-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 10px 14px;
  margin-bottom: 22px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: var(--shadow-card);
}

.tabs {
  display: flex;
  gap: 4px;
}

.tab {
  padding: 8px 15px;
  border: none;
  border-radius: 9px;
  background: transparent;
  font-size: 12.5px;
  color: var(--ink-500);
  cursor: pointer;
}

.tab.is-active {
  background: var(--brand-700);
  color: #fff;
  font-weight: 600;
}

.updated {
  font-size: 10px;
  color: var(--ink-300);
}

.ranking-content {
  min-height: 200px;
}

.podium {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.podium-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 18px 20px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--line);
  overflow: hidden;
}

.podium-card--1 {
  background: linear-gradient(160deg, #0b5c40, #073e2c);
  border-color: transparent;
  color: #fff;
}

.podium-card--1 .podium-card__avatar {
  background: var(--lime);
  color: var(--brand-900);
}

.podium-card--1 small {
  color: rgba(255, 255, 255, 0.5);
}

.podium-card--1 .podium-card__goals {
  color: var(--lime);
}

.podium-card__rank {
  position: absolute;
  right: 16px;
  top: 10px;
  font-size: 34px;
  font-weight: 800;
  color: rgba(11, 122, 83, 0.1);
}

.podium-card--1 .podium-card__rank {
  color: rgba(200, 241, 105, 0.18);
}

.podium-card__avatar {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-800);
  font-size: 21px;
  font-weight: 700;
}

.podium-card strong {
  margin-top: 11px;
  font-size: 15px;
}

.podium-card small {
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.podium-card__goals {
  margin-top: 12px;
  font-size: 25px;
  font-weight: 800;
  color: var(--brand-700);
}

.podium-card__goals i {
  margin-left: 2px;
  font-size: 10px;
  font-style: normal;
  font-weight: 400;
}

.table-card {
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--line);
  overflow: hidden;
}

.table-head,
.table-row {
  display: grid;
  grid-template-columns: 70px minmax(0, 1.4fr) minmax(0, 1.2fr) 110px;
  align-items: center;
  gap: 12px;
  padding: 0 22px;
}

.table-head {
  height: 42px;
  background: #f6faf8;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--ink-300);
}

.table-row {
  min-height: 58px;
  border-top: 1px solid var(--line);
}

.table-row__rank {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-500);
}

.table-row__player {
  display: flex;
  align-items: center;
  gap: 10px;
}

.table-row__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 11px;
  font-weight: 700;
}

.table-row__player strong {
  font-size: 12.5px;
}

.table-row__team {
  font-size: 11.5px;
  color: var(--ink-500);
}

.table-row__goals {
  text-align: right;
  font-size: 17px;
  font-weight: 800;
  color: var(--brand-700);
}

.align-right {
  text-align: right;
}

.table-foot {
  padding: 14px;
  text-align: center;
  font-size: 10.5px;
  color: var(--ink-300);
  border-top: 1px solid var(--line);
}

.ranking-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 20px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--ink-300);
}

@media (max-width: 760px) {
  .hero-grid {
    align-items: flex-start;
    flex-direction: column;
  }

  .podium {
    grid-template-columns: 1fr;
  }

  .table-head,
  .table-row {
    grid-template-columns: 44px minmax(0, 1.3fr) 70px;
    padding: 0 14px;
  }

  .table-head span:nth-child(3),
  .table-row__team {
    display: none;
  }

  .table-row__goals {
    font-size: 15px;
  }
}
</style>
