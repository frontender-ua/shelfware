import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkBundledIconBodies,
  missingEntries,
  newestMtime,
  npmPackFiles,
  packlistDiff,
  parseNpmPackJson,
  parseTarListing,
  staleBuildReason,
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

  it('counts masked names, so an extra UUID-named file is caught even though the mask makes it look identical', () => {
    const metaDir = '.output/public/_nuxt/builds/meta'
    const a = `${metaDir}/f62e7192-9767-4b46-b33c-ae672684ec3c.json`
    const b = `${metaDir}/0b1e2c3d-4f5a-6b7c-8d9e-0f1a2b3c4d5e.json`
    // npm has two UUID-named meta files (both redacted to the same masked name), tar has one.
    expect(packlistDiff(
      [`${metaDir}/***.json`, `${metaDir}/***.json`, 'package.json'],
      [`package/${a}`, 'package/package.json'],
    )).toEqual({ onlyInNpm: [`${metaDir}/***.json`], onlyInTar: [] })
    // Mirror case: tar has two, npm has one.
    expect(packlistDiff(
      [`${metaDir}/***.json`, 'package.json'],
      [`package/${a}`, `package/${b}`, 'package/package.json'],
    )).toEqual({ onlyInNpm: [], onlyInTar: [`${metaDir}/***.json`] })
  })
})

describe('parseNpmPackJson', () => {
  it('skips prepare-script chatter that npm 10 prints ahead of the JSON', () => {
    const noisy = [
      '',
      '> shelfware@0.1.1 prepare',
      '> nuxt prepare',
      '',
      '[info] Nuxt Icon server bundle mode is set to `local`',
      '│',
      '◆  Types generated in .nuxt.',
      '[',
      '  {',
      '    "name": "shelfware",',
      '    "files": [{ "path": "package.json", "size": 1, "mode": 420 }]',
      '  }',
      ']',
      '',
    ].join('\n')
    expect(parseNpmPackJson(noisy)).toEqual([{ name: 'shelfware', files: [{ path: 'package.json', size: 1, mode: 420 }] }])
  })

  it('accepts clean pretty-printed and compact output in both shapes', () => {
    expect(parseNpmPackJson('[\n  { "files": [] }\n]\n')).toEqual([{ files: [] }])
    expect(parseNpmPackJson('{\n  "shelfware": { "files": [] }\n}\n')).toEqual({ shelfware: { files: [] } })
    expect(parseNpmPackJson('[{"files":[]}]')).toEqual([{ files: [] }])
    expect(parseNpmPackJson('{"shelfware":{"files":[]}}')).toEqual({ shelfware: { files: [] } })
  })

  it('names the problem when there is no JSON at all', () => {
    expect(() => parseNpmPackJson('[info] Nuxt only chatter\n')).toThrow('no JSON in `npm pack --json` output')
  })
})

describe('npmPackFiles', () => {
  const files = [{ path: 'package.json', size: 1, mode: 420 }, { path: 'bin/shelfware.mjs', size: 2, mode: 493 }]

  it('reads the npm 11 array form and the npm 12 object form alike', () => {
    expect(npmPackFiles([{ name: 'shelfware', files }], 'shelfware')).toEqual(['package.json', 'bin/shelfware.mjs'])
    expect(npmPackFiles({ shelfware: { name: 'shelfware', files } }, 'shelfware')).toEqual(['package.json', 'bin/shelfware.mjs'])
    // An object keyed by something other than the expected name still resolves to its single entry.
    expect(npmPackFiles({ '@scope/other': { files } }, 'shelfware')).toEqual(['package.json', 'bin/shelfware.mjs'])
  })

  it('names the shape instead of throwing a TypeError on unknown output', () => {
    expect(() => npmPackFiles([], 'shelfware')).toThrow('unexpected `npm pack --json` output: []')
    expect(() => npmPackFiles({ shelfware: { name: 'shelfware' } }, 'shelfware')).toThrow('unexpected `npm pack --json` output')
    expect(() => npmPackFiles(null, 'shelfware')).toThrow('unexpected `npm pack --json` output: null')
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

describe('staleBuildReason', () => {
  function stamp(root: string, ageMs: number): void {
    fs.mkdirSync(path.join(root, '.output'), { recursive: true })
    fs.writeFileSync(path.join(root, '.output', 'nitro.json'), '{}')
    const when = new Date(Date.now() - ageMs)
    fs.utimesSync(path.join(root, '.output', 'nitro.json'), when, when)
  }

  it('names the missing stamp, the newer source, or nothing', () => {
    const root = tmp()
    fs.mkdirSync(path.join(root, 'app'))
    fs.writeFileSync(path.join(root, 'app', 'a.vue'), 'a')
    fs.writeFileSync(path.join(root, '.nuxtrc'), 'x')
    const old = new Date(Date.now() - 120_000)
    for (const p of ['app/a.vue', 'app', '.nuxtrc']) fs.utimesSync(path.join(root, p), old, old)

    expect(staleBuildReason(root)).toBe('.output/nitro.json is missing; run `pnpm build` first')

    stamp(root, 60_000)
    expect(staleBuildReason(root)).toBeNull()

    fs.writeFileSync(path.join(root, '.nuxtrc'), 'y')
    expect(staleBuildReason(root)).toBe('.output is older than .nuxtrc; run `pnpm build` first')

    // A plain write's real mtime can carry a couple ms of kernel-assigned latency past
    // `Date.now()` (observed on APFS); let that settle before stamping "now" below, or
    // the two timestamps race at sub-millisecond resolution and the next assertion flakes.
    const settleUntil = Date.now() + 3
    while (Date.now() < settleUntil);

    stamp(root, 0)
    expect(staleBuildReason(root)).toBeNull()
  })
})
