import type { RootKind } from '#shared/types/catalog'

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v < 10 && i ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export function formatWhen(ms: number): string {
  if (!ms) return '—'
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(ms))
}

export function formatTokens(n: number): string {
  if (n < 1000) return `~${n} tok`
  const k = n / 1000
  return `~${k < 10 ? k.toFixed(1) : Math.round(k)}k tok`
}

export function kindStamp(kind: RootKind): 'user' | 'builtin' | 'plugin cache' | 'quarantine' {
  if (kind === 'builtin') return 'builtin'
  if (kind === 'plugin') return 'plugin cache'
  if (kind === 'quarantine') return 'quarantine'
  return 'user'
}
