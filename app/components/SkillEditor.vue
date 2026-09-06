<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { SkillDetail } from '#shared/types/catalog'
import { ApiError } from '~/utils/api-error'

const props = defineProps<{
  detail: SkillDetail
  save: (source: string, baseHash: string) => Promise<SkillDetail>
  reload: () => Promise<SkillDetail | null>
}>()

const emit = defineEmits<{
  saved: [detail: SkillDetail]
}>()

const toast = useToast()

const text = ref(props.detail.source)
const baseline = ref({ source: props.detail.source, hash: props.detail.contentHash ?? '' })
const saving = ref(false)
const savedAt = ref('')
const conflict = ref<string | null>(null)

const dirty = computed(() => text.value !== baseline.value.source)
const parseError = computed(() => {
  const value = props.detail.frontmatter?._parseError
  return typeof value === 'string' ? value : ''
})

/** Spec §11.6: a fresh detail moves the baseline; the user's unsaved text stays until Revert. */
watch(() => props.detail, (fresh) => {
  if (!dirty.value) text.value = fresh.source
  baseline.value = { source: fresh.source, hash: fresh.contentHash ?? '' }
})

function stamp(): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date())
}

/** A failed reload (the file was renamed or removed) must never cost the user their text. */
async function doReload(): Promise<void> {
  try {
    const fresh = await props.reload()
    if (!fresh) return
    baseline.value = { source: fresh.source, hash: fresh.contentHash ?? '' }
    conflict.value = null
  } catch (err) {
    toast.add({ title: 'Reload failed', description: (err as Error).message, color: 'error' })
  }
}

async function doSave(): Promise<void> {
  if (!dirty.value || saving.value) return
  saving.value = true
  conflict.value = null
  try {
    const fresh = await props.save(text.value, baseline.value.hash)
    baseline.value = { source: fresh.source, hash: fresh.contentHash ?? '' }
    text.value = fresh.source
    savedAt.value = stamp()
    toast.add({ title: 'Saved', color: 'success' })
    emit('saved', fresh)
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      conflict.value = typeof err.data.currentHash === 'string' ? err.data.currentHash : ''
      toast.add({
        title: 'File changed on disk since it was loaded',
        description: 'Reload takes the disk version as the new baseline. Your text stays in the editor.',
        color: 'warning',
        duration: 0,
        actions: [{ label: 'Reload', color: 'neutral', variant: 'outline', onClick: () => { doReload() } }],
      })
    } else {
      toast.add({ title: (err as Error).message, color: 'error' })
    }
  } finally {
    saving.value = false
  }
}

function revert(): void {
  text.value = baseline.value.source
  conflict.value = null
}

/**
 * Spec §11.8: meta_s saves from the Edit tab only. The editor stays mounted behind the
 * other reader tabs, so swallow the browser's Save dialog first, then bow out.
 */
defineShortcuts({
  meta_s: {
    usingInput: true,
    handler: (e?: KeyboardEvent) => {
      e?.preventDefault()
      if (useReaderTab().value !== 'edit') return
      doSave()
    },
  },
})

useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
})

const leaveOpen = ref(false)
let pendingLeave: ((ok: boolean) => void) | null = null

/**
 * The modal's buttons answer the pending guard; a plain call keeps the binding's type in the
 * template. Tolerates a null `pendingLeave`, so every close path may call it unconditionally.
 */
function resolveLeave(ok: boolean): void {
  pendingLeave?.(ok)
}

function guard(next: (ok?: boolean) => void): void {
  if (!dirty.value) {
    next()
    return
  }
  leaveOpen.value = true
  pendingLeave = (ok) => {
    leaveOpen.value = false
    pendingLeave = null
    next(ok)
  }
}

onBeforeRouteLeave((_to, _from, next) => guard(next))
onBeforeRouteUpdate((_to, _from, next) => guard(next))
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <div class="flex items-center gap-2">
      <UButton size="sm" :disabled="!dirty || saving" :loading="saving" @click="doSave">Save</UButton>
      <UButton size="sm" color="neutral" variant="ghost" :disabled="!dirty || saving" @click="revert">Revert</UButton>
      <span v-if="dirty" class="text-xs text-warning" data-testid="dirty">unsaved changes</span>
      <span v-else-if="savedAt" class="text-xs text-muted" data-testid="saved-at">saved {{ savedAt }}</span>
      <span class="ms-auto text-xs text-muted"><UKbd value="meta" /> <UKbd value="S" /> save</span>
    </div>

    <UAlert
      v-if="conflict !== null"
      data-testid="conflict"
      color="warning"
      variant="subtle"
      title="File changed on disk since it was loaded"
      description="Reload takes the disk version as the new baseline. Your text stays until you press Revert."
      :actions="[{ label: 'Reload', color: 'neutral', variant: 'outline', onClick: () => { doReload() } }]"
    />

    <UAlert
      v-if="parseError"
      color="warning"
      variant="subtle"
      title="Frontmatter could not be parsed"
      :description="`${parseError}. The file is saved as written; only the parsed fields are affected.`"
    />

    <p v-if="detail.link" class="text-xs text-muted">Writes to <span class="font-mono break-all">{{ detail.refTarget || detail.linkTarget }}</span></p>

    <UTextarea
      v-model="text"
      name="editor"
      :rows="24"
      spellcheck="false"
      class="w-full flex-1"
      :ui="{ base: 'font-mono text-sm leading-5' }"
    />

    <UModal
      v-model:open="leaveOpen"
      title="Discard unsaved changes?"
      :dismissible="false"
      :close="false"
      @update:open="(v) => { if (!v) resolveLeave(false) }"
    >
      <template #body>
        <p class="text-sm text-muted">The card has edits that are not on disk yet.</p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="resolveLeave(false)">Stay</UButton>
        <UButton color="neutral" variant="solid" @click="resolveLeave(true)">Discard</UButton>
      </template>
    </UModal>
  </div>
</template>
