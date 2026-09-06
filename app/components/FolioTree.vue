<script setup lang="ts">
import type { FilePreview, SkillFileEntry } from '#shared/types/catalog'

defineProps<{
  files: SkillFileEntry[]
  preview: FilePreview | null
  previewError: string
}>()

const emit = defineEmits<{
  open: [rel: string]
}>()
</script>

<template>
  <div class="grid gap-4 md:grid-cols-[minmax(12rem,1fr)_2fr]">
    <ul class="flex flex-col gap-0.5 text-sm" role="list">
      <li v-for="file in files" :key="file.path">
        <button
          type="button"
          :class="['flex w-full justify-between gap-2 rounded px-1 py-0.5 text-start hover:bg-muted', preview?.path === file.path ? 'bg-elevated' : '']"
          :aria-current="preview?.path === file.path ? 'true' : undefined"
          @click="emit('open', file.path)"
        >
          <span class="break-all font-mono">{{ file.path }}</span>
          <span class="shrink-0 tabular-nums text-muted">{{ formatBytes(file.size) }}</span>
        </button>
      </li>
      <li v-if="!files.length" class="text-muted">No files.</li>
    </ul>

    <div class="min-w-0">
      <p v-if="previewError" class="text-sm text-error">{{ previewError }}</p>
      <p v-else-if="!preview" class="text-sm text-muted">Choose a file to preview it.</p>
      <p v-else-if="preview.binary" class="text-sm text-muted">
        <span class="font-mono">{{ preview.path }}</span> · {{ formatBytes(preview.size) }} · not a text preview
      </p>
      <template v-else>
        <p class="mb-1 text-xs text-muted">
          <span class="font-mono">{{ preview.path }}</span> · {{ formatBytes(preview.size) }}
        </p>
        <pre class="whitespace-pre-wrap break-all font-mono text-xs">{{ preview.content }}</pre>
      </template>
    </div>
  </div>
</template>
