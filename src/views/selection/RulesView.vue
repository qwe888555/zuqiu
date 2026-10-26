<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Setting } from '@element-plus/icons-vue'
import {
  GROUP_TYPE_LABEL,
  ROUND_LABEL,
  selectionTemplateApi,
} from '../../api/selection'
import type { SelectionGroupType, SelectionRound, SelectionTemplate, TemplateDimension } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'

const loading = ref(false)
const rows = ref<SelectionTemplate[]>([])
const total = ref(0)
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)

const form = reactive({
  name: '',
  groupType: 'PRIMARY' as SelectionGroupType,
  round: 'INITIAL' as SelectionRound,
  dimensions: [] as TemplateDimension[],
})

const defaultDimensions: TemplateDimension[] = [
  { code: 'SKILL', name: '技术能力', maxScore: 100, weight: 30 },
  { code: 'TACTICS', name: '战术意识', maxScore: 100, weight: 30 },
  { code: 'FITNESS', name: '身体素质', maxScore: 100, weight: 20 },
  { code: 'PERFORMANCE', name: '比赛表现', maxScore: 100, weight: 20 },
]

const weightSum = computed(
  () => Math.round(form.dimensions.reduce((sum, item) => sum + (Number(item.weight) || 0), 0) * 100) / 100,
)
const weightValid = computed(() => Math.abs(weightSum.value - 100) < 0.001)

const groupTypeOptions = Object.entries(GROUP_TYPE_LABEL) as Array<[SelectionGroupType, string]>
const roundOptions = Object.entries(ROUND_LABEL) as Array<[SelectionRound, string]>

async function load() {
  loading.value = true
  try {
    const res = await selectionTemplateApi.list({ page: 1, size: 100 })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function groupLabel(row: SelectionTemplate): string {
  return row.groupTypeLabel || GROUP_TYPE_LABEL[row.groupType]
}

function roundLabel(row: SelectionTemplate): string {
  return row.roundLabel || ROUND_LABEL[row.round]
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.groupType = 'PRIMARY'
  form.round = 'INITIAL'
  form.dimensions = defaultDimensions.map((item) => ({ ...item }))
  dialogVisible.value = true
}

function openEdit(row: SelectionTemplate) {
  editingId.value = row.id
  form.name = row.name
  form.groupType = row.groupType
  form.round = row.round
  form.dimensions = row.dimensions.map((item) => ({ ...item }))
  dialogVisible.value = true
}

function addDimension() {
  form.dimensions.push({ code: `DIM${form.dimensions.length + 1}`, name: '', maxScore: 100, weight: 0 })
}

function removeDimension(index: number) {
  form.dimensions.splice(index, 1)
}

async function save() {
  const name = form.name.trim()
  if (!name) return ElMessage.warning('请填写模板名称')
  if (!form.dimensions.length) return ElMessage.warning('请至少配置一个评分维度')
  if (form.dimensions.some((item) => !item.name.trim())) return ElMessage.warning('请填写所有维度名称')
  if (!weightValid.value) return ElMessage.warning(`维度权重之和需为 100，当前为 ${weightSum.value}`)
  if (form.dimensions.some((item) => !item.code)) {
    return ElMessage.warning('维度编码不能为空')
  }
  saving.value = true
  try {
    const payload = {
      name,
      groupType: form.groupType,
      round: form.round,
      dimensions: form.dimensions.map((item, index) => ({
        ...item,
        code: item.code.trim().toUpperCase(),
        sortNo: index + 1,
      })),
    }
    if (editingId.value) {
      await selectionTemplateApi.update(editingId.value, payload)
      ElMessage.success('评分模板已更新')
    } else {
      await selectionTemplateApi.create(payload)
      ElMessage.success('评分模板已创建，同组别同轮次旧模板已自动停用')
    }
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="评分模板"
      description="按组别与轮次维护评分维度及权重，权重合计须为 100%。模板启用后方可用于评分录入。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建模板</el-button>
      </template>
    </PageHeader>

    <section class="page-card">
      <div class="rule-summary">
        <div class="rule-summary__item">
          <span>模板总数</span>
          <strong class="num">{{ total }}</strong>
        </div>
        <div class="rule-summary__item">
          <span>启用中</span>
          <strong class="num">{{ rows.filter((r) => r.status === 1).length }}</strong>
        </div>
        <div class="rule-summary__item">
          <span>已停用</span>
          <strong class="num">{{ rows.filter((r) => r.status === 0).length }}</strong>
        </div>
        <p class="rule-summary__note">同一组别 + 轮次仅保留一个启用模板；新建时旧模板自动停用。</p>
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="模板名称" min-width="230">
          <template #default="{ row }">
            <div class="rule-cell">
              <span class="rule-cell__icon"><el-icon><Setting /></el-icon></span>
              <div>
                <strong>{{ row.name }}</strong>
                <small>{{ groupLabel(row) }} · {{ roundLabel(row) }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="评分维度" min-width="280">
          <template #default="{ row }">
            <div class="dim-list">
              <span v-for="dim in row.dimensions" :key="dim.code" class="dim-item">
                {{ dim.name }} <b>{{ dim.weight }}%</b>
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="{ row }"><span class="muted">{{ row.updatedAt || row.createdAt || '-' }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small" effect="plain">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" description="尚未配置评分模板" :image-size="80" />
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑评分模板' : '新建评分模板'" width="760px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="模板名称" required>
            <el-input v-model="form.name" maxlength="50" placeholder="如：小学男子组初选评分模板" />
          </el-form-item>
          <el-form-item label="组别" required>
            <el-select v-model="form.groupType" style="width: 100%" :disabled="!!editingId">
              <el-option v-for="[value, label] in groupTypeOptions" :key="value" :label="label" :value="value" />
            </el-select>
          </el-form-item>
          <el-form-item label="遴选轮次" required>
            <el-radio-group v-model="form.round" :disabled="!!editingId">
              <el-radio-button v-for="[value, label] in roundOptions" :key="value" :value="value">{{ label }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </div>

        <div class="dim-head">
          <span class="section-title" style="margin: 0">评分维度</span>
          <span class="weight-sum" :class="{ 'is-error': !weightValid }">权重合计 {{ weightSum }}%</span>
          <el-button size="small" :icon="Plus" @click="addDimension">添加维度</el-button>
        </div>
        <div class="dim-editor">
          <div v-for="(dim, index) in form.dimensions" :key="index" class="dim-row">
            <el-input v-model="dim.name" placeholder="维度名称" />
            <el-input v-model="dim.code" placeholder="编码" style="text-transform: uppercase" />
            <el-input-number v-model="dim.weight" :min="0" :max="100" :step="5" :precision="0" controls-position="right" />
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
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存模板</el-button>
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

.muted {
  font-size: 10px;
  color: var(--ink-400);
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
  grid-template-columns: 1fr 1fr 1fr;
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
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.8fr) 110px auto 110px auto auto;
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
