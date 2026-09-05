import type { BatchError, Root } from '#shared/types/catalog'
import type { ScanIndex, SkillSummary } from './scan'

export function idsFrom(body: unknown): string[] {
  const ids = (body as { ids?: unknown } | null | undefined)?.ids
  return Array.isArray(ids) ? ids.map(String) : []
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export interface BatchOutcome<T extends object> {
  done: (T & { id: string, name: string })[]
  errors: BatchError[]
}

/** Spec §9: batch routes never fail as a whole; each card lands in `done` or `errors`. */
export function runOnIds<T extends object>(ids: string[], index: ScanIndex, act: (summary: SkillSummary, roots: Root[]) => T): BatchOutcome<T> {
  const done: (T & { id: string, name: string })[] = []
  const errors: BatchError[] = []
  for (const id of ids) {
    const summary = index.byId.get(id)
    if (!summary) {
      errors.push({ id, error: 'Skill not in the cabinet' })
      continue
    }
    try {
      const result = act(summary, index.roots)
      done.push({ id, name: summary.name, ...result })
    } catch (err) {
      errors.push({ id, error: errorMessage(err), path: summary.path })
    }
  }
  return { done, errors }
}
