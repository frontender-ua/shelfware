import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { skillDetailFor } from '../../server/utils/detail'
import { quarantineSkill } from '../../server/utils/quarantine'
import { scanSkills } from '../../server/utils/scan'
import { createFixtureHome } from '../helpers/fixture-home'

describe('skillDetailFor', () => {
  let cleanup = () => {}
  afterEach(() => cleanup())

  it('adds the quarantine record to quarantined cards only', () => {
    const f = createFixtureHome()
    cleanup = f.cleanup
    const opts = { home: f.home }
    const before = scanSkills(opts)
    const bravo = before.skills.find(s => s.slug === 'bravo')!
    expect(skillDetailFor(bravo, opts)).not.toHaveProperty('quarantinedFrom')

    const moved = quarantineSkill(bravo, before.roots, opts)
    const after = scanSkills(opts)
    const held = after.skills.find(s => path.resolve(s.path) === path.resolve(moved.to))!
    const detail = skillDetailFor(held, opts)
    expect(detail.quarantinedFrom).toBe(f.paths.bravo)
    expect(detail.quarantinedAt).toBeGreaterThan(0)
    expect(detail.source).toBe(fs.readFileSync(path.join(moved.to, 'SKILL.md'), 'utf8'))
  })
})
