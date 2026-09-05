import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readSkill, readSkillFile, scanRoots, toCatalogSkill, tokenEstimateFor } from '../../server/utils/scan'
import { createFixtureHome, TWIN_TEXT } from '../helpers/fixture-home'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn()
})

function scanFixture() {
  const f = createFixtureHome()
  cleanups.push(f.cleanup)
  const claude = { scopeId: 'claude', scopeLabel: '.claude', root: path.join(f.home, '.claude', 'skills'), kind: 'user' as const, recursive: false }
  const index = scanRoots([claude], { home: f.home })
  const by = (slug: string) => index.skills.find(s => s.slug === slug)!
  return { ...f, index, by }
}

describe('readSkill / toCatalogSkill', () => {
  it('returns the detail fields and the token estimate', () => {
    const { by } = scanFixture()
    const detail = readSkill(by('twin-a'))
    expect(detail.source).toBe(TWIN_TEXT)
    expect(detail.frontmatter).toEqual({ name: 'twin', description: 'a twin skill' })
    expect(detail.frontmatterRaw).toBe('name: twin\ndescription: a twin skill')
    expect(detail.body).toBe('Body.\n')
    expect(detail.files).toEqual([{ path: 'SKILL.md', size: Buffer.byteLength(TWIN_TEXT), mtime: expect.any(Number) }])
    expect(detail.bytes).toBe(Buffer.byteLength(TWIN_TEXT))
    expect(detail.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(detail.tokenEstimate).toBe(tokenEstimateFor(TWIN_TEXT))
    expect(detail.skillSize).toBe(Buffer.byteLength(TWIN_TEXT))
    expect(detail.copyCount).toBe(1)
    expect('skillFile' in detail).toBe(false)
  })

  it('toCatalogSkill strips detail-only fields and adds copyCount', () => {
    const { by } = scanFixture()
    const card = toCatalogSkill(by('twin-a'))
    expect(card.copyCount).toBe(1)
    expect(card.copies[0]!.scopeLabel).toBe('.claude')
    expect(card).not.toHaveProperty('findings')
    expect(card).not.toHaveProperty('frontmatter')
    expect(card).not.toHaveProperty('skillFile')
    expect(card.tokenEstimate).toBe(tokenEstimateFor(TWIN_TEXT))
  })

  it('lists files without following symlinks and skips node_modules', () => {
    const { by, paths } = scanFixture()
    fs.mkdirSync(path.join(paths.keys, 'node_modules', 'x'), { recursive: true })
    fs.writeFileSync(path.join(paths.keys, 'node_modules', 'x', 'index.js'), '1')
    const detail = readSkill(by('keys'))
    expect(detail.files.map(f => f.path)).toEqual(['scripts/read.sh', 'SKILL.md'])
  })
})

describe('readSkillFile', () => {
  it('returns text files inside the skill directory', () => {
    const { by } = scanFixture()
    const preview = readSkillFile(by('keys'), 'scripts/read.sh')
    expect(preview).toEqual({ path: 'scripts/read.sh', size: 18, binary: false, content: 'cat ~/.ssh/id_rsa\n' })
  })

  it('file skills always return the skill file itself', () => {
    const { by } = scanFixture()
    const preview = readSkillFile(by('note'), 'anything/../../etc/passwd')
    expect(preview.path).toBe('note.md')
    expect(preview.content).toContain('name: note')
  })

  it('rejects paths that escape the skill directory, including symlinks', () => {
    const { by } = scanFixture()
    expect(() => readSkillFile(by('keys'), '../../etc/passwd')).toThrow(expect.objectContaining({ status: 400, message: 'Path escapes skill directory' }))
    expect(() => readSkillFile(by('keys'), 'outside.md')).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => readSkillFile(by('keys'), 'scripts')).toThrow(expect.objectContaining({ status: 404 }))
    expect(() => readSkillFile(by('keys'), 'nope.txt')).toThrow(expect.objectContaining({ status: 404, message: 'File not found' }))
  })

  it('flags binary content and unknown extensions, and refuses huge files', () => {
    const { by, paths } = scanFixture()
    fs.writeFileSync(path.join(paths.keys, 'blob.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47]))
    fs.writeFileSync(path.join(paths.keys, 'nul.txt'), Buffer.from([0x61, 0x00, 0x62]))
    fs.writeFileSync(path.join(paths.keys, 'big.txt'), Buffer.alloc(1_500_001, 0x61))
    expect(readSkillFile(by('keys'), 'blob.png')).toMatchObject({ binary: true, content: null, size: 4 })
    expect(readSkillFile(by('keys'), 'nul.txt')).toMatchObject({ binary: true, content: null })
    expect(() => readSkillFile(by('keys'), 'big.txt')).toThrow(expect.objectContaining({ status: 413 }))
  })
})
