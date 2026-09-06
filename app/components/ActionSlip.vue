<script setup lang="ts">
import type { BatchError } from '#shared/types/catalog'
import { idsForShelfAction, type ShelfAction } from '~/utils/shelf-actions'

const { slip, open, closeSlip } = useSlip()
const { skills, catalog, selectedId, clearMarks, refresh } = useCatalog()
const api = useApi()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const busy = ref(false)
const mode = computed<ShelfAction>(() => slip.value?.mode ?? 'quarantine')
const quarantineRoot = computed(() => catalog.value?.quarantineRoot ?? '~/.skill-cabinet/quarantine')

/** Only the cards this action may touch (upstream shelf-actions rule). */
const cards = computed(() => {
  if (!slip.value) return []
  const byId = new Map(skills.value.map(s => [s.id, s]))
  return idsForShelfAction(slip.value.ids, skills.value, slip.value.mode)
    .map(id => byId.get(id))
    .filter((card): card is NonNullable<typeof card> => Boolean(card))
})

const unlinkCount = computed(() => (mode.value === 'delete' ? cards.value.filter(c => c.link).length : 0))
const managedCount = computed(() =>
  mode.value === 'restore' ? 0 : cards.value.filter(c => c.kind === 'plugin' || c.kind === 'builtin').length,
)

function plural(n: number): string {
  return `${n} card${n === 1 ? '' : 's'}`
}

interface SlipCopy {
  heading: (n: number) => string
  note: (where: string) => Array<string | { path: string }>
  button: string
  busy: string
  done: (n: number) => string
  none: string
}

/** Upstream App.jsx ACTIONS copy, verbatim. */
const COPY: Record<ShelfAction, SlipCopy> = {
  delete: {
    heading: n => `Delete ${plural(n)} from disk`,
    note: () => ['There is no undo. Each card names its filesystem effect below.'],
    button: 'Delete',
    busy: 'Deleting…',
    done: n => `Deleted ${plural(n)} from disk.`,
    none: 'Nothing was deleted.',
  },
  quarantine: {
    heading: n => `Quarantine ${plural(n)} out of the drawers`,
    note: where => ['The cards move to ', { path: where }, '. No agent reads that folder. Restore puts them back where they came from.'],
    button: 'Quarantine',
    busy: 'Quarantining…',
    done: n => `Quarantined ${plural(n)}.`,
    none: 'Nothing was quarantined.',
  },
  restore: {
    heading: n => `Restore ${plural(n)} to their drawers`,
    note: () => ['Each card goes back to the path it was filed from. A card whose path is already taken stays in the quarantine.'],
    button: 'Restore',
    busy: 'Restoring…',
    done: n => `Restored ${plural(n)}.`,
    none: 'Nothing was restored.',
  },
}
const copy = computed(() => COPY[mode.value])

const openModel = computed({
  get: () => open.value,
  set: (value: boolean) => {
    if (!value && !busy.value) closeSlip()
  },
})

async function confirm(): Promise<void> {
  if (!slip.value || !cards.value.length || busy.value) return
  busy.value = true
  const ids = cards.value.map(c => c.id)
  try {
    let done = 0
    let errors: BatchError[] = []
    if (mode.value === 'delete') {
      const result = await api.remove(ids)
      done = result.deleted.length
      errors = result.errors
    } else if (mode.value === 'restore') {
      const result = await api.restore(ids)
      done = result.restored.length
      errors = result.errors
    } else {
      const result = await api.quarantine(ids)
      done = result.quarantined.length
      errors = result.errors
    }
    toast.add({ title: done ? copy.value.done(done) : copy.value.none, color: done ? 'success' : 'neutral' })
    for (const err of errors) {
      toast.add({ title: err.error, description: err.path, color: 'error', duration: 0 })
    }
    clearMarks()
    await refresh()
    if (selectedId.value && !skills.value.some(s => s.id === selectedId.value)) {
      await router.push({ path: '/', query: route.query })
    }
    closeSlip()
  } catch (err) {
    toast.add({ title: (err as Error).message, color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal v-model:open="openModel" :title="slip ? copy.heading(cards.length) : ''" :dismissible="!busy">
    <template #body>
      <p class="text-sm text-muted">
        <template v-for="(seg, i) in copy.note(quarantineRoot)" :key="i"><span v-if="typeof seg === 'string'">{{ seg }}</span><span v-else class="font-mono break-all">{{ seg.path }}</span></template>
      </p>
      <p v-if="unlinkCount" class="mt-2 text-sm text-warning">Unlink removes the link only. The target stays.</p>
      <p v-if="managedCount" class="mt-2 text-sm text-warning">
        {{ managedCount }} of these live in a plugin cache or builtin drawer and may return the next time that tool updates.
      </p>

      <ol class="mt-3 flex flex-col gap-2 text-sm">
        <li v-for="card in cards" :key="card.id">
          <div class="font-medium text-highlighted">
            {{ card.name }} <span class="font-normal text-muted">· {{ card.scopeLabel }}</span>
          </div>
          <div class="break-all font-mono text-xs text-muted">{{ card.path }}</div>
          <div v-if="mode === 'delete'" class="text-xs">
            <span class="text-error">{{ deleteEffect(card).label }}</span>
            <span v-if="deleteEffect(card).note" class="text-muted"> · {{ deleteEffect(card).note }}</span>
          </div>
        </li>
      </ol>
      <p v-if="!cards.length" class="mt-3 text-sm text-muted">No card on this shelf can take that action.</p>
    </template>

    <template #footer>
      <UButton color="neutral" variant="ghost" :disabled="busy" @click="closeSlip()">Cancel</UButton>
      <UButton
        :color="mode === 'delete' ? 'error' : 'neutral'"
        :variant="mode === 'delete' ? 'solid' : 'outline'"
        :loading="busy"
        :disabled="!cards.length"
        @click="confirm"
      >
        {{ busy ? copy.busy : copy.button }}
      </UButton>
    </template>
  </UModal>
</template>
