import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_TTL_MS, getIndex, invalidate, scannedAt } from '../../server/utils/catalog'
import { createFixtureHome } from '../helpers/fixture-home'

describe('catalog cache', () => {
  let home: string
  let cleanup: () => void
  beforeEach(() => {
    const f = createFixtureHome()
    home = f.home
    cleanup = f.cleanup
    invalidate()
  })
  afterEach(() => {
    invalidate()
    cleanup()
  })

  it('scans once and serves the same index inside the TTL', () => {
    let clock = 1_000
    const now = () => clock
    const first = getIndex({ home, now })
    expect(scannedAt()).toBe(1_000)
    clock += CATALOG_TTL_MS - 1
    expect(getIndex({ home, now })).toBe(first)
    expect(scannedAt()).toBe(1_000)
  })

  it('rescans after the TTL', () => {
    let clock = 1_000
    const now = () => clock
    const first = getIndex({ home, now })
    clock += CATALOG_TTL_MS
    const second = getIndex({ home, now })
    expect(second).not.toBe(first)
    expect(second.skills.length).toBe(first.skills.length)
    expect(scannedAt()).toBe(1_000 + CATALOG_TTL_MS)
  })

  it('force rescans immediately and invalidate drops the cache', () => {
    const now = () => 5
    const first = getIndex({ home, now })
    expect(getIndex({ home, now, force: true })).not.toBe(first)
    const cached = getIndex({ home, now })
    invalidate()
    expect(scannedAt()).toBe(0)
    expect(getIndex({ home, now })).not.toBe(cached)
  })
})
