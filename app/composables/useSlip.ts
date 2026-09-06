import type { ShelfAction } from '~/utils/shelf-actions'

export interface SlipState {
  mode: ShelfAction
  ids: string[]
}

/**
 * The action slip (spec §11.7): which action, for which ids. Null when closed.
 * `busy` is shared: the slip cannot be closed while its batch is running, so
 * Cancel, the backdrop and Escape all leave it standing until the request ends.
 */
export function useSlip() {
  const slip = useState<SlipState | null>('slip', () => null)
  const busy = useState<boolean>('slip-busy', () => false)
  const open = computed(() => slip.value !== null)

  function openSlip(mode: ShelfAction, ids: string[]): void {
    if (!ids.length) return
    slip.value = { mode, ids: [...ids] }
  }

  function closeSlip(): void {
    if (busy.value) return
    slip.value = null
  }

  return { slip, open, busy, openSlip, closeSlip }
}
