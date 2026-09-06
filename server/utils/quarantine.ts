/**
 * Quarantine manifest and moves, ported from skill-cabinet server/quarantine.js
 * (MIT, https://github.com/subsy/skill-cabinet). The on-disk format is kept
 * byte-compatible so a user can switch tools without losing their trash.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { QuarantineEntry, QuarantineManifest, RootKind } from '#shared/types/catalog'
import { fail } from './errors'
import { assertSkillTarget, contained, isDir, quarantineRoot, realPath, type HomeOptions } from './scan'

/**
 * The spelling a scanned card carries: a canonical parent directory plus the
 * literal last segment, so a quarantined symlink is still named by the link
 * and never by its target. Manifest entries need it because upstream
 * skill-cabinet (and older builds of this one) write `quarantinePath` through
 * a home that was never realpathed. Entries on disk are left as written.
 */
function canonicalPath(p: string): string {
  const resolved = path.resolve(p)
  return path.join(realPath(path.dirname(resolved)), path.basename(resolved))
}

export function manifestPath(opts?: HomeOptions): string {
  return path.join(quarantineRoot(opts), 'quarantine.json')
}

function occupied(p: string): boolean {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

/** Entries whose `quarantinePath` no longer exists are dropped; stray `*.tmp` files are never read. */
export function readManifest(opts?: HomeOptions): QuarantineManifest {
  let parsed: { entries?: unknown } | null = null
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath(opts), 'utf8')) as { entries?: unknown }
  } catch {
    parsed = null
  }
  const entries = Array.isArray(parsed?.entries) ? (parsed!.entries as unknown[]) : []
  return {
    version: 1,
    entries: entries.filter((entry): entry is QuarantineEntry => {
      const e = entry as Partial<QuarantineEntry> | null
      return Boolean(e && typeof e.quarantinePath === 'string' && typeof e.originPath === 'string' && occupied(e.quarantinePath))
    }),
  }
}

/** Atomic: write `quarantine.json.<pid>.tmp`, then rename over the manifest. */
export function writeManifest(manifest: QuarantineManifest, opts?: HomeOptions): void {
  fs.mkdirSync(quarantineRoot(opts), { recursive: true })
  const dest = manifestPath(opts)
  const tmp = `${dest}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, entries: manifest.entries }, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, dest)
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true })
    } catch {
      /* leave the tmp */
    }
    throw err
  }
}

export function scopeFolder(scopeId: string): string {
  const cleaned = String(scopeId || 'loose').replace(/[^A-Za-z0-9._-]+/g, '-')
  return cleaned === '.' || cleaned === '..' || !cleaned ? 'loose' : cleaned
}

function withSuffix(base: string, n: number): string {
  const ext = path.extname(base)
  return ext ? `${base.slice(0, -ext.length)}-${n}${ext}` : `${base}-${n}`
}

function freeQuarantinePath(scopeDir: string, base: string): string {
  let candidate = path.join(scopeDir, base)
  for (let n = 2; occupied(candidate) && n < 1000; n += 1) {
    candidate = path.join(scopeDir, withSuffix(base, n))
  }
  if (occupied(candidate)) throw fail(409, 'Too many quarantined copies under that name')
  return candidate
}

function move(source: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  try {
    fs.renameSync(source, dest)
    return
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
  }
  fs.cpSync(source, dest, { recursive: true, verbatimSymlinks: true })
  fs.rmSync(source, { recursive: true, force: true })
}

function persistAfterMove(from: string, to: string, persist: () => void): void {
  try {
    persist()
  } catch (err) {
    try {
      move(to, from)
    } catch {
      /* the copy now lives only at `to` */
    }
    throw err
  }
}

function pruneScopeDir(dir: string, opts?: HomeOptions): void {
  const resolved = path.resolve(dir)
  const root = quarantineRoot(opts)
  if (resolved === path.resolve(root)) return
  if (!contained(resolved, root)) return
  try {
    if (fs.readdirSync(resolved).length === 0) fs.rmdirSync(resolved)
  } catch {
    /* leave it in place */
  }
}

export interface QuarantineCard {
  path: string
  name: string
  slug: string
  scopeId: string
  scopeLabel: string
  kind: RootKind
  file?: boolean
  link?: boolean
  quarantined?: boolean
}

export interface MoveResult {
  from: string
  to: string
}

export function quarantineSkill(summary: QuarantineCard, roots: readonly { root: string }[], opts?: HomeOptions): MoveResult {
  if (summary.quarantined) throw fail(400, 'Already in the quarantine')
  const source = assertSkillTarget(summary, roots, 'quarantine', opts)
  const scopeDir = path.join(quarantineRoot(opts), scopeFolder(summary.scopeId))
  const dest = freeQuarantinePath(scopeDir, path.basename(source))

  move(source, dest)
  persistAfterMove(source, dest, () => {
    const manifest = readManifest(opts)
    manifest.entries = manifest.entries.filter(entry => path.resolve(entry.quarantinePath) !== path.resolve(dest))
    manifest.entries.push({
      quarantinePath: dest,
      originPath: source,
      name: summary.name,
      slug: summary.slug,
      scopeId: summary.scopeId,
      scopeLabel: summary.scopeLabel,
      kind: summary.kind,
      file: Boolean(summary.file),
      link: Boolean(summary.link),
      quarantinedAt: Date.now(),
    })
    writeManifest(manifest, opts)
  })

  return { from: source, to: dest }
}

export function restoreSkill(summary: { path: string, quarantined?: boolean }, roots: readonly { root: string, kind: RootKind }[], opts?: HomeOptions): MoveResult {
  const source = path.resolve(summary.path)
  if (!summary.quarantined || !contained(source, quarantineRoot(opts))) throw fail(400, 'Not a quarantined card')

  const manifest = readManifest(opts)
  const entry = manifest.entries.find(item => canonicalPath(item.quarantinePath) === source)
  if (!entry) throw fail(409, 'No quarantine record says where this came from. Move it back by hand.')

  const dest = path.resolve(entry.originPath)
  const drawers = roots.filter(root => root.kind !== 'quarantine')
  const insideDrawer = drawers.some(root => contained(dest, root.root) && path.resolve(root.root) !== dest)
  if (!insideDrawer) throw fail(403, `No cabinet drawer holds ${dest} any more`)
  if (!isDir(path.dirname(dest))) throw fail(409, `The original drawer is gone: ${path.dirname(dest)}`)
  if (occupied(dest)) throw fail(409, `Something is already at ${dest}`)

  move(source, dest)
  persistAfterMove(source, dest, () => {
    manifest.entries = manifest.entries.filter(item => canonicalPath(item.quarantinePath) !== source)
    writeManifest(manifest, opts)
    pruneScopeDir(path.dirname(source), opts)
  })

  return { from: source, to: dest }
}

export function quarantineRecordFor(quarantinePath: string, opts?: HomeOptions): QuarantineEntry | null {
  const target = canonicalPath(quarantinePath)
  return readManifest(opts).entries.find(entry => canonicalPath(entry.quarantinePath) === target) || null
}

/**
 * Drops the record for a quarantine path and tidies up after it. Callers reach
 * here once the folder is already gone, so `readManifest` has filtered the
 * entry out at read time — filtering alone never reaches the disk, and the
 * manifest is therefore always rewritten and the emptied scope folder pruned.
 */
export function forgetQuarantinePath(target: string, opts?: HomeOptions): void {
  const resolved = canonicalPath(target)
  if (!contained(resolved, quarantineRoot(opts))) return
  const manifest = readManifest(opts)
  const next = manifest.entries.filter(entry => canonicalPath(entry.quarantinePath) !== resolved)
  writeManifest({ ...manifest, entries: next }, opts)
  pruneScopeDir(path.dirname(resolved), opts)
}
