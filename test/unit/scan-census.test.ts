import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Root } from '../../shared/types/catalog'
import { scanRoots, tokenEstimateFor } from '../../server/utils/scan'
import { tempDir } from '../helpers/fixture-home'

const BODY = '---\nname: sample\ndescription: a sample skill\n---\n\nBody.\n'
const UNIQUE = '---\nname: deep-research\ndescription: unique\n---\n\nUnique body.\n'
const ASSET = "console.log('companion script');\n"

const dirs: string[] = []
function scratch(): string {
  const dir = tempDir('shelfware-census-')
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function writeSkill(dir: string, name: string, text = BODY): string {
  const skill = path.join(dir, name)
  fs.mkdirSync(skill, { recursive: true })
  fs.writeFileSync(path.join(skill, 'SKILL.md'), text)
  return skill
}

function root(dir: string, scopeId: string): Root {
  return { scopeId, scopeLabel: scopeId, root: dir, kind: 'user', recursive: false }
}

function folderBytes(skillDir: string): number {
  let bytes = 0
  for (const entry of fs.readdirSync(skillDir)) bytes += fs.statSync(path.join(skillDir, entry)).size
  return bytes
}

describe('census (upstream contract + tokenEstimate)', () => {
  it('separates physical, references, and broken', () => {
    const dir = scratch()
    const skillsDir = path.join(dir, 'skills')
    const linksDir = path.join(dir, 'links')
    writeSkill(skillsDir, 'deep-research', UNIQUE)
    writeSkill(skillsDir, 'twin-a')
    writeSkill(skillsDir, 'twin-b')
    fs.mkdirSync(linksDir, { recursive: true })
    fs.symlinkSync(path.join(skillsDir, 'deep-research'), path.join(linksDir, 'deep-research'))
    fs.symlinkSync('./nowhere', path.join(linksDir, 'dead'))
    const result = scanRoots([root(skillsDir, 'skills'), root(linksDir, 'links')], { home: dir })
    expect(result.census).toEqual({
      total: 5,
      physical: 3,
      unique: 2,
      duplicateCopies: 2,
      duplicateBytes: 2 * Buffer.byteLength(BODY, 'utf8'),
      references: 1,
      broken: 1,
      duplicates: 2,
      tokenEstimate: tokenEstimateFor(UNIQUE) + 2 * tokenEstimateFor(BODY),
    })
  })

  it('duplicateBytes counts the whole folder of each duplicate', () => {
    const dir = scratch()
    const skillsDir = path.join(dir, 'skills')
    writeSkill(skillsDir, 'twin-a')
    fs.writeFileSync(path.join(skillsDir, 'twin-a', 'run.sh'), ASSET)
    writeSkill(skillsDir, 'twin-b')
    fs.writeFileSync(path.join(skillsDir, 'twin-b', 'run.sh'), ASSET)
    const result = scanRoots([root(skillsDir, 'skills')], { home: dir })
    const expected = folderBytes(path.join(skillsDir, 'twin-a')) + folderBytes(path.join(skillsDir, 'twin-b'))
    expect(result.census.duplicateCopies).toBe(2)
    expect(result.census.duplicateBytes).toBe(expected)
    expect(result.census.duplicateBytes).toBeGreaterThan(2 * BODY.length)
  })

  it('references and broken cards add no bytes and no tokens to the census', () => {
    const dir = scratch()
    const skillsDir = path.join(dir, 'skills')
    const linksDir = path.join(dir, 'links')
    writeSkill(skillsDir, 'deep-research')
    fs.mkdirSync(linksDir, { recursive: true })
    fs.symlinkSync(path.join(skillsDir, 'deep-research'), path.join(linksDir, 'deep-research'))
    fs.symlinkSync('./nowhere', path.join(linksDir, 'dead'))
    const result = scanRoots([root(skillsDir, 'skills'), root(linksDir, 'links')], { home: dir })
    expect(result.census.duplicateCopies).toBe(0)
    expect(result.census.duplicateBytes).toBe(0)
    expect(result.census.references).toBe(1)
    expect(result.census.broken).toBe(1)
    expect(result.census.tokenEstimate).toBe(tokenEstimateFor(BODY))
    const reference = result.skills.find(s => s.physicality === 'reference')!
    expect(reference.tokenEstimate).toBe(tokenEstimateFor(BODY))
  })

  it('quarantined cards are excluded from the census', () => {
    const dir = scratch()
    const skillsDir = path.join(dir, 'skills')
    const held = path.join(dir, '.skill-cabinet', 'quarantine', 'claude')
    writeSkill(skillsDir, 'live')
    writeSkill(held, 'held')
    const result = scanRoots(
      [root(skillsDir, 'skills'), { scopeId: 'quarantine', scopeLabel: 'Quarantine', root: held, kind: 'quarantine', recursive: false, fromScope: 'claude' }],
      { home: dir },
    )
    expect(result.skills).toHaveLength(2)
    expect(result.skills.find(s => s.slug === 'held')).toMatchObject({ quarantined: true, fromScope: 'claude', scopeId: 'quarantine' })
    expect(result.census.total).toBe(1)
    expect(result.census.tokenEstimate).toBe(tokenEstimateFor(BODY))
  })

  it('tokenEstimateFor is ceil(chars / 4)', () => {
    expect(tokenEstimateFor('')).toBe(0)
    expect(tokenEstimateFor('abcd')).toBe(1)
    expect(tokenEstimateFor('abcde')).toBe(2)
    expect(tokenEstimateFor('привет')).toBe(2)
  })
})
