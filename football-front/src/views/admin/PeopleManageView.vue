<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'
import { orgApi, personApi } from '../../api'
import type { Organization, Person, PersonKind } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const loading = ref(false)
const rows = ref<Person[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const filters = reactive({ keyword: '', kind: '', reviewStatus: '' })
const orgs = ref<Organization[]>([])

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
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
        education: form.education,
        coachCategory: form.coachCategory,
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

async function removePerson(row: Person) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.realName}」的人员档案？请先确认无报名与球队关联。`, '删除人员', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await personApi.remove(row.id)
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
      eyebrow="PEOPLE DIRECTORY"
      description="统一管理运动员与教练员档案。敏感证件号与手机号按脱敏规则存储，新建档案默认进入待审核状态。"
    >
      <template #actions>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建人员</el-button>
      </template>
    </PageHeader>

    <section class="page-card">
      <div class="filter-bar">
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
        <span class="filter-bar__spacer" />
        <span class="muted">共 {{ total }} 人</span>
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="姓名" min-width="170">
          <template #default="{ row }">
            <div class="person-cell">
              <span class="person-cell__avatar">{{ row.realName.slice(0, 1) }}</span>
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
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" :icon="Delete" @click="removePerson(row)">删除</el-button>
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

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑人员档案' : '新建人员档案'" width="660px">
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
  </div>
</template>

<style scoped>
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
  border-radius: 50%;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
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
