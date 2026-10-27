<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus'
import { Delete, Document, Edit, Plus, Refresh, Search, UploadFilled } from '@element-plus/icons-vue'
import { fileApi, materialApi, orgApi, personApi } from '../../api'
import { MOCK_ENABLED } from '../../api/http'
import { useAuthStore } from '../../stores/auth'
import type { Material, Organization, Person, PersonKind } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'

const auth = useAuthStore()
/** 人员与组织接口一期仅 ADMIN；真实模式下非管理员不再发必然 403 的请求。 */
const scopeLimited = computed(() => !MOCK_ENABLED && !auth.isAdmin)

const loading = ref(false)
const rows = ref<Person[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = reactive({ keyword: '', kind: '', reviewStatus: '' })
const orgs = ref<Organization[]>([])

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const editingVersion = ref(0)
const saving = ref(false)
const avatarFileId = ref('')
const avatarUrl = ref('')
const avatarUploading = ref(false)

const materialsVisible = ref(false)
const materialsLoading = ref(false)
const materials = ref<Material[]>([])
const materialOwner = ref<Person | null>(null)
const reviewingMaterialId = ref('')
const form = reactive({
  realName: '',
  kinds: ['ATHLETE'] as PersonKind[],
  gender: 'MALE',
  birthDate: '',
  idNumber: '',
  phone: '',
  schoolOrgId: '',
  education: '',
  coachCategory: '',
})

async function load() {
  if (scopeLimited.value) {
    rows.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const res = await personApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      kind: filters.kind || undefined,
      reviewStatus: filters.reviewStatus || undefined,
    })
    rows.value = res.items
    total.value = res.total
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function loadOrgs() {
  if (scopeLimited.value) {
    orgs.value = []
    return
  }
  try {
    const res = await orgApi.list({ page: 1, pageSize: 500 })
    orgs.value = res.items.filter((org) => org.enabled)
  } catch {
    orgs.value = []
  }
}

function search() {
  page.value = 1
  load()
}

function openCreate() {
  editingId.value = null
  editingVersion.value = 0
  avatarFileId.value = ''
  avatarUrl.value = ''
  Object.assign(form, {
    realName: '',
    kinds: ['ATHLETE'],
    gender: 'MALE',
    birthDate: '',
    idNumber: '',
    phone: '',
    schoolOrgId: '',
    education: '',
    coachCategory: '',
  })
  dialogVisible.value = true
}

function openEdit(row: Person) {
  editingId.value = row.id
  editingVersion.value = row.version
  avatarFileId.value = row.avatarFileId || ''
  avatarUrl.value = row.avatarUrl || ''
  Object.assign(form, {
    realName: row.realName,
    kinds: [...row.kinds],
    gender: row.gender || 'MALE',
    birthDate: row.birthDate || '',
    idNumber: '',
    phone: '',
    schoolOrgId: row.schoolOrgId || '',
    education: row.education || '',
    coachCategory: row.coachCategory || '',
  })
  dialogVisible.value = true
}

async function save() {
  if (!form.realName.trim()) return ElMessage.warning('请填写姓名')
  if (!form.kinds.length) return ElMessage.warning('请至少选择一个人员类型')
  saving.value = true
  try {
    if (editingId.value) {
      await personApi.update(editingId.value, {
        realName: form.realName,
        kinds: form.kinds,
        gender: form.gender,
        birthDate: form.birthDate || undefined,
        schoolOrgId: form.schoolOrgId || undefined,
        avatarFileId: avatarFileId.value || undefined,
        education: form.education,
        coachCategory: form.coachCategory,
        version: editingVersion.value,
      })
      ElMessage.success('人员档案已更新')
    } else {
      await personApi.create({ ...form })
      ElMessage.success('人员档案已创建')
    }
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function uploadAvatar(options: UploadRequestOptions) {
  avatarUploading.value = true
  try {
    const record = await fileApi.upload(options.file, 'PERSON', editingId.value || '', 'AVATAR')
    avatarFileId.value = record.id
    avatarUrl.value = record.url || URL.createObjectURL(options.file)
    ElMessage.success('头像上传成功，保存档案后生效')
  } catch {
    // 拦截器提示
  } finally {
    avatarUploading.value = false
  }
}

async function openMaterials(row: Person) {
  materialOwner.value = row
  materialsVisible.value = true
  await loadMaterials(row.id)
}

async function loadMaterials(personId?: string) {
  const ownerId = personId || materialOwner.value?.id
  if (!ownerId) return
  materialsLoading.value = true
  try {
    const res = await materialApi.list({ page: 1, pageSize: 100, ownerType: 'PERSON', ownerId })
    materials.value = res.items
  } catch {
    materials.value = []
  } finally {
    materialsLoading.value = false
  }
}

async function downloadMaterial(material: Material) {
  const fileId = material.fileIds?.[0]
  if (!fileId) return ElMessage.warning('该材料暂无可下载文件，请本人重新上传')
  try {
    const downloaded = await fileApi.download(fileId, material.fileName || '履历材料')
    ElMessage.success(downloaded ? '文件已开始下载' : '演示环境已模拟下载，接入后端后将下载真实文件')
  } catch {
    // 拦截器提示
  }
}

async function reviewMaterial(material: Material, decision: 'APPROVE' | 'REJECT') {
  let reason = ''
  if (decision === 'REJECT') {
    try {
      const result = await ElMessageBox.prompt('请填写驳回原因，将通知本人重新提交。', '驳回材料', {
        confirmButtonText: '确认驳回',
        cancelButtonText: '取消',
        inputValidator: (value) => (value && value.trim().length >= 4 ? true : '请至少填写 4 个字符'),
      })
      reason = result.value
    } catch {
      return
    }
  }
  reviewingMaterialId.value = material.id
  try {
    await materialApi.review(material.id, { decision, reason: reason || undefined, version: material.version })
    ElMessage.success(decision === 'APPROVE' ? '材料已通过审核' : '材料已驳回')
    await loadMaterials()
  } catch {
    // 拦截器提示
  } finally {
    reviewingMaterialId.value = ''
  }
}

async function removePerson(row: Person) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.realName}」的人员档案？请先确认无报名与球队关联。`, '删除人员', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await personApi.remove(row.id, row.version)
    ElMessage.success('人员档案已删除')
    await load()
  } catch {
    // 取消
  }
}

onMounted(() => {
  load()
  loadOrgs()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="人员管理"
      description="统一管理运动员与教练员档案。敏感证件号与手机号按脱敏规则存储，新建档案默认进入待审核状态。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="!scopeLimited" type="primary" :icon="Plus" @click="openCreate">新建人员</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="scopeLimited"
      class="scope-alert"
      type="info"
      :closable="false"
      show-icon
      title="人员档案当前仅管理员可查看"
      description="人员数据范围一期仅对管理员开放；省审核员可继续使用报名审核、赛事与账号管理功能。"
    />

    <section class="page-card">
      <FilterBar :summary="'共 ' + total + ' 人'">
        <el-input
          v-model="filters.keyword"
          placeholder="姓名 / 证件号"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="filters.kind" placeholder="全部类型" clearable @change="search">
          <el-option label="运动员" value="ATHLETE" />
          <el-option label="教练员" value="COACH" />
        </el-select>
        <el-select v-model="filters.reviewStatus" placeholder="全部状态" clearable @change="search">
          <el-option label="待审核" value="PENDING" />
          <el-option label="已通过" value="APPROVED" />
          <el-option label="已驳回" value="REJECTED" />
        </el-select>
        <el-button type="primary" plain @click="search">查询</el-button>
      </FilterBar>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="姓名" min-width="170">
          <template #default="{ row }">
            <div class="person-cell">
              <span class="person-cell__avatar">
                <img v-if="row.avatarUrl" :src="row.avatarUrl" alt="" />
                <template v-else>{{ row.realName.slice(0, 1) }}</template>
              </span>
              <div>
                <strong>{{ row.realName }}</strong>
                <small>{{ row.maskedIdNumber || '证件号未登记' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="130">
          <template #default="{ row }">
            <el-tag v-for="kind in row.kinds" :key="kind" size="small" effect="plain" class="kind-tag">
              {{ kind === 'ATHLETE' ? '运动员' : '教练员' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="性别" width="70" align="center">
          <template #default="{ row }">
            {{ row.gender === 'FEMALE' ? '女' : row.gender === 'MALE' ? '男' : '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="schoolName" label="学校 / 单位" min-width="190">
          <template #default="{ row }">{{ row.schoolName || '—' }}</template>
        </el-table-column>
        <el-table-column label="档案状态" width="110">
          <template #default="{ row }"><StatusTag :status="row.reviewStatus" kind="review" /></template>
        </el-table-column>
        <el-table-column label="创建时间" width="130">
          <template #default="{ row }">
            <span class="muted">{{ dayjs(row.createdAt).format('YYYY-MM-DD') }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Document" @click="openMaterials(row)">材料</el-button>
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" :icon="Delete" @click="removePerson(row)">删除</el-button>
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

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑人员档案' : '新建人员档案'" width="660px">
      <div v-if="editingId" class="avatar-row">
        <span class="avatar-preview">
          <img v-if="avatarUrl" :src="avatarUrl" alt="头像" />
          <template v-else>{{ form.realName.slice(0, 1) || '人' }}</template>
        </span>
        <div>
          <strong>人员头像</strong>
          <small>用于报名表、参赛证与身份核验，建议使用近期免冠照片。</small>
        </div>
        <el-upload
          :show-file-list="false"
          :http-request="uploadAvatar"
          accept=".jpg,.jpeg,.png"
        >
          <el-button size="small" plain :icon="UploadFilled" :loading="avatarUploading">上传头像</el-button>
        </el-upload>
      </div>
      <el-form :model="form" label-position="top">
        <div class="form-grid">
          <el-form-item label="真实姓名" required>
            <el-input v-model="form.realName" placeholder="与证件一致" />
          </el-form-item>
          <el-form-item label="性别">
            <el-select v-model="form.gender" style="width: 100%">
              <el-option label="男" value="MALE" />
              <el-option label="女" value="FEMALE" />
              <el-option label="未说明" value="UNSPECIFIED" />
            </el-select>
          </el-form-item>
          <el-form-item label="出生日期">
            <el-date-picker v-model="form.birthDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="人员类型" required>
            <el-checkbox-group v-model="form.kinds">
              <el-checkbox value="ATHLETE">运动员</el-checkbox>
              <el-checkbox value="COACH">教练员</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          <template v-if="!editingId">
            <el-form-item label="身份证号">
              <el-input v-model="form.idNumber" maxlength="18" placeholder="仅用于脱敏存储" />
            </el-form-item>
            <el-form-item label="手机号">
              <el-input v-model="form.phone" maxlength="11" placeholder="仅用于脱敏存储" />
            </el-form-item>
          </template>
          <el-form-item label="学校 / 单位">
            <el-select v-model="form.schoolOrgId" filterable clearable style="width: 100%">
              <el-option v-for="org in orgs" :key="org.id" :label="org.name" :value="org.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="学历">
            <el-input v-model="form.education" placeholder="如：本科" />
          </el-form-item>
          <el-form-item v-if="form.kinds.includes('COACH')" label="教练员类别">
            <el-select v-model="form.coachCategory" style="width: 100%" clearable>
              <el-option label="主教练" value="主教练" />
              <el-option label="助理教练" value="助理教练" />
              <el-option label="守门员教练" value="守门员教练" />
              <el-option label="体能教练" value="体能教练" />
            </el-select>
          </el-form-item>
        </div>
        <el-alert
          v-if="!editingId"
          type="info"
          :closable="false"
          show-icon
          title="新建档案默认待审核"
          description="证件号与手机号仅脱敏保存，不展示完整值。"
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存档案</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="materialsVisible" size="620px" :with-header="false">
      <div class="material-head">
        <span class="material-head__eyebrow">个人材料</span>
        <h2>{{ materialOwner?.realName || '人员' }} · 履历材料</h2>
        <p>{{ materialOwner?.schoolName || '学校未登记' }} · 待审核材料需逐份给出结论。</p>
      </div>
      <div v-loading="materialsLoading" class="material-list">
        <div v-for="item in materials" :key="item.id" class="material-item">
          <span class="material-item__icon"><el-icon><Document /></el-icon></span>
          <div class="material-item__body">
            <div class="material-item__title">
              <strong>{{ item.title }}</strong>
              <StatusTag :status="item.reviewStatus" kind="review" />
            </div>
            <small>{{ item.materialLabel }} · {{ item.fileName || '文件未登记' }}</small>
            <p v-if="item.reviewReason">{{ item.reviewReason }}</p>
            <div class="material-item__actions">
              <el-button v-if="item.fileName" size="small" link type="primary" @click="downloadMaterial(item)">
                下载
              </el-button>
              <template v-if="item.reviewStatus === 'PENDING'">
              <el-button
                size="small"
                type="danger"
                plain
                :loading="reviewingMaterialId === item.id"
                @click="reviewMaterial(item, 'REJECT')"
              >
                驳回
              </el-button>
              <el-button
                size="small"
                type="success"
                :loading="reviewingMaterialId === item.id"
                @click="reviewMaterial(item, 'APPROVE')"
              >
                通过
              </el-button>
              </template>
            </div>
          </div>
        </div>
        <el-empty v-if="!materialsLoading && !materials.length" description="该人员暂无履历材料" :image-size="80" />
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.scope-alert {
  margin-bottom: 16px;
}

.person-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.person-cell__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.person-cell__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.person-cell strong {
  display: block;
  font-size: 12.5px;
}

.person-cell small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.kind-tag {
  margin-right: 4px;
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 18px;
  padding: 13px 15px;
  border-radius: 12px;
  background: var(--paper);
}

.avatar-preview {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--brand-100);
  color: var(--brand-700);
  font-size: 16px;
  font-weight: 700;
}

.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-row div {
  flex: 1;
}

.avatar-row strong {
  display: block;
  font-size: 12.5px;
}

.avatar-row small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.material-head {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.material-head__eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-600);
}

.material-head h2 {
  margin-top: 5px;
  font-size: 20px;
}

.material-head p {
  margin-top: 5px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.material-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
}

.material-item {
  display: flex;
  gap: 11px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 11px;
}

.material-item__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 9px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.material-item__body {
  flex: 1;
  min-width: 0;
}

.material-item__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.material-item__title strong {
  font-size: 12.5px;
}

.material-item small {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: var(--ink-300);
}

.material-item p {
  margin-top: 5px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.material-item__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
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
