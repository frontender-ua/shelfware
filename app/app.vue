<script setup lang="ts">
const { refresh } = useCatalog()

onMounted(() => {
  refresh()
})
</script>

<template>
  <UApp>
    <UDashboardGroup>
      <UDashboardSidebar id="drawers" resizable collapsible :default-size="18" :min-size="14" :max-size="30">
        <template #header>
          <span class="font-semibold tracking-tight">shelfware</span>
          <UColorModeButton class="ms-auto" />
        </template>
        <DrawerRail />
      </UDashboardSidebar>

      <UDashboardPanel id="tray" resizable :default-size="34" :min-size="24" :max-size="50">
        <template #body>
          <p class="text-sm text-muted">The tray arrives in Task 5.</p>
        </template>
      </UDashboardPanel>

      <UDashboardPanel id="reader">
        <template #body>
          <NuxtPage />
        </template>
      </UDashboardPanel>
    </UDashboardGroup>
  </UApp>
</template>
