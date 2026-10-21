<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type UploadRequestOptions } from 'element-plus'
import { Edit, Location, Plus, Refresh, UploadFilled, User, UserFilled } from '@element-plus/icons-vue'
import { fileApi, teamApi } from '../../api'
import type { GroupCategory, Team } from '../../api/types'
import { useTeamScope } from '../../composables/useTeamScope'
import { usePermission } from '../../composables/usePermission'
import { CATEGORY_GROUP_LABELS, categoryLabel } from '../../config/labels'
import PageHeader from '../../components/common/PageHeader.vue'

const router = useRouter()
const { can } = usePermission()
const { auth, teams, teamId, loading, loadTeams } = useTeamScope()
const team = ref<Team | null>(null)
const detailLoading = ref(false)
const editing = ref(false)
const saving = ref(false)
const createVisible = ref(false)
const creating = ref(false)
const removing = ref(false)
const createForm = reactive({
  name: '',
  category: 'MIDDLE' as GroupCategory,
  intro: '',
})

const categoryOptions = Object.entries(CATEGORY_GROUP_LABELS).map(([value, label]) => ({ value, label }))

const form = reactive({
  name: '',
  shortName: '',
  schoolName: '',
  cityName: '',
  coachName: '',
  intro: '',
})

const media = reactive({
  flagFileId: '',
  emblemFileId: '',
  groupPhotoFileId: '',
  flagUrl: '',
  emblemUrl: '',
  groupPhotoUrl: '',
})

const uploadingMedia = ref('')

const canEdit = computed(() => can('team.manage'))

async function loadTeam() {
  if (!teamId.value) {
    team.value = null
    return
  }
  detailLoading.value = true
  try {
    team.value = await teamApi.get(teamId.value)
    Object.assign(form, {
      name: team.value.name,
      shortName: team.value.shortName || '',
      schoolName: team.value.schoolName || '',
      cityName: team.value.cityName || '',
      coachName: team.value.coachName || '',
      intro: team.value.intro || '',
    })
    Object.assign(media, {
      flagFileId: '',
      emblemFileId: '',
      groupPhotoFileId: '',
      flagUrl: team.value.flagUrl || '',
      emblemUrl: team.value.emblemUrl || '',
      groupPhotoUrl: team.value.groupPhotoUrl || '',
    })
    editing.value = false
  } catch {
    team.value = null
  } finally {
    detailLoading.value = false
  }
}

async function changeTeam() {
  await loadTeam()
}

function startEdit() {
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  if (team.value) {
    Object.assign(form, {
      name: team.value.name,
      shortName: team.value.shortName || '',
      schoolName: team.value.schoolName || '',
      cityName: team.value.cityName || '',
      coachName: team.value.coachName || '',
      intro: team.value.intro || '',
    })
    Object.assign(media, {
      flagFileId: '',
      emblemFileId: '',
      groupPhotoFileId: '',
      flagUrl: team.value.flagUrl || '',
      emblemUrl: team.value.emblemUrl || '',
      groupPhotoUrl: team.value.groupPhotoUrl || '',
    })
  }
}

function uploadFlag(options: UploadRequestOptions) {
  return uploadMedia('flag', options)
}

function uploadEmblem(options: UploadRequestOptions) {
  return uploadMedia('emblem', options)
}

function uploadGroupPhoto(options: UploadRequestOptions) {
  return uploadMedia('groupPhoto', options)
}

async function uploadMedia(
  kind: 'flag' | 'emblem' | 'groupPhoto',
  options: UploadRequestOptions,
) {
  if (!team.value) return
  uploadingMedia.value = kind
  try {
    const record = await fileApi.upload(options.file, 'TEAM', team.value.id, 'TEAM_MEDIA')
    const idKey = `${kind}FileId` as const
    const urlKey = `${kind}Url` as const
    media[idKey] = record.id
    media[urlKey] = record.url || URL.createObjectURL(options.file)
    ElMessage.success('图片上传成功，保存后生效')
  } catch {
    // 拦截器提示
  } finally {
    uploadingMedia.value = ''
  }
}

async function save() {
  if (!team.value) return
  if (!form.name.trim()) return ElMessage.warning('请填写球队名称')
  saving.value = true
  try {
    team.value = await teamApi.update(team.value.id, {
      ...form,
      schoolOrgId: team.value.orgId,
      groupCategory: team.value.category,
      flagFileId: media.flagFileId || undefined,
      emblemFileId: media.emblemFileId || undefined,
      groupPhotoFileId: media.groupPhotoFileId || undefined,
      version: team.value.version,
    })
    ElMessage.success('球队资料已保存')
    editing.value = false
    await loadTeams(team.value.id)
  } catch {
    // 拦截器提示
  } finally {
    saving.value = false
  }
}

function openCreate() {
  createForm.name = ''
  createForm.category = 'MIDDLE'
  createForm.intro = ''
  createVisible.value = true
}

async function createTeam() {
  if (!createForm.name.trim()) return ElMessage.warning('请填写球队名称')
  if (!auth.user?.orgId) return ElMessage.warning('当前账号未绑定学校，无法创建球队')
  creating.value = true
  try {
    const created = await teamApi.create({
      name: createForm.name.trim(),
      schoolOrgId: auth.user.orgId,
      groupCategory: createForm.category,
      intro: createForm.intro || undefined,
    })
    ElMessage.success('球队已创建')
    createVisible.value = false
    await loadTeams(created.id)
    await loadTeam()
  } catch {
    // 拦截器提示
  } finally {
    creating.value = false
  }
}

async function removeTeam() {
  if (!team.value) return
  try {
    await ElMessageBox.confirm(
      `确认删除球队「${team.value.name}」？存在报名或比赛记录时将无法删除。`,
      '删除球队',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    removing.value = true
    await teamApi.remove(team.value.id, team.value.version)
    ElMessage.success('球队已删除')
    team.value = null
    editing.value = false
    await loadTeams()
    await loadTeam()
  } catch {
    // 取消或接口错误
  } finally {
    removing.value = false
  }
}

async function refresh() {
  await loadTeams(teamId.value)
  await loadTeam()
}

onMounted(async () => {
  await loadTeams()
  await loadTeam()
})
</script>

<template>
  <div class="page">
    <PageHeader
      title="球队资料"
      description="维护球队名称、学校归属与简介。球队资料将在报名审核、门户公示与比赛介绍中展示。"
    >
      <template #actions>
        <el-select
          v-if="teams.length > 1"
          v-model="teamId"
          style="width: 220px"
          @change="changeTeam"
        >
          <el-option v-for="item in teams" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-button :icon="Refresh" @click="refresh">刷新</el-button>
        <el-button v-if="canEdit" type="primary" plain :icon="Plus" @click="openCreate">新建球队</el-button>
        <el-button v-if="canEdit && team && !editing" type="primary" :icon="Edit" @click="startEdit">编辑资料</el-button>
      </template>
    </PageHeader>

    <div v-loading="detailLoading || loading" class="profile-grid">
      <section class="page-card profile-main">
        <div class="team-hero">
          <span class="team-hero__badge">
            <img v-if="media.emblemUrl" :src="media.emblemUrl" alt="队徽" />
            <template v-else>{{ team?.name?.slice(0, 1) || '队' }}</template>
          </span>
          <div class="team-hero__info">
            <div class="team-hero__title">
              <h2>{{ team?.name || '暂无球队' }}</h2>
              <el-tag :type="team?.status === 'APPROVED' ? 'success' : 'warning'" effect="plain" size="small">
                {{ team?.status === 'APPROVED' ? '已认证' : '待认证' }}
              </el-tag>
            </div>
            <p>{{ team?.schoolName || '未绑定学校' }} · {{ team?.category ? categoryLabel(team.category) : '学段未设置' }}</p>
            <div class="team-hero__meta">
              <span><el-icon><Location /></el-icon>{{ team?.cityName || '未设置市州' }}</span>
              <span><el-icon><User /></el-icon>主教练 {{ team?.coachName || '未设置' }}</span>
              <span><el-icon><UserFilled /></el-icon>{{ team?.memberCount || 0 }} 名球员</span>
            </div>
          </div>
        </div>

        <template v-if="!editing">
          <div class="section-title">球队简介</div>
          <p class="intro-text">{{ team?.intro || '尚未填写球队简介。可介绍球队历史、训练情况与参赛成绩。' }}</p>

          <div class="section-title">球队形象 <small>队徽、队旗与球队合影</small></div>
          <div class="media-grid">
            <div class="media-card media-card--emblem">
              <img v-if="media.emblemUrl" :src="media.emblemUrl" alt="队徽" />
              <span v-else>队徽</span>
              <small>队徽</small>
            </div>
            <div class="media-card media-card--flag">
              <img v-if="media.flagUrl" :src="media.flagUrl" alt="队旗" />
              <span v-else>队旗</span>
              <small>队旗</small>
            </div>
            <div class="media-card media-card--photo">
              <img v-if="media.groupPhotoUrl" :src="media.groupPhotoUrl" alt="球队合影" />
              <span v-else>球队合影</span>
              <small>球队合影</small>
            </div>
          </div>

          <div class="info-grid">
            <div><span>球队全称</span><strong>{{ team?.name || '—' }}</strong></div>
            <div><span>球队简称</span><strong>{{ team?.shortName || '—' }}</strong></div>
            <div><span>所属学校</span><strong>{{ team?.schoolName || '—' }}</strong></div>
            <div><span>所属市州</span><strong>{{ team?.cityName || '—' }}</strong></div>
            <div><span>学段</span><strong>{{ categoryLabel(team?.category) }}</strong></div>
            <div><span>主教练</span><strong>{{ team?.coachName || '—' }}</strong></div>
          </div>
        </template>

        <el-form v-else :model="form" label-position="top" class="edit-form">
          <div class="form-grid">
            <el-form-item label="球队全称" required>
              <el-input v-model="form.name" placeholder="球队全称" />
            </el-form-item>
            <el-form-item label="球队简称">
              <el-input v-model="form.shortName" placeholder="用于赛程展示，建议 4-6 字" />
            </el-form-item>
            <el-form-item label="所属学校">
              <el-input v-model="form.schoolName" placeholder="学校全称" />
            </el-form-item>
            <el-form-item label="所属市州">
              <el-input v-model="form.cityName" placeholder="如：成都市" />
            </el-form-item>
            <el-form-item label="主教练">
              <el-input v-model="form.coachName" placeholder="主教练姓名" />
            </el-form-item>
          </div>
          <el-form-item label="球队简介">
            <el-input
              v-model="form.intro"
              type="textarea"
              :rows="5"
              maxlength="500"
              show-word-limit
              placeholder="介绍球队历史、训练情况与参赛成绩"
            />
          </el-form-item>
          <div class="form-grid">
            <el-form-item label="队徽">
              <div class="media-upload">
                <span class="media-upload__preview">
                  <img v-if="media.emblemUrl" :src="media.emblemUrl" alt="队徽" />
                  <template v-else>队徽</template>
                </span>
                <el-upload
                  :show-file-list="false"
                  :http-request="uploadEmblem"
                  accept=".jpg,.jpeg,.png"
                >
                  <el-button size="small" plain :icon="UploadFilled" :loading="uploadingMedia === 'emblem'">
                    上传队徽
                  </el-button>
                </el-upload>
              </div>
            </el-form-item>
            <el-form-item label="队旗">
              <div class="media-upload">
                <span class="media-upload__preview">
                  <img v-if="media.flagUrl" :src="media.flagUrl" alt="队旗" />
                  <template v-else>队旗</template>
                </span>
                <el-upload
                  :show-file-list="false"
                  :http-request="uploadFlag"
                  accept=".jpg,.jpeg,.png"
                >
                  <el-button size="small" plain :icon="UploadFilled" :loading="uploadingMedia === 'flag'">
                    上传队旗
                  </el-button>
                </el-upload>
              </div>
            </el-form-item>
          </div>
          <el-form-item label="球队合影">
            <div class="media-upload media-upload--wide">
              <span class="media-upload__preview media-upload__preview--wide">
                <img v-if="media.groupPhotoUrl" :src="media.groupPhotoUrl" alt="球队合影" />
                <template v-else>球队合影</template>
              </span>
              <el-upload
                :show-file-list="false"
                :http-request="uploadGroupPhoto"
                accept=".jpg,.jpeg,.png"
              >
                <el-button size="small" plain :icon="UploadFilled" :loading="uploadingMedia === 'groupPhoto'">
                  上传合影
                </el-button>
              </el-upload>
            </div>
          </el-form-item>
          <div class="edit-actions">
            <el-button @click="cancelEdit">取消</el-button>
            <el-button type="primary" :loading="saving" @click="save">保存修改</el-button>
          </div>
        </el-form>
      </section>

      <aside class="profile-side">
        <div class="page-card side-card">
          <div class="section-title">球队管理</div>
          <div class="side-links">
            <button type="button" class="side-link" @click="router.push('/console/team/members')">
              <span>球员名单</span>
              <small>{{ team?.memberCount || 0 }} 人</small>
            </button>
            <button type="button" class="side-link" @click="router.push('/console/team/coaches')">
              <span>教练团队</span>
              <small>查看</small>
            </button>
            <button type="button" class="side-link" @click="router.push('/console/team/materials')">
              <span>球队材料</span>
              <small>资质与荣誉</small>
            </button>
            <button
              v-if="canEdit && team"
              type="button"
              class="side-link side-link--danger"
              :disabled="removing"
              @click="removeTeam"
            >
              <span>删除球队</span>
              <small>{{ removing ? '处理中…' : '不可恢复' }}</small>
            </button>
          </div>
        </div>

        <div class="page-card side-card side-card--tip">
          <span class="side-card__eyebrow">资料清单</span>
          <h3>资料完善度</h3>
          <ul>
            <li :class="{ done: team?.schoolName }">绑定所属学校</li>
            <li :class="{ done: team?.cityName }">设置所属市州</li>
            <li :class="{ done: team?.coachName }">登记主教练</li>
            <li :class="{ done: team?.intro }">填写球队简介</li>
          </ul>
        </div>
      </aside>
    </div>

    <el-dialog v-model="createVisible" title="新建球队" width="520px">
      <el-form :model="createForm" label-position="top">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="球队归属当前账号所在学校"
          :description="auth.user?.orgName || '当前账号未绑定学校'"
        />
        <el-form-item label="球队名称" required>
          <el-input v-model="createForm.name" placeholder="如：成都七中初中男子足球队" />
        </el-form-item>
        <el-form-item label="参赛组别" required>
          <el-select v-model="createForm.category" style="width: 100%">
            <el-option v-for="item in categoryOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="球队简介">
          <el-input v-model="createForm.intro" type="textarea" :rows="3" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createTeam">创建球队</el-button>
      </template>
    </el-dialog>
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

.team-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line);
}

.team-hero__badge {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--brand-700);
  color: #fff;
  font-size: 26px;
  font-weight: 700;
}

.team-hero__badge img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-grid {
  display: grid;
  grid-template-columns: 96px 96px minmax(0, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.media-card {
  position: relative;
  display: grid;
  place-items: center;
  height: 96px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--paper);
  color: var(--ink-300);
  font-size: 10px;
}

.media-card--photo {
  height: 96px;
}

.media-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-card small {
  position: absolute;
  left: 7px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(4, 40, 27, 0.62);
  color: #fff;
  font-size: 8.5px;
}

.media-upload {
  display: flex;
  align-items: center;
  gap: 10px;
}

.media-upload__preview {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 9px;
  background: var(--paper);
  color: var(--ink-300);
  font-size: 9px;
}

.media-upload__preview--wide {
  width: 96px;
}

.media-upload__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.team-hero__title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.team-hero__title h2 {
  font-size: 22px;
}

.team-hero__info p {
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--ink-500);
}

.team-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 10px;
}

.team-hero__meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--ink-500);
}

.intro-text {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--ink-700);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.info-grid > div {
  padding: 13px 15px;
  border-radius: 11px;
  background: var(--paper);
}

.info-grid span {
  display: block;
  font-size: 9.5px;
  color: var(--ink-300);
}

.info-grid strong {
  display: block;
  margin-top: 4px;
  font-size: 12.5px;
  font-weight: 500;
}

.profile-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.side-card {
  padding: 20px;
}

.side-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.side-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: #fff;
  font-size: 12px;
  color: var(--ink-900);
  text-align: left;
  cursor: pointer;
  transition: 0.15s;
}

.side-link:hover {
  border-color: var(--brand-500);
  background: var(--brand-50);
}

.side-link small {
  font-size: 9.5px;
  color: var(--ink-300);
}

.side-link--danger {
  color: #b34545;
  border-color: #f0d6d6;
}

.side-link--danger:hover {
  border-color: #d86969;
  background: #fdf6f6;
}

.side-link--danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.side-card--tip h3 {
  margin-top: 7px;
  font-size: 14px;
}

.side-card--tip ul {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.side-card--tip li {
  position: relative;
  padding-left: 17px;
  font-size: 10.5px;
  line-height: 2;
  color: #6b7a45;
}

.side-card--tip li::before {
  content: '○';
  position: absolute;
  left: 0;
}

.side-card--tip li.done {
  color: #3f5520;
}

.side-card--tip li.done::before {
  content: '●';
  color: var(--brand-700);
}

.edit-form {
  margin-top: 22px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
}

@media (max-width: 980px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .info-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .team-hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .info-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
