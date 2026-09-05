import { parse as parseYaml } from 'yaml'

export interface ParsedFrontmatter {
  data: Record<string, unknown>
  content: string
  raw: string
}

export const FRONTMATTER_PARSE_ERROR = 'YAML frontmatter could not be parsed'

/**
 * Tolerant frontmatter split, ported from skill-cabinet scan.js. A block is
 * `---` at offset 0 up to the next `\n---`. CRLF line endings are normalized
 * to `\n` before splitting so no `\r` leaks into `data`, `raw` or `content`.
 * Invalid YAML yields `{ _parseError }` instead of throwing; non-object YAML
 * yields `{}`.
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  const normalized = text.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---')) return { data: {}, content: normalized, raw: '' }
  const end = normalized.indexOf('\n---', 3)
  if (end === -1) return { data: {}, content: normalized, raw: '' }
  const raw = normalized.slice(3, end).replace(/^\n/, '')
  let data: Record<string, unknown> = {}
  try {
    const parsed: unknown = parseYaml(raw, { logLevel: 'error' })
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>
    }
  } catch {
    data = { _parseError: FRONTMATTER_PARSE_ERROR }
  }
  const content = normalized.slice(end + 4).replace(/^\n\n?/, '')
  return { data, content, raw }
}

export function stringField(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  return typeof value === 'string' ? value : ''
}
