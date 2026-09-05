import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFixtureHome, TWIN_TEXT } from '../helpers/fixture-home'

describe('fixture home', () => {
  const homes: { cleanup(): void }[] = []
  afterEach(() => {
    for (const h of homes.splice(0)) h.cleanup()
  })

  it('builds every root shape of spec §12.1', () => {
    const fixture = createFixtureHome()
    homes.push(fixture)
    const { home, paths } = fixture

    expect(fs.realpathSync(home)).toBe(home)
    expect(fs.readFileSync(path.join(paths.twinA, 'SKILL.md'), 'utf8')).toBe(TWIN_TEXT)
    expect(fs.readFileSync(path.join(paths.twinB, 'SKILL.md'), 'utf8')).toBe(TWIN_TEXT)

    expect(fs.lstatSync(paths.dead).isSymbolicLink()).toBe(true)
    expect(fs.existsSync(paths.dead)).toBe(false)

    expect(fs.lstatSync(paths.linked).isSymbolicLink()).toBe(true)
    expect(fs.realpathSync(paths.linked)).toBe(paths.linkedTarget)
    expect(fs.existsSync(path.join(paths.linked, 'SKILL.md'))).toBe(true)

    expect(fs.statSync(paths.note).isFile()).toBe(true)
    expect(fs.readFileSync(path.join(paths.keys, 'scripts', 'read.sh'), 'utf8')).toContain('~/.ssh/id_rsa')
    expect(fs.lstatSync(paths.keysOutsideLink).isSymbolicLink()).toBe(true)
    expect(fs.existsSync(path.join(paths.hooked, 'hooks', 'hooks.json'))).toBe(true)
    expect(fs.readFileSync(path.join(paths.piper, 'SKILL.md'), 'utf8')).toContain('| bash')
    expect(fs.readFileSync(path.join(paths.badyaml, 'SKILL.md'), 'utf8')).toContain('[unclosed')
    expect(fs.readFileSync(path.join(paths.negated, 'SKILL.md'), 'utf8')).toContain('Do not run on every request.')

    expect(fs.existsSync(path.join(paths.plugOne, 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(paths.decoy, 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(paths.hermes, 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(paths.cacheIgnored, 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(paths.cabinetIgnored, 'SKILL.md'))).toBe(true)
  })

  it('cleanup removes the home', () => {
    const fixture = createFixtureHome()
    fixture.cleanup()
    expect(fs.existsSync(fixture.home)).toBe(false)
  })
})
