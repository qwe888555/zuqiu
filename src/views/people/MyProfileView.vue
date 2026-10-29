<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Collection, Lock, Refresh } from '@element-plus/icons-vue'
import { meApi } from '../../api'
import type { Person } from '../../api/types'
import { COACH_CATEGORY_LABELS, EDUCATION_LABELS, educationLabel, coachCategoryLabel } from '../../config/labels'
import { useAuthStore } from '../../stores/auth'
import PageHeader from '../../components/common/PageHeader.vue'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const editing = ref(false)
const person = ref<Person | null>(null)

const form = reactive({
  realName: '',
  gender: 'MALE',
  birthDate: '',
  education: '',
  coachCategory: '',
})

const GENDER_LABELS: Record<string, string> = {
  MALE: '男',
  FEMALE: '女',
  UNSPECIFIED: '未说明',
}

const genderLabel = computed(() => (form.gender ? GENDER_LABELS[form.gender] || form.gender : '未填写'))
const educationDisplay = computed(() => educationLabel(form.education))
const coachCategoryDisplay = computed(() => coachCategoryLabel(form.coachCategory))

const isCoach = computed(() => person.value?.kinds.includes('COACH') ?? false)
const kindLabel = computed(() => {
  const kinds = person.value?.kinds || []
  return kinds.map((kind) => (kind === 'ATHLETE' ? '运动员' : '教练员')).join(' / ') || '未设置'
})

async function load() {
  loading.value = true
  try {
    person.value = await meApi.profile()
    Object.assign(form, {
      realName: person.value.realName,
      gender: person.value.gender || 'MALE',
      birthDate: person.value.birthDate || '',
      education: person.value.education || '',
      coachCategory: person.value.coachCategory || '',
    })
  } catch {
    person.value = null
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!person.value) return ElMessage.warning('档案尚未加载，请刷新后重试')
  if (!form.realName.trim()) return ElMessage.warning('请填写真实姓名')
  saving.value = true
  try {
    // 学校由 schoolOrgId 派生，本人不可改；学历/教练员类别落扩展档案 ext_json。
    person.value = await meApi.updateProfile({
      version: person.value.version,
      realName: form.realName,
      gender: form.gender as Person['gender'],
      birthDate: form.birthDate || undefined,
      schoolName: person.value.schoolName || undefined,
      education: form.education || undefined,
      coachCategory: form.coachCategory || undefined,
    })
    Object.assign(form, {
      realName: person.value.realName,
      gender: person.value.gender || 'MALE',
      birthDate: person.value.birthDate || '',
      education: person.value.education || '',
      coachCategory: person.value.coachCategory || '',
    })
    ElMessage.success('档案已更新')
    await auth.fetchMe()
    editing.value = false
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

function startEdit() {
  editing.value = true
}

function cancelEdit() {
  if (!person.value) {
    editing.value = false
    return
  }
  Object.assign(form, {
    realName: person.value.realName,
    gender: person.value.gender || 'MALE',
    birthDate: person.value.birthDate || '',
    education: person.value.education || '',
    coachCategory: person.value.coachCategory || '',
  })
  editing.value = false
}

onMounted(load)
</script>

<template>
  <div class="page">
    <PageHeader
      title="个人资料"
      description="维护真实姓名、性别、出生日期、学历与教练员类别。学校与证件信息由管理员档案维护。"
    >
      <template #actions>
        <template v-if="editing">
          <el-button @click="cancelEdit">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </template>
        <template v-else>
          <el-button :icon="Refresh" @click="load">刷新</el-button>
          <el-button type="primary" @click="startEdit">编辑资料</el-button>
        </template>
      </template>
    </PageHeader>

    <div v-loading="loading" class="profile-grid">
      <section class="page-card profile-main">
        <div class="profile-hero">
          <span class="profile-hero__avatar">
            <img v-if="person?.avatarUrl" :src="person.avatarUrl" alt="" />
            <template v-else>{{ (person?.realName || auth.displayName).slice(0, 1) }}</template>
          </span>
          <div class="profile-hero__info">
            <div class="profile-hero__title">
              <h2>{{ person?.realName || auth.displayName }}</h2>
            </div>
            <p>{{ kindLabel }} · {{ person?.schoolName || '学校未登记' }}</p>
            <small>档案编号 {{ person?.id || '—' }}</small>
          </div>
        </div>

        <div class="section-title">基础信息</div>

        <!-- 查看模式 -->
        <div v-if="!editing" class="info-grid">
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
            <span class="info-item__label">学历</span>
            <span class="info-item__value">{{ educationDisplay }}</span>
          </div>
          <div v-if="isCoach" class="info-item">
            <span class="info-item__label">教练员类别</span>
            <span class="info-item__value">{{ coachCategoryDisplay }}</span>
          </div>
        </div>

        <!-- 编辑模式 -->
        <el-form v-else :model="form" label-position="top" class="profile-form">
          <div class="form-grid">
            <el-form-item label="真实姓名" required>
              <el-input v-model="form.realName" placeholder="与身份证保持一致" />
            </el-form-item>
            <el-form-item label="性别">
              <el-select v-model="form.gender" style="width: 100%">
                <el-option label="男" value="MALE" />
                <el-option label="女" value="FEMALE" />
                <el-option label="未说明" value="UNSPECIFIED" />
              </el-select>
            </el-form-item>
            <el-form-item label="出生日期">
              <el-date-picker
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
              <el-select v-model="form.education" style="width: 100%" clearable placeholder="选择学历">
                <el-option
                  v-for="(label, value) in EDUCATION_LABELS"
                  :key="value"
                  :label="label"
                  :value="value"
                />
              </el-select>
            </el-form-item>
            <el-form-item v-if="isCoach" label="教练员类别">
              <el-select v-model="form.coachCategory" style="width: 100%" clearable placeholder="选择类别">
                <el-option
                  v-for="(label, value) in COACH_CATEGORY_LABELS"
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
            <span>身份证号</span>
            <strong>{{ person?.maskedIdNumber || '未登记' }}</strong>
          </div>
          <div>
            <span>手机号</span>
            <strong>{{ person?.maskedPhone || '未登记' }}</strong>
          </div>
          <div>
            <span>学籍号</span>
            <strong>{{ person?.maskedStudentNumber || '未登记' }}</strong>
          </div>
        </div>
        <p class="form-tip">
          <el-icon><Lock /></el-icon>
          学校 / 单位由管理员档案维护；身份证号与手机号需提交证明材料后由管理员变更。
        </p>
      </section>

      <aside class="profile-side">
        <div class="page-card side-card">
          <div class="side-card__head">
            <el-icon class="side-card__icon" :size="19"><Collection /></el-icon>
            <h3>履历材料</h3>
          </div>
          <p class="side-card__text">补充学籍、获奖、参赛经历等材料，有助于遴选与公示。</p>
          <el-button style="width: 100%; margin-top: 14px" @click="router.push('/console/materials')">
            管理我的材料
          </el-button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
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
