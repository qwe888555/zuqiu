<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Location } from '@element-plus/icons-vue'
import type { PublicMatch } from '../../api/types'
import StatusTag from '../common/StatusTag.vue'
import { matchDisplayStatus } from '../../utils/portal'

const props = defineProps<{ match: PublicMatch; followedTeam?: string }>()

const displayStatus = computed(() => matchDisplayStatus(props.match))
const isScheduled = computed(() => displayStatus.value === 'SCHEDULED')
const isCancelled = computed(() => displayStatus.value === 'CANCELLED')
const followedSide = computed(() => {
  if (!props.followedTeam) return ''
  if (props.match.homeTeamName === props.followedTeam) return 'home'
  if (props.match.awayTeamName === props.followedTeam) return 'away'
  return ''
})

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const dateText = computed(() =>
  props.match.kickoffAt
    ? `${dayjs(props.match.kickoffAt).format('MM月DD日')} · ${weekdays[dayjs(props.match.kickoffAt).day()]}`
    : '日期待定',
)

function formatTime(value?: string) {
  return value ? dayjs(value).format('HH:mm') : '--:--'
}
</script>

<template>
  <router-link
    :to="`/matches/${match.id}`"
    class="match-row"
    :class="{
      'is-live': displayStatus === 'LIVE',
      'is-followed': followedSide,
    }"
  >
    <div class="match-row__time">
      <span class="match-row__date">{{ dateText }}</span>
      <strong class="num">{{ formatTime(match.kickoffAt) }}</strong>
      <StatusTag :status="displayStatus" kind="match" />
      <span v-if="followedSide" class="match-row__follow">已关注</span>
    </div>

    <span class="match-row__group">{{ match.groupName || '组别待定' }}</span>

    <div class="match-row__teams">
      <span class="team team--home">{{ match.homeTeamName || '未关联球队' }}</span>
      <span class="score num" :class="{ 'is-upcoming': isScheduled }">
        <template v-if="isScheduled">VS</template>
        <template v-else-if="isCancelled">—</template>
        <template v-else>{{ match.homeScore }} : {{ match.awayScore }}</template>
      </span>
      <span class="team team--away">{{ match.awayTeamName || '未关联球队' }}</span>
    </div>

    <div class="match-row__venue">
      <el-icon><Location /></el-icon>
      <span>{{ match.venue || '场地待定' }}</span>
    </div>

    <span class="match-row__arrow">›</span>
  </router-link>
</template>

<style scoped>
.match-row {
  display: grid;
  grid-template-columns: 108px 92px minmax(0, 1.8fr) minmax(150px, 0.7fr) 18px;
  align-items: center;
  gap: 16px;
  min-height: 92px;
  padding: 15px 20px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line);
  transition: border-color 0.16s, box-shadow 0.16s;
}

.match-row:hover {
  border-color: var(--brand-500);
  box-shadow: var(--shadow-card);
}

.match-row.is-live {
  border-color: rgba(181, 71, 8, 0.28);
  background: var(--live-soft);
}

.match-row.is-followed {
  background: #fbfdf9;
}

.match-row__time {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.match-row__date {
  font-size: 12.5px;
  line-height: 1.3;
  color: var(--ink-500);
}

.match-row__time strong {
  font-size: 19px;
  line-height: 1.1;
  color: var(--ink-900);
}

.match-row__follow {
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 11px;
  font-weight: 600;
}

.match-row__group {
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--paper);
  font-size: 13px;
  line-height: 1.4;
  color: var(--ink-700);
  text-align: center;
}

.match-row__teams {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.team {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 16px;
  line-height: 1.45;
  color: var(--ink-900);
}

.match-row.is-followed .team {
  font-weight: 600;
}

.team--home {
  text-align: right;
}

.team--away {
  text-align: left;
}

.score {
  text-align: center;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
  color: var(--brand-800);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.score.is-upcoming {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink-300);
}

.match-row__venue {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  min-width: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-500);
}

.match-row__venue .el-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--ink-300);
}

.match-row__venue span {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.match-row__arrow {
  color: var(--ink-300);
  font-size: 20px;
  text-align: right;
}

@media (max-width: 860px) {
  .match-row {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 12px;
    min-height: 0;
    padding: 14px 16px;
  }

  .match-row__time {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .match-row__date {
    font-size: 13px;
  }

  .match-row__time strong {
    font-size: 18px;
  }

  .match-row__group,
  .match-row__venue,
  .match-row__arrow {
    display: none;
  }

  .match-row__teams {
    grid-column: 1 / -1;
    order: 2;
    grid-template-columns: minmax(0, 1fr) 84px minmax(0, 1fr);
  }

  .team {
    font-size: 15px;
  }

  .score {
    font-size: 20px;
  }
}
</style>
