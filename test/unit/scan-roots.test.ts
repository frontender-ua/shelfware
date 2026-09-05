import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  contained,
  describeInstall,
  discoverRoots,
  findSkillFile,
  idFor,
  isSkillFileName,
  quarantineRoot,
  realPath,
} from '../../server/utils/scan'
import { createFixtureHome, skillText, tempDir, writeSkill } from '../helpers/fixture-home'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn()
})

function fixture() {
  const f = createFixtureHome()
  cleanups.push(f.cleanup)
  return f
}

describe('path helpers', () => {
  it('contained requires the child to be inside or equal to the parent', () => {
    expect(contained('/a/b/c', '/a/b')).toBe(true)
    expect(contained('/a/b', '/a/b')).toBe(true)
    expect(contained('/a/bc', '/a/b')).toBe(false)
    expect(contained('/a', '/a/b')).toBe(false)
  })

  it('idFor is the first 16 hex chars of sha1(path)', () => {
    expect(idFor('/tmp/x')).toMatch(/^[0-9a-f]{16}$/)
    expect(idFor('/tmp/x')).toBe(idFor('/tmp/x'))
    expect(idFor('/tmp/x')).not.toBe(idFor('/tmp/y'))
  })

  it('isSkillFileName accepts SKILL.md, skill.md and loose *.md except readme/changelog/license', () => {
    expect(isSkillFileName('SKILL.md')).toBe(true)
    expect(isSkillFileName('skill.md')).toBe(true)
    expect(isSkillFileName('note.md')).toBe(true)
    expect(isSkillFileName('Note.MD')).toBe(true)
    expect(isSkillFileName('README.md')).toBe(false)
    expect(isSkillFileName('CHANGELOG.md')).toBe(false)
    expect(isSkillFileName('LICENSE.md')).toBe(false)
    expect(isSkillFileName('licence.md')).toBe(false)
    expect(isSkillFileName('notes.txt')).toBe(false)
  })

  it('findSkillFile prefers SKILL.md, accepts skill.md, ignores a SKILL.md directory', () => {
    const dir = tempDir('shelfware-find-')
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }))
    expect(findSkillFile(dir)).toBeNull()
    fs.mkdirSync(path.join(dir, 'SKILL.md'))
    expect(findSkillFile(dir)).toBeNull()
    fs.rmdirSync(path.join(dir, 'SKILL.md'))
    fs.writeFileSync(path.join(dir, 'skill.md'), 'x')
    const lower = findSkillFile(dir)
    expect(lower).not.toBeNull()
    expect(path.basename(lower!).toLowerCase()).toBe('skill.md')
    expect(fs.statSync(lower!).isFile()).toBe(true)
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 'y')
    expect(findSkillFile(dir)).toBe(path.join(dir, 'SKILL.md'))
  })

  it('describeInstall reports links, files and dangling links', () => {
    const dir = tempDir('shelfware-install-')
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }))
    const skill = writeSkill(path.join(dir, 'real'), skillText('real', 'r'))
    fs.symlinkSync(skill, path.join(dir, 'link'))
    fs.symlinkSync('./nowhere', path.join(dir, 'dead'))
    fs.writeFileSync(path.join(dir, 'note.md'), 'x')

    const real = describeInstall(skill)
    expect(real).toMatchObject({ link: false, file: false, linkTarget: '' })
    expect(real.ino).toBeGreaterThan(0)
    expect(describeInstall(path.join(dir, 'link'))).toMatchObject({ link: true, file: false, linkTarget: skill, ino: real.ino })
    expect(describeInstall(path.join(dir, 'dead'))).toMatchObject({ link: true, file: false, linkTarget: './nowhere', ino: 0 })
    expect(describeInstall(path.join(dir, 'note.md'))).toMatchObject({ link: false, file: true })
    expect(describeInstall(path.join(dir, 'missing'))).toEqual({ link: false, file: false, linkTarget: '', dev: 0, ino: 0 })
  })

  it('realPath falls back to resolve for missing paths', () => {
    expect(realPath('/definitely/missing/path')).toBe(path.resolve('/definitely/missing/path'))
  })

  it('quarantineRoot lives under home/.skill-cabinet/quarantine', () => {
    expect(quarantineRoot({ home: '/h' })).toBe(path.join('/h', '.skill-cabinet', 'quarantine'))
  })
})

describe('discoverRoots', () => {
  it('finds every drawer shape of the fixture and honours the denylist', () => {
    const { home } = fixture()
    const roots = discoverRoots({ home })
    const byId = new Map(roots.map(r => [r.scopeId, r]))

    expect(byId.get('claude')).toEqual({
      scopeId: 'claude', scopeLabel: '.claude', root: path.join(home, '.claude', 'skills'), kind: 'user', recursive: false, deep: false,
    })
    expect(byId.get('codex')?.root).toBe(path.join(home, '.codex', 'skills'))
    expect(byId.get('cursor-builtin')).toMatchObject({ scopeLabel: '.cursor/skills-cursor', kind: 'builtin', recursive: false })
    expect(byId.get('cursor-plugins')).toMatchObject({ scopeLabel: '.cursor/plugins', kind: 'plugin', recursive: true })
    expect(byId.get('hermes-profile:coding')).toMatchObject({ scopeLabel: 'Hermes profile · coding', kind: 'user', deep: true })

    const gemini = roots.filter(r => r.scopeId === 'gemini')
    expect(gemini.map(r => r.scopeLabel).sort()).toEqual(['.gemini/antigravity', '.gemini/antigravity (global)'])

    expect(byId.has('cache')).toBe(false)
    expect(byId.has('skill-cabinet')).toBe(false)
    expect(roots.some(r => r.root.includes('.skill-cabinet'))).toBe(false)
    expect(roots.some(r => r.kind === 'quarantine')).toBe(false)
  })

  it('adds one quarantine root per scope folder with fromScope', () => {
    const { home } = fixture()
    fs.mkdirSync(path.join(quarantineRoot({ home }), 'claude', 'held'), { recursive: true })
    fs.mkdirSync(path.join(quarantineRoot({ home }), 'codex'), { recursive: true })
    fs.writeFileSync(path.join(quarantineRoot({ home }), 'quarantine.json'), '{"version":1,"entries":[]}\n')
    const held = discoverRoots({ home }).filter(r => r.kind === 'quarantine')
    expect(held.map(r => r.fromScope).sort()).toEqual(['claude', 'codex'])
    expect(held[0]).toMatchObject({ scopeId: 'quarantine', scopeLabel: 'Quarantine', recursive: false })
  })

  it('deduplicates drawers that resolve to the same realpath', () => {
    const { home } = fixture()
    fs.symlinkSync(path.join(home, '.claude'), path.join(home, '.agents'))
    const roots = discoverRoots({ home })
    const claudeSkills = fs.realpathSync(path.join(home, '.claude', 'skills'))
    expect(roots.filter(r => r.root === claudeSkills)).toHaveLength(1)
  })

  it('returns nothing for a missing home', () => {
    expect(discoverRoots({ home: '/definitely/missing/home' })).toEqual([])
  })
})
