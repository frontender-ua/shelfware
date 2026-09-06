import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createOriginContext, inferOrigin } from '../../server/utils/origin'
import { tempDir, writeSkill, writeTextFile, skillText } from '../helpers/fixture-home'

let home: string
beforeEach(() => {
  home = tempDir('shelfware-origin-')
})
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
})

function skill(rel: string): string {
  return writeSkill(path.join(home, rel), skillText('s', 'a skill'))
}

describe('inferOrigin', () => {
  it('reads source or repository from frontmatter as attested', () => {
    const dir = skill('.claude/skills/s')
    const ctx = createOriginContext(home)
    expect(inferOrigin(dir, { source: 'https://github.com/o/r' }, '', ctx)).toEqual({
      kind: 'github', label: 'o/r', url: 'https://github.com/o/r', via: 'frontmatter', certainty: 'attested',
    })
    expect(inferOrigin(dir, { repository: { url: 'git@github.com:o/r.git' } }, '', ctx)?.label).toBe('o/r')
    expect(inferOrigin(dir, { metadata: { source: 'o/r' } }, '', ctx)?.label).toBe('o/r')
    expect(inferOrigin(dir, { source: 'https://example.com/x/y/' }, '', ctx)).toEqual({
      kind: 'url', label: 'example.com/x/y', url: 'https://example.com/x/y/', via: 'frontmatter', certainty: 'attested',
    })
  })

  it('strips embedded credentials from a url origin', () => {
    const dir = skill('.claude/skills/s')
    const ctx = createOriginContext(home)
    const result = inferOrigin(dir, { source: 'https://user:s3cret@example.com/x/y' }, '', ctx)
    expect(result).toMatchObject({ kind: 'url', label: 'example.com/x/y', url: 'https://example.com/x/y' })
    expect(JSON.stringify(result)).not.toContain('s3cret')
    expect(JSON.stringify(result)).not.toContain('user')

    // A credentialed github url misses the github regex (the `@` breaks the
    // `https://github.com` alternation) and falls to the generic branch, which
    // still strips the credentials.
    const gh = inferOrigin(dir, { source: 'https://tokenvalue@github.com/o/r' }, '', ctx)
    expect(gh).toMatchObject({ kind: 'url', url: 'https://github.com/o/r' })
    expect(JSON.stringify(gh)).not.toContain('tokenvalue')
  })

  it('takes homepage and url only when they point at github', () => {
    const dir = skill('.claude/skills/s')
    const ctx = createOriginContext(home)
    expect(inferOrigin(dir, { homepage: 'https://github.com/o/r#readme' }, '', ctx)?.label).toBe('o/r')
    expect(inferOrigin(dir, { homepage: 'https://example.com' }, '', ctx)).toBeNull()
    expect(inferOrigin(dir, { url: 'not a url' }, '', ctx)).toBeNull()
  })

  it('reads the install path', () => {
    const market = skill('.claude/plugins/marketplaces/github.com/o/r/skills/s')
    const nested = skill('.cursor/plugins/cache/github.com/o2/r2/skills/s')
    const www = skill('.cursor/plugins/cache/github.com/www/r3/skills/s')
    const ctx = createOriginContext(home)
    expect(inferOrigin(market, {}, '', ctx)).toMatchObject({ label: 'o/r', via: 'path', certainty: 'attested' })
    expect(inferOrigin(nested, {}, '', ctx)).toMatchObject({ label: 'o2/r2', via: 'path' })
    expect(inferOrigin(www, {}, '', ctx)).toBeNull()
  })

  it('finds plugin.json at the skill dir as attested and in an ancestor as inferred', () => {
    const own = skill('.claude/skills/own')
    writeTextFile(path.join(own, 'plugin.json'), JSON.stringify({ repository: 'https://github.com/o/own' }))
    const plugin = path.join(home, '.cursor', 'plugins', 'p')
    writeTextFile(path.join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ homepage: 'https://github.com/o/plug' }))
    const inside = skill('.cursor/plugins/p/skills/inside')
    const ctx = createOriginContext(home)
    expect(inferOrigin(own, {}, '', ctx)).toMatchObject({ label: 'o/own', via: 'plugin', certainty: 'attested' })
    expect(inferOrigin(inside, {}, '', ctx)).toMatchObject({ label: 'o/plug', via: 'plugin', certainty: 'inferred' })
  })

  it('caches the walked chain for the rest of the scan', () => {
    const plugin = path.join(home, '.cursor', 'plugins', 'p')
    const pluginFile = writeTextFile(path.join(plugin, 'plugin.json'), JSON.stringify({ repository: 'o/plug' }))
    const a = skill('.cursor/plugins/p/skills/a')
    const b = skill('.cursor/plugins/p/skills/b')
    const ctx = createOriginContext(home)
    expect(inferOrigin(a, {}, '', ctx)?.label).toBe('o/plug')
    fs.rmSync(pluginFile)
    expect(inferOrigin(b, {}, '', ctx)?.label).toBe('o/plug')
    expect(inferOrigin(b, {}, '', createOriginContext(home))).toBeNull()
  })

  it('reads the origin remote from a .git directory or a gitdir file', () => {
    const repo = path.join(home, 'src', 'repo')
    writeTextFile(path.join(repo, '.git', 'config'), '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/o/repo.git\n')
    const s1 = skill('src/repo/skills/s1')
    const worktree = path.join(home, 'src', 'wt')
    writeTextFile(path.join(home, 'src', 'gitdata', 'config'), '[remote "origin"]\n\turl = git@github.com:o/wt.git\n')
    writeTextFile(path.join(worktree, '.git'), 'gitdir: ../gitdata\n')
    const s2 = skill('src/wt/skills/s2')
    const ctx = createOriginContext(home)
    expect(inferOrigin(s1, {}, '', ctx)).toMatchObject({ label: 'o/repo', via: 'git', certainty: 'inferred' })
    expect(inferOrigin(s2, {}, '', ctx)).toMatchObject({ label: 'o/wt', via: 'git', certainty: 'inferred' })
  })

  it('follows a symlink target for the path and ancestor rules', () => {
    const target = skill('src/github.com/o/linked/skills/s')
    const link = path.join(home, '.claude', 'skills', 'link')
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.symlinkSync(target, link)
    const ctx = createOriginContext(home)
    expect(inferOrigin(link, {}, target, ctx)).toMatchObject({ label: 'o/linked', via: 'path' })
    fs.unlinkSync(link)
    fs.symlinkSync(path.relative(path.dirname(link), target), link)
    expect(inferOrigin(link, {}, path.relative(path.dirname(link), target), createOriginContext(home))?.label).toBe('o/linked')
  })

  it('stops at home and returns null when nothing matches', () => {
    writeTextFile(path.join(home, '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/o/home.git\n')
    const dir = skill('.claude/skills/plain')
    expect(inferOrigin(dir, {}, '', createOriginContext(home))).toBeNull()
  })
})
