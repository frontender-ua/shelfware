import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { CatalogResponse, DeleteResult, SkillCard } from '#shared/types/catalog'
import ActionSlip from '~/components/ActionSlip.vue'
import { useSlip } from '~/composables/useSlip'
import { useCatalog } from '~/composables/useCatalog'

// `mockNuxtImport` compiles to a hoisted `vi.mock`, so its spies have to be hoisted too.
const api = vi.hoisted(() => ({
  catalog: vi.fn<() => Promise<CatalogResponse>>(),
  skill: vi.fn(),
  file: vi.fn(),
  save: vi.fn(),
  quarantine: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn<(ids: string[]) => Promise<DeleteResult>>(),
}))
const addSpy = vi.hoisted(() => vi.fn())

mockNuxtImport('useApi', () => () => api)
mockNuxtImport('useToast', () => () => ({ add: addSpy }))

function cardOf(id: string, quarantined: boolean): SkillCard {
  return {
    id,
    name: id,
    slug: id,
    description: '',
    scopeId: quarantined ? 'quarantine' : 'claude',
    scopeLabel: quarantined ? 'quarantine' : '.claude',
    kind: 'user',
    path: `/h/${id}`,
    skillRel: 'SKILL.md',
    file: false,
    link: false,
    linkTarget: '',
    origin: null,
    invocation: 'model',
    invocationEvidence: '',
    risk: 'none',
    physicality: 'physical',
    refTarget: '',
    refSkillId: '',
    copyCount: 0,
    copies: [],
    mtime: 0,
    quarantined,
    fromScope: quarantined ? 'claude' : '',
    skillSize: 20,
    tokenEstimate: 5,
  }
}

function catalogOf(cards: SkillCard[]): CatalogResponse {
  return {
    home: '/h',
    scannedAt: 0,
    quarantineRoot: '/h/.skill-cabinet/quarantine',
    total: cards.length,
    census: {
      total: cards.length, physical: cards.length, unique: cards.length, duplicateCopies: 0,
      duplicateBytes: 0, references: 0, broken: 0, duplicates: 0, tokenEstimate: 0,
    },
    scopes: [{ id: 'claude', label: '.claude', kind: 'user', count: 1 }],
    skills: cards,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const HELD_ONE = cardOf('held-one', true)
const HELD_TWO = cardOf('held-two', true)
const LIVE = cardOf('live-one', false)

/** Seeds the shared catalog and slip state, then renders the slip against it. */
const Host = defineComponent({
  setup() {
    const catalog = useCatalog()
    const slip = useSlip()
    catalog.catalog.value = catalogOf([HELD_ONE, HELD_TWO, LIVE])
    catalog.marked.value = [HELD_ONE.id, HELD_TWO.id]
    slip.openSlip('delete', [HELD_ONE.id, HELD_TWO.id, LIVE.id])
    return { catalog, slip }
  },
  render() {
    return h(ActionSlip)
  },
})

/** The modal teleports its body to `document.body`, so the wrapper cannot see it. */
function slipText(): string {
  return document.body.textContent ?? ''
}

function deleteButton(): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Delete')
  if (!button) throw new Error('no Delete button in the slip')
  return button
}

describe('ActionSlip', () => {
  const wrappers: { unmount(): void }[] = []

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    for (const w of wrappers.splice(0)) w.unmount()
    clearNuxtState()
  })

  it('deletes only the quarantined cards, toasts the outcome, then refreshes and closes', async () => {
    const pending = deferred<DeleteResult>()
    api.remove.mockReturnValue(pending.promise)
    api.catalog.mockResolvedValue(catalogOf([HELD_TWO, LIVE]))

    const wrapper = await mountSuspended(Host, { attachTo: document.body })
    wrappers.push(wrapper)
    const { catalog, slip } = wrapper.vm

    // C16: v0.1 never sends `force`, so a live card never reaches the delete slip.
    expect(slipText()).toContain('Delete 2 cards from disk')
    expect(slipText()).toContain(HELD_ONE.name)
    expect(slipText()).toContain(HELD_TWO.name)
    expect(slipText()).not.toContain(LIVE.name)

    deleteButton().click()
    await nextTick()
    expect(api.remove).toHaveBeenCalledWith([HELD_ONE.id, HELD_TWO.id])
    expect(slip.busy.value).toBe(true)
    expect(slip.slip.value).not.toBe(null)

    pending.resolve({
      deleted: [{ id: HELD_ONE.id, path: HELD_ONE.path, name: HELD_ONE.name }],
      errors: [{ id: HELD_TWO.id, error: 'Permission denied', path: HELD_TWO.path }],
    })
    await flushPromises()

    expect(addSpy).toHaveBeenCalledWith({ title: 'Deleted 1 card from disk.', color: 'success' })
    expect(addSpy).toHaveBeenCalledWith({
      title: 'Permission denied',
      description: HELD_TWO.path,
      color: 'error',
      duration: 0,
    })
    expect(catalog.marked.value).toEqual([])
    expect(api.catalog).toHaveBeenCalledTimes(1)
    expect(catalog.skills.value.map(s => s.id)).toEqual([HELD_TWO.id, LIVE.id])
    expect(slip.slip.value).toBe(null)
    expect(slip.busy.value).toBe(false)
  })
})
