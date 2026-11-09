<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus'
import { Camera, Delete, Edit, Plus, Refresh, Search, User } from '@element-plus/icons-vue'
import { fileApi, personApi, teamApi } from '../../api'
import type { Person, TeamMember } from '../../api/types'
import { useTeamScope } from '../../composables/useTeamScope'
import { usePermission } from '../../composables/usePermission'
import { useAuthStore } from '../../stores/auth'
import { POSITION_LABELS, positionLabel } from '../../config/labels'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'
import StatCard from '../../components/common/StatCard.vue'
import PaginationBar from '../../components/common/PaginationBar.vue'
import FilterBar from '../../components/common/FilterBar.vue'
import SafeImage from '../../components/common/SafeImage.vue'

const { teams, teamId, loadTeams } = useTeamScope()
const { can } = usePermission()
const auth = useAuthStore()
/**
 * 成员照片实际写回人员主档（PUT /people/{id}），后端 personUpdate 仅放开 ADMIN；
 * 球队/学校账号只维护成员关系，展示上传入口会必然 403 并留下孤立文件。
 */
const canUploadPhoto = computed(() => can('system.people'))
const loading = ref(false)
const rows = ref<TeamMember[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')

const dialogVisible = ref(false)
const adding = ref(false)
const searchKeyword = ref('')
const searching = ref(false)
const candidates = ref<Person[]>([])
const selected = ref<Person | null>(null)
const memberForm = reactive({ jerseyNumber: 1, position: 'MF' })
const editVisible = ref(false)
const editingMember = ref<TeamMember | null>(null)
const savingEdit = ref(false)
const editForm = reactive({
  jerseyNumber: undefined as number | undefined,
  position: '',
  effectiveFrom: '',
  effectiveTo: '',
})
const uploadingPhotoId = ref('')
/** 头像走私有文件签名地址；按 fileId 缓存，避免翻页/刷新重复签发。 */
const avatarUrls = ref<Record<string, string>>({})

const positions = Object.entries(POSITION_LABELS).map(([value, label]) => ({ value, label }))
// 候选人搜索后端已限定「本校 + 档案已审核通过 + 未在本队现役」，前端无需再提示跨校/审核状态。

// 成员状态是 CURRENT/EXITED（冻结关系枚举），不是报名或审核状态。
const currentCount = computed(() => rows.value.filter((m) => m.status === 'CURRENT').length)
const exitedCount = computed(() => rows.value.filter((m) => m.status === 'EXITED').length)
const positionStats = computed(() =>
  positions.map(({ value, label }) => ({
    value,
    label,
    count: rows.value.filter((m) => m.position === value).length,
  })),
)

function memberAvatar(member: TeamMember): string {
  return member.avatarFileId ? avatarUrls.value[member.avatarFileId] || '' : ''
}

async function hydrateAvatars(items: TeamMember[]) {
  const pending = items.filter(
    (item) => item.avatarFileId && !avatarUrls.value[item.avatarFileId],
  )
  if (!pending.length) return
  const resolved = await Promise.all(
    pending.map(async (item) => {
      try {
        const { url } = await fileApi.signedUrl(item.avatarFileId!, 'thumbnail')
        return [item.avatarFileId!, url] as const
      } catch {
        return null
      }
    }),
  )
  const next = { ...avatarUrls.value }
  for (const pair of resolved) {
    if (pair) next[pair[0]] = pair[1]
  }
  avatarUrls.value = next
}

async function load() {
  if (!teamId.value) return
  loading.value = true
  try {
    const res = await teamApi.members(teamId.value, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value || undefined,
    })
    rows.value = res.items
    total.value = res.total
    void hydrateAvatars(res.items)
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function changeTeam() {
  page.value = 1
  keyword.value = ''
  await load()
}

function search() {
  page.value = 1
  load()
}

function openAdd() {
  dialogVisible.value = true
  searchKeyword.value = ''
  candidates.value = []
  selected.value = null
  memberForm.jerseyNumber = rows.value.length + 1
  memberForm.position = 'MF'
}

// ---------------------------------------------------------------- 本校人员档案（学校端）
/** 学校端可建档并提交复核；审核由市州/省级完成（2026-11-09 职责分离）。 */
const canManagePerson = computed(() => auth.roles.includes('UNIVERSITY'))
const personDialogVisible = ref(false)
const personLoading = ref(false)
const personRows = ref<Person[]>([])
const personTotal = ref(0)
const personPage = ref(1)
const personPageSize = ref(20)
const personFilter = ref('')
const personKeyword = ref('')

const PERSON_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '待复核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
}

function personStatusType(status?: string) {
  if (status === 'APPROVED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'PENDING') return 'warning'
  return 'info'
}

async function loadPersons() {
  personLoading.value = true
  try {
    const res = await personApi.list({
      page: personPage.value,
      pageSize: personPageSize.value,
      keyword: personKeyword.value || undefined,
      reviewStatus: personFilter.value || undefined,
    })
    personRows.value = res.items
    personTotal.value = res.total
  } catch {
    // 拦截器提示
  } finally {
    personLoading.value = false
  }
}

function openPersonDialog() {
  personDialogVisible.value = true
  personPage.value = 1
  personKeyword.value = ''
  personFilter.value = ''
  void loadPersons()
}

/** DRAFT/REJECTED → PENDING：学校把档案提交复核（否则终审必挂）。 */
async function submitPersonArchive(row: Person) {
  try {
    await personApi.submit(row.id, row.version)
    ElMessage.success('已提交复核')
    await loadPersons()
  } catch {
    // 拦截器提示
  }
}

// ---------------------------------------------------------------- 学校端新建人员
const createVisible = ref(false)
const creating = ref(false)
const createForm = reactive({
  realName: '',
  gender: 'MALE',
  birthDate: '',
  idNumber: '',
  phone: '',
  kinds: ['ATHLETE'] as string[],
  education: '',
})

function openCreate() {
  Object.assign(createForm, {
    realName: '',
    gender: 'MALE',
    birthDate: '',
    idNumber: '',
    phone: '',
    kinds: ['ATHLETE'],
    education: '',
  })
  createVisible.value = true
}

async function savePerson() {
  if (!createForm.realName.trim()) return ElMessage.warning('请填写姓名')
  if (!createForm.birthDate) return ElMessage.warning('请选择出生日期（报名按出生日期预检年龄）')
  // 后端创建链强制 18 位身份证号与 11 位手机号（schema pattern），提前校验避免 400。
  if (!/^\d{17}[\dXx]$/.test(createForm.idNumber.trim())) return ElMessage.warning('请填写 18 位身份证号')
  if (!/^1\d{10}$/.test(createForm.phone.trim())) return ElMessage.warning('请填写 11 位手机号')
  if (createForm.kinds.length !== 1) return ElMessage.warning('人员类型只能选择一项')
  if (!createForm.education.trim()) return ElMessage.warning('请填写学历')
  creating.value = true
  try {
    await personApi.create({
      realName: createForm.realName.trim(),
      kinds: createForm.kinds,
      gender: createForm.gender,
      birthDate: createForm.birthDate,
      idNumber: createForm.idNumber.trim(),
      phone: createForm.phone.trim(),
      schoolOrgId: auth.user?.orgId || undefined,
      education: createForm.education.trim(),
    })
    ElMessage.success('档案已创建，请提交复核并审核通过后加入球队')
    createVisible.value = false
    await loadPersons()
  } catch {
    // 拦截器提示
  } finally {
    creating.value = false
  }
}

async function searchPeople() {
  if (!teamId.value || !searchKeyword.value.trim()) return
  searching.value = true
  try {
    candidates.value = await teamApi.searchMembers(teamId.value, searchKeyword.value.trim())
  } catch {
    candidates.value = []
  } finally {
    searching.value = false
  }
}

function choose(person: Person) {
  selected.value = person
}

async function addMember() {
  if (!teamId.value) return
  if (!selected.value) return ElMessage.warning('请先搜索并选择球员')
  adding.value = true
  try {
    await teamApi.addMember(teamId.value, {
      athleteId: selected.value.id,
      jerseyNumber: memberForm.jerseyNumber,
      position: memberForm.position,
    })
    ElMessage.success('球员已加入球队')
    dialogVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    adding.value = false
  }
}

function openEdit(member: TeamMember) {
  editingMember.value = member
  editForm.jerseyNumber = member.jerseyNumber
  editForm.position = member.position || ''
  editForm.effectiveFrom = new Date().toISOString().slice(0, 10)
  editForm.effectiveTo = ''
  editVisible.value = true
}

async function saveMemberEdit() {
  if (!teamId.value || !editingMember.value) return
  savingEdit.value = true
  try {
    await teamApi.updateMember(teamId.value, editingMember.value.id, {
      athleteId: editingMember.value.athleteId,
      jerseyNumber: editForm.jerseyNumber,
      position: editForm.position || undefined,
      effectiveFrom: editForm.effectiveFrom,
      effectiveTo: editForm.effectiveTo || undefined,
      version: editingMember.value.version,
    })
    ElMessage.success('球员信息已更新')
    editVisible.value = false
    await load()
  } catch {
    // 拦截器提示
  } finally {
    savingEdit.value = false
  }
}

async function uploadPhoto(member: TeamMember, options: UploadRequestOptions) {
  uploadingPhotoId.value = member.id
  try {
    const record = await fileApi.upload(options.file, 'PERSON', member.athleteId, 'AVATAR')
    const person = await personApi.get(member.athleteId)
    // 人员更新是“必填字段全量替换”：仅传 kinds/realName 会把性别、出生日期清空。
    await personApi.update(person.id, {
      kinds: person.kinds,
      realName: person.realName,
      gender: person.gender,
      birthDate: person.birthDate,
      avatarFileId: record.id,
      version: person.version,
    })
    try {
      const { url } = await fileApi.signedUrl(record.id, 'thumbnail')
      avatarUrls.value = { ...avatarUrls.value, [record.id]: url }
    } catch {
      // 头像地址签发失败不阻断上传结果，下次加载列表会重试。
    }
    ElMessage.success('球员照片已更新')
    await load()
  } catch {
    // 拦截器提示
  } finally {
    uploadingPhotoId.value = ''
  }
}

async function removeMember(member: TeamMember) {
  if (!teamId.value) return
  try {
    await ElMessageBox.confirm(`确认将「${member.athleteName}」移出球队名单？`, '移除球员', {
      confirmButtonText: '移除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await teamApi.removeMember(teamId.value, member.id, member.version)
    ElMessage.success('已移出球队')
    await load()
  } catch {
    // 取消
  }
}

onMounted(async () => {
  await loadTeams()
  await load()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="球员名单"
      description="维护球队常备球员。报名时从球队名单中挑选球员，资格预检会核对年龄、学籍与重复报名情况。"
    >
      <template #actions>
        <el-select
          v-if="teams.length > 1"
          v-model="teamId"
          style="width: 210px"
          @change="changeTeam"
        >
          <el-option v-for="item in teams" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="canManagePerson" @click="openPersonDialog">本校人员档案</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd">添加球员</el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="球队球员" :value="total" hint="当前球队名单" :icon="User" tone="green" />
      <StatCard label="现役成员" :value="currentCount" hint="本页现役人数" :icon="User" tone="lime" />
      <StatCard label="历史离队" :value="exitedCount" hint="保留履历记录" :icon="User" tone="amber" />
      <StatCard
        label="本页覆盖位置"
        :value="positionStats.filter((p) => p.count > 0).length"
        hint="守门员 / 后卫 / 中场 / 前锋"
        :icon="User"
        tone="blue"
      />
    </div>

    <section class="page-card">
      <FilterBar>
        <el-input
          v-model="keyword"
          placeholder="搜索球员姓名"
          :prefix-icon="Search"
          clearable
          style="width: 240px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" plain @click="search">查询</el-button>
        <span class="filter-bar__spacer" />
        <div class="position-chips">
          <span v-for="item in positionStats" :key="item.value" class="position-chip">
            {{ item.label }} <b class="num">{{ item.count }}</b>
          </span>
        </div>
      </FilterBar>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="球员" min-width="200">
          <template #default="{ row }">
            <div class="person-cell">
              <span class="person-cell__avatar">
                <SafeImage v-if="memberAvatar(row)" :src="memberAvatar(row)" alt="" />
                <template v-else>{{ row.athleteName.slice(0, 1) }}</template>
              </span>
              <div>
                <strong>{{ row.athleteName }}</strong>
                <small>{{ row.maskedIdNumber || '证件号未登记' }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="号码" width="80" align="center">
          <template #default="{ row }">
            <span class="jersey num">{{ row.jerseyNumber ?? '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="位置" width="100">
          <template #default="{ row }">{{ positionLabel(row.position) }}</template>
        </el-table-column>
        <el-table-column label="资格状态" width="120">
          <template #default="{ row }"><StatusTag :status="row.status" kind="member" /></template>
        </el-table-column>
        <el-table-column label="操作" width="250" align="right">
          <template #default="{ row }">
            <template v-if="row.status === 'CURRENT'">
              <el-upload
                v-if="canUploadPhoto"
                :show-file-list="false"
                :http-request="(options: UploadRequestOptions) => uploadPhoto(row, options)"
                accept=".jpg,.jpeg,.png"
              >
                <el-button link type="primary" :icon="Camera" :loading="uploadingPhotoId === row.id">
                  照片
                </el-button>
              </el-upload>
              <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button link type="danger" :icon="Delete" @click="removeMember(row)">移出</el-button>
            </template>
            <span v-else class="muted">已离队</span>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        @current-change="load"
        @size-change="search"
      />
    </section>

    <el-dialog v-model="dialogVisible" title="添加球员" width="600px">
      <el-form :model="memberForm" label-position="top">
        <el-form-item label="搜索球员">
          <div class="search-row">
            <el-input
              v-model="searchKeyword"
              placeholder="输入姓名或身份证后四位"
              :prefix-icon="Search"
              @keyup.enter="searchPeople"
            />
            <el-button :loading="searching" @click="searchPeople">搜索</el-button>
          </div>
          <p class="search-hint">
            仅检索本校、档案已审核通过且未在本队现役的运动员，支持姓名或身份证后四位，最多显示 20 条。
            搜不到时请先联系学校在「人员管理」建档并提交审核。
          </p>
        </el-form-item>

        <div v-if="candidates.length" class="candidate-list">
          <button
            v-for="person in candidates"
            :key="person.id"
            type="button"
            class="candidate"
            :class="{ 'is-selected': selected?.id === person.id }"
            @click="choose(person)"
          >
            <span class="candidate__avatar">{{ person.realName.slice(0, 1) }}</span>
            <span class="candidate__info">
              <strong>{{ person.realName }}</strong>
              <small>
                {{ person.maskedIdNumber || '证件号未登记' }} ·
                {{ person.schoolName || '学校未登记' }} ·
                {{ person.gender === 'FEMALE' ? '女' : '男' }}
              </small>
            </span>
            <span v-if="selected?.id === person.id" class="candidate__check">已选择</span>
          </button>
        </div>
        <el-empty v-else-if="searchKeyword && !searching" description="未找到匹配球员" :image-size="60" />

        <div class="form-grid">
          <el-form-item label="球衣号码">
            <el-input-number v-model="memberForm.jerseyNumber" :min="1" :max="99" style="width: 100%" />
          </el-form-item>
          <el-form-item label="场上位置">
            <el-select v-model="memberForm.position" style="width: 100%">
              <el-option
                v-for="position in positions"
                :key="position.value"
                :label="position.label"
                :value="position.value"
              />
            </el-select>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="adding" @click="addMember">加入球队</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑球员信息" width="560px">
      <el-form :model="editForm" label-position="top">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="仅修改球队成员关系"
          description="球衣号码、场上位置与效力期限由球队维护；姓名、证件号等主档信息请前往人员管理修改。"
        />
        <div class="edit-person">
          <strong>{{ editingMember?.athleteName || '球员' }}</strong>
          <small>{{ editingMember?.maskedIdNumber || '证件号未登记' }}</small>
        </div>
        <div class="form-grid">
          <el-form-item label="球衣号码">
            <el-input-number v-model="editForm.jerseyNumber" :min="0" :max="999" style="width: 100%" />
          </el-form-item>
          <el-form-item label="场上位置">
            <el-select v-model="editForm.position" clearable style="width: 100%">
              <el-option
                v-for="position in positions"
                :key="position.value"
                :label="position.label"
                :value="position.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="生效日期" required>
            <el-date-picker
              v-model="editForm.effectiveFrom"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="结束日期">
            <el-date-picker
              v-model="editForm.effectiveTo"
              type="date"
              value-format="YYYY-MM-DD"
              clearable
              placeholder="留空表示仍有效"
              style="width: 100%"
            />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingEdit" @click="saveMemberEdit">保存修改</el-button>
      </template>
    </el-dialog>

    <!-- 本校人员档案（学校端）：建档 → 提交复核 → 市州/省审核，打通报名终审的人员门槛 -->
    <el-dialog v-model="personDialogVisible" title="本校人员档案" width="860px">
      <FilterBar>
        <el-input
          v-model="personKeyword"
          placeholder="搜索姓名"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
          @keyup.enter="(personPage = 1), loadPersons()"
          @clear="(personPage = 1), loadPersons()"
        />
        <el-select
          v-model="personFilter"
          placeholder="审核状态"
          clearable
          style="width: 160px"
          @change="(personPage = 1), loadPersons()"
        >
          <el-option label="草稿" value="DRAFT" />
          <el-option label="待复核" value="PENDING" />
          <el-option label="已通过" value="APPROVED" />
          <el-option label="已驳回" value="REJECTED" />
        </el-select>
        <el-button type="primary" plain @click="(personPage = 1), loadPersons()">查询</el-button>
        <span class="filter-bar__spacer" />
        <el-button type="primary" :icon="Plus" @click="openCreate">新建人员</el-button>
      </FilterBar>

      <el-table v-loading="personLoading" :data="personRows" style="width: 100%">
        <el-table-column label="姓名" min-width="120">
          <template #default="{ row }">
            <strong>{{ row.realName }}</strong>
          </template>
        </el-table-column>
        <el-table-column label="学校" min-width="160">
          <template #default="{ row }">{{ row.schoolName || '未登记' }}</template>
        </el-table-column>
        <el-table-column label="身份" width="100">
          <template #default="{ row }">{{ (row.kinds || []).join(' / ') || '—' }}</template>
        </el-table-column>
        <el-table-column label="审核状态" width="110">
          <template #default="{ row }">
            <el-tag :type="personStatusType(row.reviewStatus)" size="small">
              {{ PERSON_STATUS_LABELS[row.reviewStatus || 'DRAFT'] || '草稿' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" align="right">
          <template #default="{ row }">
            <el-button
              v-if="['DRAFT', 'REJECTED'].includes(row.reviewStatus || 'DRAFT')"
              link
              type="primary"
              @click="submitPersonArchive(row)"
            >
              提交复核
            </el-button>
            <span v-if="row.reviewStatus === 'PENDING'" class="muted">待市州/省审核</span>
            <span v-if="row.reviewStatus === 'APPROVED'" class="muted">已生效</span>
          </template>
        </el-table-column>
      </el-table>

      <PaginationBar
        v-model:page="personPage"
        v-model:page-size="personPageSize"
        :total="personTotal"
        :page-sizes="[20, 50, 100]"
        @current-change="loadPersons"
        @size-change="(personPage = 1), loadPersons()"
      />
      <template #footer>
        <el-button @click="personDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="createVisible" title="新建人员档案" width="560px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="一人一身份，且身份证号 / 手机号必填"
        description="保存后档案为草稿，需在列表中「提交复核」，待市州/省级审核通过后方可加入球队与报名。"
      />
      <el-form :model="createForm" label-position="top">
        <div class="form-grid">
          <el-form-item label="姓名" required>
            <el-input v-model="createForm.realName" placeholder="真实姓名" maxlength="100" />
          </el-form-item>
          <el-form-item label="身份" required>
            <el-select v-model="createForm.kinds" disabled style="width: 100%">
              <el-option label="运动员" value="ATHLETE" />
            </el-select>
          </el-form-item>
          <el-form-item label="性别">
            <el-select v-model="createForm.gender" style="width: 100%">
              <el-option label="男" value="MALE" />
              <el-option label="女" value="FEMALE" />
              <el-option label="未说明" value="UNSPECIFIED" />
            </el-select>
          </el-form-item>
          <el-form-item label="出生日期" required>
            <el-date-picker
              v-model="createForm.birthDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="身份证号" required>
            <el-input v-model="createForm.idNumber" placeholder="18 位身份证号" maxlength="18" />
          </el-form-item>
          <el-form-item label="手机号" required>
            <el-input v-model="createForm.phone" placeholder="11 位手机号" maxlength="11" />
          </el-form-item>
          <el-form-item label="学历" required>
            <el-input v-model="createForm.education" placeholder="如：小学 / 初中 / 高中" maxlength="100" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="savePerson">保存</el-button>
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

.jersey {
  display: inline-grid;
  place-items: center;
  min-width: 26px;
  height: 26px;
  padding: 0 5px;
  border-radius: 7px;
  background: var(--brand-50);
  color: var(--brand-800);
  font-size: 11px;
  font-weight: 700;
}

.position-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.position-chip {
  padding: 4px 8px;
  border-radius: 3px;
  background: var(--paper);
  font-size: 10.5px;
  color: var(--ink-500);
}

.position-chip b {
  margin-left: 3px;
  color: var(--brand-700);
}

.search-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.search-row .el-input {
  flex: 1;
}

.search-hint {
  margin-top: 6px;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--ink-300);
}

.candidate-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.candidate {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.candidate.is-selected {
  border-color: var(--brand-700);
  background: var(--brand-50);
}

.candidate__avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--brand-100);
  color: var(--brand-800);
  font-size: 11px;
  font-weight: 700;
}

.candidate__info {
  flex: 1;
}

.candidate__info strong {
  display: block;
  font-size: 12px;
}

.candidate__info small {
  display: block;
  margin-top: 1px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.candidate__check {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--brand-700);
}

.edit-person {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 14px 0 4px;
}

.edit-person strong {
  font-size: 14px;
}

.edit-person small {
  font-size: 10px;
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
