import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const mobileMenuOpen = ref(false)
  const unreadCount = ref(0)

  function toggleSidebar() {
    if (window.innerWidth < 992) {
      mobileMenuOpen.value = !mobileMenuOpen.value
    } else {
      sidebarCollapsed.value = !sidebarCollapsed.value
    }
  }

  return { sidebarCollapsed, mobileMenuOpen, unreadCount, toggleSidebar }
})
