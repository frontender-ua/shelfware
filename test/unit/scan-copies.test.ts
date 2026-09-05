import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { attachCopies } from '../../server/utils/scan'
import { tempDir } from '../helpers/fixture-home'

function hash(text: string | Buffer): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

describe('attachCopies (upstream contract)', () => {
  it('identical markdown bodies are copies of each other', () => {
    const dir = tempDir('shelfware-copies-')
    try {
      const body = '---\nname: twin\ndescription: same\n---\n\nSame body.\n'
      const a = path.join(dir, 'a.md')
      const b = path.join(dir, 'b.md')
      fs.writeFileSync(a, body)
      fs.writeFileSync(b, body)
      const digest = hash(fs.readFileSync(a))
      const skills = [
        { id: 'one', scopeLabel: '.agents', path: a, contentHash: digest, physicality: 'physical' as const },
        { id: 'two', scopeLabel: '.claude', path: b, contentHash: digest, physicality: 'physical' as const },
      ]
      const linked = attachCopies(skills)
      expect(linked[0]!.copies).toEqual([{ id: 'two', scopeLabel: '.claude', path: b }])
      expect(linked[1]!.copies).toEqual([{ id: 'one', scopeLabel: '.agents', path: a }])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a reference to identical content is not a copy', () => {
    const skills = [
      { id: 'one', scopeLabel: '.agents', path: '/tmp/a', contentHash: hash('alpha'), physicality: 'physical' as const },
      { id: 'two', scopeLabel: '.claude', path: '/tmp/b', contentHash: hash('alpha'), physicality: 'reference' as const },
    ]
    const linked = attachCopies(skills)
    expect(linked[0]!.copies).toEqual([])
    expect(linked[1]!.copies).toEqual([])
  })

  it('different bodies are not copies', () => {
    const skills = [
      { id: 'one', scopeLabel: '.agents', path: '/tmp/a', contentHash: hash('alpha'), physicality: 'physical' as const },
      { id: 'two', scopeLabel: '.claude', path: '/tmp/b', contentHash: hash('beta'), physicality: 'physical' as const },
    ]
    const linked = attachCopies(skills)
    expect(linked[0]!.copies).toEqual([])
    expect(linked[1]!.copies).toEqual([])
  })
})
