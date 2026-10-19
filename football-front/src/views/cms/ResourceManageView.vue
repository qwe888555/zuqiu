<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Picture, Plus, Refresh } from '@element-plus/icons-vue'
import { contentApi, resourceApi } from '../../api'
import type { Content, PortalResource } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'

const loading = ref(false)
const rows = ref<PortalResource[]>([])
const total = ref(0)
const contents = ref<Content[]>([])
const activeType = ref('CAROUSEL')

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)

const form = reactive({
  resourceType: 'CAROUSEL',
  title: '',
  imageUrl: '',
  targetContentId: '',
  targetUrl: '',
  sortOrder: 0,
  enabled: true,
})

const typeTabs = [
  { value: 'CAROUSEL', label: '首页轮播' },
  { value: 'NEWS_LINK_IMAGE', label: '新闻配图' },
  { value: 'PARTNER', label: '合作伙伴' },
]

const typeLabel: Record<string, string> = {
  CAROUSEL: '首页轮播',
  NEWS_LINK_IMAGE: '新闻配图',
  PARTNER: '合作伙伴',
}

const filteredRows = computed(() =>
  activeType.value ? rows.value.filter((row) => row.resourceType === activeType.value) : rows.value,
)

async function load() {
  loading.value = true
  try {
    const res = await resourceApi.list({ page: 1, pageSize: 200 })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadContents() {
  try {
    const res = await contentApi.list({ page: 1, pageSize: 100 })
    contents.value = res.items
  } catch {
    contents.value = []
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    resourceType: activeType.value,
    title: '',
    imageUrl: '',
    targetContentId: '',
    targetUrl: '',
    sortOrder: filteredRows.value.length,
    enabled: true,
  })
  dialogVisible.value = true
}

function openEdit(row: PortalResource) {
  editingId.value = row.id
  Object.assign(form, {
    resourceType: row.resourceType,
    title: row.title,
    imageUrl: row.imageUrl || '',
    targetContentId: row.targetContentId || '',
    targetUrl: row.targetUrl || '',
    sortOrder: row.sortOrder || 0,
    enabled: row.enabled,
  })
  dialogVisible.value = true
}

async function save() {
  if (!form.title.trim()) return ElMessage.warning('请填写资源标题')
  saving.value = true
  try {
    if (editingId.value) {
      await resourceApi.update(editingId.value, { ...form })
      ElMessage.success('资源已更新')
    } else {
      await resourceApi.create({ ...form })
      ElMessage.success('资源已创建')
    }
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(row: PortalResource) {
  try {
    await resourceApi.update(row.id, { enabled: !row.enabled })
    ElMessage.success(row.enabled ? '资源已停用' : '资源已启用')
    await load()
  } catch {
    // 拦截器提示
  }
}

async function removeResource(row: PortalResource) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.title}」？`, '删除资源', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await resourceApi.remove(row.id, row.version)
    ElMessage.success('资源已删除')
    await load()
  } catch {
    // 取消
  }
}

onMounted(() => {
  load()
  loadContents()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="门户资源"
      eyebrow="PORTAL RESOURCES"
      description="配置首页轮播、新闻配图与合作伙伴 Logo。排序值越小越靠前，停用后立即从门户移除。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增资源</el-button>
      </template>
    </PageHeader>

    <section class="page-card">
      <div class="resource-tabs">
        <button
          v-for="tab in typeTabs"
          :key="tab.value"
          type="button"
          class="resource-tab"
          :class="{ 'is-active': activeType === tab.value }"
          @click="activeType = tab.value"
        >
          {{ tab.label }}
          <b>{{ rows.filter((row) => row.resourceType === tab.value).length }}</b>
        </button>
        <span class="resource-tabs__spacer" />
        <span class="muted">共 {{ total }} 项资源</span>
      </div>

      <div v-loading="loading" class="resource-grid">
        <article v-for="row in filteredRows" :key="row.id" class="resource-card">
          <div class="resource-card__image">
            <img v-if="row.imageUrl" :src="row.imageUrl" alt="" />
            <span v-else class="resource-card__placeholder"><el-icon :size="22"><Picture /></el-icon></span>
            <el-tag class="resource-card__status" :type="row.enabled ? 'success' : 'info'" size="small" effect="dark">
              {{ row.enabled ? '已启用' : '已停用' }}
            </el-tag>
            <span class="resource-card__sort num">#{{ row.sortOrder || 0 }}</span>
          </div>
          <div class="resource-card__body">
            <span class="resource-card__type">{{ typeLabel[row.resourceType] }}</span>
            <h3>{{ row.title }}</h3>
            <p class="resource-card__target">
              {{ row.targetUrl || (row.targetContentId ? `关联内容 ${row.targetContentId}` : '未设置跳转') }}
            </p>
            <div class="resource-card__actions">
              <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button link :type="row.enabled ? 'warning' : 'success'" @click="toggleEnabled(row)">
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
              <el-button link type="danger" :icon="Delete" @click="removeResource(row)">删除</el-button>
            </div>
          </div>
        </article>
        <el-empty v-if="!loading && !filteredRows.length" description="该分类下暂无资源" :image-size="80" />
      </div>
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑资源' : '新增资源'" width="560px">
      <el-form :model="form" label-position="top">
        <el-form-item label="资源类型">
          <el-radio-group v-model="form.resourceType">
            <el-radio-button v-for="tab in typeTabs" :key="tab.value" :value="tab.value">
              {{ tab.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="资源标题或说明" />
        </el-form-item>
        <el-form-item label="图片地址">
          <el-input v-model="form.imageUrl" placeholder="https://...，留空则使用占位图" />
        </el-form-item>
        <el-form-item label="关联内容">
          <el-select v-model="form.targetContentId" clearable filterable placeholder="可选，选择门户内容" style="width: 100%">
            <el-option v-for="content in contents" :key="content.id" :label="content.title" :value="content.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="外部跳转地址">
          <el-input v-model="form.targetUrl" placeholder="https://...（选填）" />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="排序值">
            <el-input-number v-model="form.sortOrder" :min="0" :max="999" style="width: 100%" />
          </el-form-item>
          <el-form-item label="启用状态">
            <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存资源</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.resource-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.resource-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  border: none;
  border-radius: 8px;
  background: transparent;
  font-size: 12px;
  color: var(--ink-500);
  cursor: pointer;
}

.resource-tab b {
  padding: 0 6px;
  border-radius: 99px;
  background: var(--paper);
  font-size: 9px;
  font-weight: 700;
}

.resource-tab.is-active {
  background: var(--brand-50);
  color: var(--brand-800);
  font-weight: 700;
}

.resource-tab.is-active b {
  background: var(--brand-700);
  color: #fff;
}

.resource-tabs__spacer {
  flex: 1;
}

.resource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  min-height: 120px;
}

.resource-card {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
}

.resource-card__image {
  position: relative;
  height: 140px;
  background: var(--paper);
}

.resource-card__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.resource-card__placeholder {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--ink-300);
}

.resource-card__status {
  position: absolute;
  top: 10px;
  left: 10px;
}

.resource-card__sort {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(4, 40, 27, 0.65);
  color: #fff;
  font-size: 9px;
}

.resource-card__body {
  padding: 14px 16px 12px;
}

.resource-card__type {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--brand-600);
}

.resource-card h3 {
  margin-top: 4px;
  font-size: 13.5px;
}

.resource-card__target {
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9.5px;
  color: var(--ink-300);
}

.resource-card__actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}
</style>
