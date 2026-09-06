<script setup lang="ts">
const { catalog } = useCatalog()
const census = computed(() => catalog.value?.census ?? null)
</script>

<template>
  <p v-if="census" class="text-xs leading-5 text-muted" data-testid="census">
    <span class="font-medium text-highlighted">{{ census.total }}</span> cards in the house:
    {{ census.physical }} physical,
    {{ census.unique }} unique,
    {{ census.duplicateCopies }} copies wasting {{ formatBytes(census.duplicateBytes) }},
    {{ census.references }} references,
    {{ census.broken }} broken,
    {{ formatTokens(census.tokenEstimate) }} across the physical cards.
  </p>
  <p v-else class="text-xs text-muted">Counting the house…</p>
</template>
