<script setup lang="ts">
import { FORM_OPTIONS, INVOCATION_OPTIONS, RISK_OPTIONS } from '~/utils/search'

const catalog = useCatalog()
const { query, filters, visible, inQuarantine, markedOnShelf, loading, error, selectedId } = catalog
const slipState = useSlip()
const readerTab = useReaderTab()
const { openSlip } = slipState

const searchRef = ref<{ inputRef: HTMLInputElement | null } | null>(null)

const allMarked = computed(() => visible.value.length > 0 && markedOnShelf.value.length === visible.value.length)
const someMarked = computed(() => markedOnShelf.value.length > 0 && !allMarked.value)
const markAll = computed<boolean | 'indeterminate'>({
  get: () => (allMarked.value ? true : someMarked.value ? 'indeterminate' : false),
  set: (value) => {
    if (value === true) catalog.markVisible()
    else catalog.clearMarks()
  },
})

/** Spec §11.7: the actions apply to the marked cards, or to the selected card when nothing is marked. */
const targetIds = computed(() => {
  if (markedOnShelf.value.length) return markedOnShelf.value
  return selectedId.value ? [selectedId.value] : []
})

const emptyText = computed(() => {
  if (inQuarantine.value && !query.value) return 'The quarantine shelf is empty.'
  return `No cards in this drawer${query.value ? ' match the search.' : '.'}`
})

function focusSearch(): void {
  searchRef.value?.inputRef?.focus()
}

defineExpose({ focusSearch })

useShelfKeys({
  visibleIds: catalog.visibleIds,
  selectedId: catalog.selectedId,
  inQuarantine: catalog.inQuarantine,
  slipOpen: slipState.open,
  select: (id) => {
    catalog.select(id)
  },
  toggleMark: id => catalog.toggleMark(id),
  openSlip: mode => slipState.openSlip(mode, targetIds.value),
  closeSlip: slipState.closeSlip,
  focusSearch,
  openEditor: () => {
    readerTab.value = 'edit'
  },
})
</script>

<template>
  <UDashboardPanel id="tray" resizable :default-size="34" :min-size="24" :max-size="50">
    <template #header>
      <div class="flex flex-col gap-2 border-b border-default p-3">
        <UInput
          ref="searchRef"
          v-model="query"
          name="search"
          placeholder="Find a card"
          icon="i-lucide-search"
          class="w-full"
        >
          <template #trailing>
            <UKbd value="/" />
          </template>
        </UInput>

        <div class="grid grid-cols-3 gap-2">
          <USelect v-model="filters.form" :items="FORM_OPTIONS" size="sm" aria-label="Form" />
          <USelect v-model="filters.risk" :items="RISK_OPTIONS" size="sm" aria-label="Risk" />
          <USelect v-model="filters.invocation" :items="INVOCATION_OPTIONS" size="sm" aria-label="Invocation" />
        </div>

        <div class="flex items-center gap-2 text-xs">
          <UCheckbox v-model="markAll" :disabled="!visible.length" aria-label="Mark all visible cards" />
          <span class="text-muted">{{ markedOnShelf.length }} marked · {{ visible.length }} shown</span>
          <div class="ms-auto flex gap-1">
            <UButton
              v-if="!inQuarantine"
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="!targetIds.length"
              @click="openSlip('quarantine', targetIds)"
            >
              Quarantine
            </UButton>
            <template v-else>
              <UButton size="xs" color="neutral" variant="outline" :disabled="!targetIds.length" @click="openSlip('restore', targetIds)">
                Restore
              </UButton>
              <UButton size="xs" color="error" :disabled="!targetIds.length" @click="openSlip('delete', targetIds)">
                Delete
              </UButton>
            </template>
          </div>
        </div>
      </div>
    </template>

    <template #body>
      <p v-if="error" class="text-sm text-error">{{ error }}</p>
      <p v-else-if="loading && !visible.length" class="text-sm text-muted">Scanning the drawers…</p>
      <p v-else-if="!visible.length" class="text-sm text-muted">{{ emptyText }}</p>
      <ul v-else class="flex flex-col gap-1" role="list">
        <SkillCard
          v-for="card in visible"
          :key="card.id"
          :card="card"
          :selected="card.id === selectedId"
          :marked="catalog.isMarked(card.id)"
          @select="catalog.select(card.id)"
          @toggle="catalog.toggleMark(card.id)"
        />
      </ul>
    </template>

    <template #footer>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-default p-3 text-xs text-muted">
        <span><UKbd value="j" /> <UKbd value="k" /> move</span>
        <span><UKbd value="x" /> mark</span>
        <span><UKbd value="q" /> quarantine</span>
        <span><UKbd value="r" /> restore</span>
        <span><UKbd value="d" /> delete</span>
        <span><UKbd value="e" /> edit</span>
        <span><UKbd value="/" /> find</span>
      </div>
    </template>
  </UDashboardPanel>
</template>
