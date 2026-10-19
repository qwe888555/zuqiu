<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { orgApi } from '../../api'
import type { Organization } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'

type OrgType = Organization['orgType']

interface OrgNode extends Organization {
  children?: OrgNode[]
}

const loading = ref(false)
const orgs = ref<Organization[]>([])
const keyword = ref('')
const filterType = ref('')

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const form = reactive({
  parentId: '',
  name: '',
  orgType: 'CITY' as OrgType,
  code: '',
  enabled: true,
})

const typeOptions: { value: OrgType; label: string }[] = [
  { value: 'PROVINCE', label: '省级' },
  { value: 'CITY', label: '市州' },
  { value: 'SCHOOL', label: '中小学校' },
  { value: 'UNIVERSITY', label: '高等院校' },
  { value: 'TEAM', label: '独立球队' },
]

const typeLabel = Object.fromEntries(typeOptions.map((item) => [item.value, item.label])) as Record<OrgType, string>

const provinces = computed(() => orgs.value.filter((org) => org.orgType === 'PROVINCE').length)
const cities = computed(() => orgs.value.filter((org) => org.orgType === 'CITY').length)
const schools = computed(() => orgs.value.filter((org) => org.orgType === 'SCHOOL').length)
const universities = computed(() => orgs.value.filter((org) => org.orgType === 'UNIVERSITY').length)

const tree = computed<OrgNode[]>(() => {
  const map = new Map<string, OrgNode>()
  const roots: OrgNode[] = []
  orgs.value.forEach((org) => map.set(org.id, { ...org }))
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId)!
      parent.children = parent.children || []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
})

const filteredTree = computed<OrgNode[]>(() => {
  if (!keyword.value && !filterType.value) return tree.value
  const matches = (node: OrgNode): boolean => {
    const hitKeyword = !keyword.value || node.name.includes(keyword.value) || node.code.includes(keyword.value)
    const hitType = !filterType.value || node.orgType === filterType.value
    const hitChild = (node.children || []).some(matches)
    return (hitKeyword && hitType) || hitChild
  }
  const prune = (nodes: OrgNode[]): OrgNode[] =>
    nodes
      .filter(matches)
      .map((node) => ({ ...node, children: node.children ? prune(node.children) : undefined }))
  return prune(tree.value)
})

const parentOptions = computed(() =>
  orgs.value.filter((org) => org.id !== editingId.value && org.orgType !== 'TEAM'),
)

function childType(type: OrgType): OrgType {
  if (type === 'PROVINCE') return 'CITY'
  if (type === 'CITY') return 'SCHOOL'
  return 'TEAM'
}

async function load() {
  loading.value = true
  try {
    const res = await orgApi.list({ page: 1, pageSize: 500 })
    orgs.value = res.items
  } catch {
    orgs.value = []
  } finally {
    loading.value = false
  }
}

function openCreate(parent?: Organization) {
  editingId.value = null
  Object.assign(form, {
    parentId: parent?.id || '',
    name: '',
    orgType: parent ? childType(parent.orgType) : 'CITY',
    code: '',
    enabled: true,
  })
  dialogVisible.value = true
}

function openEdit(row: Organization) {
  editingId.value = row.id
  Object.assign(form, {
    parentId: row.parentId || '',
    name: row.name,
    orgType: row.orgType,
    code: row.code,
    enabled: row.enabled,
  })
  dialogVisible.value = true
}

async function save() {
  if (!form.name.trim()) return ElMessage.warning('请填写组织名称')
  if (!form.code.trim()) return ElMessage.warning('请填写组织编码')
  saving.value = true
  try {
    if (editingId.value) {
      await orgApi.update(editingId.value, {
        parentId: form.parentId || undefined,
        name: form.name,
        orgType: form.orgType,
        code: form.code,
        enabled: form.enabled,
      })
      ElMessage.success('组织信息已更新')
    } else {
      await orgApi.create({
        parentId: form.parentId || undefined,
        name: form.name,
        orgType: form.orgType,
        code: form.code,
        enabled: form.enabled,
      })
      ElMessage.success('组织已创建')
    }
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(row: Organization) {
  try {
    await orgApi.update(row.id, { enabled: !row.enabled })
    ElMessage.success(row.enabled ? '组织已停用' : '组织已启用')
    await load()
  } catch {
    // 拦截器提示
  }
}

async function removeOrg(row: Organization) {
  try {
    await ElMessageBox.confirm(
      `确认删除「${row.name}」？该组织下的球队、账号将失去归属，请先完成迁移。`,
      '删除组织',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    await orgApi.remove(row.id)
    ElMessage.success('组织已删除')
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
      title="组织结构"
      eyebrow="ORGANIZATION TREE"
      description="维护省—市州—学校/高校的四级组织结构。组织结构决定账号归属、数据权限与市州审核范围。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate()">新增组织</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="省级单位" :value="provinces" hint="根节点" :icon="Search" tone="green" />
      <StatCard label="市州" :value="cities" hint="审核主体" :icon="Search" tone="lime" />
      <StatCard label="中小学校" :value="schools" hint="参赛主体" :icon="Search" tone="blue" />
      <StatCard label="高等院校" :value="universities" hint="参赛主体" :icon="Search" tone="amber" />
    </div>

    <section class="page-card">
      <div class="filter-bar">
        <el-input
          v-model="keyword"
          placeholder="搜索名称或编码"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
        />
        <el-select v-model="filterType" placeholder="全部层级" clearable>
          <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <span class="filter-bar__spacer" />
        <span class="muted">共 {{ orgs.length }} 个组织</span>
      </div>

      <el-table
        v-loading="loading"
        :data="filteredTree"
        row-key="id"
        default-expand-all
        :tree-props="{ children: 'children' }"
        style="width: 100%"
      >
        <el-table-column label="组织名称" min-width="280">
          <template #default="{ row }">
            <div class="org-cell">
              <span class="org-cell__mark">{{ row.name.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.name }}</strong>
                <small>{{ typeLabel[row.orgType as OrgType] }} · {{ row.code }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="层级" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ typeLabel[row.orgType as OrgType] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下级组织" width="100" align="center">
          <template #default="{ row }">{{ row.children?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="plain">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" align="right">
          <template #default="{ row }">
            <el-button
              v-if="row.orgType !== 'TEAM'"
              link
              type="primary"
              :icon="Plus"
              @click="openCreate(row)"
            >
              新增下级
            </el-button>
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button link :type="row.enabled ? 'warning' : 'success'" @click="toggleEnabled(row)">
              {{ row.enabled ? '停用' : '启用' }}
            </el-button>
            <el-button link type="danger" :icon="Delete" @click="removeOrg(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑组织' : '新增组织'" width="580px">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="组织名称" required>
            <el-input v-model="form.name" placeholder="如：成都市教育局" />
          </el-form-item>
          <el-form-item label="组织编码" required>
            <el-input v-model="form.code" placeholder="如：510100" />
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item label="组织层级" required>
            <el-select v-model="form.orgType" style="width: 100%">
              <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="上级组织">
            <el-select v-model="form.parentId" filterable clearable style="width: 100%">
              <el-option v-for="org in parentOptions" :key="org.id" :label="org.name" :value="org.id" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="组织状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="层级关系说明"
          description="省级下设市州，市州下设学校与高校；独立球队可直接挂靠市州，用于社会青训等场景。"
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存组织</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.org-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.org-cell__mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.org-cell strong {
  display: block;
  font-size: 12.5px;
}

.org-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
