import type { CatalogResponse, ScopeSummary } from '#shared/types/catalog'
import { defineApiHandler } from '../utils/api-handler'
import { getIndex, scannedAt } from '../utils/catalog'
import { homeOf, quarantineRoot, toCatalogSkill } from '../utils/scan'

export default defineApiHandler((event): CatalogResponse => {
  const force = getQuery(event).refresh === '1'
  const index = getIndex({ force })
  const live = index.skills.filter(skill => !skill.quarantined)
  const scopes: ScopeSummary[] = []
  const byScope = new Map<string, ScopeSummary>()
  for (const skill of live) {
    let scope = byScope.get(skill.scopeId)
    if (!scope) {
      scope = { id: skill.scopeId, label: skill.scopeLabel, kind: skill.kind, count: 0 }
      byScope.set(skill.scopeId, scope)
      scopes.push(scope)
    }
    scope.count += 1
  }
  return {
    home: homeOf(),
    scannedAt: scannedAt(),
    quarantineRoot: quarantineRoot(),
    total: live.length,
    census: index.census,
    scopes,
    skills: index.skills.map(toCatalogSkill),
  }
})
