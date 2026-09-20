import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Root } from '../../shared/types/catalog'
import { discoverRoots, scanRoots } from '../../server/utils/scan'
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

describe('generic $HOME drawers', () => {
  it('finds skills nested below the drawer, including under dot directories', () => {
    const dir = home('shelfware-generic-')
    writeSkill(path.join(dir, '.codex', 'skills', '.system', 'skill-creator'), skillText('skill-creator', 'a codex system skill'))
    writeSkill(path.join(dir, '.agents', 'skills', 'misc', 'agent-nested'), skillText('agent-nested', 'grouped by category'))
    writeSkill(path.join(dir, '.agents', 'skills', 'flat-one'), skillText('flat-one', 'straight in the drawer'))

    const roots = discoverRoots({ home: dir })
    expect(roots.find(r => r.scopeId === 'codex')?.deep).toBe(true)

    const index = scanRoots(roots, { home: dir })
    expect(index.skills.map(s => s.slug).sort()).toEqual(['agent-nested', 'flat-one', 'skill-creator'])
  })
})

describe('plugin drawers', () => {
  it('splits cache and marketplaces into their own drawers and never adopts the parent twice', () => {
    const dir = home('shelfware-plugins-')
    writeSkill(
      path.join(dir, '.claude', 'plugins', 'cache', 'mart', 'plug', '1.0.0', 'skills', 'engineering', 'cached-one'),
      skillText('cached-one', 'installed from a marketplace'),
    )
    writeSkill(
      path.join(dir, '.claude', 'plugins', 'marketplaces', 'mart', 'skills', 'engineering', 'market-one'),
      skillText('market-one', 'the marketplace checkout'),
    )

    const roots = discoverRoots({ home: dir })
    const byId = new Map(roots.map(r => [r.scopeId, r]))
    expect(byId.get('claude-plugins-cache')).toMatchObject({
      scopeLabel: '.claude/plugins/cache', kind: 'plugin', recursive: true, deep: true,
    })
    expect(byId.get('claude-plugins-marketplaces')).toMatchObject({
      scopeLabel: '.claude/plugins/marketplaces', kind: 'plugin', recursive: true, deep: true,
    })
    expect(byId.has('claude-plugins')).toBe(false)
    expect(roots.some(r => r.root === path.join(dir, '.claude', 'plugins'))).toBe(false)

    const index = scanRoots(roots, { home: dir })
    expect(index.skills.map(s => s.slug).sort()).toEqual(['cached-one', 'market-one'])
    expect(index.skills.find(s => s.slug === 'cached-one')?.scopeId).toBe('claude-plugins-cache')
  })

  it('adopts a plugins folder without those subfolders as one drawer', () => {
    const dir = home('shelfware-plugins-flat-')
    writeSkill(
      path.join(dir, '.cursor', 'plugins', 'p', 'skills', 'plug-one'),
      skillText('plug-one', 'from a cursor plugin'),
    )
    const roots = discoverRoots({ home: dir })
    expect(roots.find(r => r.scopeId === 'cursor-plugins')).toMatchObject({
      scopeLabel: '.cursor/plugins', kind: 'plugin', recursive: true, deep: true,
    })
    const index = scanRoots(roots, { home: dir })
    expect(index.skills.map(s => s.slug)).toEqual(['plug-one'])
  })
})

describe('repository documents inside a drawer', () => {
  it('does not turn them into cards', () => {
    const dir = home('shelfware-docs-')
    const container = path.join(dir, '.claude', 'plugins', 'marketplaces', 'mart', 'skills', 'engineering')
    writeSkill(path.join(container, 'market-one'), skillText('market-one', 'a real skill'))
    for (const name of ['security.md', 'contributing.md', 'description.md', 'readme.es.md']) {
      writeTextFile(path.join(container, name), skillText(name.replace('.md', ''), 'a repo document'))
    }
    const index = scanRoots(discoverRoots({ home: dir }), { home: dir })
    expect(index.skills.map(s => s.slug)).toEqual(['market-one'])
  })
})
