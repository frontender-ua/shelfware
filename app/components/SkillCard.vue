<script setup lang="ts">
import type { SkillCard as Card } from '#shared/types/catalog'

const props = defineProps<{
  card: Card
  selected: boolean
  marked: boolean
}>()

const emit = defineEmits<{
  select: []
  toggle: []
}>()

const form = computed(() => {
  if (props.card.physicality === 'broken') return 'broken'
  if (props.card.link) return 'link'
  if (props.card.file) return 'file'
  return ''
})

/** The two-signal rule: the word "risk" always travels with the colour. */
const RISK_CLASS: Record<Card['risk'], string> = {
  none: 'text-muted',
  low: 'text-info',
  medium: 'text-warning',
  high: 'text-error',
  critical: 'text-error font-semibold',
}
</script>

<template>
  <li
    :data-id="card.id"
    :class="[
      'rounded-md border px-3 py-2 text-sm',
      selected ? 'border-default bg-elevated' : 'border-transparent hover:bg-muted',
    ]"
  >
    <div class="flex items-start gap-2">
      <UCheckbox
        :model-value="marked"
        size="sm"
        class="mt-0.5"
        :aria-label="`Mark ${card.name}`"
        @update:model-value="emit('toggle')"
      />
      <button type="button" class="min-w-0 flex-1 text-start" :aria-current="selected ? 'true' : undefined" @click="emit('select')">
        <div class="flex items-baseline gap-2">
          <span class="truncate font-medium text-highlighted">{{ card.name }}</span>
          <span class="truncate font-mono text-xs text-dimmed" :title="card.path">{{ card.scopeLabel }}</span>
        </div>
        <p v-if="card.description" class="line-clamp-2 text-xs text-muted">{{ card.description }}</p>
        <div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] uppercase tracking-wide text-dimmed">
          <span>{{ kindStamp(card.kind) }}</span>
          <span v-if="form">{{ form }}</span>
          <span v-if="card.origin" :title="`${card.origin.url} · ${card.origin.certainty} via ${card.origin.via}`">
            {{ card.origin.label }} · {{ card.origin.certainty }}
          </span>
          <span v-if="card.copyCount" :title="`${card.copyCount + 1} identical cards`">×{{ card.copyCount + 1 }}</span>
          <span v-if="card.risk !== 'none'" :class="RISK_CLASS[card.risk]">risk {{ card.risk }}</span>
          <span :title="card.invocationEvidence">{{ card.invocation }}</span>
          <span class="normal-case tabular-nums">{{ formatTokens(card.tokenEstimate) }}</span>
        </div>
      </button>
    </div>
  </li>
</template>
