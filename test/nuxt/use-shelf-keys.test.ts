import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useShelfKeys } from '~/composables/useShelfKeys'

/**
 * `code` is the physical key. The letter shortcuts are registered with
 * `layoutIndependent`, so they match on `e.code` and a `key`-only event misses.
 */
function press(key: string, target: EventTarget = document.body, code = ''): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }))
}

async function mountKeys(over: Partial<{ selectedId: string | undefined, inQuarantine: boolean, slipOpen: boolean }> = {}) {
  const spies = {
    select: vi.fn(),
    toggleMark: vi.fn(),
    openSlip: vi.fn(),
    closeSlip: vi.fn(),
    focusSearch: vi.fn(),
    openEditor: vi.fn(),
  }
  const state = {
    visibleIds: ref(['a', 'b', 'c']),
    selectedId: ref<string | undefined>('selectedId' in over ? over.selectedId : 'b'),
    inQuarantine: ref(over.inQuarantine ?? false),
    slipOpen: ref(over.slipOpen ?? false),
  }
  const Host = defineComponent({
    setup() {
      useShelfKeys({ ...state, ...spies })
      return () => h('div', [h('input', { id: 'search', name: 'search' })])
    },
  })
  const wrapper = await mountSuspended(Host, { attachTo: document.body })
  return { wrapper, spies, state }
}

describe('useShelfKeys', () => {
  const wrappers: { unmount(): void }[] = []
  afterEach(() => {
    for (const w of wrappers.splice(0)) w.unmount()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  })

  it('j and k move the selection and clamp at the ends', async () => {
    const { wrapper, spies, state } = await mountKeys()
    wrappers.push(wrapper)
    press('j', document.body, 'KeyJ')
    expect(spies.select).toHaveBeenLastCalledWith('c')
    state.selectedId.value = 'c'
    press('j', document.body, 'KeyJ')
    expect(spies.select).toHaveBeenLastCalledWith('c')
    state.selectedId.value = 'a'
    press('k', document.body, 'KeyK')
    expect(spies.select).toHaveBeenLastCalledWith('a')
    expect(spies.select).toHaveBeenCalledTimes(3)
  })

  it('x toggles the mark on the selected card only', async () => {
    const { wrapper, spies, state } = await mountKeys()
    wrappers.push(wrapper)
    press('x', document.body, 'KeyX')
    expect(spies.toggleMark).toHaveBeenCalledWith('b')
    state.selectedId.value = undefined
    press('x', document.body, 'KeyX')
    expect(spies.toggleMark).toHaveBeenCalledTimes(1)
  })

  it('does nothing while an input is focused, except escape which blurs it', async () => {
    const { wrapper, spies } = await mountKeys()
    wrappers.push(wrapper)
    const input = wrapper.find('input').element as HTMLInputElement
    input.focus()
    expect(document.activeElement).toBe(input)
    press('j', input, 'KeyJ')
    press('x', input, 'KeyX')
    press('q', input, 'KeyQ')
    expect(spies.select).not.toHaveBeenCalled()
    expect(spies.toggleMark).not.toHaveBeenCalled()
    expect(spies.openSlip).not.toHaveBeenCalled()
    press('Escape', input, 'Escape')
    expect(document.activeElement).not.toBe(input)
  })

  it('q opens the quarantine slip on live shelves only; r and d only on the quarantine shelf', async () => {
    const live = await mountKeys({ inQuarantine: false })
    wrappers.push(live.wrapper)
    press('q', document.body, 'KeyQ')
    press('r', document.body, 'KeyR')
    press('d', document.body, 'KeyD')
    expect(live.spies.openSlip).toHaveBeenCalledTimes(1)
    expect(live.spies.openSlip).toHaveBeenCalledWith('quarantine')
    live.wrapper.unmount()
    wrappers.pop()

    const held = await mountKeys({ inQuarantine: true })
    wrappers.push(held.wrapper)
    press('q', document.body, 'KeyQ')
    press('r', document.body, 'KeyR')
    press('d', document.body, 'KeyD')
    expect(held.spies.openSlip.mock.calls).toEqual([['restore'], ['delete']])
  })

  it('escape closes an open slip and slip keys are inert while it is open', async () => {
    const { wrapper, spies } = await mountKeys({ slipOpen: true })
    wrappers.push(wrapper)
    press('q', document.body, 'KeyQ')
    expect(spies.openSlip).not.toHaveBeenCalled()
    press('Escape', document.body, 'Escape')
    expect(spies.closeSlip).toHaveBeenCalledTimes(1)
  })

  it('/ focuses the search and e opens the editor', async () => {
    const { wrapper, spies } = await mountKeys()
    wrappers.push(wrapper)
    press('/', document.body, 'Slash')
    expect(spies.focusSearch).toHaveBeenCalledTimes(1)
    press('e', document.body, 'KeyE')
    expect(spies.openEditor).toHaveBeenCalledTimes(1)
  })

  it('letter keys work by physical key in a non-Latin layout', async () => {
    const live = await mountKeys()
    wrappers.push(live.wrapper)
    // A Cyrillic layout reports the letter it prints, not the Latin one on the cap.
    press('\u0447', document.body, 'KeyX')
    expect(live.spies.toggleMark).toHaveBeenCalledWith('b')
    press('\u043e', document.body, 'KeyJ')
    expect(live.spies.select).toHaveBeenLastCalledWith('c')
    press('/', document.body, 'Slash')
    expect(live.spies.focusSearch).toHaveBeenCalledTimes(1)
    live.wrapper.unmount()
    wrappers.pop()

    const held = await mountKeys({ inQuarantine: true })
    wrappers.push(held.wrapper)
    press('\u0432', document.body, 'KeyD')
    expect(held.spies.openSlip).toHaveBeenCalledWith('delete')
  })
})
