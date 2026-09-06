import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import type { Ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { FilePreview, SkillDetail } from '#shared/types/catalog'
import { useSkillDetail } from '~/composables/useSkillDetail'

// `mockNuxtImport` is a macro compiled to a hoisted `vi.mock`, so the spies the
// factory returns have to be hoisted too.
const api = vi.hoisted(() => ({
  catalog: vi.fn(),
  skill: vi.fn<(id: string) => Promise<SkillDetail>>(),
  file: vi.fn<(id: string, rel: string) => Promise<FilePreview>>(),
  save: vi.fn(),
  quarantine: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn(),
}))

mockNuxtImport('useApi', () => () => api)

/** Only the id matters to these races; the rest of a SkillDetail is noise here. */
function detailOf(id: string): SkillDetail {
  return { id, name: id, slug: id, source: `# ${id}` } as unknown as SkillDetail
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function host(id: Ref<string | undefined>) {
  return defineComponent({
    setup() {
      const d = useSkillDetail(id)
      return { d }
    },
    render() {
      return h('div')
    },
  })
}

describe('useSkillDetail', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('ignores a detail response that arrives after the selected card changed', async () => {
    const slow = deferred<SkillDetail>()
    api.skill.mockImplementation(id => (id === 'a' ? slow.promise : Promise.resolve(detailOf(id))))

    const id = ref<string | undefined>('a')
    const wrapper = await mountSuspended(host(id))
    const d = wrapper.vm.d
    expect(api.skill).toHaveBeenCalledWith('a')
    expect(d.loading.value).toBe(true)

    id.value = 'b'
    await nextTick()
    await flushPromises()
    expect(api.skill).toHaveBeenCalledWith('b')
    expect(d.detail.value?.id).toBe('b')
    expect(d.loading.value).toBe(false)

    slow.resolve(detailOf('a'))
    await flushPromises()
    expect(d.detail.value?.id).toBe('b')
    expect(d.loading.value).toBe(false)
  })

  it('ignores a file preview that arrives after the selected card changed', async () => {
    api.skill.mockImplementation(id => Promise.resolve(detailOf(id)))
    const slow = deferred<FilePreview>()
    api.file.mockReturnValue(slow.promise)

    const id = ref<string | undefined>('a')
    const wrapper = await mountSuspended(host(id))
    const d = wrapper.vm.d
    await flushPromises()

    const pending = d.openFile('x')
    expect(api.file).toHaveBeenCalledWith('a', 'x')

    id.value = 'b'
    await nextTick()
    await flushPromises()
    expect(d.detail.value?.id).toBe('b')

    slow.resolve({ path: 'x', size: 4, binary: false, content: 'stale' })
    await pending
    await flushPromises()
    expect(d.preview.value).toBeNull()
    expect(d.previewError.value).toBe('')
  })

  it('a failed reload keeps the current detail', async () => {
    api.skill.mockImplementationOnce(id => Promise.resolve(detailOf(id)))
    api.skill.mockImplementationOnce(() => Promise.reject(new Error('Skill not found')))

    const id = ref<string | undefined>('a')
    const wrapper = await mountSuspended(host(id))
    const d = wrapper.vm.d
    await flushPromises()
    expect(d.detail.value?.id).toBe('a')

    await d.reload().catch(() => {})
    await flushPromises()

    expect(d.detail.value?.id).toBe('a')
    expect(d.error.value).toBe('')
  })
})
