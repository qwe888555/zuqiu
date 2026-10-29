<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Search, UploadFilled, View } from '@element-plus/icons-vue'
import { contentApi, dictApi, eventApi, fileApi } from '../../api'
import type { Content, ContentType, Event, EventGroup, OptionItem } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'
import SafeImage from '../../components/common/SafeImage.vue'

const loading = ref(false)
const rows = ref<Content[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)

const filters = reactive({ contentType: '', eventCategory: '', eventId: '', groupId: '', status: '', keyword: '' })
const events = ref<Event[]>([])
const filterGroups = ref<EventGroup[]>([])
const formGroups = ref<EventGroup[]>([])
const eventCategories = ref<OptionItem[]>([])

const dialogVisible = ref(false)
const previewVisible = ref(false)
const editingId = ref<string | null>(null)
const editingVersion = ref(0)
const saving = ref(false)
const preview = ref<Content | null>(null)
const coverFile = ref<File | null>(null)
const coverPreview = ref('')
const uploadingCover = ref(false)

const form = reactive({
  contentType: 'NEWS' as ContentType,
  title: '',
  summary: '',
  bodyHtml: '',
  coverUrl: '',
  coverFileId: '',
  eventId: '',
  groupId: '',
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

let loadSeq = 0

async function load() {
  const seq = ++loadSeq
  loading.value = true
  try {
    const res = await contentApi.list({
      page: page.value,
      pageSize: pageSize.value,
      contentType: filters.contentType || undefined,
      eventCategory: filters.eventCategory || undefined,
      eventId: filters.eventId || undefined,
      groupId: filters.groupId || undefined,
      status: filters.status || undefined,
      keyword: filters.keyword || undefined,
    })
    if (seq !== loadSeq) return
    rows.value = res.items
    total.value = res.total
  } catch {
    if (seq === loadSeq) rows.value = []
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

async function loadEvents() {
  try {
    const res = await eventApi.list({ page: 1, pageSize: 100 })
    events.value = res.items
  } catch {
    events.value = []
  }
}

async function loadEventCategories() {
  try {
    eventCategories.value = await dictApi.options('EVENT_CATEGORY')
  } catch {
    eventCategories.value = []
  }
}

async function loadFilterGroups(eventId: string) {
  if (!eventId) {
    filterGroups.value = []
    return
  }
  try {
    filterGroups.value = await eventApi.groups(eventId).then((res) => res.items)
  } catch {
    filterGroups.value = []
  }
}

async function loadFormGroups(eventId: string) {
  if (!eventId) {
    formGroups.value = []
    return
  }
  try {
    formGroups.value = await eventApi.groups(eventId).then((res) => res.items)
  } catch {
    formGroups.value = []
  }
}

async function changeFilterEvent(eventId: string) {
  filters.groupId = ''
  await loadFilterGroups(eventId)
  search()
}

async function changeFormEvent(eventId: string) {
  form.groupId = ''
  await loadFormGroups(eventId)
}

function resetFilters() {
  filters.contentType = ''
  filters.eventCategory = ''
  filters.eventId = ''
  filters.groupId = ''
  filters.status = ''
  filters.keyword = ''
  filterGroups.value = []
  search()
}

function resetForm() {
  Object.assign(form, {
    contentType: 'NEWS',
    title: '',
    summary: '',
    bodyHtml: '',
    coverUrl: '',
    coverFileId: '',
    eventId: '',
    groupId: '',
    pinned: false,
    policyDocumentNo: '',
    policyEffectiveFrom: '',
    policyEffectiveTo: '',
  })
  formGroups.value = []
  coverFile.value = null
  coverPreview.value = ''
}

function openCreate() {
  editingId.value = null
  editingVersion.value = 0
  resetForm()
  dialogVisible.value = true
}

/** 管理端只返回 coverFileId，展示地址按文件签发短链。 */
async function signedCoverUrl(fileId: string) {
  try {
    return (await fileApi.signedUrl(fileId)).url
  } catch {
    return ''
  }
}

async function openEdit(row: Content) {
  const targetId = row.id
  editingId.value = targetId
  editingVersion.value = row.version
  const coverUrl = (row.coverFileId ? await signedCoverUrl(row.coverFileId) : '') || row.coverUrl || ''
  if (editingId.value !== targetId) return
  Object.assign(form, {
    contentType: row.contentType,
    title: row.title,
    summary: row.summary || '',
    bodyHtml: row.bodyHtml,
    coverUrl,
    coverFileId: row.coverFileId || '',
    eventId: row.eventId || '',
    groupId: row.groupId || '',
    pinned: row.pinned || false,
    policyDocumentNo: row.policyDocumentNo || '',
    policyEffectiveFrom: row.policyEffectiveFrom || '',
    policyEffectiveTo: row.policyEffectiveTo || '',
  })
  coverFile.value = null
  coverPreview.value = coverUrl
  loadFormGroups(row.eventId || '')
  dialogVisible.value = true
}

async function pickCover(options: UploadRequestOptions) {
  const file = options.file
  if (!/\.(jpg|jpeg|png)$/i.test(file.name)) {
    ElMessage.warning('请选择 JPG 或 PNG 图片')
    return
  }
  coverFile.value = file
  coverPreview.value = URL.createObjectURL(file)
}

function clearCover() {
  coverFile.value = null
  form.coverFileId = ''
  coverPreview.value = form.coverUrl || ''
}

async function save() {
  if (!form.title.trim()) return ElMessage.warning('请填写标题')
  if (!form.bodyHtml.trim()) return ElMessage.warning('请填写正文内容')
  saving.value = true
  try {
    const payload = {
      contentType: form.contentType,
      title: form.title,
      summary: form.summary || undefined,
      bodyHtml: form.bodyHtml,
      eventId: form.eventId || undefined,
      groupId: form.groupId || undefined,
      policyDocumentNo: form.policyDocumentNo || undefined,
      policyEffectiveFrom: form.policyEffectiveFrom || undefined,
      policyEffectiveTo: form.policyEffectiveTo || undefined,
      pinned: form.pinned,
    }
    if (editingId.value) {
      let coverFileId = form.coverFileId || undefined
      if (coverFile.value) {
        uploadingCover.value = true
        const record = await fileApi.upload(coverFile.value, 'CONTENT', editingId.value, 'CMS_IMAGE')
        coverFileId = record.id
      }
      await contentApi.update(editingId.value, {
        ...payload,
        coverFileId,
        version: editingVersion.value,
      })
      ElMessage.success('内容已更新')
    } else {
      const created = await contentApi.create(payload)
      if (coverFile.value) {
        uploadingCover.value = true
        const record = await fileApi.upload(coverFile.value, 'CONTENT', created.id, 'CMS_IMAGE')
        await contentApi.update(created.id, {
          ...payload,
          coverFileId: record.id,
          version: created.version,
        })
      }
      ElMessage.success('内容已创建，当前为草稿')
    }
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
    uploadingCover.value = false
  }
}

async function togglePublish(row: Content) {
  try {
    if (row.status === 'PUBLISHED') {
      const { value } = await ElMessageBox.prompt('下线后内容将从门户与列表中移除，请填写下线原因。', '下线内容', {
        confirmButtonText: '确认下线',
        cancelButtonText: '取消',
        type: 'warning',
        inputType: 'textarea',
        inputPlaceholder: '例如：内容需要补充最新赛程信息',
        inputValidator: (val) => (val && val.trim().length >= 2 ? true : '请填写下线原因'),
      })
      await contentApi.unpublish(row.id, row.version, value.trim())
      ElMessage.success('内容已下线')
    } else {
      await contentApi.publish(row.id, row.version)
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
    await contentApi.remove(row.id, row.version)
    ElMessage.success('内容已删除')
    await load()
  } catch {
    // 取消
  }
}

async function openPreview(row: Content) {
  preview.value = row
  previewVisible.value = true
  if (row.coverFileId) {
    const url = await signedCoverUrl(row.coverFileId)
    if (url && preview.value?.id === row.id) row.coverUrl = url
  }
}

onMounted(() => {
  load()
  loadEvents()
  loadEventCategories()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="内容管理"
      description="维护门户新闻、政策公告、精彩瞬间与最佳阵容。发布前请确认正文与封面无误，政策公告需填写文号与有效期。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建内容</el-button>
      </template>
    </PageHeader>

    <section class="page-card">
      <FilterBar class="content-filter-bar" :summary="'已发布 ' + publishedCount + ' · 草稿 ' + draftCount">
        <div class="filter-field filter-field--type">
          <span class="filter-field__label">内容类型</span>
          <el-select v-model="filters.contentType" placeholder="全部" clearable @change="search">
            <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </div>
        <div class="filter-field">
          <span class="filter-field__label">赛事类别</span>
          <el-select v-model="filters.eventCategory" placeholder="全部" clearable @change="search">
            <el-option v-for="item in eventCategories" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </div>
        <div class="filter-field filter-field--event">
          <span class="filter-field__label">所属赛事</span>
          <el-select
            v-model="filters.eventId"
            placeholder="全部赛事"
            clearable
            filterable
            @change="changeFilterEvent"
          >
            <el-option v-for="item in events" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </div>
        <div class="filter-field filter-field--group">
          <span class="filter-field__label">比赛组别</span>
          <el-select
            v-model="filters.groupId"
            :placeholder="filters.eventId ? '全部组别' : '请先选赛事'"
            clearable
            :disabled="!filters.eventId"
            @change="search"
          >
            <el-option v-for="item in filterGroups" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </div>
        <div class="filter-field filter-field--status">
          <span class="filter-field__label">发布状态</span>
          <el-select v-model="filters.status" placeholder="全部" clearable @change="search">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="已发布" value="PUBLISHED" />
            <el-option label="已下线" value="OFFLINE" />
          </el-select>
        </div>
        <div class="filter-field filter-field--keyword">
          <span class="filter-field__label">标题关键词</span>
          <el-input
            v-model="filters.keyword"
            placeholder="搜索标题关键词"
            :prefix-icon="Search"
            clearable
            @keyup.enter="search"
            @clear="search"
          />
        </div>
        <div class="filter-actions">
          <el-button type="primary" plain @click="search">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </div>
      </FilterBar>

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

      <PaginationBar
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
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
          <el-form-item label="关联赛事">
            <el-select
              v-model="form.eventId"
              placeholder="选填，可关联赛事"
              clearable
              filterable
              style="width: 100%"
              @change="changeFormEvent"
            >
              <el-option v-for="item in events" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="关联组别">
            <el-select
              v-model="form.groupId"
              placeholder="选填，需先选择赛事"
              clearable
              :disabled="!form.eventId"
              style="width: 100%"
            >
              <el-option v-for="item in formGroups" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="封面图">
          <div class="cover-upload">
            <el-upload
              :show-file-list="false"
              :http-request="pickCover"
              accept=".jpg,.jpeg,.png"
            >
              <div class="cover-upload__box">
                <img v-if="coverPreview" :src="coverPreview" alt="封面预览" />
                <template v-else>
                  <el-icon><UploadFilled /></el-icon>
                  <span>点击上传封面</span>
                </template>
              </div>
            </el-upload>
            <div class="cover-upload__hint">
              <span>选填。建议尺寸 16:9，支持 JPG / PNG / WebP；未上传时门户使用纯文字版式。</span>
              <el-button v-if="coverPreview" link type="danger" @click="clearCover">移除</el-button>
            </div>
          </div>
        </el-form-item>
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
        <el-button type="primary" :loading="saving" @click="save">
          {{ uploadingCover ? '封面上传中…' : '保存内容' }}
        </el-button>
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
        <SafeImage v-if="preview.coverUrl" :src="preview.coverUrl" alt="" class="preview__cover" />
        <p v-if="preview.summary" class="preview__summary">{{ preview.summary }}</p>
        <div class="rich-text" v-html="preview.bodyHtml" />
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
/* 筛选区保持单行：每个控件带独立标签，空间不足时整行横向滚动，不再换行。 */
.content-filter-bar {
  flex-wrap: nowrap;
  align-items: flex-end;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: thin;
}

.content-filter-bar :deep(.el-select),
.content-filter-bar :deep(.el-input) {
  width: 100%;
}

.content-filter-bar :deep(.muted) {
  flex-shrink: 0;
  font-size: 11px;
  white-space: nowrap;
}

.filter-field {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 5px;
  min-width: 96px;
  max-width: 150px;
}

.filter-field--type,
.filter-field--status {
  min-width: 88px;
}

.filter-field--event {
  min-width: 130px;
  max-width: 190px;
}

.filter-field--keyword {
  min-width: 140px;
  max-width: 200px;
}

.filter-field__label {
  padding-left: 2px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.2;
  color: var(--ink-500);
  white-space: nowrap;
}

.filter-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.filter-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

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

.cover-upload {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cover-upload__box {
  display: grid;
  place-items: center;
  width: 240px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px dashed var(--line);
  border-radius: 10px;
  background: var(--paper);
  color: var(--brand-500);
  font-size: 10px;
  gap: 4px;
  cursor: pointer;
}

.cover-upload__box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-upload__box .el-icon {
  font-size: 24px;
}

.cover-upload__hint {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 9.5px;
  color: var(--ink-300);
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
  border-radius: 8px;
  background: var(--paper);
  font-size: 12px;
  line-height: 1.8;
  color: var(--ink-500);
}

@media (max-width: 900px) {
  .content-filter-bar {
    flex-wrap: wrap;
    overflow-x: visible;
  }

  .filter-field {
    flex: 1 1 140px;
    max-width: none;
  }

  .filter-actions {
    flex: 1 1 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
