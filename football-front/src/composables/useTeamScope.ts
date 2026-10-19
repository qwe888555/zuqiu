import { ref } from 'vue'
import { meApi, teamApi } from '../api'
import type { Team } from '../api/types'
import { useAuthStore } from '../stores/auth'

/**
 * 统一加载当前账号可管理的球队。
 * 球队/高校账号只返回本人所属球队，管理员可切换全部球队。
 */
export function useTeamScope() {
  const auth = useAuthStore()
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
        const mine = await meApi.teams()
        teams.value = mine.length ? mine : (await teamApi.list({ page: 1, pageSize: 200 })).items
      }
      if (forceId) teamId.value = forceId
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
