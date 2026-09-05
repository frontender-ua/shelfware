import { scanSkills, type HomeOptions, type ScanIndex } from './scan'

/** Spec §3.2: the in-memory index lives 15 s; every mutation calls `invalidate()`. */
export const CATALOG_TTL_MS = 15_000

interface CacheState {
  at: number
  index: ScanIndex | null
}

let state: CacheState = { at: 0, index: null }

export interface GetIndexOptions extends HomeOptions {
  force?: boolean
  now?: () => number
}

export function getIndex(opts: GetIndexOptions = {}): ScanIndex {
  const now = opts.now ?? Date.now
  if (!opts.force && state.index && now() - state.at < CATALOG_TTL_MS) return state.index
  const index = scanSkills(opts)
  state = { at: now(), index }
  return index
}

export function invalidate(): void {
  state = { at: 0, index: null }
}

export function scannedAt(): number {
  return state.at
}
