<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Collection, Lock, Refresh } from '@element-plus/icons-vue'
import { meApi } from '../../api'
import type { Person } from '../../api/types'
import { EDUCATION_LABELS, educationLabel } from '../../config/labels'
import { useAuthStore } from '../../stores/auth'
import { httpStatusOf } from '../../utils/httpError'
import PageHeader from '../../components/common/PageHeader.vue'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const editing = ref(false)
const person = ref<Person | null>(null)
/** unbound=账号未绑定人员档案（404）；error=其他读取失败。两种状态都不允许编辑。 */
const profileState = ref<'loading' | 'ready' | 'unbound' | 'error'>('loading')

const form = reactive({
  realName: '',
  gender: '',
  birthDate: '',
  education: '',
})

const GENDER_LABELS: Record<string, string> = {
  MALE: '男',
  FEMALE: '女',
  UNSPECIFIED: '未说明',
}

const genderLabel = computed(() => (form.gender ? GENDER_LABELS[form.gender] || form.gender : '未填写'))
const educationDisplay = computed(() => educationLabel(form.education))

const isCoach = computed(() => person.value?.kinds.includes('COACH') ?? false)
const kindLabel = computed(() => {
  const kinds = person.value?.kinds || []
  return kinds.map((kind) => (kind === 'ATHLETE' ? '运动员' : '教练员')).join(' / ') || '—'
})
const canEdit = computed(() => !!person.value && profileState.value === 'ready')

type ProfileField = 'realName' | 'gender' | 'birthDate' | 'education'

/**
 * 人员档案里已登记的值属于账号“自带”信息（由管理员建档/导入/种子数据写入），
 * 个人端只读；只有未登记字段允许本人补填，避免修改关键字段触发重新审核。
 */
function isRegistered(field: ProfileField): boolean {
  return !!String(person.value?.[field] ?? '').trim()
}

const editableFields = computed<ProfileField[]>(() =>
  (['realName', 'gender', 'birthDate', 'education'] as ProfileField[]).filter(
    (field) => !isRegistered(field),
  ),
)
const hasEditableFields = computed(() => editableFields.value.length > 0)

function fillForm(source: Person) {
  Object.assign(form, {
    realName: source.realName || '',
    gender: source.gender || '',
    birthDate: source.birthDate || '',
    education: source.education || '',
  })
}

async function load() {
  loading.value = true
  profileState.value = 'loading'
  try {
    // 404 表示账号未绑定人员档案，属正常业务状态，不弹全局错误。
    const result = await meApi.profile({ silentError: true })
    person.value = result
    profileState.value = 'ready'
    fillForm(result)
  } catch (error) {
    person.value = null
    profileState.value = httpStatusOf(error) === 404 ? 'unbound' : 'error'
    Object.assign(form, { realName: '', gender: '', birthDate: '', education: '' })
    editing.value = false
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!person.value) return ElMessage.warning('账号尚未绑定人员档案，无法修改个人资料')
  if (!hasEditableFields.value) return ElMessage.warning('档案信息均已登记，个人端只读，如需修改请联系管理员')
  if (!isRegistered('realName') && !form.realName.trim()) return ElMessage.warning('请填写真实姓名')
  const current = person.value
  saving.value = true
  try {
    // 后端 MyProfileUpdate 为严格模式：schoolName 属派生字段，提交会被 400 拒绝；
    // coachCategory 虽被接收但不持久化、不回显，故不提交，避免“保存成功但值消失”。
    person.value = await meApi.updateProfile({
      version: current.version,
      // 已登记字段始终回传档案原值，避免只读字段被表单状态意外覆盖。
      realName: isRegistered('realName') ? current.realName : form.realName,
      // 未选择时省略，避免把“未登记”静默改成默认值。
      gender: isRegistered('gender') ? current.gender : ((form.gender || undefined) as Person['gender']),
      birthDate: isRegistered('birthDate') ? current.birthDate : form.birthDate || undefined,
      // 后端 education 未传＝保留原值，传空串才会清空；已登记时回传原值，未登记时提交表单值。
      education: isRegistered('education') ? current.education || '' : form.education.trim(),
    })
    fillForm(person.value)
    profileState.value = 'ready'
    ElMessage.success('档案已更新')
    await auth.fetchMe()
    editing.value = false
  } catch (error) {
    // 版本冲突说明档案已在其他端更新，拉取最新数据后由本人确认再保存。
    if (httpStatusOf(error) === 409) {
      ElMessage.warning('档案已被其他端更新，已重新加载最新数据')
      await load()
    }
  } finally {
    saving.value = false
  }
}

function startEdit() {
  if (!canEdit.value) {
    ElMessage.warning(
      profileState.value === 'unbound'
        ? '当前账号未绑定人员档案，请先联系管理员绑定'
        : '个人资料尚未加载成功，请刷新后重试',
    )
    return
  }
  if (!hasEditableFields.value) {
    ElMessage.warning('档案信息均已登记，个人端只读，如需修改请联系管理员')
    return
  }
  editing.value = true
}

function cancelEdit() {
  if (!person.value) {
    editing.value = false
    return
  }
  fillForm(person.value)
  editing.value = false
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="个人资料"
      description="姓名、性别、出生日期与学历来自人员档案；已登记信息只读，仅未登记字段可由本人补填。"
    >
      <template #actions>
        <template v-if="editing">
          <el-button @click="cancelEdit">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </template>
        <template v-else>
          <el-button :icon="Refresh" @click="load">刷新</el-button>
          <el-button v-if="canEdit && hasEditableFields" type="primary" @click="startEdit">编辑资料</el-button>
        </template>
      </template>
    </PageHeader>

    <el-alert
      v-if="profileState === 'unbound'"
      class="state-alert"
      type="warning"
      :closable="false"
      show-icon
      title="当前账号未绑定人员档案"
      description="个人资料来自人员档案；请联系管理员在「参赛账号」中完成绑定，绑定前不开放资料修改。"
    />
    <el-alert
      v-else-if="profileState === 'error'"
      class="state-alert"
      type="error"
      :closable="false"
      show-icon
      title="个人资料读取失败"
      description="请稍后刷新重试；读取成功前暂不开放资料修改。"
    />

    <div v-loading="loading" class="profile-grid">
      <section class="page-card profile-main">
        <div class="profile-hero">
          <span class="profile-hero__avatar">
            <img v-if="person?.avatarUrl" :src="person.avatarUrl" alt="" />
            <template v-else>{{ (person?.realName || '未绑定').slice(0, 1) }}</template>
          </span>
          <div class="profile-hero__info">
            <div class="profile-hero__title">
              <h2>{{ person?.realName || '未绑定人员档案' }}</h2>
            </div>
            <p>{{ kindLabel }} · {{ person?.schoolName || '学校未登记' }}</p>
            <small>登录账号 {{ auth.user?.username || '—' }} · 档案编号 {{ person?.id || '—' }}</small>
          </div>
        </div>

        <div class="section-title">基础信息</div>

        <el-empty
          v-if="!person"
          :description="profileState === 'unbound' ? '账号未绑定人员档案，暂无可显示的身份信息' : '个人资料读取失败，暂无可显示的身份信息'"
          :image-size="70"
        />

        <!-- 查看模式 -->
        <div v-else-if="!editing" class="info-grid">
          <div class="info-item">
            <span class="info-item__label">真实姓名</span>
            <span class="info-item__value">{{ form.realName || '未填写' }}</span>
          </div>
          <div class="info-item">
            <span class="info-item__label">性别</span>
            <span class="info-item__value">{{ genderLabel }}</span>
          </div>
          <div class="info-item">
            <span class="info-item__label">出生日期</span>
            <span class="info-item__value">{{ form.birthDate || '未填写' }}</span>
          </div>
          <div class="info-item">
            <span class="info-item__label">学校 / 单位</span>
            <span class="info-item__value">{{ person?.schoolName || '未登记' }}</span>
          </div>
          <div class="info-item">
            <span class="info-item__label">人员类型</span>
            <span class="info-item__value">{{ kindLabel }}</span>
          </div>
          <div class="info-item">
            <span class="info-item__label">学历</span>
            <span class="info-item__value">{{ educationDisplay }}</span>
          </div>
          <div v-if="isCoach" class="info-item">
            <span class="info-item__label">教练员类别</span>
            <span class="info-item__value muted">由管理员维护</span>
          </div>
        </div>

        <!-- 编辑模式 -->
        <el-form v-else-if="canEdit" :model="form" label-position="top" class="profile-form">
          <p class="form-tip form-tip--top">
            <el-icon><Lock /></el-icon>
            灰色字段为已登记信息，不可修改。
          </p>
          <div class="form-grid">
            <el-form-item label="真实姓名" :required="!isRegistered('realName')">
              <div v-if="isRegistered('realName')" class="readonly-field">
                {{ person?.realName || '未登记' }}
              </div>
              <el-input v-else v-model="form.realName" placeholder="与身份证保持一致" />
            </el-form-item>
            <el-form-item label="性别">
              <div v-if="isRegistered('gender')" class="readonly-field">{{ genderLabel }}</div>
              <el-select v-else v-model="form.gender" clearable placeholder="未填写" style="width: 100%">
                <el-option label="男" value="MALE" />
                <el-option label="女" value="FEMALE" />
                <el-option label="未说明" value="UNSPECIFIED" />
              </el-select>
            </el-form-item>
            <el-form-item label="出生日期">
              <div v-if="isRegistered('birthDate')" class="readonly-field">
                {{ person?.birthDate || '未登记' }}
              </div>
              <el-date-picker
                v-else
                v-model="form.birthDate"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="选择日期"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="学校 / 单位">
              <div class="readonly-field">{{ person?.schoolName || '未登记' }}</div>
            </el-form-item>
            <el-form-item label="学历">
              <div v-if="isRegistered('education')" class="readonly-field">{{ educationDisplay }}</div>
              <el-select v-else v-model="form.education" style="width: 100%" clearable placeholder="选择学历">
                <el-option
                  v-for="(label, value) in EDUCATION_LABELS"
                  :key="value"
                  :label="label"
                  :value="value"
                />
              </el-select>
            </el-form-item>
          </div>
        </el-form>

        <div class="readonly-grid">
          <div>
            <span>登录账号</span>
            <strong>{{ auth.user?.username || '—' }}</strong>
          </div>
          <div>
            <span>账号名称</span>
            <strong>{{ auth.displayName }}</strong>
          </div>
          <template v-if="person">
            <div v-if="person.maskedIdNumber">
              <span>身份证号</span>
              <strong>{{ person.maskedIdNumber }}</strong>
            </div>
            <div v-if="person.maskedStudentNumber">
              <span>学籍号</span>
              <strong>{{ person.maskedStudentNumber }}</strong>
            </div>
            <div v-if="person.maskedPhone">
              <span>手机号</span>
              <strong>{{ person.maskedPhone }}</strong>
            </div>
          </template>
        </div>
      </section>

      <aside class="profile-side">
        <div class="page-card side-card">
          <div class="side-card__head">
            <el-icon class="side-card__icon" :size="19"><Collection /></el-icon>
            <h3>履历材料</h3>
          </div>
          <p class="side-card__text">
            履历材料由管理员维护，个人端仅可查看归档状态。
          </p>
          <el-button style="width: 100%; margin-top: 14px" @click="router.push('/console/materials')">
            查看履历材料
          </el-button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.state-alert {
  margin-bottom: 16px;
}

.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 18px;
}

.profile-main {
  padding: 26px 28px;
}

.profile-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line);
}

.profile-hero__avatar {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--brand-700);
  color: #fff;
  font-size: 27px;
  font-weight: 700;
}

.profile-hero__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-hero__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.profile-hero__title h2 {
  font-size: 22px;
}

.profile-hero__info p {
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--ink-500);
}

.profile-hero__info small {
  display: block;
  margin-top: 4px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.section-title {
  margin: 8px 0 20px;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink-700);
}

.profile-form {
  margin-top: 0;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px 24px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-item__label {
  font-size: 12px;
  color: var(--ink-300);
}

.info-item__value {
  font-size: 14px;
  color: var(--ink-700);
  font-weight: 500;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px 24px;
}

.form-grid :deep(.el-form-item) {
  margin-bottom: 0;
}

.readonly-field {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
  color: var(--ink-500);
  font-size: 13px;
}

.readonly-field.is-muted {
  color: var(--ink-300);
}

.readonly-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 24px;
}

.readonly-grid > div {
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--paper);
}

.readonly-grid span {
  display: block;
  font-size: 11px;
  color: var(--ink-300);
}

.readonly-grid strong {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.03em;
}

.form-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 18px;
  font-size: 11px;
  color: var(--ink-300);
}

.form-tip--top {
  align-items: flex-start;
  margin: 0 0 18px;
}

.profile-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.side-card {
  padding: 20px;
}

.side-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.side-card__icon {
  color: var(--brand-700);
}

.side-card__head h3 {
  font-size: 14px;
}

.side-card__text {
  margin-top: 10px;
  font-size: 10.5px;
  line-height: 1.8;
  color: var(--ink-500);
}

.verify-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--paper);
  font-size: 11px;
  color: var(--ink-500);
}

@media (max-width: 980px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .form-grid,
  .readonly-grid {
    grid-template-columns: 1fr;
  }
}
</style>
