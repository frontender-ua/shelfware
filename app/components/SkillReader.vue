<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { SkillDetail } from '#shared/types/catalog'

const props = defineProps<{ id: string }>()

const idRef = toRef(props, 'id')
const { detail, error, loading, preview, previewError, openFile, save, reload } = useSkillDetail(idRef)
const tab = useReaderTab()
const { openSlip } = useSlip()
const { refresh } = useCatalog()
const route = useRoute()

const items: TabsItem[] = [
  { label: 'Manuscript', value: 'manuscript', slot: 'manuscript' },
  { label: 'Source', value: 'source', slot: 'source' },
  { label: 'Edit', value: 'edit', slot: 'edit' },
  { label: 'Folio', value: 'folio', slot: 'folio' },
]

const RISK_CLASS: Record<SkillDetail['risk'], string> = {
  none: 'text-muted',
  low: 'text-info',
  medium: 'text-warning',
  high: 'text-error',
  critical: 'text-error font-semibold',
}

/** Spec §11.5: broken cards never reach the renderer. */
const rendered = computed(() => {
  if (!detail.value || detail.value.physicality === 'broken') return ''
  return renderMarkdown(detail.value.body.trim() || '*This skill has no body after the frontmatter.*')
})

async function onSaved(): Promise<void> {
  await refresh()
}
</script>

<template>
  <p v-if="error" class="text-sm text-error">{{ error }}</p>
  <p v-else-if="!detail" class="text-sm text-muted">{{ loading ? 'Reading the card…' : 'No card.' }}</p>
  <article v-else class="flex max-w-3xl flex-col gap-4">
    <header class="flex flex-col gap-3">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="text-xl font-semibold text-highlighted">{{ detail.name }}</h1>
          <p v-if="detail.description" class="text-muted">{{ detail.description }}</p>
        </div>
        <div class="flex shrink-0 gap-1">
          <UButton v-if="!detail.quarantined" color="neutral" variant="outline" size="sm" @click="openSlip('quarantine', [detail.id])">
            Quarantine
          </UButton>
          <template v-else>
            <UButton color="neutral" variant="outline" size="sm" @click="openSlip('restore', [detail.id])">Restore</UButton>
            <UButton color="error" size="sm" @click="openSlip('delete', [detail.id])">Delete</UButton>
          </template>
        </div>
      </div>

      <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-muted">Path</dt>
        <dd class="break-all font-mono">{{ detail.path }}</dd>

        <dt class="text-muted">Drawer</dt>
        <dd>{{ detail.scopeLabel }} · {{ kindStamp(detail.kind) }}</dd>

        <dt class="text-muted">Form</dt>
        <dd>
          {{ detail.physicality }}
          <span v-if="detail.link"> · link → <span class="break-all font-mono">{{ detail.linkTarget }}</span></span>
          <span v-if="detail.file"> · single file</span>
        </dd>

        <template v-if="detail.origin">
          <dt class="text-muted">Origin</dt>
          <dd>
            <a :href="detail.origin.url" target="_blank" rel="noopener noreferrer" class="underline">{{ detail.origin.label }}</a>
            · {{ detail.origin.certainty }} via {{ detail.origin.via }}
            <span v-if="detail.origin.certainty === 'inferred'" class="text-muted">— taken from a parent plugin or git remote; it may name the wrapper rather than this skill's own repository</span>
          </dd>
        </template>

        <dt class="text-muted">Invocation</dt>
        <dd>{{ detail.invocation }} <span class="text-muted">— {{ detail.invocationEvidence }}</span></dd>

        <dt class="text-muted">Size</dt>
        <dd class="tabular-nums">
          {{ formatBytes(detail.skillSize) }} · {{ formatTokens(detail.tokenEstimate) }} · {{ formatBytes(detail.bytes) }} on disk · {{ formatWhen(detail.mtime) }}
        </dd>

        <dt class="text-muted">Risk</dt>
        <dd :class="RISK_CLASS[detail.risk]">risk {{ detail.risk }}</dd>

        <template v-if="detail.findings.length">
          <dt class="text-muted">Findings</dt>
          <dd>
            <ul class="flex flex-col gap-0.5">
              <li v-for="f in detail.findings" :key="`${f.file}:${f.line}:${f.rule}`" class="font-mono text-xs">
                {{ f.rule }} · {{ f.file }}:{{ f.line }} — {{ f.message }}
                <span :class="RISK_CLASS[f.severity]">{{ f.severity }}</span>
              </li>
            </ul>
            <p class="text-xs text-muted">Static audit evidence, not a score.</p>
          </dd>
        </template>

        <template v-if="detail.copies.length">
          <dt class="text-muted">Copies</dt>
          <dd>
            <ul class="flex flex-col gap-0.5">
              <li v-for="copy in detail.copies" :key="copy.id">
                <NuxtLink :to="{ path: `/skills/${copy.id}`, query: route.query }" class="underline">{{ copy.scopeLabel }}</NuxtLink>
                <span class="break-all font-mono text-xs text-muted"> {{ copy.path }}</span>
              </li>
            </ul>
          </dd>
        </template>

        <template v-if="detail.quarantined">
          <dt class="text-muted">Quarantined</dt>
          <dd>
            from <span class="break-all font-mono">{{ detail.quarantinedFrom ?? 'an unknown drawer' }}</span>
            · {{ formatWhen(detail.quarantinedAt ?? 0) }}
          </dd>
        </template>
      </dl>
    </header>

    <UTabs v-model="tab" :items="items" color="neutral" variant="link" :unmount-on-hide="false" class="w-full">
      <template #manuscript>
        <p v-if="detail.physicality === 'broken'" class="text-sm text-muted">The link target is gone; there is nothing to read.</p>
        <!-- eslint-disable-next-line vue/no-v-html -- markdown-it with html:false; see spec §11.5 -->
        <div v-else class="prose" v-html="rendered" />
      </template>

      <template #source>
        <pre class="whitespace-pre-wrap break-all font-mono text-xs">{{ detail.source }}</pre>
      </template>

      <template #edit>
        <p v-if="detail.physicality === 'broken'" class="text-sm text-muted">Nothing to edit: the link target is gone.</p>
        <SkillEditor v-else :detail="detail" :save="save" :reload="reload" @saved="onSaved" />
      </template>

      <template #folio>
        <FolioTree :files="detail.files" :preview="preview" :preview-error="previewError" @open="openFile" />
      </template>
    </UTabs>
  </article>
</template>
