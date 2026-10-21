import type {
  Account,
  AuditLog,
  Content,
  DictionaryItem,
  Enrollment,
  EnrollmentAttachment,
  Event,
  EventGroup,
  GoalRankingRow,
  IdentityCheck,
  LiveLink,
  LivePost,
  Match,
  MatchDocument,
  MatchEvent,
  Material,
  Message,
  MyAffiliation,
  Organization,
  Person,
  PortalResource,
  Publication,
  ReviewRecord,
  RosterItem,
  SelectionRule,
  SelectionScore,
  Team,
  TeamCoach,
  TeamMember,
} from '../api/types'

const IMG = {
  stadium:
    'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1600&q=70',
  ball: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=70',
  youth:
    'https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1200&q=70',
  match:
    'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?auto=format&fit=crop&w=1200&q=70',
  training:
    'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1200&q=70',
  trophy:
    'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&w=1200&q=70',
  crowd:
    'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?auto=format&fit=crop&w=1200&q=70',
  team:
    'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?auto=format&fit=crop&w=1200&q=70',
  coach:
    'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=1200&q=70',
}

export interface DemoAccount {
  username: string
  password: string
  accountId: string
  role: Account['roles'][number]
  displayName: string
  orgId: string
  orgName: string
  teamIds?: string[]
  personId?: string
  description: string
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: 'team',
    password: '12345678',
    accountId: 'acc_team_01',
    role: 'TEAM',
    displayName: '成都市实验小学·管理员',
    orgId: 'org_school_cd_syxx',
    orgName: '成都市实验小学',
    teamIds: ['team_cd_syxx'],
    description: '中小学球队端：球队档案、球员报送、报名提交',
  },
  {
    username: 'university',
    password: '12345678',
    accountId: 'acc_uni_01',
    role: 'UNIVERSITY',
    displayName: '四川大学·球队管理员',
    orgId: 'org_uni_scu',
    orgName: '四川大学',
    teamIds: ['team_scu'],
    description: '高校端：高校球队报名与材料报送',
  },
  {
    username: 'city',
    password: '12345678',
    accountId: 'acc_city_01',
    role: 'CITY',
    displayName: '成都市教育局·审核员',
    orgId: 'org_city_cd',
    orgName: '成都市教育局',
    description: '市州端：本市报名代报、初审与统计',
  },
  {
    username: 'province',
    password: '12345678',
    accountId: 'acc_prov_01',
    role: 'PROVINCE_REVIEWER',
    displayName: '省教育厅·终审员',
    orgId: 'org_province',
    orgName: '四川省教育厅',
    description: '省级审核：全量报名终审、统计与日志',
  },
  {
    username: 'athlete',
    password: '12345678',
    accountId: 'acc_ath_01',
    role: 'ATHLETE',
    displayName: '张子轩',
    orgId: 'org_school_cd_syxx',
    orgName: '成都市实验小学',
    personId: 'person_ath_001',
    description: '运动员端：个人档案、履历材料与所属队伍',
  },
  {
    username: 'coach',
    password: '12345678',
    accountId: 'acc_coach_01',
    role: 'COACH',
    displayName: '李建国',
    orgId: 'org_school_cd_syxx',
    orgName: '成都市实验小学',
    personId: 'person_coach_001',
    description: '教练员端：个人档案、执教履历与所属队伍',
  },
  {
    username: 'admin',
    password: '12345678',
    accountId: 'acc_admin_01',
    role: 'ADMIN',
    displayName: '系统管理员',
    orgId: 'org_province',
    orgName: '四川省教育厅',
    description: '管理员端：人员、遴选、公示、CMS、赛事配置',
  },
  {
    username: 'recorder',
    password: '12345678',
    accountId: 'acc_rec_01',
    role: 'MATCH_RECORDER',
    displayName: '赛事录入员·王超',
    orgId: 'org_province',
    orgName: '赛事运行中心',
    description: '比赛录入端：对阵、进球判罚、图文直播、身份核验',
  },
]

export { ROLE_LABELS } from '../config/labels'

export const organizations: Organization[] = [
  { id: 'org_province', name: '四川省教育厅', orgType: 'PROVINCE', code: 'SC', enabled: true, version: 1 },
  { id: 'org_city_cd', parentId: 'org_province', name: '成都市教育局', orgType: 'CITY', code: 'CD', enabled: true, version: 1 },
  { id: 'org_city_my', parentId: 'org_province', name: '绵阳市教体局', orgType: 'CITY', code: 'MY', enabled: true, version: 1 },
  { id: 'org_city_dy', parentId: 'org_province', name: '德阳市教育局', orgType: 'CITY', code: 'DY', enabled: true, version: 1 },
  { id: 'org_city_yb', parentId: 'org_province', name: '宜宾市教体局', orgType: 'CITY', code: 'YB', enabled: true, version: 1 },
  { id: 'org_city_lz', parentId: 'org_province', name: '泸州市教体局', orgType: 'CITY', code: 'LZ', enabled: true, version: 1 },
  { id: 'org_school_cd_syxx', parentId: 'org_city_cd', name: '成都市实验小学', orgType: 'SCHOOL', code: 'CD-SYXX', enabled: true, version: 1 },
  { id: 'org_school_cd_qz', parentId: 'org_city_cd', name: '成都七中育才学校', orgType: 'SCHOOL', code: 'CD-QZYC', enabled: true, version: 1 },
  { id: 'org_school_my_ns', parentId: 'org_city_my', name: '绵阳南山中学', orgType: 'SCHOOL', code: 'MY-NSZX', enabled: true, version: 1 },
  { id: 'org_school_dy_wz', parentId: 'org_city_dy', name: '德阳市第五中学', orgType: 'SCHOOL', code: 'DY-WZ', enabled: true, version: 1 },
  { id: 'org_uni_scu', parentId: 'org_province', name: '四川大学', orgType: 'UNIVERSITY', code: 'SCU', enabled: true, version: 1 },
  { id: 'org_uni_uestc', parentId: 'org_province', name: '电子科技大学', orgType: 'UNIVERSITY', code: 'UESTC', enabled: true, version: 1 },
  { id: 'org_uni_swjtu', parentId: 'org_province', name: '西南交通大学', orgType: 'UNIVERSITY', code: 'SWJTU', enabled: true, version: 1 },
]

export const dictionaries: DictionaryItem[] = [
  { id: 'dict_01', dictType: 'GROUP_CATEGORY', value: 'PRIMARY', label: '小学组', sortOrder: 1, enabled: true, version: 1 },
  { id: 'dict_02', dictType: 'GROUP_CATEGORY', value: 'MIDDLE', label: '中学组', sortOrder: 2, enabled: true, version: 1 },
  { id: 'dict_03', dictType: 'GROUP_CATEGORY', value: 'UNIVERSITY', label: '高校组', sortOrder: 3, enabled: true, version: 1 },
  { id: 'dict_04', dictType: 'POSITION', value: 'GK', label: '守门员', sortOrder: 1, enabled: true, version: 1 },
  { id: 'dict_05', dictType: 'POSITION', value: 'DF', label: '后卫', sortOrder: 2, enabled: true, version: 1 },
  { id: 'dict_06', dictType: 'POSITION', value: 'MF', label: '中场', sortOrder: 3, enabled: true, version: 1 },
  { id: 'dict_07', dictType: 'POSITION', value: 'FW', label: '前锋', sortOrder: 4, enabled: true, version: 1 },
  { id: 'dict_08', dictType: 'COACH_CATEGORY', value: 'HEAD', label: '主教练', sortOrder: 1, enabled: true, version: 1 },
  { id: 'dict_09', dictType: 'COACH_CATEGORY', value: 'ASSISTANT', label: '助理教练', sortOrder: 2, enabled: true, version: 1 },
  { id: 'dict_10', dictType: 'MATERIAL_TYPE', value: 'STUDENT_STATUS', label: '学籍证明', sortOrder: 1, enabled: true, version: 1 },
  { id: 'dict_11', dictType: 'MATERIAL_TYPE', value: 'ATHLETE_CERTIFICATE', label: '运动员证书', sortOrder: 2, enabled: true, version: 1 },
  { id: 'dict_12', dictType: 'MATERIAL_TYPE', value: 'AWARD', label: '获奖证书', sortOrder: 3, enabled: true, version: 1 },
  { id: 'dict_13', dictType: 'MATERIAL_TYPE', value: 'TEACHER_LICENSE', label: '教师资格证', sortOrder: 4, enabled: true, version: 1 },
  { id: 'dict_14', dictType: 'EVENT_CATEGORY', value: 'YOUTH', label: '青少年校园足球', sortOrder: 1, enabled: true, version: 1 },
  { id: 'dict_15', dictType: 'EVENT_CATEGORY', value: 'UNIVERSITY', label: '大学生足球', sortOrder: 2, enabled: true, version: 1 },
]

export const events: Event[] = [
  {
    id: 'event_primary_2026',
    name: '2026年四川省青少年校园足球联赛（小学组）',
    season: '2026',
    eventCategory: 'YOUTH',
    registrationOpensAt: '2026-09-01T09:00:00+08:00',
    registrationClosesAt: '2026-11-15T18:00:00+08:00',
    status: 'REGISTRATION_OPEN',
    description:
      '贯彻落实《四川省青少年校园足球发展行动计划》，推动小学阶段校园足球普及与提高。本届赛事设小学男子组、小学女子组，采用分组循环与交叉淘汰赛制。',
    groupCount: 2,
    teamCount: 32,
    version: 3,
  },
  {
    id: 'event_middle_2026',
    name: '2026年四川省青少年校园足球联赛（中学组）',
    season: '2026',
    eventCategory: 'YOUTH',
    registrationOpensAt: '2026-09-10T09:00:00+08:00',
    registrationClosesAt: '2026-11-20T18:00:00+08:00',
    status: 'REGISTRATION_OPEN',
    description:
      '面向全省普通中学、中等职业学校，设初中男子组、高中男子组。市级联赛优胜队伍获得省级总决赛资格。',
    groupCount: 2,
    teamCount: 28,
    version: 2,
  },
  {
    id: 'event_university_2026',
    name: '2026年四川省大学生足球联赛',
    season: '2026',
    eventCategory: 'UNIVERSITY',
    registrationOpensAt: '2026-08-20T09:00:00+08:00',
    registrationClosesAt: '2026-10-10T18:00:00+08:00',
    status: 'RUNNING',
    description:
      '四川省大学生体育协会主办，全省普通高等学校参加。采用主客场与赛会制结合，赛事数据同步门户。',
    groupCount: 1,
    teamCount: 16,
    version: 5,
  },
]

export const eventGroups: EventGroup[] = [
  {
    id: 'group_primary_boys',
    eventId: 'event_primary_2026',
    name: '小学男子组',
    category: 'PRIMARY',
    gender: 'MALE',
    quota: 24,
    minAge: 8,
    maxAge: 13,
    maxPlayers: 18,
    requiredMaterialTypes: ['STAMPED_FORM', 'STUDENT_STATUS'],
    teamCount: 18,
    version: 1,
  },
  {
    id: 'group_primary_girls',
    eventId: 'event_primary_2026',
    name: '小学女子组',
    category: 'PRIMARY',
    gender: 'FEMALE',
    quota: 16,
    minAge: 8,
    maxAge: 13,
    maxPlayers: 16,
    requiredMaterialTypes: ['STAMPED_FORM', 'STUDENT_STATUS'],
    teamCount: 14,
    version: 1,
  },
  {
    id: 'group_middle_junior',
    eventId: 'event_middle_2026',
    name: '初中男子组',
    category: 'MIDDLE',
    gender: 'MALE',
    quota: 20,
    minAge: 12,
    maxAge: 16,
    maxPlayers: 20,
    requiredMaterialTypes: ['STAMPED_FORM', 'STUDENT_STATUS'],
    teamCount: 16,
    version: 1,
  },
  {
    id: 'group_middle_senior',
    eventId: 'event_middle_2026',
    name: '高中男子组',
    category: 'MIDDLE',
    gender: 'MALE',
    quota: 16,
    minAge: 15,
    maxAge: 19,
    maxPlayers: 22,
    requiredMaterialTypes: ['STAMPED_FORM', 'STUDENT_STATUS'],
    teamCount: 12,
    version: 1,
  },
  {
    id: 'group_university_men',
    eventId: 'event_university_2026',
    name: '大学男子组',
    category: 'UNIVERSITY',
    gender: 'MALE',
    quota: 16,
    minAge: 17,
    maxAge: 25,
    maxPlayers: 23,
    requiredMaterialTypes: ['STAMPED_FORM', 'STUDENT_STATUS'],
    teamCount: 16,
    version: 1,
  },
]

export const accounts: Account[] = [
  ...DEMO_ACCOUNTS.map((d, i) => ({
    id: d.accountId,
    username: d.username,
    displayName: d.displayName,
    roles: [d.role],
    orgId: d.orgId,
    orgName: d.orgName,
    teamIds: d.teamIds,
    personId: d.personId,
    enabled: true,
    lastLoginAt: '2026-10-19T09:12:00+08:00',
    version: 1,
    createdAt: `2026-0${(i % 8) + 1}-12T10:00:00+08:00`,
  })),
  {
    id: 'acc_city_my_01',
    username: 'mianyang',
    displayName: '绵阳市教体局·审核员',
    roles: ['CITY'],
    orgId: 'org_city_my',
    orgName: '绵阳市教体局',
    enabled: true,
    lastLoginAt: '2026-10-18T16:20:00+08:00',
    version: 1,
    createdAt: '2026-03-04T10:00:00+08:00',
  },
  {
    id: 'acc_team_qz',
    username: 'qizhong',
    displayName: '成都七中育才·管理员',
    roles: ['TEAM'],
    orgId: 'org_school_cd_qz',
    orgName: '成都七中育才学校',
    teamIds: ['team_cd_qz'],
    enabled: false,
    lastLoginAt: '2026-09-28T11:00:00+08:00',
    version: 2,
    createdAt: '2026-03-06T10:00:00+08:00',
  },
]

const menNames = [
  '张子轩', '李明宇', '王浩然', '陈嘉豪', '刘一鸣', '赵天佑', '孙泽宇', '周俊杰',
  '吴梓涵', '郑博文', '冯奕辰', '蒋宇航', '韩子墨', '曹睿', '许文昊', '邓凯',
  '冯子豪', '曾俊熙', '彭宇轩', '肖景行', '唐子杰', '罗嘉瑞', '谢天磊', '黄一诺',
]

const womenNames = [
  '李诗涵', '王雨桐', '陈欣然', '刘语嫣', '张若曦', '赵可欣', '周芷晴', '吴佳怡',
  '郑心怡', '孙梦瑶', '冯思彤', '蒋依诺', '韩雨薇', '曹语汐', '许安然', '邓雅琪',
]

const coachNames = ['李建国', '王志强', '张伟', '刘洋', '陈刚', '杨帆', '周斌', '赵磊']

const positions = ['GK', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW']

function makePerson(
  id: string,
  name: string,
  kinds: Person['kinds'],
  index: number,
  schoolOrgId: string,
  schoolName: string,
  gender: 'MALE' | 'FEMALE',
  teamName: string,
): Person {
  return {
    id,
    kinds,
    realName: name,
    maskedIdNumber: `5101**********${String(1200 + index).slice(-4)}`,
    maskedPhone: `138****${String(1200 + index).slice(-4)}`,
    maskedStudentNumber: `2026${String(100000 + index)}`,
    gender,
    birthDate: gender === 'MALE' ? `201${index % 4}-0${(index % 9) + 1}-12` : `201${index % 4}-0${(index % 9) + 1}-08`,
    schoolOrgId,
    schoolName,
    teamName,
    avatarUrl: '',
    education: kinds.includes('COACH') ? '本科' : '小学',
    coachCategory: kinds.includes('COACH') ? (index % 3 === 0 ? 'HEAD' : 'ASSISTANT') : undefined,
    reviewStatus: index % 7 === 0 ? 'PENDING' : 'APPROVED',
    version: 1,
    createdAt: `2026-0${(index % 8) + 1}-15T10:00:00+08:00`,
  }
}

export const persons: Person[] = []

const teamSeeds: Array<{
  id: string
  name: string
  cityOrgId: string
  cityName: string
  category: 'PRIMARY' | 'MIDDLE' | 'UNIVERSITY'
  schoolOrgId: string
  schoolName: string
  gender: 'MALE' | 'FEMALE'
  count: number
}> = [
  { id: 'team_cd_syxx', name: '成都市实验小学足球队', cityOrgId: 'org_city_cd', cityName: '成都市', category: 'PRIMARY', schoolOrgId: 'org_school_cd_syxx', schoolName: '成都市实验小学', gender: 'MALE', count: 16 },
  { id: 'team_cd_qz', name: '成都七中育才学校足球队', cityOrgId: 'org_city_cd', cityName: '成都市', category: 'MIDDLE', schoolOrgId: 'org_school_cd_qz', schoolName: '成都七中育才学校', gender: 'MALE', count: 18 },
  { id: 'team_my_ns', name: '绵阳南山中学足球队', cityOrgId: 'org_city_my', cityName: '绵阳市', category: 'MIDDLE', schoolOrgId: 'org_school_my_ns', schoolName: '绵阳南山中学', gender: 'MALE', count: 20 },
  { id: 'team_dy_wz', name: '德阳五中足球队', cityOrgId: 'org_city_dy', cityName: '德阳市', category: 'MIDDLE', schoolOrgId: 'org_school_dy_wz', schoolName: '德阳市第五中学', gender: 'MALE', count: 18 },
  { id: 'team_yb_rml', name: '宜宾人民路小学足球队', cityOrgId: 'org_city_yb', cityName: '宜宾市', category: 'PRIMARY', schoolOrgId: 'org_school_cd_syxx', schoolName: '宜宾市人民路小学', gender: 'MALE', count: 14 },
  { id: 'team_scu', name: '四川大学男子足球队', cityOrgId: 'org_city_cd', cityName: '成都市', category: 'UNIVERSITY', schoolOrgId: 'org_uni_scu', schoolName: '四川大学', gender: 'MALE', count: 22 },
  { id: 'team_uestc', name: '电子科技大学男子足球队', cityOrgId: 'org_city_cd', cityName: '成都市', category: 'UNIVERSITY', schoolOrgId: 'org_uni_uestc', schoolName: '电子科技大学', gender: 'MALE', count: 20 },
  { id: 'team_swjtu', name: '西南交通大学足球队', cityOrgId: 'org_city_cd', cityName: '成都市', category: 'UNIVERSITY', schoolOrgId: 'org_uni_swjtu', schoolName: '西南交通大学', gender: 'MALE', count: 20 },
  { id: 'team_lz_sy', name: '泸州实验小学足球队', cityOrgId: 'org_city_lz', cityName: '泸州市', category: 'PRIMARY', schoolOrgId: 'org_school_cd_syxx', schoolName: '泸州市实验小学', gender: 'FEMALE', count: 14 },
]

const teamCovers = [IMG.youth, IMG.match, IMG.training, IMG.stadium, IMG.crowd, IMG.ball, IMG.match, IMG.training, IMG.youth]

export const teams: Team[] = teamSeeds.map((t, i) => ({
  id: t.id,
  name: t.name,
  shortName: t.name.replace('足球队', '').replace('男子', ''),
  orgId: t.schoolOrgId,
  cityOrgId: t.cityOrgId,
  cityName: t.cityName,
  category: t.category,
  schoolName: t.schoolName,
  coachName: coachNames[i % coachNames.length],
  intro:
    t.category === 'UNIVERSITY'
      ? `${t.schoolName}男子足球队长期坚持系统训练，多次参加省级大学生联赛，球队作风硬朗、攻守均衡。`
      : `${t.schoolName}足球队坚持“以球育人”，将足球纳入校本课程，形成梯队培养体系，多次在市级联赛中取得优异成绩。`,
  flagUrl: teamCovers[i % teamCovers.length],
  emblemUrl: teamCovers[(i + 2) % teamCovers.length],
  groupPhotoUrl: teamCovers[(i + 4) % teamCovers.length],
  memberCount: t.count,
  status: i === 3 ? 'PENDING' : 'APPROVED',
  version: 1,
  createdAt: `2026-0${(i % 8) + 1}-18T10:00:00+08:00`,
}))

let personIndex = 0
export const teamMembers: TeamMember[] = []
export const teamCoaches: TeamCoach[] = []

teamSeeds.forEach((t, ti) => {
  const names = t.gender === 'FEMALE' ? womenNames : menNames
  for (let i = 0; i < t.count; i++) {
    const name = names[(ti * 3 + i) % names.length]
    const id = `person_${t.id}_${String(i + 1).padStart(3, '0')}`
    const person = makePerson(
      id,
      name,
      ['ATHLETE'],
      personIndex++,
      t.schoolOrgId,
      t.schoolName,
      t.gender,
      t.name,
    )
    persons.push(person)
    teamMembers.push({
      id: `tm_${t.id}_${String(i + 1).padStart(3, '0')}`,
      teamId: t.id,
      athleteId: id,
      athleteName: name,
      maskedIdNumber: person.maskedIdNumber,
      jerseyNumber: i + 1,
      position: positions[i % positions.length],
      avatarFileId: person.avatarFileId,
      photoUrl: person.avatarUrl || '',
      effectiveFrom: '2025-09-01',
      active: true,
      status: i === 0 ? 'PENDING' : 'APPROVED',
      version: 1,
    })
  }
  const coachName = coachNames[ti % coachNames.length]
  const coachId = `person_coach_${String(ti + 1).padStart(3, '0')}`
  if (!persons.find((p) => p.id === coachId)) {
    persons.push(
      makePerson(coachId, coachName, ['COACH'], personIndex++, t.schoolOrgId, t.schoolName, 'MALE', t.name),
    )
  }
  teamCoaches.push({
    id: `tc_${t.id}_01`,
    teamId: t.id,
    coachId,
    coachName,
    category: ti % 3 === 0 ? 'HEAD_COACH' : 'ASSISTANT_COACH',
    effectiveFrom: '2025-09-01',
    maskedPhone: '139****6688',
    reviewStatus: 'APPROVED',
    version: 1,
  })
})

// 固定演示人员：运动员张子轩、教练员李建国
const demoAthlete = persons.find((p) => p.id === 'person_team_cd_syxx_001')
if (demoAthlete) {
  demoAthlete.id = 'person_ath_001'
  demoAthlete.realName = '张子轩'
  demoAthlete.reviewStatus = 'APPROVED'
  const member = teamMembers.find((m) => m.athleteId === 'person_team_cd_syxx_001')
  if (member) {
    member.athleteId = 'person_ath_001'
    member.athleteName = '张子轩'
  }
}
const demoCoach = persons.find((p) => p.id === 'person_coach_001')
if (demoCoach) {
  demoCoach.realName = '李建国'
  demoCoach.reviewStatus = 'APPROVED'
}

export const enrollments: Enrollment[] = [
  {
    id: 'enr_001', eventId: 'event_primary_2026', eventName: events[0].name,
    groupId: 'group_primary_boys', groupName: '小学男子组', teamId: 'team_cd_syxx',
    teamName: '成都市实验小学足球队', subjectType: 'SCHOOL_TEAM', cityOrgId: 'org_city_cd',
    cityName: '成都市', status: 'PENDING_CITY_REVIEW', submissionNo: 1,
    contactName: '李建国', maskedContactPhone: '138****6688', editable: false,
    playerCount: 16, version: 4, createdAt: '2026-10-08T10:20:00+08:00',
    updatedAt: '2026-10-12T15:30:00+08:00',
  },
  {
    id: 'enr_002', eventId: 'event_primary_2026', eventName: events[0].name,
    groupId: 'group_primary_boys', groupName: '小学男子组', teamId: 'team_yb_rml',
    teamName: '宜宾人民路小学足球队', subjectType: 'SCHOOL_TEAM', cityOrgId: 'org_city_yb',
    cityName: '宜宾市', status: 'APPROVED', submissionNo: 2,
    contactName: '陈老师', maskedContactPhone: '137****2210', editable: false,
    playerCount: 14, version: 6, createdAt: '2026-10-02T09:10:00+08:00',
    updatedAt: '2026-10-11T11:00:00+08:00',
  },
  {
    id: 'enr_003', eventId: 'event_primary_2026', eventName: events[0].name,
    groupId: 'group_primary_girls', groupName: '小学女子组', teamId: 'team_lz_sy',
    teamName: '泸州实验小学足球队', subjectType: 'SCHOOL_TEAM', cityOrgId: 'org_city_lz',
    cityName: '泸州市', status: 'PENDING_PROVINCE_REVIEW', submissionNo: 1,
    contactName: '王老师', maskedContactPhone: '136****9090', editable: false,
    playerCount: 14, version: 5, createdAt: '2026-10-05T14:00:00+08:00',
    updatedAt: '2026-10-14T09:30:00+08:00',
  },
  {
    id: 'enr_004', eventId: 'event_middle_2026', eventName: events[1].name,
    groupId: 'group_middle_junior', groupName: '初中男子组', teamId: 'team_cd_qz',
    teamName: '成都七中育才学校足球队', subjectType: 'SCHOOL_TEAM', cityOrgId: 'org_city_cd',
    cityName: '成都市', status: 'REJECTED', submissionNo: 1,
    contactName: '张伟', maskedContactPhone: '135****1188', editable: true,
    playerCount: 18, version: 8, createdAt: '2026-10-01T10:00:00+08:00',
    updatedAt: '2026-10-13T16:20:00+08:00',
    latestReviewReason: '缺少加盖学校公章的报名表扫描件，请补充后重新报送。',
  },
  {
    id: 'enr_005', eventId: 'event_middle_2026', eventName: events[1].name,
    groupId: 'group_middle_junior', groupName: '初中男子组', teamId: 'team_my_ns',
    teamName: '绵阳南山中学足球队', subjectType: 'SCHOOL_TEAM', cityOrgId: 'org_city_my',
    cityName: '绵阳市', status: 'PENDING_CITY_REVIEW', submissionNo: 1,
    contactName: '刘洋', maskedContactPhone: '139****7788', editable: false,
    playerCount: 20, version: 3, createdAt: '2026-10-09T09:40:00+08:00',
    updatedAt: '2026-10-15T10:10:00+08:00',
  },
  {
    id: 'enr_006', eventId: 'event_middle_2026', eventName: events[1].name,
    groupId: 'group_middle_senior', groupName: '高中男子组', teamId: 'team_dy_wz',
    teamName: '德阳五中足球队', subjectType: 'SCHOOL_TEAM', cityOrgId: 'org_city_dy',
    cityName: '德阳市', status: 'DRAFT', submissionNo: 0,
    contactName: '陈刚', maskedContactPhone: '138****3344', editable: true,
    playerCount: 12, version: 2, createdAt: '2026-10-16T15:00:00+08:00',
    updatedAt: '2026-10-18T09:30:00+08:00',
  },
  {
    id: 'enr_007', eventId: 'event_university_2026', eventName: events[2].name,
    groupId: 'group_university_men', groupName: '大学男子组', teamId: 'team_scu',
    teamName: '四川大学男子足球队', subjectType: 'UNIVERSITY', cityOrgId: 'org_city_cd',
    cityName: '成都市', status: 'APPROVED', submissionNo: 1,
    contactName: '杨帆', maskedContactPhone: '136****5566', editable: false,
    playerCount: 22, version: 4, createdAt: '2026-09-18T10:00:00+08:00',
    updatedAt: '2026-09-30T14:00:00+08:00',
  },
  {
    id: 'enr_008', eventId: 'event_university_2026', eventName: events[2].name,
    groupId: 'group_university_men', groupName: '大学男子组', teamId: 'team_uestc',
    teamName: '电子科技大学男子足球队', subjectType: 'UNIVERSITY', cityOrgId: 'org_city_cd',
    cityName: '成都市', status: 'WITHDRAWN', submissionNo: 1,
    contactName: '周斌', maskedContactPhone: '137****9900', editable: true,
    playerCount: 20, version: 7, createdAt: '2026-09-19T11:20:00+08:00',
    updatedAt: '2026-10-06T09:00:00+08:00',
  },
]

export const rosterItems: RosterItem[] = []
enrollments.forEach((e) => {
  const seed = teamSeeds.find((t) => t.id === e.teamId)
  if (!seed) return
  const members = teamMembers.filter((m) => m.teamId === e.teamId)
  members.slice(0, e.playerCount).forEach((m, i) => {
    const person = persons.find((p) => p.id === m.athleteId)
    rosterItems.push({
      id: `roster_${e.id}_${String(i + 1).padStart(3, '0')}`,
      athleteId: m.athleteId,
      athleteName: m.athleteName,
      maskedIdNumber: m.maskedIdNumber || person?.maskedIdNumber,
      jerseyNumber: m.jerseyNumber,
      position: m.position,
      photoUrl: '',
      gender: person?.gender,
      schoolName: seed.schoolName,
      version: 1,
    })
  })
})

export const enrollmentAttachments: EnrollmentAttachment[] = enrollments
  .filter((e) => e.status !== 'DRAFT')
  .flatMap((e) => [
    {
      id: `att_${e.id}_01`,
      materialType: 'STAMPED_FORM' as const,
      fileId: `file_${e.id}_stamp`,
      fileName: `报名表盖章扫描件-${e.teamName}.pdf`,
      version: 1,
    },
    {
      id: `att_${e.id}_02`,
      materialType: 'STUDENT_STATUS' as const,
      fileId: `file_${e.id}_student`,
      fileName: `学籍验证材料-${e.teamName}.zip`,
      version: 1,
    },
  ])

export const reviewRecords: ReviewRecord[] = [
  {
    id: 'rev_001', enrollmentId: 'enr_001', submissionNo: 1, stage: 'SUBMISSION',
    action: 'SUBMIT', fromStatus: 'DRAFT', toStatus: 'PENDING_CITY_REVIEW',
    operatorName: '李建国', createdAt: '2026-10-08T10:30:00+08:00',
  },
  {
    id: 'rev_002', enrollmentId: 'enr_002', submissionNo: 1, stage: 'SUBMISSION',
    action: 'SUBMIT', fromStatus: 'DRAFT', toStatus: 'PENDING_CITY_REVIEW',
    operatorName: '陈老师', createdAt: '2026-10-02T09:20:00+08:00',
  },
  {
    id: 'rev_003', enrollmentId: 'enr_002', submissionNo: 1, stage: 'CITY',
    action: 'APPROVE', fromStatus: 'PENDING_CITY_REVIEW', toStatus: 'PENDING_PROVINCE_REVIEW',
    operatorName: '宜宾市教体局·审核员', createdAt: '2026-10-05T10:00:00+08:00',
  },
  {
    id: 'rev_004', enrollmentId: 'enr_002', submissionNo: 2, stage: 'PROVINCE',
    action: 'APPROVE', fromStatus: 'PENDING_PROVINCE_REVIEW', toStatus: 'APPROVED',
    operatorName: '省教育厅·终审员', createdAt: '2026-10-11T11:00:00+08:00',
  },
  {
    id: 'rev_005', enrollmentId: 'enr_003', submissionNo: 1, stage: 'SUBMISSION',
    action: 'SUBMIT', fromStatus: 'DRAFT', toStatus: 'PENDING_CITY_REVIEW',
    operatorName: '王老师', createdAt: '2026-10-05T14:10:00+08:00',
  },
  {
    id: 'rev_006', enrollmentId: 'enr_003', submissionNo: 1, stage: 'CITY',
    action: 'APPROVE', fromStatus: 'PENDING_CITY_REVIEW', toStatus: 'PENDING_PROVINCE_REVIEW',
    operatorName: '泸州市教体局·审核员', createdAt: '2026-10-14T09:30:00+08:00',
  },
  {
    id: 'rev_007', enrollmentId: 'enr_004', submissionNo: 1, stage: 'SUBMISSION',
    action: 'SUBMIT', fromStatus: 'DRAFT', toStatus: 'PENDING_CITY_REVIEW',
    operatorName: '张伟', createdAt: '2026-10-01T10:10:00+08:00',
  },
  {
    id: 'rev_008', enrollmentId: 'enr_004', submissionNo: 1, stage: 'CITY',
    action: 'REJECT', fromStatus: 'PENDING_CITY_REVIEW', toStatus: 'REJECTED',
    reason: '缺少加盖学校公章的报名表扫描件，请补充后重新报送。',
    operatorName: '成都市教育局·审核员', createdAt: '2026-10-13T16:20:00+08:00',
  },
]

export const matches: Match[] = [
  {
    id: 'match_001', eventId: 'event_primary_2026', eventName: events[0].name,
    groupId: 'group_primary_boys', groupName: '小学男子组',
    homeTeamId: 'team_cd_syxx', awayTeamId: 'team_yb_rml',
    homeTeamName: '成都市实验小学', awayTeamName: '宜宾人民路小学',
    kickoffAt: '2026-10-19T10:00:00+08:00', venue: '成都市青羊区体育中心 1 号场',
    stage: '小组赛第 1 轮', status: 'LIVE', homeScore: 2, awayScore: 1,
    published: true, resultPublished: false, scoreRevision: 5,
    referees: [
      { name: '王建军', role: 'REFEREE', level: '一级' },
      { name: '刘鹏', role: 'ASSISTANT', level: '二级' },
      { name: '陈宇', role: 'FOURTH_OFFICIAL', level: '二级' },
    ],
    version: 9,
  },
  {
    id: 'match_002', eventId: 'event_primary_2026', eventName: events[0].name,
    groupId: 'group_primary_boys', groupName: '小学男子组',
    homeTeamId: 'team_yb_rml', awayTeamId: 'team_lz_sy',
    homeTeamName: '宜宾人民路小学', awayTeamName: '泸州实验小学',
    kickoffAt: '2026-10-19T15:30:00+08:00', venue: '成都市青羊区体育中心 2 号场',
    stage: '小组赛第 1 轮', status: 'SCHEDULED', homeScore: 0, awayScore: 0,
    published: true, resultPublished: false, scoreRevision: 0,
    referees: [{ name: '赵明', role: 'REFEREE', level: '一级' }],
    version: 2,
  },
  {
    id: 'match_003', eventId: 'event_primary_2026', eventName: events[0].name,
    groupId: 'group_primary_girls', groupName: '小学女子组',
    homeTeamId: 'team_lz_sy', awayTeamId: 'team_cd_syxx',
    homeTeamName: '泸州实验小学', awayTeamName: '成都市实验小学',
    kickoffAt: '2026-10-20T09:00:00+08:00', venue: '成都市青羊区体育中心 1 号场',
    stage: '小组赛第 1 轮', status: 'SCHEDULED', homeScore: 0, awayScore: 0,
    published: false, resultPublished: false, scoreRevision: 0,
    referees: [], version: 1,
  },
  {
    id: 'match_004', eventId: 'event_middle_2026', eventName: events[1].name,
    groupId: 'group_middle_junior', groupName: '初中男子组',
    homeTeamId: 'team_cd_qz', awayTeamId: 'team_my_ns',
    homeTeamName: '成都七中育才学校', awayTeamName: '绵阳南山中学',
    kickoffAt: '2026-10-18T14:00:00+08:00', venue: '绵阳市南河体育中心',
    stage: '小组赛第 2 轮', status: 'FINISHED', homeScore: 1, awayScore: 3,
    published: true, resultPublished: true, scoreRevision: 11,
    referees: [{ name: '李伟', role: 'REFEREE', level: '国家级' }],
    version: 14,
  },
  {
    id: 'match_005', eventId: 'event_middle_2026', eventName: events[1].name,
    groupId: 'group_middle_junior', groupName: '初中男子组',
    homeTeamId: 'team_dy_wz', awayTeamId: 'team_cd_qz',
    homeTeamName: '德阳五中', awayTeamName: '成都七中育才学校',
    kickoffAt: '2026-10-21T14:00:00+08:00', venue: '德阳市体育公园',
    stage: '小组赛第 3 轮', status: 'SCHEDULED', homeScore: 0, awayScore: 0,
    published: true, resultPublished: false, scoreRevision: 0,
    referees: [], version: 1,
  },
  {
    id: 'match_006', eventId: 'event_university_2026', eventName: events[2].name,
    groupId: 'group_university_men', groupName: '大学男子组',
    homeTeamId: 'team_scu', awayTeamId: 'team_uestc',
    homeTeamName: '四川大学', awayTeamName: '电子科技大学',
    kickoffAt: '2026-10-17T19:30:00+08:00', venue: '四川大学望江校区体育场',
    stage: '第 5 轮', status: 'FINISHED', homeScore: 2, awayScore: 2,
    published: true, resultPublished: true, scoreRevision: 16,
    referees: [{ name: '张宏', role: 'REFEREE', level: '国家级' }],
    version: 20,
  },
  {
    id: 'match_007', eventId: 'event_university_2026', eventName: events[2].name,
    groupId: 'group_university_men', groupName: '大学男子组',
    homeTeamId: 'team_swjtu', awayTeamId: 'team_scu',
    homeTeamName: '西南交通大学', awayTeamName: '四川大学',
    kickoffAt: '2026-10-22T19:00:00+08:00', venue: '西南交通大学犀浦校区体育场',
    stage: '第 6 轮', status: 'SCHEDULED', homeScore: 0, awayScore: 0,
    published: true, resultPublished: false, scoreRevision: 0,
    referees: [], version: 1,
  },
  {
    id: 'match_008', eventId: 'event_university_2026', eventName: events[2].name,
    groupId: 'group_university_men', groupName: '大学男子组',
    homeTeamId: 'team_uestc', awayTeamId: 'team_swjtu',
    homeTeamName: '电子科技大学', awayTeamName: '西南交通大学',
    kickoffAt: '2026-10-15T19:00:00+08:00', venue: '电子科技大学清水河校区体育场',
    stage: '第 4 轮', status: 'CANCELLED', homeScore: 0, awayScore: 0,
    published: true, resultPublished: false, scoreRevision: 0,
    referees: [], version: 4,
  },
]

export const matchEvents: MatchEvent[] = [
  {
    id: 'me_001', matchId: 'match_001', eventType: 'GOAL', minute: 8, teamId: 'team_cd_syxx',
    teamName: '成都市实验小学', scorerAthleteId: 'person_team_cd_syxx_008',
    scorerName: '周俊杰', ownGoal: false, note: '禁区外远射破门', version: 1,
    createdAt: '2026-10-19T10:09:00+08:00',
  },
  {
    id: 'me_002', matchId: 'match_001', eventType: 'GOAL', minute: 21, teamId: 'team_yb_rml',
    teamName: '宜宾人民路小学', scorerAthleteId: 'person_team_yb_rml_009',
    scorerName: '郑博文', ownGoal: false, note: '角球后头球攻门', version: 1,
    createdAt: '2026-10-19T10:23:00+08:00',
  },
  {
    id: 'me_003', matchId: 'match_001', eventType: 'PENALTY', minute: 30, teamId: 'team_cd_syxx',
    teamName: '成都市实验小学', athleteId: 'person_team_cd_syxx_005',
    athleteName: '刘一鸣', penaltyType: 'YELLOW_CARD', reason: '战术犯规', version: 1,
    createdAt: '2026-10-19T10:32:00+08:00',
  },
  {
    id: 'me_004', matchId: 'match_001', eventType: 'GOAL', minute: 42, teamId: 'team_cd_syxx',
    teamName: '成都市实验小学', scorerAthleteId: 'person_team_cd_syxx_001',
    scorerName: '张子轩', ownGoal: false, note: '单刀推射', version: 1,
    createdAt: '2026-10-19T10:45:00+08:00',
  },
]

export const livePosts: LivePost[] = [
  {
    id: 'live_001', matchId: 'match_001', minute: 1,
    text: '比赛开始！成都市实验小学率先开球，现场气氛热烈。',
    imageUrls: [IMG.stadium], cursor: 1, version: 1, createdAt: '2026-10-19T10:01:00+08:00',
  },
  {
    id: 'live_002', matchId: 'match_001', minute: 9,
    text: '第 8 分钟，成都市实验小学 8 号周俊杰禁区外远射破门，主队 1:0 领先！',
    imageUrls: [], cursor: 2, version: 1, createdAt: '2026-10-19T10:10:00+08:00',
  },
  {
    id: 'live_003', matchId: 'match_001', minute: 22,
    text: '宜宾人民路小学利用角球机会头球扳平比分，1:1。',
    imageUrls: [IMG.match], cursor: 3, version: 1, createdAt: '2026-10-19T10:24:00+08:00',
  },
  {
    id: 'live_004', matchId: 'match_001', minute: 42,
    text: '上半场补时阶段，张子轩单刀推射得手，主队再次领先，2:1！',
    imageUrls: [], cursor: 4, version: 1, createdAt: '2026-10-19T10:46:00+08:00',
  },
]

export const liveLinks: LiveLink[] = [
  {
    id: 'link_001', matchId: 'match_001', title: '视频直播 · 四川校园足球频道',
    url: 'https://example.com/live/2026-primary', enabled: true, version: 1,
  },
]

export const matchDocuments: MatchDocument[] = [
  {
    id: 'doc_001', matchId: 'match_004', documentType: 'SIGN_IN',
    fileName: '比赛签到表-初中组第2轮.pdf', version: 1, createdAt: '2026-10-18T13:30:00+08:00',
  },
  {
    id: 'doc_002', matchId: 'match_004', documentType: 'REFEREE_REPORT',
    fileName: '裁判员报告书-初中组第2轮.pdf', version: 1, createdAt: '2026-10-18T16:20:00+08:00',
  },
]

export const goalRanking: GoalRankingRow[] = [
  { rank: 1, athleteId: 'person_team_my_ns_009', athleteName: '郑博文', teamId: 'team_my_ns', teamName: '绵阳南山中学', goals: 9 },
  { rank: 2, athleteId: 'person_team_scu_008', athleteName: '周俊杰', teamId: 'team_scu', teamName: '四川大学', goals: 8 },
  { rank: 3, athleteId: 'person_team_cd_syxx_001', athleteName: '张子轩', teamId: 'team_cd_syxx', teamName: '成都市实验小学', goals: 7 },
  { rank: 4, athleteId: 'person_team_cd_qz_010', athleteName: '吴梓涵', teamId: 'team_cd_qz', teamName: '成都七中育才学校', goals: 6 },
  { rank: 5, athleteId: 'person_team_yb_rml_009', athleteName: '郑博文', teamId: 'team_yb_rml', teamName: '宜宾人民路小学', goals: 6 },
  { rank: 6, athleteId: 'person_team_uestc_007', athleteName: '孙泽宇', teamId: 'team_uestc', teamName: '电子科技大学', goals: 5 },
  { rank: 7, athleteId: 'person_team_dy_wz_011', athleteName: '冯奕辰', teamId: 'team_dy_wz', teamName: '德阳五中', goals: 5 },
  { rank: 8, athleteId: 'person_team_swjtu_006', athleteName: '赵天佑', teamId: 'team_swjtu', teamName: '西南交通大学', goals: 4 },
  { rank: 9, athleteId: 'person_team_lz_sy_003', athleteName: '陈欣然', teamId: 'team_lz_sy', teamName: '泸州实验小学', goals: 4 },
  { rank: 10, athleteId: 'person_team_cd_syxx_007', athleteName: '孙泽宇', teamId: 'team_cd_syxx', teamName: '成都市实验小学', goals: 3 },
]

export const contents: Content[] = [
  {
    id: 'content_news_001', contentType: 'NEWS', title: '2026年四川省青少年校园足球联赛正式开幕',
    summary: '10月18日上午，2026年四川省青少年校园足球联赛在成都开幕，全省32支小学队伍、28支中学队伍参加本届赛事。',
    bodyHtml:
      '<p>10月18日上午，2026年四川省青少年校园足球联赛开幕式在成都市青羊区体育中心举行。省教育厅相关负责同志出席并宣布开幕。</p><p>本届联赛以“奔跑吧·少年”为主题，设置小学男子组、小学女子组、初中男子组、高中男子组四个组别，覆盖全省21个市州。赛事将持续至11月下旬。</p><p>开幕式后，东道主成都市实验小学与宜宾人民路小学进行了揭幕战。现场近千名师生和家长观赛，氛围热烈。</p>',
    coverUrl: IMG.stadium, pinned: true, status: 'PUBLISHED',
    publishedAt: '2026-10-18T12:00:00+08:00', revision: 2, author: '赛事宣传组',
    viewCount: 3280, version: 3, createdAt: '2026-10-18T10:00:00+08:00',
  },
  {
    id: 'content_news_002', contentType: 'NEWS', title: '揭幕战远射世界波：小球员的赛场高光',
    summary: '成都市实验小学 8 号球员周俊杰在禁区外一脚远射直挂死角，成为本届赛事首粒进球。',
    bodyHtml:
      '<p>揭幕战第 8 分钟，成都市实验小学 8 号周俊杰在禁区弧顶得球后稍作调整，一脚势大力沉的远射直挂球门右上角，引爆全场。</p><p>“平时训练就经常练远射，今天能打进很开心。”周俊杰赛后说。教练李建国表示，球队会继续保持传控打法，争取走得更远。</p>',
    coverUrl: IMG.training, status: 'PUBLISHED',
    publishedAt: '2026-10-19T11:00:00+08:00', revision: 1, author: '赛事宣传组',
    viewCount: 1260, version: 2, createdAt: '2026-10-19T10:50:00+08:00',
  },
  {
    id: 'content_news_003', contentType: 'NEWS', title: '赛前联席会召开，强调赛风赛纪与安全保障',
    summary: '各参赛队领队、教练员参加会议，组委会就竞赛规程、安全保障、反兴奋剂等事项作说明。',
    bodyHtml:
      '<p>10月17日下午，本届联赛赛前联席会在成都召开。组委会竞赛部负责人就竞赛规程、资格审查、赛风赛纪和安全管理作了详细说明。</p><p>会议强调，各参赛单位要严格落实主体责任，做好运动员健康监测和交通安全保障，共同营造公平、公正、安全的竞赛环境。</p>',
    coverUrl: IMG.crowd, status: 'PUBLISHED',
    publishedAt: '2026-10-17T18:00:00+08:00', revision: 1, author: '组委会',
    viewCount: 860, version: 1, createdAt: '2026-10-17T17:00:00+08:00',
  },
  {
    id: 'content_news_004', contentType: 'NEWS', title: '志愿者招募完成，200名青年志愿者服务赛事',
    summary: '来自成都体育学院等高校的200名志愿者将承担竞赛服务、场地保障、媒体运行等工作。',
    bodyHtml:
      '<p>经过报名、面试和培训，本届联赛共招募志愿者200名。他们将在竞赛组织、场地器材、医疗保障、媒体服务等岗位提供志愿服务。</p><p>志愿者代表表示，将以饱满的热情和专业的态度服务好每一场比赛。</p>',
    coverUrl: IMG.ball, status: 'PUBLISHED',
    publishedAt: '2026-10-16T15:00:00+08:00', revision: 1, author: '志愿者部',
    viewCount: 640, version: 1, createdAt: '2026-10-16T14:00:00+08:00',
  },
  {
    id: 'content_policy_001', contentType: 'POLICY', title: '2026年四川省青少年校园足球联赛竞赛规程',
    summary: '本届联赛竞赛办法、参赛资格、报名要求、录取名次与奖励办法。',
    bodyHtml:
      '<h3>一、竞赛办法</h3><p>小学组、初中组采用分组循环加交叉淘汰赛制；高中组、高校组根据报名情况确定赛制。</p><h3>二、参赛资格</h3><p>参赛运动员须具有四川省正式学籍，且符合相应组别年龄要求。每名运动员只能代表一支球队参加同一组别比赛。</p><h3>三、报名要求</h3><p>各参赛队须在规定时间内通过赛事系统提交报名表、球员名单、学籍证明及盖章扫描件。报名截止后不再受理。</p><h3>四、录取名次</h3><p>各组别录取前八名，颁发奖杯、奖牌和证书。</p>',
    policyDocumentNo: '川教体〔2026〕18号', policyEffectiveFrom: '2026-09-01',
    policyEffectiveTo: '2026-12-31', pinned: true, status: 'PUBLISHED',
    publishedAt: '2026-09-01T09:00:00+08:00', revision: 3, author: '省教育厅体卫艺处',
    viewCount: 5620, version: 4, createdAt: '2026-08-28T10:00:00+08:00',
  },
  {
    id: 'content_policy_002', contentType: 'POLICY', title: '报名材料准备指南（球队端）',
    summary: '盖章报名表、球员身份证件、学籍证明、球员照片等材料的格式和上传要求。',
    bodyHtml:
      '<p>一、报名表：系统生成后打印，加盖学校公章并扫描为 PDF 上传。</p><p>二、学籍证明：由学校教务部门出具，须包含学生姓名、身份证号、学籍号等信息。</p><p>三、球员照片：近期免冠证件照，jpg/png 格式，按身份证号命名，打包为 ZIP 上传。</p><p>四、其他材料：运动员等级证书、获奖证书等按赛事要求上传。</p>',
    policyDocumentNo: '赛事指南〔2026〕03号', policyEffectiveFrom: '2026-09-05',
    policyEffectiveTo: '2026-11-30', status: 'PUBLISHED',
    publishedAt: '2026-09-05T10:00:00+08:00', revision: 2, author: '竞赛部',
    viewCount: 4180, version: 2, createdAt: '2026-09-03T10:00:00+08:00',
  },
  {
    id: 'content_policy_003', contentType: 'POLICY', title: '运动员参赛资格与年龄组别说明',
    summary: '各组别年龄区间、学籍要求、转学与借读运动员参赛规定。',
    bodyHtml:
      '<p>小学组：2013年9月1日至2018年8月31日出生。初中组：2010年9月1日至2013年8月31日出生。高中组：2007年9月1日至2010年8月31日出生。</p><p>转学运动员须提供转学证明，且在原学校未参加本届赛事同一组别比赛。</p>',
    policyDocumentNo: '赛事指南〔2026〕05号', policyEffectiveFrom: '2026-09-10',
    policyEffectiveTo: '2026-11-30', status: 'PUBLISHED',
    publishedAt: '2026-09-10T10:00:00+08:00', revision: 1, author: '资格审查组',
    viewCount: 3050, version: 1, createdAt: '2026-09-10T09:00:00+08:00',
  },
  {
    id: 'content_policy_004', contentType: 'POLICY', title: '赛事安全与医疗保障工作方案',
    summary: '赛场医疗点设置、急救流程、极端天气应对和食品安全要求。',
    bodyHtml:
      '<p>每个比赛场地设置医疗点，配备 AED、急救药品和救护车。比赛期间安排专业医护人员现场值守。</p><p>遇高温、暴雨、雷电等极端天气，由组委会决定暂停或延期比赛。</p>',
    policyDocumentNo: '赛事指南〔2026〕08号', policyEffectiveFrom: '2026-09-15',
    policyEffectiveTo: '2026-12-31', status: 'PUBLISHED',
    publishedAt: '2026-09-15T10:00:00+08:00', revision: 1, author: '安全保障部',
    viewCount: 1980, version: 1, createdAt: '2026-09-15T09:00:00+08:00',
  },
  {
    id: 'content_highlight_001', contentType: 'HIGHLIGHT', title: '精彩瞬间｜揭幕战进球集锦',
    summary: '远射、头球、单刀，揭幕战三粒进球各有精彩。',
    bodyHtml:
      '<p>第 8 分钟，周俊杰禁区外远射破门；第 21 分钟，宜宾人民路小学角球头球扳平；第 42 分钟，张子轩单刀推射锁定上半场比分。</p><p>一起来回顾揭幕战的精彩瞬间。</p>',
    coverUrl: IMG.youth, status: 'PUBLISHED',
    publishedAt: '2026-10-19T12:30:00+08:00', revision: 1, author: '赛事宣传组',
    viewCount: 2210, version: 1, createdAt: '2026-10-19T12:00:00+08:00',
  },
  {
    id: 'content_highlight_002', contentType: 'HIGHLIGHT', title: '精彩瞬间｜大学组第 5 轮：川大 2:2 电子科大',
    summary: '双方四粒进球，比赛最后时刻绝平，现场气氛火爆。',
    bodyHtml:
      '<p>四川大学与电子科技大学的比赛跌宕起伏。电子科大两度领先，川大在补时阶段由 10 号球员头球绝平，最终 2:2 握手言和。</p>',
    coverUrl: IMG.match, status: 'PUBLISHED',
    publishedAt: '2026-10-18T09:00:00+08:00', revision: 1, author: '赛事宣传组',
    viewCount: 1740, version: 1, createdAt: '2026-10-18T08:00:00+08:00',
  },
  {
    id: 'content_lineup_001', contentType: 'BEST_LINEUP', title: '2026小学男子组第 1 轮最佳阵容',
    summary: '门将、后卫、中场、前锋各位置表现最突出的球员。',
    bodyHtml:
      '<p>门将：李明宇（成都市实验小学）；后卫：王浩然、陈嘉豪、刘一鸣；中场：赵天佑、孙泽宇；前锋：周俊杰、张子轩。</p>',
    coverUrl: IMG.team, status: 'PUBLISHED',
    publishedAt: '2026-10-19T20:00:00+08:00', revision: 1, author: '技术分析组',
    viewCount: 980, version: 1, createdAt: '2026-10-19T19:30:00+08:00',
  },
  {
    id: 'content_lineup_002', contentType: 'BEST_LINEUP', title: '2026大学男子组第 5 轮最佳阵容',
    summary: '川大、电子科大、西南交大球员领衔本轮最佳阵容。',
    bodyHtml:
      '<p>门将：许文昊（四川大学）；后卫：邓凯、冯子豪、曾俊熙；中场：彭宇轩、肖景行；前锋：唐子杰、罗嘉瑞。</p>',
    coverUrl: IMG.coach, status: 'PUBLISHED',
    publishedAt: '2026-10-18T20:00:00+08:00', revision: 1, author: '技术分析组',
    viewCount: 760, version: 1, createdAt: '2026-10-18T19:30:00+08:00',
  },
  {
    id: 'content_news_draft', contentType: 'NEWS', title: '赛事第二周赛程预告（草稿）',
    summary: '第二周共安排 24 场比赛，涉及小学组、初中组和大学组。',
    bodyHtml: '<p>待补充具体赛程与场地信息。</p>', status: 'DRAFT',
    revision: 1, author: '竞赛部', viewCount: 0, version: 1,
    createdAt: '2026-10-19T08:00:00+08:00',
  },
]

export const portalResources: PortalResource[] = [
  {
    id: 'res_001', resourceType: 'CAROUSEL', title: '奔跑吧·少年',
    imageUrl: IMG.stadium, targetContentId: 'content_news_001', sortOrder: 1, enabled: true, version: 1,
  },
  {
    id: 'res_002', resourceType: 'CAROUSEL', title: '揭幕战精彩瞬间',
    imageUrl: IMG.match, targetContentId: 'content_highlight_001', sortOrder: 2, enabled: true, version: 1,
  },
  {
    id: 'res_003', resourceType: 'CAROUSEL', title: '大学组焦点战',
    imageUrl: IMG.crowd, targetContentId: 'content_highlight_002', sortOrder: 3, enabled: true, version: 1,
  },
  {
    id: 'res_004', resourceType: 'NEWS_LINK_IMAGE', title: '报名材料准备指南',
    imageUrl: IMG.ball, targetContentId: 'content_policy_002', sortOrder: 1, enabled: true, version: 1,
  },
  {
    id: 'res_005', resourceType: 'PARTNER', title: '四川省学生体育艺术协会',
    targetUrl: 'https://example.com/partner/1', sortOrder: 1, enabled: true, version: 1,
  },
  {
    id: 'res_006', resourceType: 'PARTNER', title: '四川校园足球',
    targetUrl: 'https://example.com/partner/2', sortOrder: 2, enabled: true, version: 1,
  },
  {
    id: 'res_007', resourceType: 'PARTNER', title: '成都体育学院',
    targetUrl: 'https://example.com/partner/3', sortOrder: 3, enabled: false, version: 1,
  },
]

export const publications: Publication[] = [
  { id: 'pub_001', targetType: 'ENROLLMENT', targetId: 'enr_002', targetName: '宜宾人民路小学足球队', teamName: '宜宾人民路小学足球队', eventId: 'event_primary_2026', groupId: 'group_primary_boys', groupName: '小学男子组', cityName: '宜宾市', active: true, publishedAt: '2026-10-11T12:00:00+08:00', version: 1 },
  { id: 'pub_002', targetType: 'ENROLLMENT', targetId: 'enr_007', targetName: '四川大学男子足球队', teamName: '四川大学男子足球队', eventId: 'event_university_2026', groupId: 'group_university_men', groupName: '大学男子组', cityName: '成都市', active: true, publishedAt: '2026-09-30T15:00:00+08:00', version: 1 },
  { id: 'pub_003', targetType: 'ATHLETE', targetId: 'person_team_cd_syxx_001', targetName: '张子轩', teamName: '成都市实验小学', groupName: '小学男子组', cityName: '成都市', active: true, publishedAt: '2026-10-12T09:00:00+08:00', version: 1 },
  { id: 'pub_004', targetType: 'ATHLETE', targetId: 'person_team_my_ns_009', targetName: '郑博文', teamName: '绵阳南山中学', groupName: '初中男子组', cityName: '绵阳市', active: true, publishedAt: '2026-10-10T10:00:00+08:00', version: 1 },
  { id: 'pub_005', targetType: 'ATHLETE', targetId: 'person_team_scu_008', targetName: '周俊杰', teamName: '四川大学', groupName: '大学男子组', cityName: '成都市', active: true, publishedAt: '2026-10-09T10:00:00+08:00', version: 1 },
  { id: 'pub_006', targetType: 'COACH', targetId: 'person_coach_001', targetName: '李建国', teamName: '成都市实验小学', groupName: '小学男子组', cityName: '成都市', active: true, publishedAt: '2026-10-08T10:00:00+08:00', version: 1 },
  { id: 'pub_007', targetType: 'COACH', targetId: 'person_coach_002', targetName: '王志强', teamName: '成都七中育才学校', groupName: '初中男子组', cityName: '成都市', active: true, publishedAt: '2026-10-07T10:00:00+08:00', version: 1 },
  { id: 'pub_008', targetType: 'ATHLETE', targetId: 'person_team_cd_syxx_003', targetName: '王浩然', teamName: '成都市实验小学', groupName: '小学男子组', cityName: '成都市', active: false, publishedAt: '2026-10-01T10:00:00+08:00', cancelledAt: '2026-10-06T10:00:00+08:00', version: 2 },
  { id: 'pub_009', targetType: 'ENROLLMENT', targetId: 'enr_005', targetName: '绵阳南山中学足球队', teamName: '绵阳南山中学足球队', eventId: 'event_middle_2026', groupId: 'group_middle_junior', groupName: '初中男子组', cityName: '绵阳市', active: true, publishedAt: '2026-10-15T11:00:00+08:00', version: 1 },
  { id: 'pub_010', targetType: 'ATHLETE', targetId: 'person_team_lz_sy_004', targetName: '刘语嫣', teamName: '泸州实验小学', groupName: '小学女子组', cityName: '泸州市', active: true, publishedAt: '2026-10-13T10:00:00+08:00', version: 1 },
]

export const selectionRules: SelectionRule[] = [
  {
    id: 'rule_primary_pre_2026', eventId: 'event_primary_2026', eventName: events[0].name,
    groupId: 'group_primary_boys', groupName: '小学男子组', round: 'PRELIMINARY',
    dimensions: [
      { key: 'skill', label: '技术能力', maxScore: 100, weight: 0.4 },
      { key: 'fitness', label: '体能素质', maxScore: 100, weight: 0.3 },
      { key: 'awareness', label: '比赛意识', maxScore: 100, weight: 0.2 },
      { key: 'attitude', label: '训练态度', maxScore: 100, weight: 0.1 },
    ],
    topN: 8, tiePolicy: 'KEEP_TIES', confirmed: true, version: 2,
  },
  {
    id: 'rule_middle_pre_2026', eventId: 'event_middle_2026', eventName: events[1].name,
    groupId: 'group_middle_junior', groupName: '初中男子组', round: 'PRELIMINARY',
    dimensions: [
      { key: 'skill', label: '技术能力', maxScore: 100, weight: 0.4 },
      { key: 'fitness', label: '体能素质', maxScore: 100, weight: 0.3 },
      { key: 'awareness', label: '战术意识', maxScore: 100, weight: 0.2 },
      { key: 'attitude', label: '比赛作风', maxScore: 100, weight: 0.1 },
    ],
    topN: 10, tiePolicy: 'KEEP_TIES', confirmed: true, version: 1,
  },
  {
    id: 'rule_university_pre_2026', eventId: 'event_university_2026', eventName: events[2].name,
    groupId: 'group_university_men', groupName: '大学男子组', round: 'PRELIMINARY',
    dimensions: [
      { key: 'skill', label: '技术能力', maxScore: 100, weight: 0.35 },
      { key: 'fitness', label: '体能素质', maxScore: 100, weight: 0.25 },
      { key: 'awareness', label: '战术意识', maxScore: 100, weight: 0.25 },
      { key: 'attitude', label: '比赛作风', maxScore: 100, weight: 0.15 },
    ],
    topN: 10, tiePolicy: 'KEEP_TIES', confirmed: true, version: 1,
  },
]

function buildScores(rule: SelectionRule, teamIds: string[], start: number): SelectionScore[] {
  const result: SelectionScore[] = []
  const members = teamMembers.filter((m) => teamIds.includes(m.teamId)).slice(0, 14)
  members.forEach((m, i) => {
    const base = 78 + ((i * 7 + start) % 18)
    const dimensionScores = rule.dimensions.map((d, di) => ({
      key: d.key,
      label: d.label,
      value: Math.min(d.maxScore, base + ((di * 3 + i) % 7)),
      maxScore: d.maxScore,
    }))
    const total = rule.dimensions.reduce((sum, d, di) => {
      const v = dimensionScores[di].value
      return sum + (v / d.maxScore) * 100 * d.weight
    }, 0)
    result.push({
      id: `score_${rule.id}_${i + 1}`,
      ruleId: rule.id,
      athleteId: m.athleteId,
      athleteName: m.athleteName,
      teamName: teams.find((t) => t.id === m.teamId)?.name || '',
      groupName: rule.groupName,
      round: rule.round,
      dimensionScores,
      remark: i % 4 === 0 ? '联赛表现稳定，具备较好发展潜力。' : '',
      totalScore: Math.round(total * 100) / 100,
      scoreRevision: 12,
      operatorName: '系统管理员',
      version: 1,
      createdAt: '2026-10-16T10:00:00+08:00',
    })
  })
  return result
}

export const selectionScores: SelectionScore[] = [
  ...buildScores(selectionRules[0], ['team_cd_syxx', 'team_yb_rml', 'team_lz_sy'], 3),
  ...buildScores(selectionRules[1], ['team_cd_qz', 'team_my_ns', 'team_dy_wz'], 5),
  ...buildScores(selectionRules[2], ['team_scu', 'team_uestc', 'team_swjtu'], 7),
]

export const identityChecks: IdentityCheck[] = [
  {
    id: 'idc_001', matchId: 'match_001', matchLabel: '成都市实验小学 vs 宜宾人民路小学',
    enrollmentId: 'enr_001', athleteId: 'person_team_cd_syxx_001', athleteName: '张子轩',
    teamName: '成都市实验小学', mode: 'FACE_COMPARE', machineStatus: 'MATCH',
    machineVerified: true, manualStatus: 'NOT_REVIEWED', capturedPhotoUrl: '',
    version: 1, createdAt: '2026-10-19T09:40:00+08:00',
  },
  {
    id: 'idc_002', matchId: 'match_001', matchLabel: '成都市实验小学 vs 宜宾人民路小学',
    enrollmentId: 'enr_001', athleteId: 'person_team_cd_syxx_003', athleteName: '王浩然',
    teamName: '成都市实验小学', mode: 'FACE_COMPARE', machineStatus: 'MISMATCH',
    machineVerified: false, manualStatus: 'PENDING', capturedPhotoUrl: '',
    version: 2, createdAt: '2026-10-19T09:42:00+08:00',
  },
  {
    id: 'idc_003', matchId: 'match_001', matchLabel: '成都市实验小学 vs 宜宾人民路小学',
    enrollmentId: 'enr_001', athleteId: 'person_team_cd_syxx_005', athleteName: '刘一鸣',
    teamName: '成都市实验小学', mode: 'MANUAL', machineStatus: 'NOT_RUN',
    machineVerified: false, manualStatus: 'CONFIRMED', manualReason: '现场拍照与本人一致，人工确认通过。',
    capturedPhotoUrl: '', reviewerName: '王超', reviewedAt: '2026-10-19T09:50:00+08:00',
    version: 3, createdAt: '2026-10-19T09:45:00+08:00',
  },
  {
    id: 'idc_004', matchId: 'match_004', matchLabel: '成都七中育才 vs 绵阳南山中学',
    enrollmentId: 'enr_004', athleteId: 'person_team_cd_qz_002', athleteName: '李明宇',
    teamName: '成都七中育才学校', mode: 'FACE_COMPARE', machineStatus: 'UNAVAILABLE',
    machineVerified: false, manualStatus: 'PENDING', capturedPhotoUrl: '',
    version: 1, createdAt: '2026-10-18T13:35:00+08:00',
  },
]

export const messages: Message[] = [
  {
    id: 'msg_001', title: '报名审核通过', body: '您报送的「成都市实验小学足球队·小学男子组」报名已通过省级终审。',
    businessType: 'ENROLLMENT', businessId: 'enr_001', read: false, version: 1,
    createdAt: '2026-10-18T09:00:00+08:00',
  },
  {
    id: 'msg_002', title: '材料补充提醒', body: '您提交的报名缺少加盖学校公章的报名表扫描件，请在报名截止前补充。',
    businessType: 'MATERIAL', businessId: 'enr_004', read: false, version: 1,
    createdAt: '2026-10-17T14:20:00+08:00',
  },
  {
    id: 'msg_003', title: '赛事日程更新', body: '小学男子组第 2 轮比赛时间调整为 10 月 21 日 10:00，请留意最新赛程。',
    businessType: 'MATCH', businessId: 'match_002', read: true, readAt: '2026-10-16T10:00:00+08:00',
    version: 1, createdAt: '2026-10-16T08:30:00+08:00',
  },
  {
    id: 'msg_004', title: '公示已发布', body: '「张子轩」的运动员报名信息已在门户公示，公示期间如有异议请联系组委会。',
    businessType: 'PUBLICATION', businessId: 'pub_003', read: true, readAt: '2026-10-13T09:00:00+08:00',
    version: 1, createdAt: '2026-10-12T09:00:00+08:00',
  },
  {
    id: 'msg_005', title: '报名被退回，请补充材料', body: '「绵阳南山中学·高中男子组」报名单缺少近三个月体检证明，请在被退回后 3 日内补交并重新提交。',
    businessType: 'REVIEW', businessId: 'enr_004', read: false, version: 1,
    createdAt: '2026-10-18T16:40:00+08:00',
  },
  {
    id: 'msg_006', title: '报名审核通过', body: '您负责的「成都市第七中学·高中男子组」报名已通过市级初审，等待省级终审。',
    businessType: 'ENROLLMENT', businessId: 'enr_002', read: true, readAt: '2026-10-17T11:10:00+08:00',
    version: 1, createdAt: '2026-10-16T18:20:00+08:00',
  },
  {
    id: 'msg_007', title: '比赛场地变更', body: '原定于成都体育学院进行的「成都市实验小学 vs 绵阳市实验小学」调整至高新区足球公园 2 号场，开球时间不变。',
    businessType: 'MATCH', businessId: 'match_001', read: false, version: 1,
    createdAt: '2026-10-18T08:15:00+08:00',
  },
  {
    id: 'msg_008', title: '公示期即将结束', body: '「2026 年省级最佳阵容遴选名单」公示将于 10 月 22 日 18:00 结束，如无异议将进入正式发布。',
    businessType: 'PUBLICATION', businessId: 'pub_003', read: false, version: 1,
    createdAt: '2026-10-19T09:05:00+08:00',
  },
  {
    id: 'msg_009', title: '系统维护通知', body: '平台将于 10 月 21 日 00:00-02:00 进行数据库维护，期间报名提交与审核功能暂停使用。',
    businessType: 'SYSTEM', read: true, readAt: '2026-10-15T10:00:00+08:00',
    version: 1, createdAt: '2026-10-14T17:00:00+08:00',
  },
  {
    id: 'msg_010', title: '待完成身份核验', body: '「成都市实验小学 vs 绵阳市实验小学」有 2 名球员尚未完成人脸比对，请在开赛前 30 分钟处理。',
    businessType: 'IDENTITY', businessId: 'match_001', read: false, version: 1,
    createdAt: '2026-10-19T08:30:00+08:00',
  },
  {
    id: 'msg_011', title: '遴选评分汇总完成', body: '2026 年省级最佳阵容遴选评分已汇总，可前往排名汇总查看各位置候选人与专家评分明细。',
    businessType: 'SELECTION', businessId: 'sel_001', read: true, readAt: '2026-10-11T15:20:00+08:00',
    version: 1, createdAt: '2026-10-10T16:00:00+08:00',
  },
]

export const auditLogs: AuditLog[] = [
  {
    id: 'log_001', logType: 'LOGIN', operatorAccountId: 'acc_admin_01', operatorName: '系统管理员',
    action: '登录', outcome: 'SUCCESS', summary: '账号 admin 登录成功', version: 1,
    createdAt: '2026-10-19T08:30:00+08:00',
  },
  {
    id: 'log_002', logType: 'ENROLLMENT', operatorAccountId: 'acc_team_01', operatorName: '成都市实验小学·管理员',
    action: '提交报名', objectType: 'ENROLLMENT', objectId: 'enr_001', outcome: 'SUCCESS',
    summary: '提交报名单 enr_001，批次 1', version: 1, createdAt: '2026-10-08T10:30:00+08:00',
  },
  {
    id: 'log_003', logType: 'OPERATION', operatorAccountId: 'acc_prov_01', operatorName: '省教育厅·终审员',
    action: '审核通过', objectType: 'ENROLLMENT', objectId: 'enr_002', outcome: 'SUCCESS',
    summary: '省级终审通过 enr_002', version: 1, createdAt: '2026-10-11T11:00:00+08:00',
  },
  {
    id: 'log_004', logType: 'OPERATION', operatorAccountId: 'acc_city_01', operatorName: '成都市教育局·审核员',
    action: '审核驳回', objectType: 'ENROLLMENT', objectId: 'enr_004', outcome: 'SUCCESS',
    summary: '驳回 enr_004：缺少盖章报名表', version: 1, createdAt: '2026-10-13T16:20:00+08:00',
  },
  {
    id: 'log_005', logType: 'OPERATION', operatorAccountId: 'acc_admin_01', operatorName: '系统管理员',
    action: '发布内容', objectType: 'CONTENT', objectId: 'content_news_001', outcome: 'SUCCESS',
    summary: '发布新闻：2026年四川省青少年校园足球联赛正式开幕', version: 1,
    createdAt: '2026-10-18T12:00:00+08:00',
  },
  {
    id: 'log_006', logType: 'LOGIN', operatorAccountId: 'acc_team_qz', operatorName: '成都七中育才·管理员',
    action: '登录', outcome: 'FAILURE', summary: '账号已停用，登录失败', version: 1,
    createdAt: '2026-10-18T10:05:00+08:00',
  },
  {
    id: 'log_007', logType: 'ENROLLMENT', operatorAccountId: 'acc_team_01', operatorName: '成都市实验小学·管理员',
    action: '修改名单', objectType: 'ENROLLMENT', objectId: 'enr_001', outcome: 'SUCCESS',
    summary: '新增球员 2 名，删除球员 0 名', version: 1, createdAt: '2026-10-07T15:00:00+08:00',
  },
  {
    id: 'log_008', logType: 'OPERATION', operatorAccountId: 'acc_admin_01', operatorName: '系统管理员',
    action: '生成遴选结果', objectType: 'SELECTION_RESULT', objectId: 'result_primary_pre', outcome: 'SUCCESS',
    summary: '生成小学男子组初选最佳球员结果', version: 1, createdAt: '2026-10-17T09:30:00+08:00',
  },
]

export const materials: Material[] = [
  { id: 'mat_001', ownerType: 'PERSON', ownerId: 'person_ath_001', ownerName: '张子轩', materialType: 'STUDENT_STATUS', materialLabel: '学籍证明', title: '2026学年学籍证明', description: '成都市实验小学教务处出具', fileName: '学籍证明-张子轩.pdf', reviewStatus: 'APPROVED', version: 1, createdAt: '2026-09-20T10:00:00+08:00' },
  { id: 'mat_002', ownerType: 'PERSON', ownerId: 'person_ath_001', ownerName: '张子轩', materialType: 'ATHLETE_CERTIFICATE', materialLabel: '运动员证书', title: '足球项目三级运动员证书', description: '', fileName: '运动员证书-张子轩.pdf', reviewStatus: 'APPROVED', version: 1, createdAt: '2026-09-20T10:05:00+08:00' },
  { id: 'mat_003', ownerType: 'PERSON', ownerId: 'person_ath_001', ownerName: '张子轩', materialType: 'AWARD', materialLabel: '获奖证书', title: '2025年成都市校园足球联赛最佳射手', description: '市级比赛荣誉', fileName: '获奖证书-最佳射手.pdf', reviewStatus: 'PENDING', version: 1, createdAt: '2026-10-01T10:00:00+08:00' },
  { id: 'mat_004', ownerType: 'PERSON', ownerId: 'person_ath_001', ownerName: '张子轩', materialType: 'COMPETITION', materialLabel: '参赛经历', title: '2024-2026 参赛经历', description: '代表学校参加市级、区级联赛共 28 场', fileName: '', reviewStatus: 'APPROVED', version: 1, createdAt: '2026-09-22T10:00:00+08:00' },
  { id: 'mat_005', ownerType: 'PERSON', ownerId: 'person_coach_001', ownerName: '李建国', materialType: 'TEACHER_LICENSE', materialLabel: '教师资格证', title: '小学体育教师资格证', description: '', fileName: '教师资格证-李建国.pdf', reviewStatus: 'APPROVED', version: 1, createdAt: '2026-09-10T10:00:00+08:00' },
  { id: 'mat_006', ownerType: 'PERSON', ownerId: 'person_coach_001', ownerName: '李建国', materialType: 'COACH_LICENSE', materialLabel: '教练员证书', title: '亚足联 C 级教练员证书', description: '', fileName: '亚足联C级证书.pdf', reviewStatus: 'APPROVED', version: 1, createdAt: '2026-09-10T10:05:00+08:00' },
  { id: 'mat_007', ownerType: 'PERSON', ownerId: 'person_coach_001', ownerName: '李建国', materialType: 'COACHING_RECORD', materialLabel: '执教记录', title: '2018-2026 执教记录', description: '执教成都市实验小学足球队，获市级冠军 3 次', fileName: '', reviewStatus: 'PENDING', version: 1, createdAt: '2026-09-28T10:00:00+08:00' },
  { id: 'mat_008', ownerType: 'TEAM', ownerId: 'team_cd_syxx', ownerName: '成都市实验小学足球队', materialType: 'TRAINING_PLAN', materialLabel: '训练计划', title: '2026 秋季学期训练计划', description: '', fileName: '训练计划-2026秋季.pdf', reviewStatus: 'APPROVED', version: 1, createdAt: '2026-09-05T10:00:00+08:00' },
  { id: 'mat_009', ownerType: 'TEAM', ownerId: 'team_cd_syxx', ownerName: '成都市实验小学足球队', materialType: 'TEAM_HONOR', materialLabel: '球队荣誉', title: '2025年成都市校园足球联赛冠军', description: '', fileName: '冠军证书.pdf', reviewStatus: 'APPROVED', version: 1, createdAt: '2026-09-05T10:05:00+08:00' },
  { id: 'mat_010', ownerType: 'PERSON', ownerId: 'person_team_my_ns_004', ownerName: '陈嘉豪', materialType: 'STUDENT_STATUS', materialLabel: '学籍证明', title: '2026学年学籍证明', fileName: '学籍证明.pdf', reviewStatus: 'REJECTED', reviewReason: '学籍证明缺少学校公章，请重新上传。', version: 1, createdAt: '2026-10-02T10:00:00+08:00' },
]

export const affiliations: MyAffiliation[] = [
  { id: 'aff_001', personId: 'person_ath_001', teamId: 'team_cd_syxx', teamName: '成都市实验小学足球队', relation: '运动员', startDate: '2024-09-01', current: true, verifyStatus: 'VERIFIED', version: 1 },
  { id: 'aff_002', personId: 'person_ath_001', teamId: 'team_lz_sy', teamName: '泸州实验小学足球队', relation: '运动员', startDate: '2022-09-01', endDate: '2024-06-30', current: false, verifyStatus: 'VERIFIED', version: 1 },
  { id: 'aff_003', personId: 'person_coach_001', teamId: 'team_cd_syxx', teamName: '成都市实验小学足球队', relation: '主教练', startDate: '2018-09-01', current: true, verifyStatus: 'VERIFIED', version: 1 },
]

export const orgOptions = organizations
  .filter((o) => o.orgType === 'CITY' || o.orgType === 'UNIVERSITY' || o.orgType === 'SCHOOL')
  .map((o) => ({ value: o.id, label: o.name }))

export { IMG }
