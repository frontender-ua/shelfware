import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkBundledIconBodies,
  missingEntries,
  newestMtime,
  packlistDiff,
  parseTarListing,
  topLevelNodeModules,
} from '../../scripts/pack-verify-lib.mjs'

const dirs: string[] = []
function tmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-verify-lib-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('parseTarListing', () => {
  it('strips ./ prefixes, trailing slashes and blank lines', () => {
    expect(parseTarListing('./package/\npackage/bin/shelfware.mjs\n\n./package/LICENSE\n'))
      .toEqual(['package', 'package/bin/shelfware.mjs', 'package/LICENSE'])
  })
})

describe('tarball assertions', () => {
  const entries = [
    'package/package.json',
    'package/bin/shelfware.mjs',
    'package/.output/server/index.mjs',
    'package/.output/server/node_modules/vue/index.js',
  ]

  it('missingEntries names exactly what is absent', () => {
    expect(missingEntries(entries, ['package/bin/shelfware.mjs', 'package/README.md'])).toEqual(['package/README.md'])
    expect(missingEntries(entries, [])).toEqual([])
  })

  it('topLevelNodeModules ignores the node_modules Nitro nests under .output/server', () => {
    expect(topLevelNodeModules(entries)).toEqual([])
    expect(topLevelNodeModules([...entries, 'package/node_modules/x/index.js'])).toEqual(['package/node_modules/x/index.js'])
  })
})

describe('checkBundledIconBodies', () => {
  it('returns null when a chunk carries an inline body, and a distinct reason for each failure', () => {
    const dir = tmp()
    const nuxt = path.join(dir, '_nuxt')
    expect(checkBundledIconBodies(nuxt)).toContain('does not exist')
    fs.mkdirSync(nuxt)
    expect(checkBundledIconBodies(nuxt)).toContain('no .js chunks')
    fs.writeFileSync(path.join(nuxt, 'a.js'), 'const x = 1')
    expect(checkBundledIconBodies(nuxt)).toContain('none of 1 client chunks')
    fs.writeFileSync(path.join(nuxt, 'b.js'), 'addIcons({body:"<path d=\\"M0 0\\"/>"})')
    expect(checkBundledIconBodies(nuxt)).toBeNull()
  })
})

describe('packlistDiff', () => {
  it('reports files present on only one side, relative to package/', () => {
    expect(packlistDiff(
      ['package.json', 'bin/shelfware.mjs', 'CHANGELOG.md'],
      ['package/package.json', 'package/bin/shelfware.mjs', 'package/LICENSE'],
    )).toEqual({ onlyInNpm: ['CHANGELOG.md'], onlyInTar: ['LICENSE'] })
    expect(packlistDiff(['a'], ['package/a'])).toEqual({ onlyInNpm: [], onlyInTar: [] })
  })

  it('matches the UUID segment npm redacts as *** against the real tarball name', () => {
    const meta = '.output/public/_nuxt/builds/meta/f62e7192-9767-4b46-b33c-ae672684ec3c.json'
    expect(packlistDiff(
      ['.output/public/_nuxt/builds/meta/***.json'],
      [`package/${meta}`],
    )).toEqual({ onlyInNpm: [], onlyInTar: [] })
    // Masking is per UUID, so a genuinely different file is still reported.
    expect(packlistDiff(
      ['.output/public/_nuxt/builds/meta/***.json'],
      [`package/${meta}`, 'package/extra.json'],
    )).toEqual({ onlyInNpm: [], onlyInTar: ['extra.json'] })
  })
})

describe('newestMtime', () => {
  it('walks directories and treats missing paths as never modified', () => {
    const dir = tmp()
    const deep = path.join(dir, 'src', 'deep')
    fs.mkdirSync(deep, { recursive: true })
    fs.writeFileSync(path.join(deep, 'a.ts'), 'a')
    const old = new Date(Date.now() - 60_000)
    fs.utimesSync(path.join(deep, 'a.ts'), old, old)
    fs.utimesSync(deep, old, old)
    fs.utimesSync(path.join(dir, 'src'), old, old)
    fs.writeFileSync(path.join(dir, 'b.ts'), 'b')
    expect(newestMtime([path.join(dir, 'missing')])).toBe(0)
    expect(newestMtime([path.join(dir, 'src')])).toBeLessThan(Date.now() - 50_000)
    expect(newestMtime([path.join(dir, 'src'), path.join(dir, 'b.ts')])).toBeGreaterThan(Date.now() - 5_000)
  })
})
