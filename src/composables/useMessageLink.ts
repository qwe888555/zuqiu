import { useAuthStore } from '../stores/auth'
import type { Message, RoleCode } from '../api/types'

export interface MessageLink {
  label: string
  path: string
}

const ENROLLMENT_ROLES: RoleCode[] = ['TEAM', 'UNIVERSITY', 'CITY', 'PROVINCE_REVIEWER', 'ADMIN']
const REVIEW_ROLES: RoleCode[] = ['CITY', 'PROVINCE_REVIEWER', 'ADMIN']
const MATCH_VIEW_ROLES: RoleCode[] = ['TEAM', 'UNIVERSITY', 'CITY', 'PROVINCE_REVIEWER', 'ADMIN', 'MATCH_RECORDER']
const RECORDER_ROLES: RoleCode[] = ['ADMIN', 'PROVINCE_REVIEWER', 'MATCH_RECORDER']
const PUBLICATION_ROLES: RoleCode[] = ['ADMIN', 'PROVINCE_REVIEWER']

/**
 * 把消息的业务类型转换为当前角色可访问的深链。
 * 路由守卫会按 meta.roles 拦截，因此这里必须先做角色判断，
 * 避免收件箱把用户带到 403 页面。
 */
export function useMessageLink() {
  const auth = useAuthStore()

  function linkFor(message: Message): MessageLink | null {
    const type = (message.businessType || 'SYSTEM').toUpperCase()
    const id = message.businessId || ''

    switch (type) {
      case 'ENROLLMENT':
        if (id && auth.hasRole(ENROLLMENT_ROLES)) {
          return { label: '查看报名单', path: `/console/enrollments/${id}` }
        }
        if (auth.hasRole(['TEAM', 'UNIVERSITY', 'CITY', 'ADMIN'])) {
          return { label: '前往报名单', path: '/console/enrollments' }
        }
        return null

      case 'REVIEW':
        if (id && auth.hasRole(ENROLLMENT_ROLES)) {
          return { label: '查看审核结果', path: `/console/enrollments/${id}` }
        }
        if (auth.hasRole(REVIEW_ROLES)) {
          return { label: '前往审核工作台', path: '/console/review' }
        }
        return null

      case 'MATERIAL':
        if (id && auth.hasRole(ENROLLMENT_ROLES)) {
          return { label: '补充材料', path: `/console/enrollments/${id}` }
        }
        if (auth.hasRole(['TEAM', 'UNIVERSITY'])) {
          return { label: '前往球队材料', path: '/console/team/profile?tab=materials' }
        }
        if (auth.hasRole(['ATHLETE', 'COACH'])) {
          return { label: '前往履历材料', path: '/console/materials' }
        }
        return null

      case 'MATCH':
        if (id && auth.hasRole(RECORDER_ROLES)) {
          return { label: '进入比赛记录台', path: `/console/matches/${id}/console` }
        }
        if (auth.hasRole(MATCH_VIEW_ROLES)) {
          return { label: '查看新赛程', path: '/console/matches' }
        }
        if (id) return { label: '查看比赛详情', path: `/matches/${id}` }
        return { label: '前往赛程与比分', path: '/matches' }

      case 'PUBLICATION':
        if (auth.hasRole(PUBLICATION_ROLES)) {
          return { label: '查看公示', path: '/console/publications' }
        }
        if (auth.hasRole(['ATHLETE', 'COACH'])) {
          return { label: '查看我的公示', path: '/console/my-publications' }
        }
        return { label: '查看公示', path: '/publications' }

      case 'IDENTITY':
        if (auth.hasRole(RECORDER_ROLES)) {
          return { label: '前往身份核验', path: '/console/identity' }
        }
        return null

      case 'SELECTION':
        if (auth.hasRole(['ADMIN'])) {
          return { label: '查看遴选结果', path: '/console/selection/results' }
        }
        return null

      default:
        return null
    }
  }

  return { linkFor }
}
