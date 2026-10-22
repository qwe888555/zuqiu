import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { meApi, teamApi } from '../api'
import type { Team } from '../api/types'
import { useAuthStore } from '../stores/auth'

/**
 * 统一加载当前账号可管理的球队。
 * 学校端返回本校全部球队，球队端只返回所属球队，管理员可切换全部球队。
 */
export function useTeamScope() {
  const auth = useAuthStore()
  const route = useRoute()
  const teams = ref<Team[]>([])
  const teamId = ref('')
  const loading = ref(false)

  async function loadTeams(forceId?: string) {
    loading.value = true
    try {
      if (auth.isAdmin) {
        const res = await teamApi.list({ page: 1, pageSize: 200 })
        teams.value = res.items
      } else {
        // 学校端返回本校全部球队，球队端只返回所属球队；没有返回时不能退化为全量球队。
        teams.value = await meApi.teams()
      }
      // 从学校端球队列表进入时，通过 query 指定要维护的球队。
      const requestedId = typeof route.query.teamId === 'string' ? route.query.teamId : ''
      if (forceId) teamId.value = forceId
      else if (requestedId && teams.value.some((team) => team.id === requestedId)) {
        teamId.value = requestedId
      }
      if (!teamId.value || !teams.value.some((team) => team.id === teamId.value)) {
        teamId.value = teams.value[0]?.id || ''
      }
    } catch {
      teams.value = []
    } finally {
      loading.value = false
    }
    return teamId.value
  }

  return { auth, teams, teamId, loading, loadTeams }
}
