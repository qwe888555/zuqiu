import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { isUnauthenticated, useAuthStore } from '../stores/auth'
import { canEnroll, canOpenEnrollment, homeForRoles, workspaceLabelForRoles } from '../utils/roles'
import { openLoginDialog } from './useLoginDialog'

/**
 * 门户与页脚共用的工作台 / 报名入口。
 * 统一处理未登录、登录态未恢复和无报名权限三种情况，避免各页面行为不一致。
 */
export function useConsoleEntry() {
  const auth = useAuthStore()
  const router = useRouter()

  const loggedIn = computed(() => Boolean(auth.token))
  const enrollable = computed(() => Boolean(auth.token) && canEnroll(auth.roles))
  const consoleLabel = computed(() =>
    auth.user ? `进入${workspaceLabelForRoles(auth.roles)}` : '登录',
  )

  async function goConsole() {
    if (!auth.token) {
      openLoginDialog()
      return
    }
    if (!auth.user) {
      try {
        await auth.fetchMe()
      } catch (error) {
        if (isUnauthenticated(error)) auth.clear()
        openLoginDialog()
        return
      }
    }
    router.push(homeForRoles(auth.roles))
  }

  function startEnrollment() {
    if (!auth.token) {
      openLoginDialog({ redirect: '/console/enrollments/create', intent: 'enroll' })
      return
    }
    if (canEnroll(auth.roles)) {
      router.push('/console/enrollments/create')
      return
    }
    // 已登录的球队/市州/管理员进入只读报名列表，不重复弹登录框。
    if (canOpenEnrollment(auth.roles)) {
      ElMessage.info('报名由学校端统一提交，当前仅可查看权限范围内的报名进度')
      router.push('/console/enrollments')
      return
    }
    ElMessage.info('报名由学校端统一提交，请使用学校账号')
    openLoginDialog({ redirect: '/console/enrollments/create', intent: 'enroll' })
  }

  return { loggedIn, enrollable, consoleLabel, goConsole, startEnrollment }
}
