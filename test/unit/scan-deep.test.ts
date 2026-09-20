import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Root } from '../../shared/types/catalog'
import { scanRoots } from '../../server/utils/scan'
import { skillText, tempDir, writeSkill, writeTextFile } from '../helpers/fixture-home'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn()
})

function home(prefix = 'shelfware-deep-'): string {
  const dir = tempDir(prefix)
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function pluginRoot(root: string): Root {
  return { scopeId: 'plugins', scopeLabel: 'plugins', root, kind: 'plugin', recursive: true, deep: true }
}

describe('a recursive drawer that is also deep', () => {
  it('walks category directories inside a skills container', () => {
    const dir = home()
    writeSkill(
      path.join(dir, 'plugins', 'mart', 'plug', '1.0.0', 'skills', 'engineering', 'nested-one'),
      skillText('nested-one', 'grouped by category'),
    )
    const index = scanRoots([pluginRoot(path.join(dir, 'plugins'))], { home: dir })
    expect(index.skills.map(s => s.slug)).toEqual(['nested-one'])
  })

  it('adopts nothing outside a skills container', () => {
    const dir = home()
    writeSkill(
      path.join(dir, 'plugins', 'mart', 'plug', '1.0.0', 'skills', 'engineering', 'nested-one'),
      skillText('nested-one', 'grouped by category'),
    )
    writeTextFile(path.join(dir, 'plugins', 'mart', 'CONTEXT.md'), skillText('context', 'a repo doc, not a skill'))
    writeTextFile(path.join(dir, 'plugins', 'mart', 'docs', 'guide.md'), skillText('guide', 'also not a skill'))
    const index = scanRoots([pluginRoot(path.join(dir, 'plugins'))], { home: dir })
    expect(index.skills.map(s => s.slug)).toEqual(['nested-one'])
  })
})
