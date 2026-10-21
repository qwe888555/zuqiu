import type { RoleCode } from '../api/types'

/**
 * 前端权限点。与后端接口文档中的 api:* 权限点一一对应，
 * 用于共享页面内的按钮级控制；页面级权限仍由路由 meta.roles 承担。
 */
export type PermissionCode =
  | 'enrollment.create'
  | 'enrollment.edit'
  | 'enrollment.submit'
  | 'enrollment.export'
  | 'enrollment.review.city'
  | 'enrollment.review.province'
  | 'enrollment.stats'
  | 'event.manage'
  | 'match.view'
  | 'match.manage'
  | 'match.record'
  | 'match.publish'
  | 'identity.review'
  | 'team.manage'
  | 'team.view.all'
  | 'person.self'
  | 'material.self'
  | 'selection.view'
  | 'selection.manage'
  | 'publication.manage'
  | 'content.manage'
  | 'resource.manage'
  | 'system.people'
  | 'system.accounts'
  | 'system.orgs'
  | 'system.dicts'
  | 'system.logs'
  | 'message.view'
  | 'portal.view'
  | 'data.province'
  | 'data.city'
  | 'data.team'
  | 'data.self'

export interface PermissionDef {
  code: PermissionCode
  label: string
  description: string
}

export interface PermissionGroup {
  key: string
  title: string
  hint: string
  permissions: PermissionDef[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'enrollment',
    title: '报名与审核',
    hint: '三类主体共用一套报名引擎，市州初审、省级终审',
    permissions: [
      { code: 'enrollment.create', label: '新建报名', description: '创建球队/高校/市州报名单' },
      { code: 'enrollment.edit', label: '编辑报名', description: '草稿或被驳回后修改报名信息与名单' },
      { code: 'enrollment.submit', label: '提交报名', description: '预检并冻结报名快照' },
      { code: 'enrollment.export', label: '导出报名资料', description: '报名表 PDF、球员 Word 与批量打包' },
      { code: 'enrollment.review.city', label: '市州初审', description: '审核本市学校报名并驳回/通过' },
      { code: 'enrollment.review.province', label: '省级终审', description: '终审全部报名并查看历史记录' },
      { code: 'enrollment.stats', label: '报名统计', description: '按市州、组别与主体汇总统计' },
    ],
  },
  {
    key: 'competition',
    title: '赛事运行',
    hint: '赛事配置、对阵、赛况事件流、图文直播与现场身份核验',
    permissions: [
      { code: 'event.manage', label: '赛事配置', description: '创建赛事、组别、名额与报名窗口' },
      { code: 'match.view', label: '查看比赛', description: '查看赛程、对阵与已发布赛果' },
      { code: 'match.manage', label: '编排比赛', description: '创建、修改、删除对阵' },
      { code: 'match.record', label: '赛况录入', description: '录入进球、判罚、换人与图文直播' },
      { code: 'match.publish', label: '发布比赛/赛果', description: '将比赛与成绩发布到门户' },
      { code: 'identity.review', label: '身份核验', description: '现场人脸比对与人工确认' },
    ],
  },
  {
    key: 'team',
    title: '球队与档案',
    hint: '球队资料、成员与个人履历；管理员可跨市州查看',
    permissions: [
      { code: 'team.manage', label: '管理本队', description: '维护球队资料、球员与教练团队' },
      { code: 'team.view.all', label: '查看全部球队', description: '管理员按市州、组别查看参赛球队' },
      { code: 'person.self', label: '维护个人资料', description: '运动员/教练员完善并确认身份信息' },
      { code: 'material.self', label: '维护履历材料', description: '上传、查看本人履历材料' },
    ],
  },
  {
    key: 'selection',
    title: '遴选与公示',
    hint: '初选/复选评分、正式结果与门户公示',
    permissions: [
      { code: 'selection.view', label: '查看遴选档案', description: '检索运动员档案与历史评分' },
      { code: 'selection.manage', label: '遴选评分与结果', description: '维护评分规则、录入评分、生成正式结果' },
      { code: 'publication.manage', label: '公示管理', description: '发布与撤销门户公示' },
    ],
  },
  {
    key: 'portal',
    title: '门户运营',
    hint: '新闻、政策、精彩瞬间与门户资源位',
    permissions: [
      { code: 'content.manage', label: '内容管理', description: '创建、发布、下线与置顶门户内容' },
      { code: 'resource.manage', label: '门户资源', description: '维护轮播图、跳转图与合作方链接' },
    ],
  },
  {
    key: 'system',
    title: '系统管理',
    hint: '账号、组织、字典与审计；仅管理员可达',
    permissions: [
      { code: 'system.people', label: '人员管理', description: '运动员与教练员档案增删改查' },
      { code: 'system.accounts', label: '账号管理', description: '账号、角色授权、启停与密码重置' },
      { code: 'system.orgs', label: '组织与主体', description: '维护省—市州—学校组织树与参赛主体' },
      { code: 'system.dicts', label: '数据字典', description: '维护组别、位置、材料类型等枚举' },
      { code: 'system.logs', label: '操作日志', description: '查询登录、操作与报名审计日志' },
    ],
  },
  {
    key: 'common',
    title: '通用能力',
    hint: '所有登录角色共享的消息与门户访问',
    permissions: [
      { code: 'message.view', label: '站内消息', description: '查看审核、核验与系统通知' },
      { code: 'portal.view', label: '访问门户', description: '浏览公开赛事、新闻与公示' },
    ],
  },
  {
    key: 'scope',
    title: '数据范围',
    hint: '行级数据隔离，由后端按账号所属组织与球队校验',
    permissions: [
      { code: 'data.province', label: '全省数据', description: '省级审核员、管理员与赛事记录员' },
      { code: 'data.city', label: '本市数据', description: '市州账号仅能访问所属市州数据' },
      { code: 'data.team', label: '本队数据', description: '球队与高校账号仅能访问绑定球队' },
      { code: 'data.self', label: '本人数据', description: '运动员与教练员仅能访问本人档案' },
    ],
  },
]

export const ALL_PERMISSION_CODES: PermissionCode[] = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.code),
)

const submitterPermissions: PermissionCode[] = [
  'enrollment.create',
  'enrollment.edit',
  'enrollment.submit',
  'enrollment.export',
  'match.view',
  'team.manage',
  'message.view',
  'portal.view',
  'data.team',
]

const reviewerPermissions: PermissionCode[] = [
  'enrollment.review.province',
  'enrollment.export',
  'enrollment.stats',
  'event.manage',
  'match.view',
  'match.manage',
  'match.record',
  'match.publish',
  'identity.review',
  'team.view.all',
  'publication.manage',
  'content.manage',
  'resource.manage',
  'system.people',
  'system.accounts',
  'system.logs',
  'message.view',
  'portal.view',
  'data.province',
]

export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  TEAM: submitterPermissions,
  UNIVERSITY: submitterPermissions,
  CITY: [
    'enrollment.create',
    'enrollment.edit',
    'enrollment.submit',
    'enrollment.export',
    'enrollment.review.city',
    'enrollment.stats',
    'match.view',
    'message.view',
    'portal.view',
    'data.city',
  ],
  PROVINCE_REVIEWER: reviewerPermissions,
  ATHLETE: ['person.self', 'material.self', 'message.view', 'portal.view', 'data.self'],
  COACH: ['person.self', 'material.self', 'message.view', 'portal.view', 'data.self'],
  MATCH_RECORDER: [
    'match.view',
    'match.manage',
    'match.record',
    'match.publish',
    'identity.review',
    'message.view',
    'portal.view',
    'data.province',
  ],
  ADMIN: ALL_PERMISSION_CODES,
}

export const ROLE_DESCRIPTIONS: Record<RoleCode, string> = {
  TEAM: '中小学球队端。维护球队、球员与教练，报送报名与材料，查看审核结果。',
  UNIVERSITY: '高校端。维护高校球队与球员，完成赛事报名与材料报送。',
  CITY: '市州审核端。本市报名代报、初审、统计与导出，数据范围限本市。',
  PROVINCE_REVIEWER: '省级审核端。全部报名终审、赛事配置、比赛与成绩发布、账号与内容运营；遴选评分由管理员完成。',
  ATHLETE: '运动员端。维护个人档案、履历材料、所属队伍，查看本人公示。',
  COACH: '教练员端。维护个人档案与履历材料，查看所属队伍与本人公示。',
  ADMIN: '系统管理员。账号授权、组织字典、CMS、遴选与全部业务数据。',
  MATCH_RECORDER: '赛事记录员。编排对阵、录入赛况与图文直播、现场身份核验。',
}

export function hasPermission(roles: readonly RoleCode[], permission: PermissionCode): boolean {
  if (roles.includes('ADMIN')) return true
  return roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission))
}
