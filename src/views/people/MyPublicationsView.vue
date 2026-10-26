<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Medal, Refresh, View } from '@element-plus/icons-vue'
import { meApi, publicApi } from '../../api'
import { publicityApi } from '../../api/selection'
import type { Person, PublicityRecord } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const loading = ref(false)
const person = ref<Person | null>(null)
const rows = ref<PublicityRecord[]>([])
const activeFilter = ref<'all' | 'active' | 'cancelled'>('all')

const filtered = computed(() => {
  if (activeFilter.value === 'active') return rows.value.filter((item) => item.status === 'PUBLISHED')
  if (activeFilter.value === 'cancelled') return rows.value.filter((item) => item.status === 'CANCELLED')
  return rows.value
})

const activeCount = computed(() => rows.value.filter((item) => item.status === 'PUBLISHED').length)

async function load() {
  loading.value = true
  try {
    person.value = await meApi.profile()
    const current = person.value
    // 门户列表只含公示中的记录，本人页面还需要已撤销记录，所以走 CMS 管理列表。
    // sourceId 是报名档案（名册/教练关系/报名单）的主键，不是人员 ID，不能用来归属；
    // 运动员与教练公示都带脱敏证件号，用它和本人档案比对，缺失时再退回姓名 + 学校。
    const matchesSelf = (item: PublicityRecord) => {
      if (item.publicityType === 'TEAM') return false
      if (item.idCardMasked) {
        return !!current.maskedIdNumber && item.idCardMasked === current.maskedIdNumber
      }
      return item.name === current.realName && item.schoolName === current.schoolName
    }
    const events = await publicApi.events({ page: 1, pageSize: 100 })
    const collected: PublicityRecord[] = []
    for (const event of events.items) {
      const res = await publicityApi.manageList({
        eventId: event.id,
        keyword: current.realName,
        page: 1,
        size: 100,
      })
      collected.push(...res.items.filter(matchesSelf))
    }
    rows.value = collected.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="我的公示"
      description="查看本人被纳入赛事公示的信息。公示内容仅供赛事展示，不包含身份证号、手机号等敏感信息。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <section class="publication-hero">
      <div class="publication-hero__icon"><el-icon :size="26"><Medal /></el-icon></div>
      <div>
        <span>公示档案</span>
        <h2>{{ person?.realName || '—' }}</h2>
        <p>{{ person?.schoolName || '学校未登记' }} · 公示中的运动员 / 教练员信息</p>
      </div>
      <div class="publication-hero__count">
        <strong class="num">{{ activeCount }}</strong>
        <span>条公示中</span>
      </div>
    </section>

    <section class="page-card">
      <FilterBar :summary="'共 ' + filtered.length + ' 条记录'">
        <el-radio-group v-model="activeFilter">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="active">公示中</el-radio-button>
          <el-radio-button value="cancelled">已撤销</el-radio-button>
        </el-radio-group>
      </FilterBar>

      <div v-loading="loading" class="publication-list">
        <article v-for="item in filtered" :key="item.id" class="publication-card">
          <div class="publication-card__head">
            <span class="publication-card__tag">{{ item.publicityTypeLabel }}</span>
            <el-tag :type="item.status === 'PUBLISHED' ? 'success' : 'info'" size="small" effect="plain">
              {{ item.statusLabel }}
            </el-tag>
          </div>
          <h3>{{ item.name || person?.realName || '—' }}</h3>
          <p>{{ item.teamName || '球队未登记' }} · {{ item.groupTypeLabel || '组别未登记' }}</p>
          <div class="publication-card__meta">
            <span>市州：{{ item.city || '—' }}</span>
            <span>公示时间：{{ item.publishedAt || '—' }}</span>
          </div>
          <div v-if="item.status === 'CANCELLED'" class="publication-card__cancelled">
            撤销于 {{ item.cancelledAt || '—' }}{{ item.cancelReason ? ` · ${item.cancelReason}` : '' }}
          </div>
        </article>
        <el-empty v-if="!loading && !filtered.length" description="暂无公示记录" :image-size="90" />
      </div>
    </section>

    <section class="page-card privacy-card">
      <div class="privacy-card__icon"><el-icon :size="19"><View /></el-icon></div>
      <div>
        <strong>公示信息说明</strong>
        <p>
          公示仅展示姓名、球队、组别与市州等必要信息。如需更正或撤销公示，请联系赛事管理员处理；公示撤销后不再展示在门户。
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.publication-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 20px 22px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: #fff;
  color: var(--ink-900);
}

.publication-hero__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.publication-hero > div:nth-child(2) {
  flex: 1;
}

.publication-hero span {
  font-size: 11px;
  color: var(--ink-500);
}

.publication-hero h2 {
  margin-top: 3px;
  font-size: 21px;
}

.publication-hero p {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--ink-500);
}

.publication-hero__count {
  text-align: right;
}

.publication-hero__count strong {
  display: block;
  font-size: 30px;
  color: var(--brand-700);
}

.publication-hero__count span {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--ink-500);
}

.publication-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

.publication-card {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.publication-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.publication-card__tag {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9px;
  font-weight: 600;
}

.publication-card h3 {
  margin-top: 12px;
  font-size: 16px;
}

.publication-card > p {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.publication-card__meta {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
  font-size: 10px;
  color: var(--ink-500);
}

.publication-card__cancelled {
  margin-top: 10px;
  padding: 6px 9px;
  border-radius: 6px;
  background: #f8f1f1;
  font-size: 9.5px;
  color: #a06565;
}

.privacy-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 16px;
  padding: 18px 20px;
}

.privacy-card__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.privacy-card strong {
  font-size: 12.5px;
}

.privacy-card p {
  margin-top: 4px;
  font-size: 10.5px;
  line-height: 1.8;
  color: var(--ink-500);
}
</style>
