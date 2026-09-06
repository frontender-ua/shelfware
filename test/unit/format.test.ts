import { describe, expect, it } from 'vitest'
import { formatBytes, formatTokens, formatWhen, kindStamp } from '../../app/utils/format'

describe('format helpers', () => {
  it('formatBytes mirrors upstream', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10 * 1024)).toBe('10 KB')
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB')
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5120 MB')
  })

  it('formatWhen renders a date or a dash', () => {
    expect(formatWhen(0)).toBe('—')
    expect(formatWhen(Date.UTC(2026, 8, 5, 12))).toMatch(/2026/)
  })

  it('formatTokens abbreviates thousands', () => {
    expect(formatTokens(0)).toBe('~0 tok')
    expect(formatTokens(842)).toBe('~842 tok')
    expect(formatTokens(1234)).toBe('~1.2k tok')
    expect(formatTokens(15_000)).toBe('~15k tok')
  })

  it('kindStamp names the drawer kind', () => {
    expect(kindStamp('user')).toBe('user')
    expect(kindStamp('builtin')).toBe('builtin')
    expect(kindStamp('plugin')).toBe('plugin cache')
    expect(kindStamp('quarantine')).toBe('quarantine')
  })
})
