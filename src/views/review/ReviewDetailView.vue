<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Close, Download } from '@element-plus/icons-vue'
import { enrollmentApi, fileApi } from '../../api'
import type { EnrollmentDetail } from '../../api'
import type { EnrollmentAttachment, ReviewRecord } from '../../api/types'
import { useAuthStore } from '../../stores/auth'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const detail = ref<EnrollmentDetail | null>(null)
const reviews = ref<ReviewRecord[]>([])
const loading = ref(false)
const reviewing = ref(false)

const enrollmentId = computed(() => String(route.params.id || ''))
const isCity = computed(() => auth.roles.includes('CITY'))
const isAdmin = computed(() => auth.roles.includes('ADMIN'))

const currentStageLabel = computed(() =>
  detail.value?.status === 'PENDING_CITY_REVIEW' ? '市州初审' : '省级终审',
)

const canActOnDetail = computed(() => {
  if (!detail.value) return false
  if (isAdmin.value) {
    return detail.value.status === 'PENDING_CITY_REVIEW' || detail.value.status === 'PENDING_PROVINCE_REVIEW'
  }
  if (isCity.value) return detail.value.status === 'PENDING_CITY_REVIEW'
  return detail.value.status === 'PENDING_PROVINCE_REVIEW'
})

const metaLine = computed(() => {
  const current = detail.value
  if (!current) return '正在加载报名信息…'
  return [
    current.schoolName || current.teamName,
    current.campusName || '本部',
    current.eventName,
    current.groupName,
    current.cityName,
  ]
    .filter(Boolean)
    .join(' · ')
})

async function load() {
  if (!enrollmentId.value) return
  loading.value = true
  detail.value = null
  reviews.value = []
  try {
    detail.value = await enrollmentApi.get(enrollmentId.value)
    reviews.value = await enrollmentApi.reviews(enrollmentId.value)
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

/** 审核结束或点返回时回到列表；直接打开链接时退回审核工作台。 */
function goBack() {
  if (router.options.history.state.back) {
    router.back()
  } else {
    router.push({ name: 'review' })
  }
}

async function approve() {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(
      detail.value.status === 'PENDING_CITY_REVIEW'
        ? '确认通过市州初审？报名将进入省级终审环节。'
        : '确认通过省级终审？通过后报名状态将变为「已通过」。',
      '审核通过',
      { confirmButtonText: '确认通过', cancelButtonText: '再核对一下', type: 'success' },
    )
    reviewing.value = true
    await enrollmentApi.review(detail.value.id, { decision: 'APPROVE' })
    ElMessage.success('审核已通过')
    goBack()
  } catch {
    // 取消或异常
  } finally {
    reviewing.value = false
  }
}

async function reject() {
  if (!detail.value) return
  try {
    const { value } = await ElMessageBox.prompt(
      '请填写具体驳回原因，报送学校将收到通知并可修改后重新提交。',
      '驳回报名',
      {
        confirmButtonText: '确认驳回',
        cancelButtonText: '取消',
        inputPlaceholder: '例如：盖章报名表缺少学校公章',
        inputValidator: (val) => (val && val.trim().length >= 6 ? true : '请至少填写 6 个字符'),
      },
    )
    reviewing.value = true
    await enrollmentApi.review(detail.value.id, { decision: 'REJECT', reason: value })
    ElMessage.success('已驳回并通知报送学校')
    goBack()
  } catch {
    // 取消
  } finally {
    reviewing.value = false
  }
}

async function downloadAttachment(attachment: EnrollmentAttachment) {
  try {
    const downloaded = await fileApi.download(attachment.fileId, attachment.fileName)
    ElMessage.success(downloaded ? '文件已开始下载' : '演示环境已模拟下载，接入后端后将下载真实文件')
  } catch {
    // 拦截器提示
  }
}

async function downloadPlayers() {
  if (!detail.value) return
  try {
    const downloaded = await enrollmentApi.downloadPlayers(detail.value.id)
    ElMessage.success(
      downloaded ? '球员信息表已开始下载' : '演示环境已模拟下载，接入后端后将下载真实 Word 文件',
    )
  } catch {
    // 拦截器提示
  }
}

onMounted(load)
watch(enrollmentId, load)
</script>

<template>
  <div class="page review-page">
    <PageHeader
      :title="detail?.teamName || '报名审核'"
      :description="detail ? `${currentStageLabel} · ${metaLine}` : metaLine"
      show-back
    >
      <template #actions>
        <StatusTag v-if="detail" :status="detail.status" kind="enrollment" size="default" />
      </template>
    </PageHeader>

    <div v-loading="loading" class="review-body">
      <template v-if="detail">
        <section class="page-card">
          <h2 class="card-title">报名信息</h2>
          <div class="info-grid">
            <div><span>报名阶段</span><strong>{{ currentStageLabel }}</strong></div>
            <div><span>参赛学校</span><strong>{{ detail.schoolName || '—' }}</strong></div>
            <div><span>校区 / 分校</span><strong>{{ detail.campusName || '本部' }}</strong></div>
            <div><span>所属市州</span><strong>{{ detail.cityName || '—' }}</strong></div>
            <div><span>赛事 / 组别</span><strong>{{ detail.eventName }} · {{ detail.groupName }}</strong></div>
            <div><span>联系人</span><strong>{{ detail.contactName }}</strong></div>
            <div><span>联系电话</span><strong>{{ detail.maskedContactPhone || '—' }}</strong></div>
            <div><span>球员人数</span><strong class="num">{{ detail.playerCount }}</strong></div>
            <div><span>提交次数</span><strong class="num">{{ detail.submissionNo }}</strong></div>
            <div><span>最后更新</span><strong>{{ dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm') }}</strong></div>
          </div>
        </section>

        <section class="page-card">
          <div class="card-head">
            <h2 class="card-title">球员名单 <small>{{ (detail.players || []).length }} 人</small></h2>
            <el-button size="small" type="primary" plain :icon="Download" @click="downloadPlayers">
              导出球员信息表
            </el-button>
          </div>
          <el-table :data="detail.players || []" size="small">
            <el-table-column prop="athleteName" label="姓名" width="120" />
            <el-table-column prop="maskedIdNumber" label="身份证号" min-width="190" />
            <el-table-column prop="jerseyNumber" label="号码" width="80" align="center" />
            <el-table-column prop="position" label="位置" width="90" />
            <el-table-column prop="schoolName" label="学校" min-width="180" />
          </el-table>
          <el-empty v-if="!(detail.players || []).length" description="名单为空" :image-size="70" />
        </section>

        <div class="review-columns">
          <section class="page-card">
            <h2 class="card-title">报名材料</h2>
            <div class="material-list">
              <div v-for="att in detail.attachments || []" :key="att.id" class="material">
                <span class="material__type">{{ att.materialType === 'STAMPED_FORM' ? '盖章报名表' : '学籍证明' }}</span>
                <strong>{{ att.fileName }}</strong>
                <el-button size="small" text type="primary" @click="downloadAttachment(att)">下载</el-button>
              </div>
              <el-empty v-if="!(detail.attachments || []).length" description="未上传材料" :image-size="60" />
            </div>
          </section>

          <section class="page-card">
            <h2 class="card-title">审核记录</h2>
            <div class="history">
              <div v-for="record in reviews" :key="record.id" class="history-row">
                <span class="history-row__dot" :class="`is-${(record.action || '').toLowerCase()}`" />
                <div>
                  <strong>{{ record.action === 'APPROVE' ? '审核通过' : record.action === 'REJECT' ? '审核驳回' : record.action === 'WITHDRAW' ? '撤回' : '提交' }}</strong>
                  <p v-if="record.reason">{{ record.reason }}</p>
                  <small>{{ record.operatorName }} · {{ dayjs(record.createdAt).format('YYYY-MM-DD HH:mm') }}</small>
                </div>
              </div>
              <el-empty v-if="!reviews.length" description="暂无审核记录" :image-size="60" />
            </div>
          </section>
        </div>

        <footer v-if="canActOnDetail" class="review-bar">
          <div class="review-bar__hint">
            <strong>{{ currentStageLabel }}</strong>
            <span>请核对球员资格、材料完整性与盖章文件后再提交审核结果。</span>
          </div>
          <div class="review-bar__actions">
            <el-button :icon="Close" type="danger" plain :loading="reviewing" @click="reject">驳回</el-button>
            <el-button :icon="Check" type="success" :loading="reviewing" @click="approve">
              {{ detail.status === 'PENDING_CITY_REVIEW' ? '通过并提交终审' : '终审通过' }}
            </el-button>
          </div>
        </footer>
      </template>

      <section v-else-if="!loading" class="page-card empty-box">
        <el-empty description="报名单不存在或无权查看">
          <el-button @click="goBack">返回审核工作台</el-button>
        </el-empty>
      </section>
    </div>
  </div>
</template>

<style scoped>
.review-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 240px;
}

.review-page {
  padding-bottom: 4px;
}

.card-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-900);
}

.card-title small {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 400;
  color: var(--ink-300);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.page-card .card-title + .info-grid,
.page-card .card-title + .material-list,
.page-card .card-title + .history {
  margin-top: 14px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.info-grid div {
  padding: 11px 13px;
  border-radius: 9px;
  background: var(--paper);
}

.info-grid span {
  display: block;
  font-size: 10.5px;
  color: var(--ink-300);
}

.info-grid strong {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-900);
  line-height: 1.5;
}

.review-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 18px;
}

.material-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.material {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
}

.material__type {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9.5px;
}

.material strong {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-row {
  display: flex;
  gap: 10px;
}

.history-row__dot {
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--brand-500);
  flex-shrink: 0;
}

.history-row__dot.is-reject {
  background: #d86969;
}

.history-row strong {
  font-size: 12px;
}

.history-row p {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-500);
}

.history-row small {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--ink-300);
}

.review-bar {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 18px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  box-shadow: 0 -6px 18px rgba(24, 53, 43, 0.08);
}

.review-bar__hint {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 11.5px;
  color: var(--ink-500);
}

.review-bar__hint strong {
  color: var(--brand-800);
  font-size: 12.5px;
}

.review-bar__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

@media (max-width: 1180px) {
  .info-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .info-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .review-columns {
    grid-template-columns: 1fr;
  }

  .review-bar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
