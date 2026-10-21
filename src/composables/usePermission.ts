import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import {
  PERMISSION_GROUPS,
  ROLE_PERMISSIONS,
  hasPermission,
  type PermissionCode,
} from '../config/permissions'

/**
 * 按钮级权限判断。ADMIN 默认拥有全部权限（hasPermission 内统一处理），
 * 页面级权限请继续使用路由 meta.roles。
 */
export function usePermission() {
  const auth = useAuthStore()

  function can(permission: PermissionCode | readonly PermissionCode[]): boolean {
    const list: readonly PermissionCode[] = Array.isArray(permission)
      ? (permission as readonly PermissionCode[])
      : [permission as PermissionCode]
    return list.some((item) => hasPermission(auth.roles, item))
  }

  function canAll(permissions: readonly PermissionCode[]): boolean {
    return permissions.every((item) => hasPermission(auth.roles, item))
  }

  const permissionCodes = computed<PermissionCode[]>(() => {
    const codes = new Set<PermissionCode>()
    auth.roles.forEach((role) => {
      ROLE_PERMISSIONS[role]?.forEach((code) => codes.add(code))
    })
    return [...codes]
  })

  const permissionCount = computed(() => permissionCodes.value.length)
  const permissionTotal = computed(() =>
    PERMISSION_GROUPS.reduce((sum, group) => sum + group.permissions.length, 0),
  )
  const permissionGroups = computed(() =>
    PERMISSION_GROUPS.map((group) => ({
      ...group,
      granted: group.permissions.filter((permission) => can(permission.code)).length,
    })),
  )

  return { can, canAll, permissionCodes, permissionCount, permissionTotal, permissionGroups }
}
