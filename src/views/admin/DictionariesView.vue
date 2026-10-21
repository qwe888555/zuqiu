<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Search, Tickets } from '@element-plus/icons-vue'
import { dictApi } from '../../api'
import type { DictionaryItem } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const TYPE_LABELS: Record<string, string> = {
  GROUP_CATEGORY: '组别类型',
  POSITION: '场上位置',
  COACH_CATEGORY: '教练类别',
  MATERIAL_TYPE: '材料类型',
  EVENT_CATEGORY: '赛事类别',
  EDUCATION: '学历',
  GENDER: '性别',
}

const loading = ref(false)
const items = ref<DictionaryItem[]>([])
const activeType = ref('')
const keyword = ref('')

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const form = reactive({
  dictType: '',
  value: '',
  label: '',
  sortOrder: 0,
  enabled: true,
})

const typeGroups = computed(() => {
  const map = new Map<string, DictionaryItem[]>()
  items.value.forEach((item) => {
    const list = map.get(item.dictType) || []
    list.push(item)
    map.set(item.dictType, list)
  })
  return [...map.entries()]
    .map(([dictType, list]) => ({
      dictType,
      label: TYPE_LABELS[dictType] || dictType,
      count: list.length,
      enabledCount: list.filter((item) => item.enabled).length,
    }))
    .sort((a, b) => a.dictType.localeCompare(b.dictType))
})

const activeItems = computed(() => {
  const list = items.value
    .filter((item) => !activeType.value || item.dictType === activeType.value)
    .filter((item) => !keyword.value || item.label.includes(keyword.value) || item.value.includes(keyword.value))
  return list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
})

const enabledCount = computed(() => items.value.filter((item) => item.enabled).length)
const typeOptions = computed(() => {
  const known = Object.keys(TYPE_LABELS)
  const found = [...new Set(items.value.map((item) => item.dictType))]
  return [...new Set([...known, ...found])]
})

async function load() {
  loading.value = true
  try {
    const res = await dictApi.list({ page: 1, pageSize: 500 })
    items.value = res.items
    if (!typeGroups.value.some((group) => group.dictType === activeType.value)) {
      activeType.value = typeGroups.value[0]?.dictType || ''
    }
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    dictType: activeType.value || 'GROUP_CATEGORY',
    value: '',
    label: '',
    sortOrder: activeItems.value.length + 1,
    enabled: true,
  })
  dialogVisible.value = true
}

function openEdit(row: DictionaryItem) {
  editingId.value = row.id
  Object.assign(form, {
    dictType: row.dictType,
    value: row.value,
    label: row.label,
    sortOrder: row.sortOrder || 0,
    enabled: row.enabled,
  })
  dialogVisible.value = true
}

async function save() {
  if (!form.dictType) return ElMessage.warning('请选择或填写字典类型')
  if (!form.value.trim()) return ElMessage.warning('请填写字典值')
  if (!form.label.trim()) return ElMessage.warning('请填写显示名称')
  saving.value = true
  try {
    if (editingId.value) {
      await dictApi.update(editingId.value, { ...form })
      ElMessage.success('字典项已更新')
    } else {
      await dictApi.create({ ...form })
      ElMessage.success('字典项已创建')
      activeType.value = form.dictType
    }
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(row: DictionaryItem) {
  try {
    await dictApi.update(row.id, { enabled: !row.enabled })
    ElMessage.success(row.enabled ? '字典项已停用' : '字典项已启用')
    await load()
  } catch {
    // 拦截器提示
  }
}

async function removeItem(row: DictionaryItem) {
  try {
    await ElMessageBox.confirm(
      `确认删除「${row.label}」？已被业务数据引用的字典项建议停用而非删除。`,
      '删除字典项',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    await dictApi.remove(row.id, row.version)
    ElMessage.success('字典项已删除')
    await load()
  } catch {
    // 取消
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="数据字典"
      description="维护组别、场上位置、材料类型等枚举数据。停用后新的业务表单不再展示该项，历史数据保持可读。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增字典项</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="字典类型" :value="typeGroups.length" hint="枚举分类" :icon="Tickets" tone="green" />
      <StatCard label="字典项" :value="items.length" hint="全部条目" :icon="Tickets" tone="lime" />
      <StatCard label="启用中" :value="enabledCount" hint="表单可选" :icon="Tickets" tone="blue" />
      <StatCard label="停用" :value="items.length - enabledCount" hint="仅历史可读" :icon="Tickets" tone="amber" />
    </div>

    <div class="dict-layout">
      <aside class="page-card dict-side">
        <div class="dict-side__head">
          <strong>字典类型</strong>
          <small>共 {{ typeGroups.length }} 类</small>
        </div>
        <button
          type="button"
          class="dict-type"
          :class="{ 'is-active': !activeType }"
          @click="activeType = ''"
        >
          <span>全部字典项</span>
          <em>{{ items.length }}</em>
        </button>
        <button
          v-for="group in typeGroups"
          :key="group.dictType"
          type="button"
          class="dict-type"
          :class="{ 'is-active': activeType === group.dictType }"
          @click="activeType = group.dictType"
        >
          <span>
            {{ group.label }}
            <small>{{ group.dictType }}</small>
          </span>
          <em>{{ group.count }}</em>
        </button>
      </aside>

      <section class="page-card dict-main">
        <FilterBar :summary="'当前 ' + activeItems.length + ' 项'">
          <el-input
            v-model="keyword"
            placeholder="搜索名称或值"
            :prefix-icon="Search"
            clearable
            style="width: 220px"
          />
        </FilterBar>

        <el-table v-loading="loading" :data="activeItems" style="width: 100%">
          <el-table-column label="显示名称" min-width="180">
            <template #default="{ row }">
              <strong class="dict-label">{{ row.label }}</strong>
            </template>
          </el-table-column>
          <el-table-column prop="value" label="字典值" min-width="170">
            <template #default="{ row }"><code class="dict-value">{{ row.value }}</code></template>
          </el-table-column>
          <el-table-column label="所属类型" min-width="150">
            <template #default="{ row }">
              <span class="muted">{{ TYPE_LABELS[row.dictType] || row.dictType }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="90" align="center" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="plain">
                {{ row.enabled ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="210" align="right">
            <template #default="{ row }">
              <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button link :type="row.enabled ? 'warning' : 'success'" @click="toggleEnabled(row)">
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
              <el-button link type="danger" :icon="Delete" @click="removeItem(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑字典项' : '新增字典项'" width="540px">
      <el-form :model="form" label-position="top">
        <el-form-item label="字典类型" required>
          <el-select
            v-model="form.dictType"
            filterable
            allow-create
            default-first-option
            style="width: 100%"
            placeholder="选择已有类型或输入新类型编码"
          >
            <el-option
              v-for="type in typeOptions"
              :key="type"
              :label="`${TYPE_LABELS[type] || type}（${type}）`"
              :value="type"
            />
          </el-select>
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="字典值" required>
            <el-input v-model="form.value" placeholder="如：PRIMARY" />
          </el-form-item>
          <el-form-item label="显示名称" required>
            <el-input v-model="form.label" placeholder="如：小学组" />
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item label="排序">
            <el-input-number v-model="form.sortOrder" :min="0" :max="999" style="width: 100%" />
          </el-form-item>
          <el-form-item label="状态">
            <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
          </el-form-item>
        </div>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="字典值创建后不建议修改"
          description="字典值可能已被业务数据引用，确需调整时请优先新增条目并停用旧条目。"
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存字典项</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dict-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.dict-side {
  padding: 12px;
  position: sticky;
  top: 88px;
}

.dict-side__head {
  padding: 6px 10px 12px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 6px;
}

.dict-side__head strong {
  display: block;
  font-size: 12.5px;
}

.dict-side__head small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.dict-type {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  font-size: 11.5px;
  color: var(--ink-700);
  cursor: pointer;
}

.dict-type:hover {
  background: var(--paper);
}

.dict-type.is-active {
  background: var(--brand-50);
  color: var(--brand-800);
  font-weight: 700;
}

.dict-type span small {
  display: block;
  margin-top: 1px;
  font-size: 8.5px;
  font-weight: 400;
  color: var(--ink-300);
}

.dict-type em {
  font-style: normal;
  font-size: 9.5px;
  color: var(--ink-300);
}

.dict-label {
  font-size: 12.5px;
}

.dict-value {
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--paper);
  border: 1px solid var(--line);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 10.5px;
  color: var(--brand-800);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

@media (max-width: 900px) {
  .dict-layout {
    grid-template-columns: 1fr;
  }

  .dict-side {
    position: static;
  }
}
</style>
