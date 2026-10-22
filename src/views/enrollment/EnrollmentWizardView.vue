<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormRules } from 'element-plus'
import { ArrowRight, Check, InfoFilled } from '@element-plus/icons-vue'
import { enrollmentApi, eventApi, meApi } from '../../api'
import type { Event, EventGroup, Team } from '../../api/types'
import { subjectTypeLabel } from '../../config/labels'
import { useAuthStore } from '../../stores/auth'
import { canEnroll } from '../../utils/roles'
import PageHeader from '../../components/common/PageHeader.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const step = ref(0)
const loading = ref(false)
const submitting = ref(false)
const events = ref<Event[]>([])
const groups = ref<EventGroup[]>([])
const teams = ref<Team[]>([])

const form = reactive({
  eventId: '',
  groupId: '',
  teamId: '',
  contactName: auth.displayName,
  contactPhone: '',
  remarks: '',
})

const rules: FormRules = {
  eventId: [{ required: true, message: '请选择赛事', trigger: 'change' }],
  groupId: [{ required: true, message: '请选择组别', trigger: 'change' }],
  teamId: [{ required: true, message: '请选择参赛球队', trigger: 'change' }],
  contactName: [{ required: true, message: '请填写领队/联系人', trigger: 'blur' }],
  contactPhone: [
    { required: true, message: '请填写联系电话', trigger: 'blur' },
    { pattern: /^1\d{10}$/, message: '请输入 11 位手机号', trigger: 'blur' },
  ],
}

const selectedEvent = computed(() => events.value.find((e) => e.id === form.eventId))
const selectedGroup = computed(() => groups.value.find((g) => g.id === form.groupId))
const selectedTeam = computed(() => teams.value.find((t) => t.id === form.teamId))

const subjectType = 'SCHOOL_TEAM' as const
const routeSteps = ['学校填报', '市州初审', '省级终审']
const steps = ['选择赛事', '填写信息', '确认创建']

/** 仅保留符合组别学段与性别的本校球队（含各校区）。 */
const availableTeams = computed(() => {
  const group = selectedGroup.value
  if (!group) return teams.value
  return teams.value.filter((team) => {
    if (team.status === 'PENDING') return false
    if (team.category && team.category !== group.category) return false
    if (group.gender !== 'MIXED' && team.gender && team.gender !== group.gender) return false
    return true
  })
})

function groupFullReason(group: EventGroup): string {
  const quota = group.quota ?? 0
  if (quota > 0 && (group.totalUsed ?? 0) >= quota) return '全省名额已满'
  const schoolQuota = group.schoolQuota ?? 1
  if (schoolQuota > 0 && (group.schoolUsed ?? 0) >= schoolQuota) return '本校名额已用完'
  return ''
}

function selectGroup(group: EventGroup) {
  const reason = groupFullReason(group)
  if (reason) return ElMessage.warning(`「${group.name}」${reason}`)
  form.groupId = group.id
}

function campusText(team?: Team): string {
  return team?.campusName || '本部'
}

async function loadBase() {
  loading.value = true
  try {
    const [eventRes, schoolTeams] = await Promise.all([
      eventApi.available({ page: 1, pageSize: 50, registrationOpen: 'true' }),
      meApi.teams(),
    ])
    events.value = eventRes.items
    teams.value = schoolTeams
    const presetTeamId = String(route.query.teamId || '')
    if (presetTeamId && teams.value.some((team) => team.id === presetTeamId)) {
      form.teamId = presetTeamId
    }
    if (events.value.length === 1) {
      form.eventId = events.value[0].id
      await loadGroups()
    }
    if (!form.teamId && availableTeams.value.length === 1) {
      form.teamId = availableTeams.value[0].id
    }
  } catch {
    // 保持空态
  } finally {
    loading.value = false
  }
}

async function loadGroups() {
  groups.value = []
  form.groupId = ''
  if (!form.eventId) return
  try {
    groups.value = await eventApi.availableGroups(form.eventId)
    const selectable = groups.value.find((group) => !groupFullReason(group))
    if (groups.value.length === 1 && selectable) form.groupId = selectable.id
  } catch {
    groups.value = []
  }
}

function next() {
  if (step.value === 0) {
    if (!form.eventId) return ElMessage.warning('请选择赛事')
    if (!form.groupId) return ElMessage.warning('请选择参赛组别')
    if (!availableTeams.value.some((team) => team.id === form.teamId)) {
      return ElMessage.warning('请选择与组别学段、性别一致的本校球队')
    }
    step.value = 1
    return
  }
  if (step.value === 1) {
    if (!form.contactName.trim()) return ElMessage.warning('请填写领队/联系人')
    if (!/^1\d{10}$/.test(form.contactPhone)) return ElMessage.warning('请填写正确的 11 位手机号')
    step.value = 2
  }
}

async function create() {
  submitting.value = true
  try {
    const enrollment = await enrollmentApi.create({
      eventId: form.eventId,
      groupId: form.groupId,
      teamId: form.teamId,
      subjectType,
      contactName: form.contactName,
      contactPhone: form.contactPhone,
      remarks: form.remarks,
    })
    ElMessage.success('报名单已创建，请继续完善球员名单与材料')
    router.replace(`/console/enrollments/${enrollment.id}`)
  } catch {
    // 错误提示由拦截器处理
  } finally {
    submitting.value = false
  }
}

watch(
  () => form.eventId,
  () => {
    loadGroups()
  },
)

watch(availableTeams, (items) => {
  if (form.teamId && !items.some((team) => team.id === form.teamId)) form.teamId = ''
  if (!form.teamId && items.length === 1) form.teamId = items[0].id
})

onMounted(() => {
  if (!canEnroll(auth.roles)) {
    ElMessage.warning('报名由学校端统一提交，请使用学校账号')
    router.replace('/console/enrollments')
    return
  }
  loadBase()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="新建报名"
      description="以学校为报送主体，选择赛事、组别与本校参赛球队（含分校区）。分校球队与本校共享同一个学校名额。"
      show-back
    />

    <section class="page-card wizard" v-loading="loading">
      <div class="steps">
        <div
          v-for="(label, index) in steps"
          :key="label"
          class="step"
          :class="{ 'is-active': step === index, 'is-done': step > index }"
        >
          <span class="step__dot">
            <el-icon v-if="step > index"><Check /></el-icon>
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span class="step__label">{{ label }}</span>
          <span v-if="index < steps.length - 1" class="step__line" />
        </div>
      </div>

      <div class="wizard-body">
        <div class="wizard-main">
          <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large">
            <div v-show="step === 0" class="step-panel">
              <h2>选择参赛赛事</h2>
              <p class="step-desc">仅展示当前处于报名开放期的赛事。草稿即占用学校名额，提交前可在报名列表撤回或删除。</p>

              <el-form-item label="赛事" prop="eventId">
                <el-select v-model="form.eventId" placeholder="请选择赛事" style="width: 100%">
                  <el-option v-for="event in events" :key="event.id" :label="event.name" :value="event.id">
                    <div class="option-row">
                      <span>{{ event.name }}</span>
                      <small>{{ event.season }}</small>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>

              <el-form-item label="组别" prop="groupId">
                <div v-if="groups.length" class="group-grid">
                  <button
                    v-for="group in groups"
                    :key="group.id"
                    type="button"
                    class="group-card"
                    :class="{ 'is-selected': form.groupId === group.id, 'is-disabled': Boolean(groupFullReason(group)) }"
                    :disabled="Boolean(groupFullReason(group))"
                    @click="selectGroup(group)"
                  >
                    <strong>{{ group.name }}</strong>
                    <span>{{ group.gender === 'MALE' ? '男子' : group.gender === 'FEMALE' ? '女子' : '混合' }} · 每队最多 {{ group.maxPlayers }} 人</span>
                    <small>年龄 {{ group.minAge }}-{{ group.maxAge }} 岁</small>
                    <small>
                      每校名额 {{ (group.schoolQuota ?? 1) === 0 ? '不限' : (group.schoolQuota ?? 1) }} 队 · 本校已用 {{ group.schoolUsed ?? 0 }} · 全省已报 {{ group.totalUsed ?? 0 }}/{{ group.quota || '不限' }}
                    </small>
                    <em v-if="groupFullReason(group)">{{ groupFullReason(group) }}</em>
                  </button>
                </div>
                <el-empty v-else description="请先选择赛事以加载组别" :image-size="60" />
              </el-form-item>

              <el-form-item label="参赛球队（本校及校区）" prop="teamId">
                <el-select v-model="form.teamId" placeholder="请选择参赛球队" filterable style="width: 100%">
                  <el-option
                    v-for="team in availableTeams"
                    :key="team.id"
                    :label="`${team.name} · ${campusText(team)}`"
                    :value="team.id"
                  >
                    <div class="option-row">
                      <span>{{ team.name }}</span>
                      <small>{{ team.schoolName }} · {{ campusText(team) }}</small>
                    </div>
                  </el-option>
                </el-select>
                <div v-if="selectedGroup && !availableTeams.length" class="team-hint">
                  本校暂无符合「{{ selectedGroup.name }}」学段与性别的球队，请先到
                  <router-link to="/console/school/teams">本校球队</router-link>
                  新建或调整校区球队。
                </div>
              </el-form-item>
            </div>

            <div v-show="step === 1" class="step-panel">
              <h2>报名联系信息</h2>
              <p class="step-desc">联系方式仅用于赛事通知，不会在门户公开。</p>

              <div class="form-grid">
                <el-form-item label="领队 / 联系人" prop="contactName">
                  <el-input v-model="form.contactName" placeholder="请输入联系人姓名" />
                </el-form-item>
                <el-form-item label="联系电话" prop="contactPhone">
                  <el-input v-model="form.contactPhone" placeholder="11 位手机号" maxlength="11" />
                </el-form-item>
              </div>

              <el-form-item label="备注说明">
                <el-input
                  v-model="form.remarks"
                  type="textarea"
                  :rows="4"
                  maxlength="300"
                  show-word-limit
                  placeholder="可填写球队特殊情况、到场时间等说明（选填）"
                />
              </el-form-item>
            </div>

            <div v-show="step === 2" class="step-panel">
              <h2>确认报名信息</h2>
              <p class="step-desc">创建后仍可完善球员名单与材料；正式提交前不会进入审核。</p>

              <div class="summary-card">
                <dl>
                  <div><dt>赛事</dt><dd>{{ selectedEvent?.name || '—' }}</dd></div>
                  <div><dt>组别</dt><dd>{{ selectedGroup?.name || '—' }}</dd></div>
                  <div><dt>参赛球队</dt><dd>{{ selectedTeam?.name || '—' }}</dd></div>
                  <div><dt>参赛学校 / 校区</dt><dd>{{ selectedTeam?.schoolName || '—' }} · {{ campusText(selectedTeam) }}</dd></div>
                  <div><dt>报送主体</dt><dd>{{ subjectTypeLabel(subjectType) }}</dd></div>
                  <div><dt>联系人</dt><dd>{{ form.contactName }}</dd></div>
                  <div><dt>联系电话</dt><dd>{{ form.contactPhone }}</dd></div>
                  <div class="full"><dt>备注</dt><dd>{{ form.remarks || '无' }}</dd></div>
                </dl>
              </div>

              <el-alert type="info" :closable="false" show-icon :title="`审核流程：${routeSteps.join(' → ')}`" />
            </div>
          </el-form>
        </div>

        <aside class="wizard-side">
          <div class="side-card">
            <el-icon class="side-card__icon" :size="20"><InfoFilled /></el-icon>
            <h3>报名须知</h3>
            <ul>
              <li>学校是唯一报送主体，报名由学校管理员统一提交。</li>
              <li>每支球队每个组别仅可提交一份有效报名，草稿也占用名额。</li>
              <li>分校/校区球队与本校共享同一个学校名额，不单独计算。</li>
              <li>球员名单需满足组别人数下限，并通过资格预检。</li>
              <li>提交后生成报名快照，撤回后方可修改。</li>
              <li>所需材料：盖章报名表、学籍证明等，以组别配置为准。</li>
            </ul>
          </div>
          <div class="side-card side-card--tip">
            <span class="side-card__eyebrow">提示</span>
            <p>建议先准备好球队球员名单 Excel 与证件照，创建后可在详情页批量导入。</p>
          </div>
        </aside>
      </div>

      <footer class="wizard-foot">
        <el-button v-if="step > 0" size="large" @click="step -= 1">上一步</el-button>
        <span class="wizard-foot__spacer" />
        <el-button v-if="step < 2" type="primary" size="large" @click="next">
          下一步
          <el-icon><ArrowRight /></el-icon>
        </el-button>
        <el-button v-else type="primary" size="large" :loading="submitting" @click="create">
          创建报名单
        </el-button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.wizard {
  padding: 26px 30px;
}

.steps {
  display: flex;
  align-items: center;
  gap: 0;
  padding-bottom: 22px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--line);
}

.step {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--ink-300);
}

.step__dot {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fff;
  font-size: 11px;
  font-weight: 700;
}

.step__label {
  font-size: 12.5px;
  white-space: nowrap;
}

.step__line {
  width: 64px;
  height: 1px;
  margin: 0 14px;
  background: var(--line);
}

.step.is-active {
  color: var(--brand-800);
}

.step.is-active .step__dot {
  border-color: var(--brand-700);
  background: var(--brand-700);
  color: #fff;
}

.step.is-done {
  color: var(--brand-700);
}

.step.is-done .step__dot {
  border-color: var(--brand-100);
  background: var(--brand-100);
  color: var(--brand-800);
}

.step.is-done .step__line {
  background: var(--brand-500);
}

.wizard-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 30px;
}

.step-panel {
  max-width: 720px;
}

.step-panel h2 {
  font-size: 19px;
}

.step-desc {
  margin: 7px 0 20px;
  font-size: 11.5px;
  color: var(--ink-500);
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.option-row small {
  font-size: 10px;
  color: var(--ink-300);
}

.group-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.group-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: 0.15s;
}

.group-card:hover {
  border-color: var(--brand-500);
}

.group-card.is-selected {
  border-color: var(--brand-700);
  background: var(--brand-50);
  box-shadow: 0 0 0 2px var(--brand-100);
}

.group-card.is-disabled {
  cursor: not-allowed;
  opacity: 0.62;
  background: var(--paper);
}

.group-card.is-disabled:hover {
  border-color: var(--line);
}

.group-card em {
  margin-top: 2px;
  font-size: 9.5px;
  font-style: normal;
  color: var(--danger, #c45656);
}

.team-hint {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-500);
}

.team-hint a {
  color: var(--brand-700);
  text-decoration: underline;
}

.group-card strong {
  font-size: 13px;
}

.group-card span {
  font-size: 10.5px;
  color: var(--ink-500);
}

.group-card small {
  font-size: 9.5px;
  color: var(--ink-300);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.summary-card {
  padding: 20px;
  border-radius: var(--radius-md);
  background: var(--paper);
  margin-bottom: 16px;
}

.summary-card dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 22px;
  margin: 0;
}

.summary-card dl > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.summary-card .full {
  grid-column: 1 / -1;
}

.summary-card dt {
  font-size: 10px;
  color: var(--ink-300);
}

.summary-card dd {
  margin: 0;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ink-900);
}

.wizard-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.side-card {
  padding: 18px;
  border-radius: var(--radius-md);
  background: var(--paper);
  border: 1px solid var(--line);
}

.side-card__icon {
  color: var(--brand-700);
}

.side-card h3 {
  margin-top: 8px;
  font-size: 14px;
}

.side-card ul {
  margin: 10px 0 0;
  padding-left: 16px;
}

.side-card li {
  font-size: 10.5px;
  line-height: 1.85;
  color: var(--ink-500);
}

.side-card--tip {
  background: var(--lime-soft);
  border-color: #dcefb9;
}

.side-card__eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  color: #5b7310;
}

.side-card--tip p {
  margin-top: 6px;
  font-size: 10.5px;
  line-height: 1.8;
  color: #4c5f2a;
}

.wizard-foot {
  display: flex;
  align-items: center;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}

.wizard-foot__spacer {
  flex: 1;
}

@media (max-width: 900px) {
  .wizard-body {
    grid-template-columns: 1fr;
  }

  .wizard-side {
    display: none;
  }

  .step__line {
    width: 24px;
    margin: 0 8px;
  }

  .step__label {
    display: none;
  }

  .group-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
