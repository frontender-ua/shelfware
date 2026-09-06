import type { ShelfAction } from '~/utils/shelf-actions'

export interface SlipState {
  mode: ShelfAction
  ids: string[]
}

/** The action slip (spec §11.7): which action, for which ids. Null when closed. */
export function useSlip() {
  const slip = useState<SlipState | null>('slip', () => null)
  const open = computed(() => slip.value !== null)

  function openSlip(mode: ShelfAction, ids: string[]): void {
    if (!ids.length) return
    slip.value = { mode, ids: [...ids] }
  }

  function closeSlip(): void {
    slip.value = null
  }

  return { slip, open, openSlip, closeSlip }
}
