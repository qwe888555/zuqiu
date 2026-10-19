<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Search, View } from '@element-plus/icons-vue'
import { contentApi } from '../../api'
import type { Content, ContentType } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const loading = ref(false)
const rows = ref<Content[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const filters = reactive({ contentType: '', status: '', keyword: '' })

const dialogVisible = ref(false)
const previewVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const preview = ref<Content | null>(null)

const form = reactive({
  contentType: 'NEWS' as ContentType,
  title: '',
  summary: '',
  bodyHtml: '',
  coverUrl: '',
  pinned: false,
  policyDocumentNo: '',
  policyEffectiveFrom: '',
  policyEffectiveTo: '',
})

const typeOptions = [
  { value: 'NEWS', label: '赛事动态' },
  { value: 'POLICY', label: '政策公告' },
  { value: 'HIGHLIGHT', label: '精彩瞬间' },
  { value: 'BEST_LINEUP', label: '最佳阵容' },
]

const typeLabel: Record<string, string> = {
  NEWS: '赛事动态',
  POLICY: '政策公告',
  HIGHLIGHT: '精彩瞬间',
  BEST_LINEUP: '最佳阵容',
}

const publishedCount = computed(() => rows.value.filter((row) => row.status === 'PUBLISHED').length)
const draftCount = computed(() => rows.value.filter((row) => row.status === 'DRAFT').length)

async function load() {
  loading.value = true
  try {
    const res = await contentApi.list({
      page: page.value,
      pageSize: pageSize.value,
      contentType: filters.contentType || undefined,
      status: filters.status || undefined,
      keyword: filters.keyword || undefined,
    })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    contentType: 'NEWS',
    title: '',
    summary: '',
    bodyHtml: '',
    coverUrl: '',
    pinned: false,
    policyDocumentNo: '',
    policyEffectiveFrom: '',
    policyEffectiveTo: '',
  })
  dialogVisible.value = true
}

function openEdit(row: Content) {
  editingId.value = row.id
  Object.assign(form, {
    contentType: row.contentType,
    title: row.title,
    summary: row.summary || '',
    bodyHtml: row.bodyHtml,
    coverUrl: row.coverUrl || '',
    pinned: row.pinned || false,
    policyDocumentNo: row.policyDocumentNo || '',
    policyEffectiveFrom: row.policyEffectiveFrom || '',
    policyEffectiveTo: row.policyEffectiveTo || '',
  })
  dialogVisible.value = true
}

async function save() {
  if (!form.title.trim()) return ElMessage.warning('请填写标题')
  if (!form.bodyHtml.trim()) return ElMessage.warning('请填写正文内容')
  saving.value = true
  try {
    if (editingId.value) {
      await contentApi.update(editingId.value, { ...form })
      ElMessage.success('内容已更新')
    } else {
      await contentApi.create({ ...form })
      ElMessage.success('内容已创建，当前为草稿')
    }
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function togglePublish(row: Content) {
  try {
    if (row.status === 'PUBLISHED') {
      await contentApi.unpublish(row.id)
      ElMessage.success('内容已下线')
    } else {
      await contentApi.publish(row.id)
      ElMessage.success('内容已发布至门户')
    }
    await load()
  } catch {
    // 拦截器提示
  }
}

async function removeContent(row: Content) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.title}」？删除后不可恢复。`, '删除内容', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await contentApi.remove(row.id)
    ElMessage.success('内容已删除')
    await load()
  } catch {
    // 取消
  }
}

function openPreview(row: Content) {
  preview.value = row
  previewVisible.value = true
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="内容管理"
      eyebrow="CONTENT MANAGEMENT"
      description="维护门户新闻、政策公告、精彩瞬间与最佳阵容。发布前请确认正文与封面无误，政策公告需填写文号与有效期。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建内容</el-button>
      </template>
    </PageHeader>

    <section class="page-card">
      <div class="filter-bar">
        <el-select v-model="filters.contentType" placeholder="全部类型" clearable @change="search">
          <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="filters.status" placeholder="全部状态" clearable @change="search">
          <el-option label="草稿" value="DRAFT" />
          <el-option label="已发布" value="PUBLISHED" />
          <el-option label="已下线" value="OFFLINE" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          placeholder="搜索标题"
          :prefix-icon="Search"
          clearable
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" plain @click="search">查询</el-button>
        <span class="filter-bar__spacer" />
        <span class="muted">已发布 {{ publishedCount }} · 草稿 {{ draftCount }}</span>
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="标题" min-width="300">
          <template #default="{ row }">
            <div class="content-cell">
              <span class="content-cell__type" :class="`is-${row.contentType.toLowerCase()}`">
                {{ typeLabel[row.contentType] }}
              </span>
              <div>
                <strong>{{ row.title }}</strong>
                <small>
                  {{ row.summary || '暂无摘要' }}
                </small>
              </div>
              <el-tag v-if="row.pinned" size="small" type="danger" effect="plain">置顶</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><StatusTag :status="row.status" kind="content" /></template>
        </el-table-column>
        <el-table-column label="发布 / 更新" width="160">
          <template #default="{ row }">
            <span class="muted">
              {{ dayjs(row.publishedAt || row.createdAt).format('YYYY-MM-DD HH:mm') }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="阅读" width="80" align="center">
          <template #default="{ row }"><span class="num">{{ row.viewCount || 0 }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="270" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="View" @click="openPreview(row)">预览</el-button>
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button
              link
              :type="row.status === 'PUBLISHED' ? 'warning' : 'success'"
              @click="togglePublish(row)"
            >
              {{ row.status === 'PUBLISHED' ? '下线' : '发布' }}
            </el-button>
            <el-button link type="danger" :icon="Delete" @click="removeContent(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="load"
        @size-change="search"
      />
    </section>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑内容' : '新建内容'" width="780px" top="6vh">
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="内容类型">
            <el-select v-model="form.contentType" style="width: 100%">
              <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="封面图地址">
            <el-input v-model="form.coverUrl" placeholder="https://..." />
          </el-form-item>
        </div>
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="80" show-word-limit placeholder="请输入内容标题" />
        </el-form-item>
        <el-form-item label="摘要">
          <el-input v-model="form.summary" maxlength="160" show-word-limit placeholder="用于列表展示的简短摘要" />
        </el-form-item>
        <el-form-item label="正文（支持 HTML）" required>
          <el-input
            v-model="form.bodyHtml"
            type="textarea"
            :rows="10"
            placeholder="<p>请输入正文内容...</p>"
          />
        </el-form-item>

        <template v-if="form.contentType === 'POLICY'">
          <div class="form-grid">
            <el-form-item label="政策文号">
              <el-input v-model="form.policyDocumentNo" placeholder="如：川教函〔2026〕15 号" />
            </el-form-item>
            <el-form-item label="有效期">
              <div class="date-range">
                <el-date-picker
                  v-model="form.policyEffectiveFrom"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placeholder="生效日期"
                  style="width: 100%"
                />
                <span>至</span>
                <el-date-picker
                  v-model="form.policyEffectiveTo"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placeholder="失效日期"
                  style="width: 100%"
                />
              </div>
            </el-form-item>
          </div>
        </template>

        <el-checkbox v-model="form.pinned">在门户置顶展示</el-checkbox>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存内容</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="previewVisible" size="720px" :with-header="false">
      <div v-if="preview" class="preview">
        <span class="preview__type">{{ typeLabel[preview.contentType] }}</span>
        <h1>{{ preview.title }}</h1>
        <div class="preview__meta">
          <span>{{ preview.author || '赛事组委会' }}</span>
          <span>{{ dayjs(preview.publishedAt || preview.createdAt).format('YYYY-MM-DD HH:mm') }}</span>
          <StatusTag :status="preview.status" kind="content" />
        </div>
        <img v-if="preview.coverUrl" :src="preview.coverUrl" alt="" class="preview__cover" />
        <p v-if="preview.summary" class="preview__summary">{{ preview.summary }}</p>
        <div class="rich-text" v-html="preview.bodyHtml" />
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.content-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.content-cell__type {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 5px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9px;
  font-weight: 600;
}

.content-cell__type.is-policy {
  background: #fdf3e3;
  color: #a9772e;
}

.content-cell__type.is-highlight {
  background: #eef3fb;
  color: #5373a8;
}

.content-cell__type.is-best_lineup {
  background: #f6eefb;
  color: #7c5896;
}

.content-cell > div {
  min-width: 0;
}

.content-cell strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}

.content-cell small {
  display: block;
  max-width: 520px;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 9.5px;
  color: var(--ink-300);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.date-range {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.date-range span {
  font-size: 10px;
  color: var(--ink-300);
}

.preview {
  padding: 8px 4px 40px;
}

.preview__type {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 5px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9px;
  font-weight: 600;
}

.preview h1 {
  margin-top: 12px;
  font-size: 26px;
  line-height: 1.4;
}

.preview__meta {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  color: var(--ink-300);
}

.preview__cover {
  width: 100%;
  margin-top: 18px;
  border-radius: 12px;
}

.preview__summary {
  margin-top: 16px;
  padding: 12px 14px;
  border-left: 3px solid var(--brand-700);
  background: var(--paper);
  font-size: 12px;
  line-height: 1.8;
  color: var(--ink-500);
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
