<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Delete,
  Document,
  Link,
  Plus,
  Refresh,
  Timer,
  Trophy,
  VideoCamera,
} from '@element-plus/icons-vue'
import { matchApi } from '../../api'
import type { LiveLink, LivePost, Match, MatchDocument, MatchEvent, MatchResult } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatusTag from '../../components/common/StatusTag.vue'

const route = useRoute()
const router = useRouter()
const matchId = String(route.params.id)

const loading = ref(false)
const match = ref<Match | null>(null)
const events = ref<MatchEvent[]>([])
const livePosts = ref<LivePost[]>([])
const links = ref<LiveLink[]>([])
const documents = ref<MatchDocument[]>([])
const result = ref<MatchResult | null>(null)
const activeTab = ref('events')

const eventVisible = ref(false)
const savingEvent = ref(false)
const eventForm = reactive({
  eventType: 'GOAL',
  teamId: '',
  minute: 1,
  scorerName: '',
  ownGoal: false,
  athleteName: '',
  penaltyType: 'YELLOW_CARD',
  reason: '',
  outAthleteName: '',
  inAthleteName: '',
  note: '',
})

const postForm = reactive({ text: '', minute: 1, withImage: false })
const posting = ref(false)
const linkVisible = ref(false)
const linkForm = reactive({ title: '', url: '' })
const docVisible = ref(false)
const docForm = reactive({ documentType: 'SIGN_IN', fileName: '' })
const resultForm = reactive({ resultType: 'NORMAL', manualHomeScore: 0, manualAwayScore: 0, reason: '' })
const savingResult = ref(false)

const eventTypeLabel: Record<string, string> = { GOAL: '进球', PENALTY: '判罚', SUBSTITUTION: '换人' }
const penaltyLabel: Record<string, string> = {
  YELLOW_CARD: '黄牌',
  RED_CARD: '红牌',
  PENALTY_KICK: '点球',
  OTHER: '其他',
}
const documentLabel: Record<string, string> = {
  SIGN_IN: '签到表',
  SIGNED_RECORD: '签字记录',
  REFEREE_REPORT: '裁判报告',
}

const sortedEvents = computed(() =>
  [...events.value].sort((a, b) => (a.minute || 0) - (b.minute || 0) || (a.createdAt || '').localeCompare(b.createdAt || '')),
)

const canFinish = computed(() => match.value?.status !== 'FINISHED')

async function loadAll() {
  loading.value = true
  try {
    const [m, ev, posts, ls, docs, res] = await Promise.all([
      matchApi.get(matchId),
      matchApi.events(matchId, { page: 1, pageSize: 200 }),
      matchApi.livePosts(matchId, { page: 1, pageSize: 50 }),
      matchApi.liveLinks(matchId),
      matchApi.documents(matchId),
      matchApi.result(matchId),
    ])
    match.value = m
    events.value = ev.items
    livePosts.value = posts.items
    links.value = ls
    documents.value = docs
    result.value = res
    resultForm.resultType = res.resultType
    resultForm.manualHomeScore = res.homeScore
    resultForm.manualAwayScore = res.awayScore
    resultForm.reason = res.reason || ''
    if (!eventForm.teamId) eventForm.teamId = m.homeTeamId
  } catch {
    // 拦截器提示
  } finally {
    loading.value = false
  }
}

async function refreshMatch() {
  try {
    match.value = await matchApi.get(matchId)
    const ev = await matchApi.events(matchId, { page: 1, pageSize: 200 })
    events.value = ev.items
  } catch {
    // ignore
  }
}

function openEvent(type = 'GOAL', teamId?: string) {
  eventForm.eventType = type
  eventForm.teamId = teamId || match.value?.homeTeamId || ''
  eventForm.minute = 1
  eventForm.scorerName = ''
  eventForm.ownGoal = false
  eventForm.athleteName = ''
  eventForm.penaltyType = 'YELLOW_CARD'
  eventForm.reason = ''
  eventForm.outAthleteName = ''
  eventForm.inAthleteName = ''
  eventForm.note = ''
  eventVisible.value = true
}

async function saveEvent() {
  if (!eventForm.teamId) return ElMessage.warning('请选择所属球队')
  if (eventForm.eventType === 'GOAL' && !eventForm.scorerName.trim()) return ElMessage.warning('请填写进球球员')
  if (eventForm.eventType === 'PENALTY' && !eventForm.athleteName.trim()) return ElMessage.warning('请填写判罚球员')
  if (eventForm.eventType === 'SUBSTITUTION' && (!eventForm.outAthleteName.trim() || !eventForm.inAthleteName.trim())) {
    return ElMessage.warning('请填写换下与换上球员')
  }
  savingEvent.value = true
  try {
    await matchApi.addEvent(matchId, { ...eventForm })
    ElMessage.success('比赛事件已记录')
    eventVisible.value = false
    await refreshMatch()
  } catch {
    // 拦截器提示
  } finally {
    savingEvent.value = false
  }
}

async function removeEvent(event: MatchEvent) {
  try {
    await ElMessageBox.confirm('删除该事件后将同步回退比分，确认删除？', '删除事件', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await matchApi.removeEvent(matchId, event.id)
    ElMessage.success('事件已删除')
    await refreshMatch()
  } catch {
    // 取消
  }
}

async function submitPost() {
  if (!postForm.text.trim()) return ElMessage.warning('请输入直播文字')
  posting.value = true
  try {
    await matchApi.addLivePost(matchId, {
      text: postForm.text,
      minute: postForm.minute,
      imageFileIds: postForm.withImage ? [`file_live_${Date.now()}`] : [],
    })
    postForm.text = ''
    postForm.withImage = false
    const res = await matchApi.livePosts(matchId, { page: 1, pageSize: 50 })
    livePosts.value = res.items
    ElMessage.success('直播动态已发布')
  } catch {
    // 拦截器提示
  } finally {
    posting.value = false
  }
}

async function removePost(post: LivePost) {
  try {
    await ElMessageBox.confirm('确认删除该条图文直播？', '删除直播', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await matchApi.removeLivePost(matchId, post.id)
    livePosts.value = livePosts.value.filter((item) => item.id !== post.id)
    ElMessage.success('已删除')
  } catch {
    // 取消
  }
}

async function addLink() {
  if (!linkForm.title.trim() || !linkForm.url.trim()) return ElMessage.warning('请填写链接标题与地址')
  try {
    await matchApi.addLiveLink(matchId, { ...linkForm, enabled: true })
    linkForm.title = ''
    linkForm.url = ''
    linkVisible.value = false
    links.value = await matchApi.liveLinks(matchId)
    ElMessage.success('直播链接已添加')
  } catch {
    // 拦截器提示
  }
}

async function removeLink(link: LiveLink) {
  try {
    await matchApi.removeLiveLink(matchId, link.id)
    links.value = links.value.filter((item) => item.id !== link.id)
    ElMessage.success('链接已删除')
  } catch {
    // 拦截器提示
  }
}

async function addDocument() {
  if (!docForm.fileName.trim()) return ElMessage.warning('请填写文件名')
  try {
    await matchApi.addDocument(matchId, { ...docForm })
    docForm.fileName = ''
    docVisible.value = false
    documents.value = await matchApi.documents(matchId)
    ElMessage.success('比赛文件已登记')
  } catch {
    // 拦截器提示
  }
}

async function saveResult() {
  savingResult.value = true
  try {
    result.value = await matchApi.saveResult(matchId, {
      resultType: resultForm.resultType,
      manualHomeScore: resultForm.manualHomeScore,
      manualAwayScore: resultForm.manualAwayScore,
      reason: resultForm.reason,
    })
    ElMessage.success('赛果已保存')
    await refreshMatch()
  } catch {
    // 拦截器提示
  } finally {
    savingResult.value = false
  }
}

async function publishResult() {
  try {
    await ElMessageBox.confirm('发布赛果后比赛将标记为已结束，并同步至门户与射手榜。', '发布赛果', {
      confirmButtonText: '确认发布',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await matchApi.publishResult(matchId)
    ElMessage.success('赛果已发布')
    await loadAll()
  } catch {
    // 取消
  }
}

onMounted(loadAll)
</script>

<template>
  <div v-loading="loading" class="page console-page">
    <PageHeader
      title="比赛记录台"
      eyebrow="LIVE MATCH CONSOLE"
      description="记录员操作界面。事件提交后实时更新比分，发布的图文直播将同步展示在门户赛事详情页。"
      show-back
    >
      <template #actions>
        <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
        <el-button type="primary" plain :icon="VideoCamera" @click="router.push(`/matches/${matchId}`)">
          门户预览
        </el-button>
      </template>
    </PageHeader>

    <section v-if="match" class="scoreboard">
      <div class="scoreboard__meta">
        <span>{{ match.eventName }} · {{ match.groupName }} · {{ match.stage || '小组赛' }}</span>
        <span>{{ dayjs(match.kickoffAt).format('YYYY-MM-DD HH:mm') }} · {{ match.venue }}</span>
      </div>
      <div class="scoreboard__main">
        <div class="team team--home">
          <span class="team__badge">{{ match.homeTeamName.slice(0, 1) }}</span>
          <strong>{{ match.homeTeamName }}</strong>
        </div>
        <div class="score">
          <div class="score__nums num">
            <span>{{ match.homeScore ?? 0 }}</span>
            <i>:</i>
            <span>{{ match.awayScore ?? 0 }}</span>
          </div>
          <StatusTag :status="match.status" kind="match" />
        </div>
        <div class="team team--away">
          <span class="team__badge">{{ match.awayTeamName.slice(0, 1) }}</span>
          <strong>{{ match.awayTeamName }}</strong>
        </div>
      </div>
      <div class="scoreboard__quick">
        <el-button type="primary" :icon="Plus" @click="openEvent('GOAL', match.homeTeamId)">
          {{ match.homeTeamName }} 进球
        </el-button>
        <el-button :icon="Plus" @click="openEvent('GOAL', match.awayTeamId)">
          {{ match.awayTeamName }} 进球
        </el-button>
        <el-button plain @click="openEvent('PENALTY')">记录判罚</el-button>
        <el-button plain @click="openEvent('SUBSTITUTION')">记录换人</el-button>
      </div>
    </section>

    <section v-if="match" class="page-card console-card">
      <el-tabs v-model="activeTab">
        <el-tab-pane name="events">
          <template #label>
            <span class="tab-label"><el-icon><Trophy /></el-icon>比赛事件 <b>{{ events.length }}</b></span>
          </template>
          <div class="timeline">
            <div v-for="(event, index) in sortedEvents" :key="event.id" class="timeline-row">
              <div class="timeline-row__minute num">{{ event.minute }}′</div>
              <div class="timeline-row__line">
                <span class="timeline-row__dot" :class="`is-${event.eventType.toLowerCase()}`" />
              </div>
              <div class="timeline-row__body">
                <div class="timeline-row__head">
                  <strong>{{ eventTypeLabel[event.eventType] }}</strong>
                  <el-tag v-if="event.eventType === 'PENALTY'" size="small" effect="plain">
                    {{ penaltyLabel[event.penaltyType || 'OTHER'] }}
                  </el-tag>
                  <span class="muted">{{ event.teamName }}</span>
                  <span class="timeline-row__no">#{{ index + 1 }}</span>
                </div>
                <p v-if="event.eventType === 'GOAL'">
                  {{ event.scorerName || '未填写球员' }}
                  <span v-if="event.ownGoal" class="own-goal">（乌龙球）</span>
                </p>
                <p v-else-if="event.eventType === 'PENALTY'">
                  {{ event.athleteName || '—' }}<template v-if="event.reason"> · {{ event.reason }}</template>
                </p>
                <p v-else>
                  {{ event.outAthleteName || '—' }} <span class="muted">换下</span>
                  {{ event.inAthleteName || '—' }} <span class="muted">换上</span>
                </p>
                <small v-if="event.note">{{ event.note }}</small>
              </div>
              <el-button link type="danger" :icon="Delete" @click="removeEvent(event)">删除</el-button>
            </div>
            <el-empty v-if="!sortedEvents.length" description="尚未记录比赛事件" :image-size="80" />
          </div>
        </el-tab-pane>

        <el-tab-pane name="live">
          <template #label>
            <span class="tab-label"><el-icon><VideoCamera /></el-icon>图文直播 <b>{{ livePosts.length }}</b></span>
          </template>
          <div class="post-composer">
            <div class="post-composer__row">
              <el-input-number v-model="postForm.minute" :min="0" :max="130" controls-position="right" />
              <span class="muted">分钟</span>
              <el-checkbox v-model="postForm.withImage">附带现场图片</el-checkbox>
              <span class="post-composer__spacer" />
              <el-button type="primary" :loading="posting" @click="submitPost">发布直播</el-button>
            </div>
            <el-input
              v-model="postForm.text"
              type="textarea"
              :rows="3"
              maxlength="300"
              show-word-limit
              placeholder="例如：主队 10 号球员禁区外远射破门，比分改写为 1:0。"
            />
          </div>
          <div class="live-list">
            <div v-for="post in livePosts" :key="post.id" class="live-item">
              <span class="live-item__minute num">{{ post.minute ? `${post.minute}′` : '—' }}</span>
              <div class="live-item__body">
                <p>{{ post.text }}</p>
                <div v-if="post.imageUrls?.length" class="live-item__images">
                  <img v-for="url in post.imageUrls" :key="url" :src="url" alt="直播图片" />
                </div>
                <small>{{ dayjs(post.createdAt).format('HH:mm:ss') }}</small>
              </div>
              <el-button link type="danger" :icon="Delete" @click="removePost(post)" />
            </div>
            <el-empty v-if="!livePosts.length" description="暂无图文直播" :image-size="80" />
          </div>
        </el-tab-pane>

        <el-tab-pane name="links">
          <template #label>
            <span class="tab-label"><el-icon><Link /></el-icon>直播链接 <b>{{ links.length }}</b></span>
          </template>
          <div class="panel-toolbar">
            <p class="muted">配置视频直播、数据直播等外链，启用后展示在门户比赛详情页。</p>
            <el-button type="primary" plain :icon="Plus" @click="linkVisible = true">添加链接</el-button>
          </div>
          <el-table :data="links" style="width: 100%">
            <el-table-column prop="title" label="链接标题" min-width="180" />
            <el-table-column prop="url" label="链接地址" min-width="300" show-overflow-tooltip />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="plain">
                  {{ row.enabled ? '已启用' : '已停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="right">
              <template #default="{ row }">
                <el-button link type="danger" :icon="Delete" @click="removeLink(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!links.length" description="暂无直播链接" :image-size="80" />
        </el-tab-pane>

        <el-tab-pane name="documents">
          <template #label>
            <span class="tab-label"><el-icon><Document /></el-icon>比赛文件 <b>{{ documents.length }}</b></span>
          </template>
          <div class="panel-toolbar">
            <p class="muted">登记签到表、签字记录与裁判报告，正式文件请扫描后上传至文件服务。</p>
            <el-button type="primary" plain :icon="Plus" @click="docVisible = true">登记文件</el-button>
          </div>
          <el-table :data="documents" style="width: 100%">
            <el-table-column label="文件类型" width="140">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ documentLabel[row.documentType] }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="fileName" label="文件名" min-width="240" />
            <el-table-column label="登记时间" width="180">
              <template #default="{ row }">{{ dayjs(row.createdAt).format('YYYY-MM-DD HH:mm') }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" align="right">
              <template #default>
                <el-button link type="primary">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!documents.length" description="暂无比赛文件" :image-size="80" />
        </el-tab-pane>

        <el-tab-pane name="result">
          <template #label>
            <span class="tab-label"><el-icon><CircleCheck /></el-icon>赛果确认</span>
          </template>
          <div class="result-grid">
            <div class="result-form">
              <el-form label-position="top">
                <el-form-item label="赛果类型">
                  <el-radio-group v-model="resultForm.resultType">
                    <el-radio-button value="NORMAL">常规赛果</el-radio-button>
                    <el-radio-button value="FORFEIT">弃权</el-radio-button>
                    <el-radio-button value="ADMIN_CORRECTION">人工更正</el-radio-button>
                  </el-radio-group>
                </el-form-item>
                <div class="result-score">
                  <el-form-item :label="match.homeTeamName">
                    <el-input-number v-model="resultForm.manualHomeScore" :min="0" :max="99" />
                  </el-form-item>
                  <span class="result-score__sep">:</span>
                  <el-form-item :label="match.awayTeamName">
                    <el-input-number v-model="resultForm.manualAwayScore" :min="0" :max="99" />
                  </el-form-item>
                </div>
                <el-form-item label="更正原因 / 说明">
                  <el-input
                    v-model="resultForm.reason"
                    type="textarea"
                    :rows="3"
                    placeholder="常规赛果可留空；弃权或人工更正请说明原因"
                  />
                </el-form-item>
                <div class="result-actions">
                  <el-button :loading="savingResult" @click="saveResult">保存赛果</el-button>
                  <el-button v-if="!result?.published && canFinish" type="primary" @click="publishResult">
                    发布赛果并结束比赛
                  </el-button>
                  <el-tag v-if="result?.published" type="success" effect="plain" size="large">
                    赛果已发布 · 第 {{ result.sourceScoreRevision }} 版
                  </el-tag>
                </div>
              </el-form>
            </div>
            <aside class="result-side">
              <div class="result-side__icon"><el-icon :size="22"><Timer /></el-icon></div>
              <h3>发布前请确认</h3>
              <ul>
                <li>比赛事件与比分一致，无遗漏的进球或乌龙球。</li>
                <li>弃权、罢赛等特殊情况需附裁判报告。</li>
                <li>发布后赛果进入门户与射手榜统计。</li>
                <li>如需更正，请使用人工更正并保留原因。</li>
              </ul>
            </aside>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog v-model="eventVisible" title="记录比赛事件" width="560px">
      <el-form :model="eventForm" label-position="top">
        <el-form-item label="事件类型">
          <el-radio-group v-model="eventForm.eventType">
            <el-radio-button value="GOAL">进球</el-radio-button>
            <el-radio-button value="PENALTY">判罚</el-radio-button>
            <el-radio-button value="SUBSTITUTION">换人</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="所属球队">
          <el-select v-model="eventForm.teamId" style="width: 100%">
            <el-option :label="match?.homeTeamName || '主队'" :value="match?.homeTeamId || ''" />
            <el-option :label="match?.awayTeamName || '客队'" :value="match?.awayTeamId || ''" />
          </el-select>
        </el-form-item>
        <el-form-item label="比赛分钟">
          <el-input-number v-model="eventForm.minute" :min="0" :max="130" controls-position="right" />
        </el-form-item>

        <template v-if="eventForm.eventType === 'GOAL'">
          <el-form-item label="进球球员">
            <el-input v-model="eventForm.scorerName" placeholder="输入球员姓名" />
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="eventForm.ownGoal">该进球为乌龙球</el-checkbox>
          </el-form-item>
        </template>

        <template v-else-if="eventForm.eventType === 'PENALTY'">
          <el-form-item label="判罚类型">
            <el-select v-model="eventForm.penaltyType" style="width: 100%">
              <el-option label="黄牌" value="YELLOW_CARD" />
              <el-option label="红牌" value="RED_CARD" />
              <el-option label="点球" value="PENALTY_KICK" />
              <el-option label="其他" value="OTHER" />
            </el-select>
          </el-form-item>
          <el-form-item label="球员">
            <el-input v-model="eventForm.athleteName" placeholder="输入球员姓名" />
          </el-form-item>
          <el-form-item label="判罚原因">
            <el-input v-model="eventForm.reason" placeholder="如：战术犯规" />
          </el-form-item>
        </template>

        <template v-else>
          <div class="form-grid">
            <el-form-item label="换下球员">
              <el-input v-model="eventForm.outAthleteName" placeholder="球员姓名" />
            </el-form-item>
            <el-form-item label="换上球员">
              <el-input v-model="eventForm.inAthleteName" placeholder="球员姓名" />
            </el-form-item>
          </div>
        </template>

        <el-form-item label="备注">
          <el-input v-model="eventForm.note" placeholder="选填，如助攻球员、伤停补时等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="eventVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingEvent" @click="saveEvent">提交事件</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="linkVisible" title="添加直播链接" width="480px">
      <el-form :model="linkForm" label-position="top">
        <el-form-item label="链接标题">
          <el-input v-model="linkForm.title" placeholder="如：视频直播（咪咕体育）" />
        </el-form-item>
        <el-form-item label="链接地址">
          <el-input v-model="linkForm.url" placeholder="https://" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="linkVisible = false">取消</el-button>
        <el-button type="primary" @click="addLink">添加</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="docVisible" title="登记比赛文件" width="480px">
      <el-form :model="docForm" label-position="top">
        <el-form-item label="文件类型">
          <el-select v-model="docForm.documentType" style="width: 100%">
            <el-option label="签到表" value="SIGN_IN" />
            <el-option label="签字记录" value="SIGNED_RECORD" />
            <el-option label="裁判报告" value="REFEREE_REPORT" />
          </el-select>
        </el-form-item>
        <el-form-item label="文件名">
          <el-input v-model="docForm.fileName" placeholder="如：2026-10-18_成都七中_vs_石室中学_签到表.pdf" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="docVisible = false">取消</el-button>
        <el-button type="primary" @click="addDocument">登记</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.console-page {
  max-width: 1180px;
}

.scoreboard {
  padding: 22px 28px 20px;
  border-radius: 18px;
  background:
    radial-gradient(circle at 85% 0%, rgba(200, 241, 105, 0.18), transparent 45%),
    linear-gradient(135deg, #075c40, #053c2b);
  color: #fff;
}

.scoreboard__meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.48);
}

.scoreboard__main {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 24px;
  padding: 18px 0 20px;
}

.team {
  display: flex;
  align-items: center;
  gap: 12px;
}

.team--away {
  flex-direction: row-reverse;
  text-align: right;
}

.team__badge {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--lime);
  font-size: 17px;
  font-weight: 700;
}

.team strong {
  font-size: 16px;
}

.score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.score__nums {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 40px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.score__nums i {
  font-style: normal;
  font-size: 26px;
  color: rgba(255, 255, 255, 0.4);
}

.scoreboard__quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.09);
}

.scoreboard__quick :deep(.el-button) {
  --el-button-bg-color: rgba(255, 255, 255, 0.08);
  --el-button-border-color: rgba(255, 255, 255, 0.16);
  --el-button-text-color: #fff;
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.14);
  --el-button-hover-border-color: rgba(255, 255, 255, 0.3);
  --el-button-hover-text-color: #fff;
}

.scoreboard__quick :deep(.el-button--primary) {
  --el-button-bg-color: var(--lime);
  --el-button-border-color: var(--lime);
  --el-button-text-color: #1c2a10;
  --el-button-hover-bg-color: #d9f78d;
  --el-button-hover-border-color: #d9f78d;
  --el-button-hover-text-color: #1c2a10;
}

.console-card {
  padding-top: 12px;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-label b {
  padding: 0 6px;
  border-radius: 99px;
  background: var(--brand-50);
  color: var(--brand-700);
  font-size: 9px;
  font-weight: 700;
}

.timeline {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}

.timeline-row {
  display: grid;
  grid-template-columns: 54px 24px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: flex-start;
  padding: 9px 0;
}

.timeline-row__minute {
  padding-top: 1px;
  font-size: 14px;
  font-weight: 700;
  text-align: right;
  color: var(--brand-700);
}

.timeline-row__line {
  position: relative;
  display: flex;
  justify-content: center;
  align-self: stretch;
}

.timeline-row__line::after {
  content: '';
  position: absolute;
  top: 14px;
  bottom: -18px;
  width: 1px;
  background: var(--line);
}

.timeline-row:last-child .timeline-row__line::after {
  display: none;
}

.timeline-row__dot {
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--brand-500);
  box-shadow: 0 0 0 3px var(--brand-50);
  z-index: 1;
}

.timeline-row__dot.is-penalty {
  background: #e2a23f;
  box-shadow: 0 0 0 3px #fdf3e2;
}

.timeline-row__dot.is-substitution {
  background: #6b8cd1;
  box-shadow: 0 0 0 3px #eaf0fb;
}

.timeline-row__body p {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
}

.timeline-row__body small {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  color: var(--ink-300);
}

.timeline-row__head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.timeline-row__no {
  margin-left: auto;
  font-size: 9px;
  color: var(--ink-300);
}

.own-goal {
  color: #c07b3a;
}

.post-composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  background: var(--paper);
  margin-bottom: 16px;
}

.post-composer__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.post-composer__spacer {
  flex: 1;
}

.live-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.live-item {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 11px;
}

.live-item__minute {
  width: 42px;
  flex-shrink: 0;
  padding-top: 1px;
  font-size: 13px;
  font-weight: 700;
  color: var(--brand-700);
}

.live-item__body {
  flex: 1;
}

.live-item__body p {
  font-size: 12.5px;
  line-height: 1.75;
}

.live-item__body small {
  display: block;
  margin-top: 5px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.live-item__images {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.live-item__images img {
  width: 120px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
}

.panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 0 14px;
}

.panel-toolbar p {
  font-size: 11px;
}

.result-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 26px;
  padding: 8px 0;
}

.result-score {
  display: flex;
  align-items: flex-end;
  gap: 14px;
}

.result-score__sep {
  padding-bottom: 12px;
  font-size: 22px;
  color: var(--ink-300);
}

.result-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.result-side {
  align-self: start;
  padding: 20px;
  border-radius: 14px;
  background: var(--paper);
  border: 1px solid var(--line);
}

.result-side__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--brand-50);
  color: var(--brand-700);
}

.result-side h3 {
  margin-top: 12px;
  font-size: 14px;
}

.result-side ul {
  margin: 10px 0 0;
  padding-left: 16px;
}

.result-side li {
  font-size: 10.5px;
  line-height: 1.85;
  color: var(--ink-500);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
}

@media (max-width: 900px) {
  .result-grid {
    grid-template-columns: 1fr;
  }

  .scoreboard__meta {
    flex-direction: column;
    gap: 4px;
  }

  .scoreboard__main {
    gap: 10px;
  }

  .team {
    flex-direction: column;
    gap: 7px;
    text-align: center;
  }

  .team--away {
    flex-direction: column;
  }

  .team strong {
    font-size: 12.5px;
  }

  .score__nums {
    font-size: 30px;
  }
}

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .post-composer__row {
    flex-wrap: wrap;
  }
}
</style>
