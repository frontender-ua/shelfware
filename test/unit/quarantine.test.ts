import fs from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { assertDeletable, deleteSkillDir, quarantineRoot, scanSkills } from '../../server/utils/scan'
import { forgetQuarantinePath, quarantineSkill, readManifest, restoreSkill, scopeFolder } from '../../server/utils/quarantine'
import { tempDir } from '../helpers/fixture-home'

const HOME = tempDir('shelfware-q-')
const opts = { home: HOME }

afterAll(() => {
  fs.rmSync(HOME, { recursive: true, force: true })
})

function writeSkill(dir: string, name: string, body = 'does a thing'): string {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${body}\n---\n\n# ${name}\n`, 'utf8')
  return dir
}

function drawer(scope: string): string {
  const dir = path.join(HOME, scope, 'skills')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cardAt(target: string) {
  const index = scanSkills(opts)
  const skill = index.skills.find(s => path.resolve(s.path) === path.resolve(target))!
  return { index, skill }
}

function occupied(p: string): boolean {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

function linkKind(): 'dir' | 'junction' | null {
  for (const kind of ['dir', 'junction'] as const) {
    const probe = path.join(HOME, `.link-probe-${kind}`)
    try {
      fs.symlinkSync(HOME, probe, kind)
      const ok = fs.lstatSync(probe).isSymbolicLink()
      fs.unlinkSync(probe)
      if (ok) return kind
    } catch {
      /* try the next kind */
    }
  }
  return null
}

const LINK_KIND = linkKind()

function withReadOnlyQuarantineRoot(fn: () => void): boolean {
  const root = quarantineRoot(opts)
  const mode = fs.statSync(root).mode
  fs.chmodSync(root, 0o555)
  let blocked = false
  try {
    fs.writeFileSync(path.join(root, '.perm-probe'), 'x')
  } catch {
    blocked = true
  }
  try {
    if (!blocked) return false
    fn()
    return true
  } finally {
    fs.chmodSync(root, mode)
    try {
      fs.rmSync(path.join(root, '.perm-probe'), { force: true })
    } catch {
      /* gone */
    }
  }
}

describe('quarantine (upstream contract)', () => {
  it('scopeFolder sanitises scope ids', () => {
    expect(scopeFolder('claude')).toBe('claude')
    expect(scopeFolder('hermes-profile:coding')).toBe('hermes-profile-coding')
    expect(scopeFolder('')).toBe('loose')
    expect(scopeFolder('..')).toBe('loose')
  })

  it('quarantine moves a skill out of its drawer', () => {
    const origin = writeSkill(path.join(drawer('.claude'), 'alpha'), 'alpha')
    const { index, skill } = cardAt(origin)
    expect(skill).toBeTruthy()
    expect(skill.quarantined).toBe(false)

    const moved = quarantineSkill(skill, index.roots, opts)

    expect(occupied(origin)).toBe(false)
    expect(moved.to.startsWith(quarantineRoot(opts))).toBe(true)

    const after = scanSkills(opts)
    const held = after.skills.find(s => path.resolve(s.path) === path.resolve(moved.to))!
    expect(held).toBeTruthy()
    expect(held.quarantined).toBe(true)
    expect(held.scopeId).toBe('quarantine')
    expect(held.fromScope).toBe('claude')
    expect(held.name).toBe('alpha')
    expect(after.census.total).toBe(0)

    const record = readManifest(opts).entries.find(e => e.quarantinePath === moved.to)!
    expect(record).toMatchObject({ originPath: origin, name: 'alpha', slug: 'alpha', scopeId: 'claude', scopeLabel: '.claude', kind: 'user', file: false, link: false })
    expect(record.quarantinedAt).toBeGreaterThan(0)
  })

  it('a quarantined skill is never indexed as a live drawer', () => {
    const origin = writeSkill(path.join(drawer('.codex'), 'bravo'), 'bravo')
    const { index, skill } = cardAt(origin)
    quarantineSkill(skill, index.roots, opts)

    const after = scanSkills(opts)
    const live = after.skills.filter(s => !s.quarantined)
    expect(live.some(s => s.name === 'bravo')).toBe(false)
    expect(after.roots.some(r => r.kind !== 'quarantine' && r.root.includes('.skill-cabinet'))).toBe(false)
  })

  it('restore puts the skill back at its exact original path', () => {
    const origin = writeSkill(path.join(drawer('.agents'), 'charlie'), 'charlie')
    const first = cardAt(origin)
    const moved = quarantineSkill(first.skill, first.index.roots, opts)

    const second = cardAt(moved.to)
    const back = restoreSkill(second.skill, second.index.roots, opts)

    expect(path.resolve(back.to)).toBe(path.resolve(origin))
    expect(occupied(origin)).toBe(true)
    expect(occupied(moved.to)).toBe(false)
    expect(readManifest(opts).entries.some(e => e.quarantinePath === moved.to)).toBe(false)

    const after = scanSkills(opts)
    const live = after.skills.find(s => path.resolve(s.path) === path.resolve(origin))!
    expect(live).toBeTruthy()
    expect(live.quarantined).toBe(false)
    expect(live.scopeId).toBe('agents')
  })

  it('restore refuses an occupied path and keeps the quarantined copy', () => {
    const origin = writeSkill(path.join(drawer('.claude'), 'delta'), 'delta')
    const { index, skill } = cardAt(origin)
    const moved = quarantineSkill(skill, index.roots, opts)
    writeSkill(origin, 'delta', 'the reinstalled one')

    const held = cardAt(moved.to)
    expect(() => restoreSkill(held.skill, held.index.roots, opts)).toThrow(expect.objectContaining({ status: 409, message: expect.stringMatching(/already at/i) }))
    expect(occupied(moved.to)).toBe(true)
    expect(fs.readFileSync(path.join(origin, 'SKILL.md'), 'utf8')).toContain('reinstalled')
  })

  it('quarantining the same slug twice keeps both copies', () => {
    const origin = path.join(drawer('.claude'), 'echo')
    writeSkill(origin, 'echo', 'first cut')
    const first = cardAt(origin)
    const one = quarantineSkill(first.skill, first.index.roots, opts)

    writeSkill(origin, 'echo', 'second cut')
    const second = cardAt(origin)
    const two = quarantineSkill(second.skill, second.index.roots, opts)

    expect(one.to).not.toBe(two.to)
    expect(path.basename(two.to)).toBe('echo-2')
    expect(occupied(one.to)).toBe(true)
    expect(fs.readFileSync(path.join(one.to, 'SKILL.md'), 'utf8')).toContain('first cut')
  })

  it('a loose .md skill quarantines and restores under its own filename', () => {
    const origin = path.join(drawer('.codex'), 'foxtrot.md')
    fs.writeFileSync(origin, '---\nname: foxtrot\ndescription: a single file skill\n---\n\nbody\n', 'utf8')

    const { index, skill } = cardAt(origin)
    expect(skill.file).toBe(true)
    const moved = quarantineSkill(skill, index.roots, opts)
    expect(path.basename(moved.to)).toBe('foxtrot.md')

    const held = cardAt(moved.to)
    restoreSkill(held.skill, held.index.roots, opts)
    expect(occupied(origin)).toBe(true)
  })

  it.skipIf(!LINK_KIND)('quarantining a symlink moves the link, not the target', () => {
    const target = writeSkill(path.join(HOME, 'repo', 'golf'), 'golf')
    const origin = path.join(drawer('.agents'), 'golf')
    fs.symlinkSync(target, origin, LINK_KIND!)

    const { index, skill } = cardAt(origin)
    expect(skill.link).toBe(true)
    const moved = quarantineSkill(skill, index.roots, opts)

    expect(fs.lstatSync(moved.to).isSymbolicLink()).toBe(true)
    expect(occupied(path.join(target, 'SKILL.md'))).toBe(true)

    const held = cardAt(moved.to)
    restoreSkill(held.skill, held.index.roots, opts)
    expect(fs.lstatSync(origin).isSymbolicLink()).toBe(true)
  })

  it('restore refuses when the drawer it came from is gone', () => {
    const origin = writeSkill(path.join(drawer('.cursor'), 'juliet'), 'juliet')
    const { index, skill } = cardAt(origin)
    const moved = quarantineSkill(skill, index.roots, opts)
    fs.rmSync(path.join(HOME, '.cursor'), { recursive: true, force: true })

    const held = cardAt(moved.to)
    expect(() => restoreSkill(held.skill, held.index.roots, opts)).toThrow(expect.objectContaining({ status: 403, message: expect.stringMatching(/no cabinet drawer/i) }))
    expect(occupied(path.join(moved.to, 'SKILL.md'))).toBe(true)
  })

  it('quarantine refuses a path outside every cabinet root', () => {
    const stray = writeSkill(path.join(HOME, 'not-a-drawer', 'hotel'), 'hotel')
    const index = scanSkills(opts)
    expect(() =>
      quarantineSkill(
        { path: stray, name: 'hotel', slug: 'hotel', scopeId: 'claude', scopeLabel: '.claude', kind: 'user', quarantined: false },
        index.roots,
        opts,
      ),
    ).toThrow(expect.objectContaining({ status: 403 }))
    expect(occupied(path.join(stray, 'SKILL.md'))).toBe(true)
  })

  it('an already quarantined card cannot be quarantined again', () => {
    const origin = writeSkill(path.join(drawer('.claude'), 'india'), 'india')
    const { index, skill } = cardAt(origin)
    const moved = quarantineSkill(skill, index.roots, opts)
    const held = cardAt(moved.to)
    expect(() => quarantineSkill(held.skill, held.index.roots, opts)).toThrow(expect.objectContaining({ status: 400, message: expect.stringMatching(/already in the quarantine/i) }))
  })

  it('Hermes profile skills are labelled and scanned recursively', () => {
    const nested = path.join(HOME, '.hermes', 'profiles', 'coding', 'skills', 'nested', 'deep-research')
    writeSkill(nested, 'deep-research')
    const index = scanSkills(opts)
    const skill = index.skills.find(s => s.slug === 'deep-research')!
    expect(skill).toBeTruthy()
    expect(skill.scopeId).toBe('hermes-profile:coding')
    expect(skill.scopeLabel).toBe('Hermes profile · coding')
    expect(skill.quarantined).toBe(false)
  })

  it('deleting a quarantined skill drops its quarantine record', () => {
    const origin = writeSkill(path.join(drawer('.claude'), 'kilo'), 'kilo')
    const { index, skill } = cardAt(origin)
    const moved = quarantineSkill(skill, index.roots, opts)
    const held = cardAt(moved.to)
    const target = assertDeletable(held.skill, held.index.roots, opts)
    deleteSkillDir(target)
    forgetQuarantinePath(target, opts)
    expect(occupied(moved.to)).toBe(false)
    expect(readManifest(opts).entries.some(e => e.quarantinePath === moved.to)).toBe(false)
  })

  it('a leftover manifest tmp file does not replace the live records', () => {
    const origin = writeSkill(path.join(drawer('.claude'), 'november'), 'november')
    const { index, skill } = cardAt(origin)
    quarantineSkill(skill, index.roots, opts)
    const dest = path.join(quarantineRoot(opts), 'quarantine.json')
    fs.writeFileSync(`${dest}.99999.tmp`, '{not json', 'utf8')
    expect(readManifest(opts).entries.some(e => e.originPath === origin)).toBe(true)
  })

  it('entries whose quarantinePath is gone are dropped on read', () => {
    const origin = writeSkill(path.join(drawer('.claude'), 'papa'), 'papa')
    const { index, skill } = cardAt(origin)
    const moved = quarantineSkill(skill, index.roots, opts)
    fs.rmSync(moved.to, { recursive: true, force: true })
    expect(readManifest(opts).entries.some(e => e.quarantinePath === moved.to)).toBe(false)
  })

  it('a failed manifest write rolls the skill back to its drawer', () => {
    const kept = writeSkill(path.join(drawer('.claude'), 'lima'), 'lima')
    const first = cardAt(kept)
    quarantineSkill(first.skill, first.index.roots, opts)
    const origin = writeSkill(path.join(drawer('.claude'), 'mike'), 'mike')

    const ran = withReadOnlyQuarantineRoot(() => {
      const second = cardAt(origin)
      expect(() => quarantineSkill(second.skill, second.index.roots, opts)).toThrow()
      expect(occupied(path.join(origin, 'SKILL.md'))).toBe(true)
    })
    if (!ran) return

    expect(readManifest(opts).entries.some(e => e.originPath === kept)).toBe(true)
    expect(readManifest(opts).entries.some(e => e.originPath === origin)).toBe(false)
  })

  it('a failed restore write puts the skill back in the quarantine', () => {
    const origin = writeSkill(path.join(drawer('.claude'), 'oscar'), 'oscar')
    const { index, skill } = cardAt(origin)
    const moved = quarantineSkill(skill, index.roots, opts)

    withReadOnlyQuarantineRoot(() => {
      const held = cardAt(moved.to)
      expect(() => restoreSkill(held.skill, held.index.roots, opts)).toThrow()
      expect(occupied(path.join(moved.to, 'SKILL.md'))).toBe(true)
      expect(occupied(origin)).toBe(false)
    })
  })
})
