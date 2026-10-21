<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, Delete, Edit, Plus, Refresh, Setting } from '@element-plus/icons-vue'
import { eventApi, selectionApi } from '../../api'
import type { Event, EventGroup, RoundType, ScoreDimension, SelectionRule } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'

const loading = ref(false)
const rows = ref<SelectionRule[]>([])
const total = ref(0)
const events = ref<Event[]>([])
const groups = ref<EventGroup[]>([])
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)

const form = reactive({
  eventId: '',
  groupId: '',
  round: 'PRELIMINARY' as RoundType,
  topN: 10,
  confirmed: false,
  dimensions: [] as ScoreDimension[],
})

const defaultDimensions: ScoreDimension[] = [
  { key: 'skill', label: '技术能力', maxScore: 100, weight: 0.3 },
  { key: 'tactics', label: '战术意识', maxScore: 100, weight: 0.3 },
  { key: 'fitness', label: '身体素质', maxScore: 100, weight: 0.2 },
  { key: 'performance', label: '比赛表现', maxScore: 100, weight: 0.2 },
]

const weightSum = computed(() =>
  Math.round(form.dimensions.reduce((sum, item) => sum + (Number(item.weight) || 0), 0) * 100) / 100,
)

const weightValid = computed(() => Math.abs(weightSum.value - 1) < 0.001)

const roundLabel: Record<string, string> = { PRELIMINARY: '初选', FINAL: '终选' }

async function load() {
  loading.value = true
  try {
    const res = await selectionApi.rules({ page: 1, pageSize: 100 })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadBase() {
  try {
    const res = await eventApi.list({ page: 1, pageSize: 50 })
    events.value = res.items
  } catch {
    events.value = []
  }
}

async function loadGroups() {
  groups.value = []
  form.groupId = ''
  if (!form.eventId) return
  try {
    const res = await eventApi.groups(form.eventId)
    groups.value = res.items
  } catch {
    groups.value = []
  }
}

function openCreate() {
  editingId.value = null
  form.eventId = events.value[0]?.id || ''
  form.groupId = ''
  form.round = 'PRELIMINARY'
  form.topN = 10
  form.confirmed = false
  form.dimensions = defaultDimensions.map((item) => ({ ...item }))
  dialogVisible.value = true
  loadGroups()
}

async function openEdit(row: SelectionRule) {
  editingId.value = row.id
  form.eventId = row.eventId
  form.round = row.round
  form.topN = row.topN
  form.confirmed = row.confirmed
  form.dimensions = row.dimensions.map((item) => ({ ...item }))
  dialogVisible.value = true
  groups.value = []
  form.groupId = row.groupId
  try {
    const res = await eventApi.groups(row.eventId)
    groups.value = res.items
  } catch {
    groups.value = []
  }
}

function addDimension() {
  form.dimensions.push({ key: `dim_${Date.now()}`, label: '', maxScore: 100, weight: 0 })
}

function removeDimension(index: number) {
  form.dimensions.splice(index, 1)
}

async function save() {
  if (!form.eventId) return ElMessage.warning('请选择赛事')
  if (!form.groupId) return ElMessage.warning('请选择组别')
  if (!form.dimensions.length) return ElMessage.warning('请至少配置一个评分维度')
  if (form.dimensions.some((item) => !item.label.trim())) return ElMessage.warning('请填写所有维度名称')
  if (!weightValid.value) return ElMessage.warning(`维度权重之和需为 1，当前为 ${weightSum.value}`)
  saving.value = true
  try {
    const payload = {
      eventId: form.eventId,
      groupId: form.groupId,
      round: form.round,
      topN: form.topN,
      confirmed: form.confirmed,
      dimensions: form.dimensions,
    }
    if (editingId.value) {
      await selectionApi.updateRule(editingId.value, payload)
      ElMessage.success('评分规则已更新')
    } else {
      await selectionApi.createRule(payload)
      ElMessage.success('评分规则已创建')
    }
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function confirmRule(row: SelectionRule) {
  try {
    await ElMessageBox.confirm('规则确认后将用于评分录入与排名生成，后续修改需重新确认。', '确认评分规则', {
      confirmButtonText: '确认规则',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await selectionApi.updateRule(row.id, { confirmed: true })
    ElMessage.success('规则已确认')
    await load()
  } catch {
    // 取消
  }
}

onMounted(() => {
  load()
  loadBase()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="评分规则"
      description="按赛事与组别配置遴选维度、权重与入围名额。规则确认后方可录入评分，权重合计须为 100%。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建规则</el-button>
      </template>
    </PageHeader>

    <section class="page-card">
      <div class="rule-summary">
        <div class="rule-summary__item">
          <span>规则总数</span>
          <strong class="num">{{ total }}</strong>
        </div>
        <div class="rule-summary__item">
          <span>已确认</span>
          <strong class="num">{{ rows.filter((r) => r.confirmed).length }}</strong>
        </div>
        <div class="rule-summary__item">
          <span>待确认</span>
          <strong class="num">{{ rows.filter((r) => !r.confirmed).length }}</strong>
        </div>
        <p class="rule-summary__note">
          排名并列时按「并列保留」处理；终选规则可单独设置入围名额。
        </p>
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="赛事 / 组别" min-width="230">
          <template #default="{ row }">
            <div class="rule-cell">
              <span class="rule-cell__icon"><el-icon><Setting /></el-icon></span>
              <div>
                <strong>{{ row.eventName || '赛事' }}</strong>
                <small>{{ row.groupName || '组别' }} · {{ roundLabel[row.round] }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="评分维度" min-width="250">
          <template #default="{ row }">
            <div class="dim-list">
              <span v-for="dim in row.dimensions" :key="dim.key" class="dim-item">
                {{ dim.label }} <b>{{ Math.round(dim.weight * 100) }}%</b>
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="入围名额" width="100" align="center">
          <template #default="{ row }"><span class="num">{{ row.topN }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.confirmed ? 'success' : 'warning'" size="small" effect="plain">
              {{ row.confirmed ? '已确认' : '待确认' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button v-if="!row.confirmed" link type="success" :icon="CircleCheck" @click="confirmRule(row)">
              确认
            </el-button>
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" description="尚未配置评分规则" :image-size="80" />
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑评分规则' : '新建评分规则'" width="760px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="赛事" required>
            <el-select v-model="form.eventId" style="width: 100%" @change="loadGroups">
              <el-option v-for="event in events" :key="event.id" :label="event.name" :value="event.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="组别" required>
            <el-select v-model="form.groupId" style="width: 100%" placeholder="选择组别">
              <el-option v-for="group in groups" :key="group.id" :label="group.name" :value="group.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="遴选轮次">
            <el-radio-group v-model="form.round">
              <el-radio-button value="PRELIMINARY">初选</el-radio-button>
              <el-radio-button value="FINAL">终选</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="入围名额">
            <el-input-number v-model="form.topN" :min="1" :max="200" style="width: 100%" />
          </el-form-item>
        </div>

        <div class="dim-head">
          <span class="section-title" style="margin: 0">评分维度</span>
          <span class="weight-sum" :class="{ 'is-error': !weightValid }">权重合计 {{ Math.round(weightSum * 100) }}%</span>
          <el-button size="small" :icon="Plus" @click="addDimension">添加维度</el-button>
        </div>
        <div class="dim-editor">
          <div v-for="(dim, index) in form.dimensions" :key="dim.key" class="dim-row">
            <el-input v-model="dim.label" placeholder="维度名称" />
            <el-input-number v-model="dim.weight" :min="0" :max="1" :step="0.05" :precision="2" controls-position="right" />
            <span class="dim-row__suffix">权重</span>
            <el-input-number v-model="dim.maxScore" :min="1" :max="1000" :step="10" controls-position="right" />
            <span class="dim-row__suffix">满分</span>
            <el-button
              link
              type="danger"
              :icon="Delete"
              :disabled="form.dimensions.length <= 1"
              @click="removeDimension(index)"
            />
          </div>
        </div>

        <el-form-item style="margin-top: 14px">
          <el-checkbox v-model="form.confirmed">保存后立即确认规则（确认后录入评分）</el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存规则</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.rule-summary {
  display: flex;
  align-items: center;
  gap: 34px;
  padding: 4px 0 18px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.rule-summary__item span {
  display: block;
  font-size: 9.5px;
  color: var(--ink-300);
}

.rule-summary__item strong {
  display: block;
  margin-top: 2px;
  font-size: 22px;
  color: var(--brand-800);
}

.rule-summary__note {
  margin-left: auto;
  font-size: 10px;
  color: var(--ink-300);
}

.rule-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rule-cell__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.rule-cell strong {
  display: block;
  font-size: 12.5px;
}

.rule-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.dim-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.dim-item {
  padding: 3px 8px;
  border-radius: 5px;
  background: var(--paper);
  font-size: 9.5px;
  color: var(--ink-500);
}

.dim-item b {
  color: var(--brand-700);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.dim-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.weight-sum {
  margin-left: auto;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-700);
}

.weight-sum.is-error {
  color: #c26a4f;
}

.dim-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 12px;
  background: var(--paper);
}

.dim-row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) 130px auto 130px auto auto;
  align-items: center;
  gap: 7px;
}

.dim-row__suffix {
  font-size: 9.5px;
  color: var(--ink-300);
}

@media (max-width: 760px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .dim-row {
    grid-template-columns: minmax(0, 1fr) 110px auto;
  }

  .dim-row__suffix:nth-of-type(2),
  .dim-row .el-input-number:nth-of-type(2) {
    display: none;
  }
}
</style>
