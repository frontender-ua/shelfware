import { useLocalStorage } from '@vueuse/core'
import type { CatalogResponse, ScopeSummary, SkillCard } from '#shared/types/catalog'
import { DEFAULT_FILTERS, matchesFilters, matchesQuery, type Filters } from '~/utils/search'
import { crossingQuarantineShelf } from '~/utils/shelf-actions'

export const FILTERS_STORAGE_KEY = 'shelfware-filters'

/**
 * Spec §11.2. Catalog state on useState, scope in the URL query, filters in
 * localStorage. `visible` = shelf (live or quarantine) → scope → filters → query.
 */
export function useCatalog() {
  const api = useApi()
  const route = useRoute()
  const router = useRouter()

  const catalog = useState<CatalogResponse | null>('catalog', () => null)
  const loading = useState<boolean>('catalog-loading', () => false)
  const error = useState<string>('catalog-error', () => '')
  const query = useState<string>('catalog-query', () => '')
  const marked = useState<string[]>('catalog-marked', () => [])
  const filters = useLocalStorage<Filters>(FILTERS_STORAGE_KEY, { ...DEFAULT_FILTERS }, { mergeDefaults: true })

  const scopeId = computed(() => (typeof route.query.scope === 'string' && route.query.scope) || 'all')
  const inQuarantine = computed(() => scopeId.value === 'quarantine')
  const selectedId = computed(() => (typeof route.params.id === 'string' ? route.params.id : undefined))

  const skills = computed<SkillCard[]>(() => catalog.value?.skills ?? [])
  const live = computed(() => skills.value.filter(s => !s.quarantined))
  const held = computed(() => skills.value.filter(s => s.quarantined))
  const heldCount = computed(() => held.value.length)
  const scopes = computed<ScopeSummary[]>(() => catalog.value?.scopes ?? [])
  const selected = computed(() => skills.value.find(s => s.id === selectedId.value) ?? null)

  const filteredLive = computed(() => live.value.filter(s => matchesFilters(s, filters.value)))
  const visible = computed(() => {
    const q = query.value.trim().toLowerCase()
    const pool = inQuarantine.value ? held.value.filter(s => matchesFilters(s, filters.value)) : filteredLive.value
    return pool.filter((s) => {
      if (!inQuarantine.value && scopeId.value !== 'all' && s.scopeId !== scopeId.value) return false
      return matchesQuery(s, q)
    })
  })
  const visibleIds = computed(() => visible.value.map(s => s.id))

  /** Drawer counts follow the tray filters (DESIGN.md); the census does not. */
  const scopeCounts = computed(() => {
    const by = new Map<string, number>()
    for (const s of filteredLive.value) by.set(s.scopeId, (by.get(s.scopeId) ?? 0) + 1)
    return by
  })

  const markedOnShelf = computed(() => visibleIds.value.filter(id => marked.value.includes(id)))

  async function refresh(force = false): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      catalog.value = await api.catalog(force)
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      loading.value = false
    }
  }

  function setScope(id: string) {
    if (crossingQuarantineShelf(scopeId.value, id)) marked.value = []
    const nextQuery: Record<string, string> = {}
    for (const [key, value] of Object.entries(route.query)) {
      if (typeof value === 'string' && key !== 'scope') nextQuery[key] = value
    }
    if (id !== 'all') nextQuery.scope = id
    return router.push({ path: '/', query: nextQuery })
  }

  function select(id: string) {
    return router.push({ path: `/skills/${id}`, query: route.query })
  }

  function isMarked(id: string): boolean {
    return marked.value.includes(id)
  }

  function toggleMark(id: string): void {
    marked.value = isMarked(id) ? marked.value.filter(x => x !== id) : [...marked.value, id]
  }

  function markVisible(): void {
    marked.value = [...new Set([...marked.value, ...visibleIds.value])]
  }

  function clearMarks(): void {
    marked.value = []
  }

  return {
    catalog, loading, error, query, filters,
    scopeId, inQuarantine, selectedId, selected,
    skills, live, held, heldCount, scopes, visible, visibleIds, scopeCounts,
    marked, markedOnShelf,
    refresh, setScope, select, isMarked, toggleMark, markVisible, clearMarks,
  }
}
