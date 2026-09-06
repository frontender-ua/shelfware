import { timingSafeEqual } from 'node:crypto'

/** Hostnames the Host and Origin checks accept. `URL.hostname` keeps IPv6 brackets. */
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** Spec §10.2: mutation bodies are capped at 1 MiB. */
export const MAX_BODY_BYTES = 1_048_576

export interface ParsedHost {
  hostname: string
  port: string
}

export function parseHostHeader(host: string | undefined): ParsedHost | null {
  if (!host) return null
  try {
    const url = new URL(`http://${host}`)
    return { hostname: url.hostname, port: url.port }
  } catch {
    return null
  }
}

/**
 * The port the bin (NITRO_PORT) or @nuxt/test-utils (PORT) told Nitro to bind.
 * Null under plain `nuxt dev`, where the port is not checked.
 */
export function expectedPort(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.NITRO_PORT ?? env.PORT
  return raw && /^\d+$/.test(raw) ? raw : null
}

function portMatches(port: string, expected: string | null, fallback: string): boolean {
  if (expected === null) return true
  return (port || fallback) === expected
}

export function isAllowedHost(host: string | undefined, expected: string | null): boolean {
  const parsed = parseHostHeader(host)
  if (!parsed || !LOOPBACK_HOSTNAMES.has(parsed.hostname)) return false
  return portMatches(parsed.port, expected, '80')
}

export function isLoopbackOrigin(origin: string | undefined, expected: string | null): boolean {
  if (!origin) return false
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (!LOOPBACK_HOSTNAMES.has(url.hostname)) return false
  return portMatches(url.port, expected, url.protocol === 'https:' ? '443' : '80')
}

/** Spec §10.3: the session token is always `sw_` followed by 64 hex characters. */
export const TOKEN_PATTERN = /^sw_[0-9a-f]{64}$/

export function isWellFormedToken(value: string | undefined): boolean {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

/** Constant-time comparison; length mismatch and empty values are always false. */
export function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (!actual || !expected) return false
  const a = Buffer.from(actual, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
