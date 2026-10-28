<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CircleCheck, Collection, Lock, Refresh } from '@element-plus/icons-vue'
import { meApi } from '../../api'
import type { Person } from '../../api/types'
import { COACH_CATEGORY_LABELS } from '../../config/labels'
import { useAuthStore } from '../../stores/auth'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const confirming = ref(false)
const person = ref<Person | null>(null)
const profileMatch = ref<Record<string, unknown> | null>(null)

const form = reactive({
  realName: '',
  gender: 'MALE',
  birthDate: '',
  education: '',
  coachCategory: '',
})

const isCoach = computed(() => person.value?.kinds.includes('COACH') ?? false)
const kindLabel = computed(() => {
  const kinds = person.value?.kinds || []
  return kinds.map((kind) => (kind === 'ATHLETE' ? '运动员' : '教练员')).join(' / ') || '未设置'
})

/** 只有 DRAFT 才需要本人确认；PENDING 已提交、APPROVED/REJECTED 由管理员处理。 */
const canConfirm = computed(() => person.value?.reviewStatus === 'DRAFT')
const confirmLabel = computed(() => {
  switch (person.value?.reviewStatus) {
    case 'DRAFT':
      return '确认档案无误'
    case 'PENDING':
      return '复核中'
    case 'APPROVED':
      return '档案已复核'
    case 'REJECTED':
      return '已被驳回'
    default:
      return '暂不可确认'
  }
})
const matchHint = computed(() => {
  switch (person.value?.reviewStatus) {
    case 'APPROVED':
      return '档案已通过管理员复核，无需再次确认。'
    case 'PENDING':
      return '档案已提交复核，请等待管理员处理。'
    case 'REJECTED':
      return '档案已被驳回，请联系管理员处理。'
    default:
      return profileMatch.value?.result === 'NO_MATCH'
        ? '当前账号尚未匹配到人员档案，请联系管理员。'
        : '请核对姓名、学校与证件信息，确认后提交管理员复核。'
  }
})
const matchLabel = computed(() => {
  if (profileMatch.value?.result === 'MATCHED_TO_SELF') return '比对一致'
  if (profileMatch.value?.result === 'REVIEW_REQUIRED') return '复核中'
  if (profileMatch.value?.result === 'NO_MATCH') return '未匹配'
  return '未比对'
})
const matchTagType = computed<'success' | 'warning' | 'info'>(() => {
  if (profileMatch.value?.result === 'MATCHED_TO_SELF') return 'success'
  if (profileMatch.value?.result === 'REVIEW_REQUIRED') return 'warning'
  return 'info'
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
  }
  // 比对结果是独立展示项，接口异常不应把已加载的档案一并清空。
  try {
    profileMatch.value = await meApi.profileMatch()
  } catch {
    profileMatch.value = null
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
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

async function confirmProfile() {
  if (!person.value) return ElMessage.warning('档案尚未加载，请刷新后重试')
  if (!canConfirm.value) return ElMessage.info('当前状态无需再次确认')
  confirming.value = true
  try {
    await meApi.confirmProfile(person.value.version)
    ElMessage.success('档案已确认，等待管理员复核')
    await load()
  } catch {
    // 拦截器提示
  } finally {
    confirming.value = false
  }
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
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存资料</el-button>
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
              <StatusTag v-if="person?.reviewStatus" :status="person.reviewStatus" kind="review" />
            </div>
            <p>{{ kindLabel }} · {{ person?.schoolName || '学校未登记' }}</p>
            <small>档案编号 {{ person?.id || '—' }}</small>
          </div>
        </div>

        <div class="section-title">基础信息</div>
        <el-form :model="form" label-position="top" class="profile-form">
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
              <el-input v-model="form.education" placeholder="如：本科" maxlength="50" />
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
        </el-form>
      </section>

      <aside class="profile-side">
        <div class="page-card side-card">
          <div class="side-card__head">
            <el-icon class="side-card__icon" :size="19"><CircleCheck /></el-icon>
            <h3>档案确认</h3>
          </div>
          <p class="side-card__text">{{ matchHint }}</p>
          <div class="verify-row">
            <span>比对结果</span>
            <el-tag :type="matchTagType" size="small" effect="plain">
              {{ matchLabel }}
            </el-tag>
          </div>
          <el-button
            type="primary"
            plain
            style="width: 100%; margin-top: 14px"
            :loading="confirming"
            :disabled="!canConfirm"
            @click="confirmProfile"
          >
            {{ confirmLabel }}
          </el-button>
        </div>

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

.profile-form {
  margin-top: 6px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.readonly-field {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--paper);
  color: var(--ink-500);
  font-size: 12px;
}

.readonly-field.is-muted {
  color: var(--ink-300);
}

.readonly-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 6px;
}

.readonly-grid > div {
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--paper);
}

.readonly-grid span {
  display: block;
  font-size: 9.5px;
  color: var(--ink-300);
}

.readonly-grid strong {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.03em;
}

.form-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  font-size: 10px;
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
