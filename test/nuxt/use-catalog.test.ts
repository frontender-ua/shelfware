import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { CatalogResponse, SkillCard } from '#shared/types/catalog'
import { useCatalog } from '~/composables/useCatalog'
import { DEFAULT_FILTERS } from '~/utils/search'

function card(over: Partial<SkillCard>): SkillCard {
  return {
    id: over.slug ?? 'id', name: over.slug ?? 'name', slug: 'slug', description: '', scopeId: 'claude', scopeLabel: '.claude',
    kind: 'user', path: `/h/.claude/skills/${over.slug}`, skillRel: 'SKILL.md', file: false, link: false, linkTarget: '',
    origin: null, invocation: 'model', invocationEvidence: '', risk: 'none', physicality: 'physical', refTarget: '',
    refSkillId: '', copyCount: 0, copies: [], mtime: 0, quarantined: false, fromScope: '', skillSize: 4, tokenEstimate: 1,
    ...over,
  }
}

function fakeCatalog(): CatalogResponse {
  const skills = [
    card({ slug: 'alpha' }),
    card({ slug: 'bravo', scopeId: 'codex', scopeLabel: '.codex' }),
    card({ slug: 'broken', physicality: 'broken', risk: 'high' }),
    card({ slug: 'held', quarantined: true, scopeId: 'quarantine', scopeLabel: 'Quarantine', fromScope: 'codex', kind: 'quarantine' }),
  ]
  return {
    home: '/h', scannedAt: 1, quarantineRoot: '/h/.skill-cabinet/quarantine', total: 3,
    census: { total: 3, physical: 2, unique: 2, duplicateCopies: 0, duplicateBytes: 0, references: 0, broken: 1, duplicates: 0, tokenEstimate: 2 },
    scopes: [{ id: 'claude', label: '.claude', kind: 'user', count: 2 }, { id: 'codex', label: '.codex', kind: 'user', count: 1 }],
    skills,
  }
}

const Host = defineComponent({
  setup() {
    const c = useCatalog()
    return { c }
  },
  render() {
    return h('div')
  },
})

describe('useCatalog', () => {
  afterEach(() => {
    clearNuxtState()
    localStorage.clear()
  })

  it('derives visible cards from the route scope, the filters and the query', async () => {
    const wrapper = await mountSuspended(Host, { route: '/?scope=claude' })
    const c = wrapper.vm.c
    c.catalog.value = fakeCatalog()
    await nextTick()
    expect(c.scopeId.value).toBe('claude')
    expect(c.visible.value.map(s => s.slug)).toEqual(['alpha', 'broken'])
    expect(c.scopeCounts.value.get('claude')).toBe(2)
    expect(c.heldCount.value).toBe(1)

    c.filters.value = { ...DEFAULT_FILTERS, form: 'broken' }
    await nextTick()
    expect(c.visible.value.map(s => s.slug)).toEqual(['broken'])
    expect(c.scopeCounts.value.get('claude')).toBe(1)
    expect(JSON.parse(localStorage.getItem('shelfware-filters') ?? '{}').form).toBe('broken')

    c.filters.value = { ...DEFAULT_FILTERS }
    c.query.value = '  ALPHA '
    await nextTick()
    expect(c.visible.value.map(s => s.slug)).toEqual(['alpha'])
  })

  it('switches shelves through the URL and clears marks when crossing the quarantine shelf', async () => {
    const wrapper = await mountSuspended(Host, { route: '/' })
    const c = wrapper.vm.c
    c.catalog.value = fakeCatalog()
    await nextTick()
    expect(c.scopeId.value).toBe('all')
    expect(c.visible.value.map(s => s.slug)).toEqual(['alpha', 'bravo', 'broken'])

    c.toggleMark('alpha')
    c.toggleMark('bravo')
    expect(c.isMarked('alpha')).toBe(true)
    expect(c.markedOnShelf.value).toEqual(['alpha', 'bravo'])

    await c.setScope('codex')
    await nextTick()
    expect(c.visible.value.map(s => s.slug)).toEqual(['bravo'])
    expect(c.marked.value).toEqual(['alpha', 'bravo'])
    expect(c.markedOnShelf.value).toEqual(['bravo'])

    await c.setScope('quarantine')
    await nextTick()
    expect(c.inQuarantine.value).toBe(true)
    expect(c.visible.value.map(s => s.slug)).toEqual(['held'])
    expect(c.marked.value).toEqual([])

    c.markVisible()
    expect(c.marked.value).toEqual(['held'])
    c.clearMarks()
    expect(c.marked.value).toEqual([])
  })
})
