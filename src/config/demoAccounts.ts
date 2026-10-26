import type { Account } from '../api/types'

/** 仅 Mock 演示模式使用；正式联调时登录弹窗不会展示这组账号。 */
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
    displayName: '成都市实验小学·球队管理员',
    orgId: 'org_school_cd_syxx',
    orgName: '成都市实验小学',
    teamIds: ['team_cd_syxx'],
    description: '球队端：维护所属球队、名单与材料，查看学校提交的报名进度',
  },
  {
    username: 'school',
    password: '12345678',
    accountId: 'acc_school_01',
    role: 'UNIVERSITY',
    displayName: '成都七中育才学校·学校管理员',
    orgId: 'org_school_cd_qz',
    orgName: '成都七中育才学校',
    teamIds: ['team_cd_qz', 'team_cd_qz_g', 'team_cd_qz_b'],
    description: '学校端：以学校为报送主体，统筹本校及校区球队完成报名',
  },
  {
    username: 'city',
    password: '12345678',
    accountId: 'acc_city_01',
    role: 'CITY',
    displayName: '成都市教育局·审核员',
    orgId: 'org_city_cd',
    orgName: '成都市教育局',
    description: '市州端：本市学校报名初审、统计与导出',
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
