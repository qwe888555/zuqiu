<script setup lang="ts">
import { computed } from 'vue'
import type { StatRow } from '../../api/types'

const props = defineProps<{
  rows: StatRow[]
  selected?: string
}>()

defineEmits<{ select: [city: string] }>()

interface CityTile {
  key: string
  label: string
  col: string
  row: string
}

/**
 * 21 个市州的示意布局：按大致地理方位排布，用于报名热度对比，
 * 不作为行政区划地图使用。
 */
const CITY_TILES: CityTile[] = [
  { key: '阿坝', label: '阿坝州', col: '1 / span 2', row: '1' },
  { key: '广元', label: '广元市', col: '3', row: '1' },
  { key: '巴中', label: '巴中市', col: '4', row: '1' },
  { key: '达州', label: '达州市', col: '5 / span 2', row: '1' },
  { key: '甘孜', label: '甘孜州', col: '1', row: '2 / span 2' },
  { key: '绵阳', label: '绵阳市', col: '2', row: '2' },
  { key: '德阳', label: '德阳市', col: '3', row: '2' },
  { key: '南充', label: '南充市', col: '4', row: '2' },
  { key: '广安', label: '广安市', col: '5', row: '2' },
  { key: '成都', label: '成都市', col: '2', row: '3' },
  { key: '资阳', label: '资阳市', col: '3', row: '3' },
  { key: '遂宁', label: '遂宁市', col: '4', row: '3' },
  { key: '内江', label: '内江市', col: '5', row: '3' },
  { key: '泸州', label: '泸州市', col: '6', row: '3 / span 2' },
  { key: '雅安', label: '雅安市', col: '1', row: '4' },
  { key: '眉山', label: '眉山市', col: '2', row: '4' },
  { key: '乐山', label: '乐山市', col: '3', row: '4' },
  { key: '自贡', label: '自贡市', col: '4', row: '4' },
  { key: '宜宾', label: '宜宾市', col: '5', row: '4' },
  { key: '凉山', label: '凉山州', col: '1 / span 2', row: '5' },
  { key: '攀枝花', label: '攀枝花市', col: '3', row: '5' },
]

function cityKey(label: string) {
  return label
    .replace(/(藏族羌族自治州|彝族自治州|藏族自治州|自治州|地区|市|州)$/g, '')
    .trim()
}

const statsByCity = computed(() => {
  const map = new Map<string, StatRow>()
  props.rows.forEach((row) => {
    const key = cityKey(row.label)
    const current = map.get(key)
    if (current) {
      current.teamCount += row.teamCount
      current.athleteCount += row.athleteCount
      current.pendingCount = (current.pendingCount || 0) + (row.pendingCount || 0)
      current.approvedCount = (current.approvedCount || 0) + (row.approvedCount || 0)
    } else {
      map.set(key, { ...row, key })
    }
  })
  return map
})

const maxTeams = computed(() => Math.max(1, ...Array.from(statsByCity.value.values()).map((row) => row.teamCount)))

const unmapped = computed(() =>
  props.rows.filter((row) => !CITY_TILES.some((tile) => tile.key === cityKey(row.label))),
)

function tileStat(tile: CityTile) {
  return statsByCity.value.get(tile.key)
}

function levelOf(tile: CityTile) {
  const count = tileStat(tile)?.teamCount || 0
  if (!count) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / maxTeams.value) * 4)))
}

function tipOf(tile: CityTile) {
  const stat = tileStat(tile)
  if (!stat) return `${tile.label}：暂无报名`
  return `${tile.label}：${stat.teamCount} 支球队 / ${stat.athleteCount} 名球员 / 待审 ${stat.pendingCount || 0}`
}
</script>

<template>
  <div class="city-heatmap">
    <div class="city-heatmap__grid">
      <button
        v-for="tile in CITY_TILES"
        :key="tile.key"
        type="button"
        class="city-tile"
        :class="[`level-${levelOf(tile)}`, { 'is-selected': selected === tile.key }]"
        :style="{ gridColumn: tile.col, gridRow: tile.row }"
        :title="tipOf(tile)"
        @click="$emit('select', tile.key)"
      >
        <span class="city-tile__name">{{ tile.label }}</span>
        <span class="city-tile__value num">{{ tileStat(tile)?.teamCount || 0 }}</span>
        <span class="city-tile__unit">支</span>
      </button>
    </div>

    <div class="city-heatmap__foot">
      <div class="heat-legend">
        <span>报名热度</span>
        <i class="level-0" /><i class="level-1" /><i class="level-2" /><i class="level-3" /><i class="level-4" />
        <span>低 → 高</span>
      </div>
      <span v-if="unmapped.length" class="city-heatmap__note">
        另有 {{ unmapped.length }} 条未匹配市州的记录已计入明细
      </span>
    </div>
  </div>
</template>

<style scoped>
.city-heatmap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.city-heatmap__grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  grid-auto-rows: 58px;
  gap: 6px;
}

.city-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 9px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.city-tile:hover {
  border-color: var(--brand-500);
}

.city-tile.is-selected {
  border-color: var(--brand-900);
  box-shadow: 0 0 0 2px rgba(6, 74, 53, 0.14);
}

.city-tile__name {
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
}

.city-tile__value {
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
}

.city-tile__unit {
  position: absolute;
  right: 8px;
  bottom: 8px;
  font-size: 8.5px;
  opacity: 0.65;
}

.level-0 {
  background: #f3f7f5;
  border-color: var(--line);
  color: var(--ink-300);
}

.level-1 {
  background: #e4f5ec;
  color: var(--brand-800);
}

.level-2 {
  background: #b9e6d1;
  color: var(--brand-900);
}

.level-3 {
  background: #63b992;
  color: #fff;
}

.level-4 {
  background: linear-gradient(145deg, var(--brand-700), var(--brand-900));
  color: #fff;
}

.city-heatmap__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 9.5px;
  color: var(--ink-300);
}

.heat-legend {
  display: flex;
  align-items: center;
  gap: 4px;
}

.heat-legend i {
  width: 14px;
  height: 7px;
  border-radius: 2px;
}

.heat-legend span:first-child {
  margin-right: 4px;
  color: var(--ink-500);
}

.city-heatmap__note {
  color: var(--ink-300);
}

@media (max-width: 760px) {
  .city-heatmap__grid {
    display: flex;
    flex-wrap: wrap;
  }

  .city-tile {
    flex: 1 1 92px;
    min-height: 54px;
  }
}
</style>
