import type { Ref } from 'vue'
import { nextSelection, type ShelfAction } from '~/utils/shelf-actions'

export interface ShelfKeyOptions {
  visibleIds: Ref<string[]>
  selectedId: Ref<string | undefined>
  inQuarantine: Ref<boolean>
  slipOpen: Ref<boolean>
  select: (id: string) => void
  toggleMark: (id: string) => void
  openSlip: (mode: ShelfAction) => void
  closeSlip: () => void
  focusSearch: () => void
  openEditor: () => void
}

/**
 * Spec §11.8 on Nuxt UI defineShortcuts: shortcuts skip inputs unless
 * `usingInput`, `meta` becomes `ctrl` off macOS, and a `false` entry in the
 * reactive config disables that key (q on the quarantine shelf, r/d on live
 * shelves, all three while the slip is open).
 */
export function useShelfKeys(options: ShelfKeyOptions) {
  function move(delta: number): void {
    const next = nextSelection(options.visibleIds.value, options.selectedId.value, delta)
    if (!next) return
    options.select(next)
    nextTick(() => {
      const el = document.querySelector<HTMLElement>(`[data-id="${next}"]`)
      el?.scrollIntoView?.({ block: 'nearest' })
    })
  }

  function blurActive(): void {
    const active = document.activeElement as HTMLElement | null
    active?.blur?.()
  }

  defineShortcuts(computed(() => {
    const slipOpen = options.slipOpen.value
    const held = options.inQuarantine.value
    return {
      '/': () => options.focusSearch(),
      'j': () => move(1),
      'k': () => move(-1),
      'x': () => {
        if (options.selectedId.value) options.toggleMark(options.selectedId.value)
      },
      'q': slipOpen || held ? false : () => options.openSlip('quarantine'),
      'r': slipOpen || !held ? false : () => options.openSlip('restore'),
      'd': slipOpen || !held ? false : () => options.openSlip('delete'),
      'e': () => options.openEditor(),
      'escape': {
        usingInput: true,
        handler: () => {
          if (options.slipOpen.value) options.closeSlip()
          else blurActive()
        },
      },
    }
  }))

  return { move }
}
