<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus'
import { Delete, Document, Plus, Refresh, UploadFilled } from '@element-plus/icons-vue'
import { fileApi, materialApi } from '../../api'
import type { Material } from '../../api/types'
import StatusTag from '../../components/common/StatusTag.vue'
import StatCard from '../../components/common/StatCard.vue'

const props = defineProps<{ teamId: string }>()

const loading = ref(false)
const rows = ref<Material[]>([])
const total = ref(0)
const dialogVisible = ref(false)
const uploading = ref(false)
const saving = ref(false)
const uploadedFileName = ref('')
const uploadedFileIds = ref<string[]>([])

const form = ref({
  materialType: 'TEAM_HONOR',
  title: '',
  description: '',
})

const materialTypes = [
  { value: 'TEAM_HONOR', label: '球队荣誉' },
  { value: 'COMPETITION', label: '参赛记录' },
  { value: 'MATCH_RECORD', label: '对阵记录' },
  { value: 'TRAINING_PLAN', label: '训练计划' },
  { value: 'COACH_LICENSE', label: '教练员证书' },
  { value: 'OTHER', label: '其他材料' },
]

const approvedCount = computed(() => rows.value.filter((m) => m.reviewStatus === 'APPROVED').length)
const pendingCount = computed(() => rows.value.filter((m) => m.reviewStatus === 'PENDING').length)

async function load() {
  if (!props.teamId) {
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const res = await materialApi.list({
      page: 1,
      pageSize: 100,
      ownerType: 'TEAM',
      ownerId: props.teamId,
    })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = { materialType: 'TEAM_HONOR', title: '', description: '' }
  uploadedFileName.value = ''
  uploadedFileIds.value = []
  dialogVisible.value = true
}

async function doUpload(options: UploadRequestOptions) {
  if (!props.teamId) return
  uploading.value = true
  try {
    const record = await fileApi.upload(options.file, 'TEAM', props.teamId)
    uploadedFileName.value = record.originalName
    uploadedFileIds.value = [record.id]
    ElMessage.success('文件上传成功')
  } catch {
    // 拦截器提示
  } finally {
    uploading.value = false
  }
}

async function create() {
  if (!props.teamId) return
  if (!form.value.title.trim()) return ElMessage.warning('请填写材料名称')
  if (!uploadedFileName.value) return ElMessage.warning('请先上传材料文件')
  saving.value = true
  try {
    await materialApi.create({
      ownerType: 'TEAM',
      ownerId: props.teamId,
      materialType: form.value.materialType,
      title: form.value.title,
      description: form.value.description,
      fileName: uploadedFileName.value,
      fileIds: uploadedFileIds.value,
    })
    ElMessage.success('材料已提交审核')
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function removeMaterial(row: Material) {
  try {
    await ElMessageBox.confirm(`确认删除材料「${row.title}」？`, '删除材料', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await materialApi.remove(row.id, row.version)
    ElMessage.success('材料已删除')
    await load()
  } catch {
    // 取消
  }
}

watch(() => props.teamId, load, { immediate: true })
</script>

<template>
  <div class="materials-panel">
    <div class="materials-toolbar">
      <p class="materials-toolbar__copy">
        归档球队荣誉、参赛记录、对阵记录与训练计划；提交后由省级管理员审核，通过后可用于遴选与公示。
      </p>
      <div class="materials-toolbar__actions">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">上传材料</el-button>
      </div>
    </div>

    <div class="stat-grid">
      <StatCard label="球队材料" :value="total" hint="已归档材料数" :icon="Document" tone="green" />
      <StatCard label="审核通过" :value="approvedCount" hint="可用于公示" :icon="Document" tone="lime" />
      <StatCard label="待审核" :value="pendingCount" hint="等待管理员处理" :icon="Document" tone="amber" />
    </div>

    <section class="page-card">
      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="材料名称" min-width="240">
          <template #default="{ row }">
            <div class="material-cell">
              <span class="material-cell__icon"><el-icon><Document /></el-icon></span>
              <div>
                <strong>{{ row.title }}</strong>
                <small>{{ row.fileName || '文件未登记' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="materialLabel" label="材料类型" width="130" />
        <el-table-column label="提交时间" width="160">
          <template #default="{ row }">{{ dayjs(row.createdAt).format('YYYY-MM-DD HH:mm') }}</template>
        </el-table-column>
        <el-table-column label="审核状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.reviewStatus" kind="review" /></template>
        </el-table-column>
        <el-table-column label="审核意见" min-width="180">
          <template #default="{ row }">
            <span :class="{ muted: !row.reviewReason }">{{ row.reviewReason || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="right">
          <template #default="{ row }">
            <el-button link type="danger" :icon="Delete" @click="removeMaterial(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !rows.length" description="暂无球队材料，点击右上角上传" :image-size="80" />
    </section>

    <el-dialog v-model="dialogVisible" title="上传球队材料" width="560px">
      <el-form :model="form" label-position="top">
        <el-form-item label="材料类型">
          <el-select v-model="form.materialType" style="width: 100%">
            <el-option v-for="item in materialTypes" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="材料名称" required>
          <el-input v-model="form.title" placeholder="如：2025 年四川省校园足球联赛冠军证书" />
        </el-form-item>
        <el-form-item label="材料说明">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="选填，可说明材料用途或备注" />
        </el-form-item>
        <el-form-item label="材料文件" required>
          <el-upload
            class="uploader"
            drag
            :show-file-list="false"
            :http-request="doUpload"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          >
            <el-icon class="uploader__icon"><UploadFilled /></el-icon>
            <div v-if="uploadedFileName" class="uploader__file">
              已上传：<strong>{{ uploadedFileName }}</strong>（点击可重新上传）
            </div>
            <template v-else>
              <div class="uploader__text">将文件拖到此处，或<em>点击上传</em></div>
              <div class="uploader__hint">支持 PDF、JPG、PNG、DOC，单个文件不超过 20MB</div>
            </template>
          </el-upload>
          <span v-if="uploading" class="muted">文件上传中…</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="create">提交审核</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.materials-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}

.materials-toolbar__copy {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.materials-toolbar__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.material-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.material-cell__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.material-cell strong {
  display: block;
  font-size: 12.5px;
}

.material-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.uploader {
  width: 100%;
}

.uploader :deep(.el-upload-dragger) {
  padding: 26px 16px;
  border-color: var(--line);
  border-radius: 12px;
  background: var(--paper);
}

.uploader__icon {
  font-size: 30px;
  color: var(--brand-500);
}

.uploader__text {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-500);
}

.uploader__text em {
  font-style: normal;
  color: var(--brand-700);
}

.uploader__hint {
  margin-top: 6px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.uploader__file {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-500);
}

.uploader__file strong {
  color: var(--brand-700);
}
</style>
