<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Football, Medal } from '@element-plus/icons-vue'
import { publicApi } from '../../api'
import type { GoalRankingRow } from '../../api/types'

const loading = ref(false)
const rows = ref<GoalRankingRow[]>([])
const category = ref('PRIMARY')
const generatedAt = ref('')

const categories = [
  { label: '小学组', value: 'PRIMARY' },
  { label: '初中组', value: 'MIDDLE' },
  { label: '高校组', value: 'UNIVERSITY' },
]

const currentCategoryLabel = computed(
  () => categories.find((item) => item.value === category.value)?.label || '当前组别',
)

/**
 * 公开接口返回的 rank 是跨组别生成的，切组后会出现空号。
 * 这里按组内进球数重排；同分并列，后续名次顺延（1、1、3）。
 */
const rankedRows = computed(() => {
  const sorted = [...rows.value].sort(
    (a, b) => b.goals - a.goals || a.athleteName.localeCompare(b.athleteName, 'zh-Hans-CN'),
  )
  let lastGoals: number | null = null
  let lastRank = 0
  return sorted.map((row, index) => {
    const rank = row.goals === lastGoals ? lastRank : index + 1
    lastGoals = row.goals
    lastRank = rank
    return { ...row, rank }
  })
})

const podium = computed(() => rankedRows.value.slice(0, 3))
const rest = computed(() => rankedRows.value.slice(3))
const generatedTime = computed(() =>
  generatedAt.value ? dayjs(generatedAt.value).format('MM-DD HH:mm') : '',
)

async function load() {
  loading.value = true
  try {
    const res = await publicApi.goals({ groupCategory: category.value })
    rows.value = res.rows
    generatedAt.value = res.generatedAt
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function switchCategory(value: string) {
  if (category.value === value) return
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
          <h1>射手榜</h1>
          <p>按组别统计已发布赛果中的进球数据；同分并列，后续名次顺延。</p>
        </div>
        <div class="hero-badge">
          <el-icon :size="25"><Football /></el-icon>
          <div>
            <strong class="num">{{ rows.length }}</strong>
            <span>{{ currentCategoryLabel }} · 上榜球员</span>
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
        <span v-if="generatedTime" class="updated">
          2026 赛季 · 统计生成于 {{ generatedTime }}
        </span>
      </div>

      <div v-loading="loading" class="ranking-content">
        <p class="group-note">{{ currentCategoryLabel }} · 组内排名，不与其它年龄组混排</p>

        <div v-if="podium.length" class="podium">
          <div
            v-for="(row, index) in podium"
            :key="row.athleteId"
            class="podium-card"
            :class="`podium-card--${index + 1}`"
          >
            <span class="podium-card__rank num">{{ row.rank }}</span>
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
            <span class="table-row__goals num">{{ row.goals }}<i>球</i></span>
          </div>
          <el-empty v-if="!loading && !rows.length" :description="`${currentCategoryLabel}暂无进球数据`" />
          <div v-if="!loading && rows.length && !rest.length" class="table-foot">
            当前组别仅展示前 {{ rows.length }} 名球员
          </div>
        </div>
      </div>

      <p class="ranking-note">
        <el-icon><Medal /></el-icon>
        <span>
          射手榜数据来源于比赛记录台提交并确认的进球事件；同一球员按组内总进球数排名，进球相同并列。
          如对统计有异议，请由参赛单位向组委会书面申诉。
        </span>
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
  padding: 28px 0 26px;
  background: var(--brand-900);
  color: #fff;
}

.hero-grid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.page-hero h1 {
  font-size: 27px;
  font-weight: 600;
}

.page-hero p {
  margin-top: 7px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
}

.hero-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 17px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--lime);
}

.hero-badge strong {
  display: block;
  font-size: 24px;
  line-height: 1;
}

.hero-badge span {
  display: block;
  margin-top: 4px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.68);
}

.ranking-body {
  margin-top: 20px;
}

.ranking-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 10px 12px;
  margin-bottom: 18px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line);
}

.tabs {
  display: flex;
  gap: 4px;
}

.tab {
  min-height: 36px;
  padding: 7px 16px;
  border: none;
  border-radius: 5px;
  background: transparent;
  font-size: 14px;
  color: var(--ink-500);
  cursor: pointer;
}

.tab:hover {
  background: var(--paper);
}

.tab.is-active {
  background: var(--brand-700);
  color: #fff;
  font-weight: 600;
}

.updated {
  font-size: 13px;
  color: var(--ink-500);
}

.ranking-content {
  min-height: 200px;
}

.group-note {
  margin-bottom: 10px;
  font-size: 13.5px;
  color: var(--ink-500);
}

.podium {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.podium-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 14px 14px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line);
  overflow: hidden;
}

.podium-card--1 {
  background: var(--brand-900);
  border-color: var(--brand-900);
  color: #fff;
}

.podium-card--1 .podium-card__avatar {
  background: var(--lime);
  color: var(--brand-900);
}

.podium-card--1 small {
  color: #dcefe6;
}

.podium-card--1 .podium-card__goals {
  color: var(--lime);
}

.podium-card__rank {
  position: absolute;
  right: 15px;
  top: 8px;
  font-size: 30px;
  font-weight: 800;
  color: rgba(11, 122, 83, 0.1);
}

.podium-card--1 .podium-card__rank {
  color: rgba(200, 243, 106, 0.2);
}

.podium-card__avatar {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-800);
  font-size: 18px;
  font-weight: 700;
}

.podium-card strong {
  margin-top: 8px;
  font-size: 16px;
}

.podium-card small {
  margin-top: 3px;
  font-size: 14px;
  color: var(--ink-500);
}

.podium-card__goals {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 800;
  color: var(--brand-700);
}

.podium-card__goals i {
  margin-left: 2px;
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
}

.table-card {
  border-radius: 8px;
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
  height: 44px;
  background: #f7f9f8;
  font-size: 12.5px;
  letter-spacing: 0.04em;
  color: var(--ink-500);
}

.table-row {
  min-height: 62px;
  border-top: 1px solid var(--line);
}

.table-row__rank {
  font-size: 15px;
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
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.table-row__player strong {
  font-size: 16px;
}

.table-row__team {
  font-size: 14px;
  color: var(--ink-500);
}

.table-row__goals {
  text-align: right;
  font-size: 19px;
  font-weight: 800;
  color: var(--brand-700);
}

.table-row__goals i {
  margin-left: 2px;
  font-size: 11px;
  font-style: normal;
  font-weight: 500;
}

.align-right {
  text-align: right;
}

.table-foot {
  padding: 14px;
  text-align: center;
  font-size: 13px;
  color: var(--ink-500);
  border-top: 1px solid var(--line);
}

.ranking-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 20px;
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink-500);
}

.ranking-note .el-icon {
  flex-shrink: 0;
  margin-top: 3px;
}

@media (max-width: 760px) {
  .page-hero {
    padding: 22px 0 20px;
  }

  .page-hero h1 {
    font-size: 23px;
  }

  .hero-grid {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
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
    font-size: 17px;
  }
}
</style>
