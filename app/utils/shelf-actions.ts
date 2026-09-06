export type ShelfAction = 'quarantine' | 'restore' | 'delete'

/** Upstream src/shelf-actions.js: which of the marked ids the action may touch. */
export function idsForShelfAction(ids: string[], cards: { id: string, quarantined: boolean }[], mode: ShelfAction): string[] {
  const byId = new Map(cards.map(card => [card.id, card]))
  return ids.filter((id) => {
    const card = byId.get(id)
    if (!card) return false
    if (mode === 'restore') return Boolean(card.quarantined)
    if (mode === 'quarantine') return !card.quarantined
    return true
  })
}

export function crossingQuarantineShelf(fromScopeId: string, toScopeId: string): boolean {
  return (fromScopeId === 'quarantine') !== (toScopeId === 'quarantine')
}

/** Spec §11.8: j/k move by one visible card, clamped; an unknown selection starts at the first card. */
export function nextSelection(visibleIds: string[], currentId: string | undefined, delta: number): string | null {
  if (!visibleIds.length) return null
  const i = currentId ? visibleIds.indexOf(currentId) : -1
  if (i === -1) return visibleIds[0]!
  const next = Math.max(0, Math.min(visibleIds.length - 1, i + delta))
  return visibleIds[next]!
}
