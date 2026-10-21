<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, CircleClose, Key, Lock, Menu, Setting, UserFilled } from '@element-plus/icons-vue'
import { ROLE_MENU_LABELS, visibleSections } from '../../config/menus'
import {
  PERMISSION_GROUPS,
  ROLE_DESCRIPTIONS,
  ROLE_PERMISSIONS,
} from '../../config/permissions'
import type { RoleCode } from '../../api/types'
import PageHeader from '../../components/common/PageHeader.vue'
import StatCard from '../../components/common/StatCard.vue'

const router = useRouter()
const selectedRole = ref<RoleCode>('ADMIN')

const roleOrder: RoleCode[] = [
  'TEAM',
  'UNIVERSITY',
  'CITY',
  'PROVINCE_REVIEWER',
  'ATHLETE',
  'COACH',
  'MATCH_RECORDER',
  'ADMIN',
]

const totalPermissions = computed(() =>
  PERMISSION_GROUPS.reduce((sum, group) => sum + group.permissions.length, 0),
)

const granted = computed(() => new Set(ROLE_PERMISSIONS[selectedRole.value] || []))
const grantedCount = computed(() => granted.value.size)

const groups = computed(() =>
  PERMISSION_GROUPS.map((group) => ({
    ...group,
    granted: group.permissions.filter((permission) => granted.value.has(permission.code)).length,
  })),
)

const menus = computed(() => {
  const sections = visibleSections([selectedRole.value])
  const items = sections.flatMap((section) =>
    section.items.map((item) => ({ ...item, section: section.title })),
  )
  return items
})

const scopeLabel = computed(() => {
  const scopes: Record<string, string> = {
    'data.province': '全省数据',
    'data.city': '本市数据',
    'data.team': '本队数据',
    'data.self': '本人数据',
  }
  const keys = ROLE_PERMISSIONS[selectedRole.value].filter((code) => scopes[code])
  return keys.map((code) => scopes[code]).join(' / ') || '未配置'
})

const roleInitial = computed(() => ROLE_MENU_LABELS[selectedRole.value].slice(0, 1))
</script>

<template>
  <div class="page">
    <PageHeader
      title="权限矩阵"
      description="按角色查看菜单可见范围、按钮级权限点与数据范围。角色变更在「参赛账号」中完成，本页为只读视图。"
    >
      <template #actions>
        <el-button :icon="UserFilled" @click="router.push('/console/admin/accounts')">账号与角色</el-button>
        <el-button type="primary" :icon="Setting" @click="router.push('/console/admin/menus')">
          菜单配置
        </el-button>
      </template>
    </PageHeader>

    <div class="stat-grid">
      <StatCard label="登录角色" :value="roleOrder.length" hint="含管理员与记录员" :icon="UserFilled" tone="green" />
      <StatCard label="权限点" :value="totalPermissions" hint="按钮级权限" :icon="Key" tone="lime" />
      <StatCard
        label="当前角色权限"
        :value="`${grantedCount} / ${totalPermissions}`"
        :hint="ROLE_MENU_LABELS[selectedRole]"
        :icon="Lock"
        tone="blue"
      />
      <StatCard label="数据范围" :value="scopeLabel" hint="后端行级隔离" :icon="Menu" tone="amber" />
    </div>

    <section class="role-strip">
      <button
        v-for="role in roleOrder"
        :key="role"
        type="button"
        class="role-card"
        :class="{ 'is-active': selectedRole === role }"
        @click="selectedRole = role"
      >
        <span class="role-card__mark">{{ ROLE_MENU_LABELS[role].slice(0, 1) }}</span>
        <span class="role-card__body">
          <strong>{{ ROLE_MENU_LABELS[role] }}</strong>
          <small>{{ ROLE_PERMISSIONS[role].length }} 项权限</small>
        </span>
        <span v-if="role === 'ADMIN'" class="role-card__flag">全部</span>
      </button>
    </section>

    <div class="permission-layout">
      <section class="page-card role-detail">
        <div class="role-hero">
          <span class="role-hero__mark">{{ roleInitial }}</span>
          <div>
            <span class="role-hero__eyebrow">当前角色</span>
            <h2>{{ ROLE_MENU_LABELS[selectedRole] }}</h2>
            <p>{{ ROLE_DESCRIPTIONS[selectedRole] }}</p>
          </div>
        </div>

        <div class="detail-stats">
          <div><span>菜单入口</span><strong>{{ menus.length }} 个</strong></div>
          <div><span>权限点</span><strong>{{ grantedCount }} / {{ totalPermissions }}</strong></div>
          <div><span>数据范围</span><strong>{{ scopeLabel }}</strong></div>
        </div>

        <div class="menu-block">
          <div class="section-title">侧边栏菜单 <small>登录后实际可见</small></div>
          <div class="menu-tags">
            <span v-for="item in menus" :key="item.key" class="menu-tag">
              <el-icon :size="12"><component :is="item.icon" /></el-icon>
              {{ item.title }}
            </span>
          </div>
        </div>

        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="权限同时由前端与后端校验"
          description="前端菜单与路由负责可见性与可访问性；后端对每个接口再次校验角色与数据范围，前端隐藏按钮不能替代接口鉴权。"
        />
      </section>

      <section class="permission-groups">
        <article v-for="group in groups" :key="group.key" class="page-card group-card">
          <header class="group-head">
            <div>
              <h3>{{ group.title }}</h3>
              <p>{{ group.hint }}</p>
            </div>
            <span class="group-count" :class="{ 'is-full': group.granted === group.permissions.length }">
              {{ group.granted }} / {{ group.permissions.length }}
            </span>
          </header>

          <ul class="permission-list">
            <li
              v-for="permission in group.permissions"
              :key="permission.code"
              :class="{ 'is-granted': granted.has(permission.code) }"
            >
              <span class="permission-icon">
                <el-icon v-if="granted.has(permission.code)" :size="13"><Check /></el-icon>
                <el-icon v-else :size="13"><CircleClose /></el-icon>
              </span>
              <span class="permission-body">
                <strong>{{ permission.label }}</strong>
                <small>{{ permission.description }}</small>
              </span>
              <code>{{ permission.code }}</code>
            </li>
          </ul>

          <div v-if="group.granted === 0" class="group-empty">该角色不包含此组权限</div>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
.role-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.role-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.role-card:hover {
  border-color: var(--brand-500);
  background: var(--brand-50);
}

.role-card.is-active {
  border-color: var(--brand-600);
  background: var(--brand-50);
  box-shadow: 0 0 0 3px rgba(11, 122, 83, 0.08);
}

.role-card__mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--paper);
  color: var(--brand-700);
  font-size: 12px;
  font-weight: 700;
}

.role-card.is-active .role-card__mark {
  background: var(--brand-700);
  color: var(--lime);
}

.role-card__body {
  min-width: 0;
}

.role-card__body strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.role-card__body small {
  display: block;
  margin-top: 2px;
  font-size: 9.5px;
  color: var(--ink-300);
}

.role-card__flag {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--lime-soft);
  color: var(--brand-800);
  font-size: 8px;
  font-weight: 700;
}

.permission-layout {
  display: grid;
  grid-template-columns: 370px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.role-detail {
  position: sticky;
  top: 88px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.role-hero {
  display: flex;
  gap: 13px;
}

.role-hero__mark {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--brand-700);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
}

.role-hero__eyebrow {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--brand-600);
}

.role-hero h2 {
  margin-top: 3px;
  font-size: 19px;
}

.role-hero p {
  margin-top: 5px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--ink-500);
}

.detail-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.detail-stats > div {
  padding: 9px 10px;
  border-radius: 9px;
  background: var(--paper);
}

.detail-stats span {
  display: block;
  font-size: 9px;
  color: var(--ink-300);
}

.detail-stats strong {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  font-weight: 600;
}

.menu-block .section-title {
  font-size: 13px;
  margin-bottom: 9px;
}

.menu-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.menu-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  font-size: 10px;
  color: var(--ink-500);
}

.permission-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.group-card {
  padding: 18px;
}

.group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.group-head h3 {
  font-size: 14px;
}

.group-head p {
  margin-top: 3px;
  font-size: 9.5px;
  line-height: 1.6;
  color: var(--ink-300);
}

.group-count {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 3px;
  background: var(--paper);
  font-family: var(--font-display);
  font-size: 10px;
  color: var(--ink-500);
}

.group-count.is-full {
  background: var(--brand-50);
  color: var(--brand-700);
}

.permission-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}

.permission-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 4px;
  border-radius: 8px;
  opacity: 0.5;
}

.permission-list li.is-granted {
  opacity: 1;
}

.permission-list li:hover {
  background: var(--paper);
}

.permission-icon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 1px;
  border-radius: 6px;
  background: var(--paper);
  color: var(--ink-300);
}

.permission-list li.is-granted .permission-icon {
  background: var(--brand-50);
  color: var(--brand-600);
}

.permission-body {
  flex: 1;
  min-width: 0;
}

.permission-body strong {
  display: block;
  font-size: 11.5px;
  font-weight: 600;
}

.permission-body small {
  display: block;
  margin-top: 1px;
  font-size: 9px;
  line-height: 1.5;
  color: var(--ink-300);
}

.permission-list code {
  flex-shrink: 0;
  max-width: 44%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 8.5px;
  color: var(--ink-300);
}

.group-empty {
  margin-top: 10px;
  padding: 10px;
  border-radius: 8px;
  background: var(--paper);
  text-align: center;
  font-size: 10px;
  color: var(--ink-300);
}

@media (max-width: 1200px) {
  .role-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .permission-layout {
    grid-template-columns: 1fr;
  }

  .role-detail {
    position: static;
  }
}

@media (max-width: 760px) {
  .permission-groups {
    grid-template-columns: 1fr;
  }

  .role-strip {
    grid-template-columns: 1fr;
  }
}
</style>
