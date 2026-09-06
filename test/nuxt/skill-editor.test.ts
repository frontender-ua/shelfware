import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { SkillDetail } from '#shared/types/catalog'
import SkillEditor from '~/components/SkillEditor.vue'
import { useReaderTab } from '~/composables/useReaderTab'
import { ApiError } from '~/utils/api-error'

function detailWith(over: Partial<SkillDetail> = {}): SkillDetail {
  return {
    id: 'id', name: 'x', slug: 'x', description: '', scopeId: 'claude', scopeLabel: '.claude', kind: 'user',
    path: '/h/.claude/skills/x', skillRel: 'SKILL.md', file: false, link: false, linkTarget: '', origin: null,
    invocation: 'model', invocationEvidence: '', risk: 'none', physicality: 'physical', refTarget: '', refSkillId: '',
    copyCount: 0, copies: [], mtime: 0, quarantined: false, fromScope: '', skillSize: 20, tokenEstimate: 5,
    frontmatter: { name: 'x' }, frontmatterRaw: 'name: x', body: 'Body.\n', source: '---\nname: x\n---\n\nBody.\n',
    files: [], bytes: 20, findings: [], contentHash: 'hash1',
    ...over,
  }
}

/** `defineShortcuts` maps `meta` to `ctrl` off macOS, so the event has to match the platform. */
const MAC = /Macintosh;/.test(navigator.userAgent)
function pressSave(target: EventTarget, key = 's'): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, code: 'KeyS', metaKey: MAC, ctrlKey: !MAC, bubbles: true, cancelable: true }))
}

function buttonNamed(wrapper: { findAll: (s: string) => { text(): string, trigger(e: string): Promise<void> }[] }, label: string) {
  const button = wrapper.findAll('button').find(b => b.text().trim() === label)
  if (!button) throw new Error(`no button "${label}"`)
  return button
}

describe('SkillEditor', () => {
  it('meta_s saves from the Edit tab only', async () => {
    const detail = detailWith()
    const save = vi.fn(async (source: string) => detailWith({ source, contentHash: 'hash2' }))
    const wrapper = await mountSuspended(SkillEditor, { props: { detail, save, reload: vi.fn() }, attachTo: document.body })
    const textarea = wrapper.find('textarea').element

    await wrapper.find('textarea').setValue('new text')
    const tab = useReaderTab()

    tab.value = 'source'
    pressSave(textarea)
    await flushPromises()
    expect(save).not.toHaveBeenCalled()

    tab.value = 'edit'
    pressSave(textarea)
    await flushPromises()
    expect(save).toHaveBeenCalledWith('new text', 'hash1')

    // A Cyrillic layout reports \u044b for the physical S key; the shortcut still fires.
    await wrapper.find('textarea').setValue('newer text')
    pressSave(textarea, '\u044b')
    await flushPromises()
    expect(save).toHaveBeenLastCalledWith('newer text', 'hash2')

    tab.value = 'manuscript'
    wrapper.unmount()
  })

  it('typing sets dirty and Save calls save with the baseline hash', async () => {
    const detail = detailWith()
    const save = vi.fn(async (source: string) => detailWith({ source, contentHash: 'hash2' }))
    const wrapper = await mountSuspended(SkillEditor, { props: { detail, save, reload: vi.fn(async () => detail) } })

    expect(wrapper.find('[data-testid="dirty"]').exists()).toBe(false)
    await wrapper.find('textarea').setValue('new text')
    expect(wrapper.find('[data-testid="dirty"]').exists()).toBe(true)

    await buttonNamed(wrapper, 'Save').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledWith('new text', 'hash1')
    expect(wrapper.find('[data-testid="dirty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="saved-at"]').exists()).toBe(true)
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ contentHash: 'hash2' })
  })

  it('Revert restores the baseline', async () => {
    const detail = detailWith()
    const wrapper = await mountSuspended(SkillEditor, { props: { detail, save: vi.fn(), reload: vi.fn() } })
    await wrapper.find('textarea').setValue('scratch')
    await buttonNamed(wrapper, 'Revert').trigger('click')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(detail.source)
    expect(wrapper.find('[data-testid="dirty"]').exists()).toBe(false)
  })

  it('a 409 shows the conflict alert with Reload and keeps the text; Reload moves the baseline', async () => {
    const detail = detailWith()
    const save = vi.fn(async (): Promise<SkillDetail> => {
      throw new ApiError('File changed on disk since it was loaded', 409, { error: 'File changed on disk since it was loaded', currentHash: 'disk' })
    })
    const reload = vi.fn(async () => detailWith({ source: 'disk version', contentHash: 'disk' }))
    const wrapper = await mountSuspended(SkillEditor, { props: { detail, save, reload } })

    await wrapper.find('textarea').setValue('my text')
    await buttonNamed(wrapper, 'Save').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="conflict"]').exists()).toBe(true)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('my text')

    await buttonNamed(wrapper, 'Reload').trigger('click')
    await flushPromises()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="conflict"]').exists()).toBe(false)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('my text')

    save.mockImplementationOnce(async () => detailWith({ source: 'my text', contentHash: 'hash3' }))
    await buttonNamed(wrapper, 'Save').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenLastCalledWith('my text', 'disk')
  })

  it('a rejected reload keeps the text and the conflict alert', async () => {
    const detail = detailWith()
    const save = vi.fn(async (): Promise<SkillDetail> => {
      throw new ApiError('File changed on disk since it was loaded', 409, { error: 'File changed on disk since it was loaded', currentHash: 'disk' })
    })
    const reload = vi.fn(async (): Promise<SkillDetail | null> => {
      throw new Error('Skill not found')
    })
    const wrapper = await mountSuspended(SkillEditor, { props: { detail, save, reload } })

    await wrapper.find('textarea').setValue('my text')
    await buttonNamed(wrapper, 'Save').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="conflict"]').exists()).toBe(true)

    await buttonNamed(wrapper, 'Reload').trigger('click')
    await flushPromises()

    expect(reload).toHaveBeenCalledTimes(1)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('my text')
    expect(wrapper.find('[data-testid="conflict"]').exists()).toBe(true)
  })

  it('shows the frontmatter warning without blocking', async () => {
    const detail = detailWith({ frontmatter: { _parseError: 'YAML frontmatter could not be parsed' } })
    const wrapper = await mountSuspended(SkillEditor, { props: { detail, save: vi.fn(), reload: vi.fn() } })
    expect(wrapper.text()).toContain('Frontmatter could not be parsed')
    await wrapper.find('textarea').setValue('x')
    expect(buttonNamed(wrapper, 'Save')).toBeTruthy()
  })

  it('names the real write target for a symlinked card only', async () => {
    const linked = await mountSuspended(SkillEditor, {
      props: {
        detail: detailWith({ link: true, linkTarget: '/h/repo/x', refTarget: '/h/repo/x/SKILL.md' }),
        save: vi.fn(),
        reload: vi.fn(),
      },
    })
    expect(linked.text()).toContain('Writes to')
    expect(linked.text()).toContain('/h/repo/x/SKILL.md')

    const plain = await mountSuspended(SkillEditor, { props: { detail: detailWith(), save: vi.fn(), reload: vi.fn() } })
    expect(plain.text()).not.toContain('Writes to')
  })
})
