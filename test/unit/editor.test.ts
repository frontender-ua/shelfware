import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { saveSkillSource, sha256 } from '../../server/utils/editor'
import { scanRoots } from '../../server/utils/scan'
import { createFixtureHome, skillText, writeSkill } from '../helpers/fixture-home'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn()
})

function scanned() {
  const f = createFixtureHome()
  cleanups.push(f.cleanup)
  const root = { scopeId: 'claude', scopeLabel: '.claude', root: path.join(f.home, '.claude', 'skills'), kind: 'user' as const, recursive: false }
  const rescan = () => scanRoots([root], { home: f.home })
  return { ...f, root, rescan, opts: { home: f.home } }
}

function leftovers(dir: string): string[] {
  return fs.readdirSync(dir).filter(name => name.endsWith('.tmp'))
}

describe('saveSkillSource', () => {
  it('writes atomically, preserves the file mode and returns the new hash', () => {
    const { paths, rescan, opts } = scanned()
    const file = path.join(paths.alpha, 'SKILL.md')
    fs.chmodSync(file, 0o600)
    const index = rescan()
    const alpha = index.skills.find(s => s.slug === 'alpha')!
    const source = skillText('alpha', 'edited', 'Edited body.\n')

    const result = saveSkillSource(alpha, { source, baseHash: alpha.contentHash! }, index.roots, opts)

    expect(fs.readFileSync(file, 'utf8')).toBe(source)
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    expect(leftovers(paths.alpha)).toEqual([])
    expect(result).toEqual({ path: file, contentHash: sha256(source) })
    expect(rescan().skills.find(s => s.slug === 'alpha')!.contentHash).toBe(result.contentHash)
  })

  it('rejects a stale baseHash with 409 and the current hash, leaving the file untouched', () => {
    const { paths, rescan, opts } = scanned()
    const index = rescan()
    const alpha = index.skills.find(s => s.slug === 'alpha')!
    const before = fs.readFileSync(path.join(paths.alpha, 'SKILL.md'), 'utf8')
    expect(() => saveSkillSource(alpha, { source: 'x', baseHash: 'deadbeef' }, index.roots, opts)).toThrow(
      expect.objectContaining({ status: 409, message: 'File changed on disk since it was loaded', data: { currentHash: alpha.contentHash } }),
    )
    expect(fs.readFileSync(path.join(paths.alpha, 'SKILL.md'), 'utf8')).toBe(before)
    expect(leftovers(paths.alpha)).toEqual([])
  })

  it('refuses a SKILL.md symlinked outside the skill directory', () => {
    const { home, paths, rescan, opts } = scanned()
    const escape = path.join(home, '.claude', 'skills', 'escape')
    fs.mkdirSync(escape)
    fs.symlinkSync(path.join(paths.linkedTarget, 'SKILL.md'), path.join(escape, 'SKILL.md'))
    const index = rescan()
    const card = index.skills.find(s => s.slug === 'escape')!
    expect(card.physicality).toBe('physical')
    expect(() => saveSkillSource(card, { source: 'x', baseHash: card.contentHash! }, index.roots, opts)).toThrow(
      expect.objectContaining({ status: 400, message: 'Skill file escapes its directory' }),
    )
    expect(fs.readFileSync(path.join(paths.linkedTarget, 'SKILL.md'), 'utf8')).not.toBe('x')
  })

  it('saves a loose file skill in place', () => {
    const { paths, rescan, opts } = scanned()
    const index = rescan()
    const note = index.skills.find(s => s.slug === 'note')!
    const source = skillText('note', 'edited note')
    const result = saveSkillSource(note, { source, baseHash: note.contentHash! }, index.roots, opts)
    expect(result.path).toBe(paths.note)
    expect(fs.readFileSync(paths.note, 'utf8')).toBe(source)
  })

  it('refuses broken cards and cards outside the roots', () => {
    const { home, rescan, opts } = scanned()
    const index = rescan()
    const dead = index.skills.find(s => s.slug === 'dead')!
    expect(() => saveSkillSource(dead, { source: 'x', baseHash: '' }, index.roots, opts)).toThrow(
      expect.objectContaining({ status: 400, message: 'Nothing to edit: the link target is gone' }),
    )
    const stray = writeSkill(path.join(home, 'elsewhere', 'stray'), skillText('stray', 's'))
    const alpha = index.skills.find(s => s.slug === 'alpha')!
    const fake = { ...alpha, path: stray, skillFile: path.join(stray, 'SKILL.md') }
    expect(() => saveSkillSource(fake, { source: 'x', baseHash: alpha.contentHash! }, index.roots, opts)).toThrow(
      expect.objectContaining({ status: 403 }),
    )
  })

  it('sha256 hashes bytes, not characters', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256(Buffer.from('abc'))).toBe(sha256('abc'))
  })
})
