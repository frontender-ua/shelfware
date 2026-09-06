import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useSlip } from '~/composables/useSlip'

const Host = defineComponent({
  setup() {
    const s = useSlip()
    return { s }
  },
  render() {
    return h('div')
  },
})

describe('useSlip', () => {
  afterEach(() => {
    clearNuxtState()
  })

  it('opens on a mode with ids and closes again', async () => {
    const wrapper = await mountSuspended(Host)
    const s = wrapper.vm.s
    expect(s.open.value).toBe(false)

    s.openSlip('delete', ['a'])
    expect(s.slip.value).toEqual({ mode: 'delete', ids: ['a'] })
    expect(s.open.value).toBe(true)

    s.closeSlip()
    expect(s.slip.value).toBe(null)
    expect(s.open.value).toBe(false)
  })

  it('refuses to close while its batch is running', async () => {
    const wrapper = await mountSuspended(Host)
    const s = wrapper.vm.s

    s.openSlip('delete', ['a', 'b'])
    s.busy.value = true
    s.closeSlip()
    expect(s.slip.value).toEqual({ mode: 'delete', ids: ['a', 'b'] })
    expect(s.open.value).toBe(true)

    s.busy.value = false
    s.closeSlip()
    expect(s.slip.value).toBe(null)
    expect(s.open.value).toBe(false)
  })

  it('stays closed when the action has no ids', async () => {
    const wrapper = await mountSuspended(Host)
    const s = wrapper.vm.s

    s.openSlip('quarantine', [])
    expect(s.slip.value).toBe(null)
    expect(s.open.value).toBe(false)
  })
})
