<script setup lang="ts">
const { scopes, scopeId, scopeCounts, setScope, heldCount } = useCatalog()

const drawers = computed(() => scopes.value.filter(s => s.id !== 'quarantine'))
const allCount = computed(() => [...scopeCounts.value.values()].reduce((sum, n) => sum + n, 0))

function variantFor(id: string) {
  return scopeId.value === id ? 'soft' : 'ghost'
}
</script>

<template>
  <nav class="flex flex-col gap-1" aria-label="Drawers">
    <UButton block color="neutral" :variant="variantFor('all')" :aria-current="scopeId === 'all' ? 'page' : undefined" class="justify-between" @click="setScope('all')">
      <span>All drawers</span>
      <span class="tabular-nums text-muted">{{ allCount }}</span>
    </UButton>
    <UButton
      v-for="scope in drawers"
      :key="scope.id"
      block
      color="neutral"
      :variant="variantFor(scope.id)"
      :aria-current="scopeId === scope.id ? 'page' : undefined"
      :title="scope.label"
      class="justify-between"
      @click="setScope(scope.id)"
    >
      <span class="truncate font-mono text-xs">{{ scope.label }}</span>
      <span class="tabular-nums text-muted">{{ scopeCounts.get(scope.id) ?? 0 }}</span>
    </UButton>
  </nav>

  <CensusNote class="mt-4" />

  <div class="mt-auto border-t border-default pt-3">
    <UButton block color="neutral" :variant="variantFor('quarantine')" :aria-current="scopeId === 'quarantine' ? 'page' : undefined" class="justify-between" @click="setScope('quarantine')">
      <span>Quarantine</span>
      <span class="tabular-nums text-muted">{{ heldCount }}</span>
    </UButton>
  </div>
</template>
