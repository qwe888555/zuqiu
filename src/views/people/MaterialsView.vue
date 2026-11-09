<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, type UploadRequestOptions } from 'element-plus'
import { Document, Plus, Refresh, UploadFilled } from '@element-plus/icons-vue'
import { fileApi, materialApi, meApi } from '../../api'
import type { Material, Person } from '../../api/types'
import { httpStatusOf } from '../../utils/httpError'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import StatCard from '../../components/common/StatCard.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const loading = ref(false)
const rows = ref<Material[]>([])
const total = ref(0)
const person = ref<Person | null>(null)
const filterStatus = ref('')
/** 后端数据范围未开放（403）时提示只读。 */
const restricted = ref(false)
/** 账号未绑定人员档案（404）。 */
const profileMissing = ref(false)

const dialogVisible = ref(false)
const uploading = ref(false)
const saving = ref(false)
const uploadedFileName = ref('')
const uploadedFileIds = ref<string[]>([])

const form = ref({
  materialType: '',
  title: '',
  description: '',
})

/** 教练与运动员可维护的材料类型不同；身兼两种身份时合并展示。 */
const COACH_MATERIAL_TYPES = [
  { value: 'COACH_LICENSE', label: '教练员证书' },
  { value: 'TEACHER_LICENSE', label: '教师资格证' },
  { value: 'COACHING_RECORD', label: '执教记录' },
  { value: 'AWARD', label: '获奖证书' },
  { value: 'OTHER', label: '其他材料' },
]

const ATHLETE_MATERIAL_TYPES = [
  { value: 'STUDENT_STATUS', label: '学籍证明' },
  { value: 'ATHLETE_CERTIFICATE', label: '运动员证书' },
  { value: 'COMPETITION', label: '参赛经历' },
  { value: 'AWARD', label: '获奖证书' },
  { value: 'OTHER', label: '其他材料' },
]

const materialTypes = computed(() => {
  const kinds = person.value?.kinds ?? []
  const options = [
    ...(kinds.includes('COACH') ? COACH_MATERIAL_TYPES : []),
    ...(kinds.includes('ATHLETE') ? ATHLETE_MATERIAL_TYPES : []),
  ]
  // 兼有两种身份时 AWARD / OTHER 会重复，按类型去重。
  return options.filter((item, index) => options.findIndex((other) => other.value === item.value) === index)
})

const pageDescription = '维护本人履历材料，用于资格审查与遴选；提交后由学校端或管理员审核。'

const filteredRows = computed(() =>
  filterStatus.value ? rows.value.filter((row) => row.reviewStatus === filterStatus.value) : rows.value,
)

const approvedCount = computed(() => rows.value.filter((m) => m.reviewStatus === 'APPROVED').length)
const pendingCount = computed(() => rows.value.filter((m) => m.reviewStatus === 'PENDING').length)
const rejectedCount = computed(() => rows.value.filter((m) => m.reviewStatus === 'REJECTED').length)

async function load() {
  loading.value = true
  try {
    try {
      person.value = await meApi.profile({ silentError: true })
      profileMissing.value = false
    } catch (error) {
      person.value = null
      profileMissing.value = httpStatusOf(error) === 404
      rows.value = []
      total.value = 0
      return
    }
    try {
      const res = await materialApi.list(
        {
          page: 1,
          pageSize: 100,
          ownerType: 'PERSON',
          ownerId: person.value.id,
        },
        { silentError: true },
      )
      rows.value = res.items
      total.value = res.total
      restricted.value = false
    } catch (error) {
      rows.value = []
      total.value = 0
      restricted.value = httpStatusOf(error) === 403
    }
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.value = {
    materialType: materialTypes.value[0]?.value ?? 'OTHER',
    title: '',
    description: '',
  }
  uploadedFileName.value = ''
  uploadedFileIds.value = []
  dialogVisible.value = true
}

async function doUpload(options: UploadRequestOptions) {
  if (!person.value) return
  if (options.file.size > 20 * 1024 * 1024) {
    ElMessage.warning('单个文件不能超过 20MB')
    return
  }
  uploading.value = true
  try {
    const record = await fileApi.upload(options.file, 'PERSON', person.value.id, 'MATERIAL')
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
  if (!person.value) return
  if (!form.value.materialType) return ElMessage.warning('请选择材料类型')
  if (!form.value.title.trim()) return ElMessage.warning('请填写材料名称')
  if (!uploadedFileName.value) return ElMessage.warning('请先上传材料文件')
  saving.value = true
  try {
    await materialApi.create({
      ownerType: 'PERSON',
      ownerId: person.value.id,
      materialType: form.value.materialType,
      title: form.value.title.trim(),
      description: form.value.description,
      fileName: uploadedFileName.value,
      fileIds: uploadedFileIds.value,
    })
    ElMessage.success('材料已提交审核，请等待学校端处理')
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
      title="履历材料"
      :description="pageDescription"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button
          v-if="person && !profileMissing && !restricted"
          type="primary"
          :icon="Plus"
          @click="openCreate"
        >
          上传材料
        </el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="profileMissing"
      class="state-alert"
      type="warning"
      :closable="false"
      show-icon
      title="当前账号未绑定人员档案"
      description="请联系组委会管理员将账号与人员档案绑定后，再查看履历材料。"
    />
    <el-alert
      v-else-if="restricted"
      class="state-alert"
      type="info"
      :closable="false"
      show-icon
      title="履历材料数据范围未开放"
      description="当前账号暂无法读取本人履历材料，请联系组委会管理员核对人员档案绑定与数据范围。"
    />

    <div class="stat-grid">
      <StatCard label="材料总数" :value="total" hint="个人履历材料" :icon="Document" tone="green" />
      <StatCard label="已通过" :value="approvedCount" hint="可用于遴选" :icon="Document" tone="lime" />
      <StatCard label="待审核" :value="pendingCount" hint="等待审核处理" :icon="Document" tone="amber" />
      <StatCard label="已驳回" :value="rejectedCount" hint="需重新提交" :icon="Document" tone="blue" />
    </div>

    <section class="page-card">
      <FilterBar :summary="'共 ' + filteredRows.length + ' 份材料'">
        <el-radio-group v-model="filterStatus">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="PENDING">待审核</el-radio-button>
          <el-radio-button value="APPROVED">已通过</el-radio-button>
          <el-radio-button value="REJECTED">已驳回</el-radio-button>
        </el-radio-group>
      </FilterBar>

      <el-table v-loading="loading" :data="filteredRows" style="width: 100%">
        <el-table-column label="材料名称" min-width="260">
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
        <el-table-column prop="materialLabel" label="类型" width="120" />
        <el-table-column label="提交时间" width="160">
          <template #default="{ row }">{{ dayjs(row.createdAt).format('YYYY-MM-DD HH:mm') }}</template>
        </el-table-column>
        <el-table-column label="审核状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.reviewStatus" kind="review" /></template>
        </el-table-column>
        <el-table-column label="审核意见" min-width="200">
          <template #default="{ row }">
            <span :class="{ muted: !row.reviewReason }">{{ row.reviewReason || '—' }}</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!loading && !filteredRows.length"
        :description="
          profileMissing
            ? '绑定人员档案后即可查看材料'
            : restricted
              ? '材料数据范围暂未开放'
              : '暂无履历材料'
        "
        :image-size="80"
      />
    </section>

    <el-dialog v-model="dialogVisible" title="上传履历材料" width="560px">
      <el-form :model="form" label-position="top">
        <el-form-item label="材料类型" required>
          <el-select v-model="form.materialType" style="width: 100%">
            <el-option v-for="item in materialTypes" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="材料名称" required>
          <el-input v-model="form.title" placeholder="如：亚足联 C 级教练员证书" />
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
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="提交后由所在学校审核员或管理员审核，审核通过后才可用于资格审查与遴选。"
      />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="create">提交审核</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.state-alert {
  margin-bottom: 16px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.material-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.material-cell__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--brand-50);
  color: var(--brand-600);
  flex-shrink: 0;
}

.material-cell strong {
  display: block;
  font-size: 13px;
}

.material-cell small {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--ink-400);
}

.muted {
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

@media (max-width: 768px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
