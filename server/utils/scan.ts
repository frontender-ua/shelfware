/**
 * Scanner core, ported from skill-cabinet server/scan.js (MIT,
 * https://github.com/subsy/skill-cabinet). Every filesystem entry point takes
 * `{ home }` so tests never touch the real home directory.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AuditFinding, Census, CopyRef, FilePreview, Physicality, Root, RootKind, SkillCard, SkillDetail, SkillFileEntry } from '#shared/types/catalog'
import { auditSkill } from './audit'
import { fail } from './errors'
import { parseFrontmatter, stringField } from './frontmatter'
import { skillInvocation } from './invocation'
import { createOriginContext, inferOrigin, type OriginContext } from './origin'

export interface HomeOptions {
  home?: string
}

export function homeOf(opts?: HomeOptions): string {
  return path.resolve(opts?.home ?? os.homedir())
}

/**
 * Quarantined skills live here, outside every drawer an agent reads.
 * `.skill-cabinet` is on the home denylist, so the quarantine is never
 * re-indexed as a live drawer.
 */
export function quarantineRoot(opts?: HomeOptions): string {
  return path.join(homeOf(opts), '.skill-cabinet', 'quarantine')
}

export const SKIP_HOME_DOTDIRS: ReadonlySet<string> = new Set([
  '.cache',
  '.local',
  '.npm',
  '.nvm',
  '.rustup',
  '.cargo',
  '.docker',
  '.mozilla',
  '.config',
  '.steam',
  '.var',
  '.wine',
  '.thumbnails',
  '.Trash',
  '.android',
  '.gradle',
  '.java',
  '.skill-cabinet',
])

export const SKIP_WALK: ReadonlySet<string> = new Set(['node_modules', '.git', 'dist', '.cache', 'upstream'])

export function pathExists(p: string): boolean {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** realpath, or the resolved path when it does not exist. */
export function realPath(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

export function contained(child: string, parent: string): boolean {
  const c = path.resolve(child)
  const p = path.resolve(parent)
  return c === p || c.startsWith(p + path.sep)
}

export function idFor(absPath: string): string {
  return crypto.createHash('sha1').update(absPath).digest('hex').slice(0, 16)
}

const NAMED_SKILL_FILES = new Set(['skill.md', 'SKILL.md'])
const IGNORE_LOOSE_MD = new Set(['readme.md', 'changelog.md', 'license.md', 'licence.md'])

export function isSkillFileName(name: string): boolean {
  if (NAMED_SKILL_FILES.has(name)) return true
  if (!/\.md$/i.test(name)) return false
  return !IGNORE_LOOSE_MD.has(name.toLowerCase())
}

export function findSkillFile(dir: string): string | null {
  for (const name of ['SKILL.md', 'skill.md']) {
    const p = path.join(dir, name)
    if (pathExists(p) && !isDir(p)) return p
  }
  return null
}

function readLinkTarget(p: string): string {
  try {
    return fs.readlinkSync(p)
  } catch {
    return ''
  }
}

export interface InstallInfo {
  link: boolean
  file: boolean
  linkTarget: string
  dev: number
  ino: number
}

export function describeInstall(p: string): InstallInfo {
  let link = false
  let file = false
  let linkTarget = ''
  let dev = 0
  let ino = 0
  try {
    const listed = fs.lstatSync(p)
    link = listed.isSymbolicLink()
    if (link) {
      linkTarget = readLinkTarget(p)
      try {
        const followed = fs.statSync(p)
        file = followed.isFile()
        dev = followed.dev
        ino = followed.ino
      } catch {
        file = false
      }
    } else {
      file = listed.isFile()
      dev = listed.dev
      ino = listed.ino
    }
  } catch {
    /* missing or unreadable */
  }
  return { link, file, linkTarget, dev, ino }
}

function readDirents(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

export function discoverRoots(opts?: HomeOptions): Root[] {
  const home = homeOf(opts)
  const roots: Root[] = []
  const seen = new Set<string>()

  const add = (scopeId: string, scopeLabel: string, root: string, kind: RootKind, recursive = false, deep = false): void => {
    if (!pathExists(root) || !isDir(root)) return
    const resolved = realPath(root)
    if (seen.has(resolved)) return
    seen.add(resolved)
    roots.push({ scopeId, scopeLabel, root: resolved, kind, recursive, deep })
  }

  for (const entry of readDirents(home)) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (!entry.name.startsWith('.')) continue
    if (SKIP_HOME_DOTDIRS.has(entry.name)) continue

    const base = path.join(home, entry.name)
    const scopeId = entry.name.slice(1)

    for (const folder of ['skills', 'skill']) {
      add(scopeId, entry.name, path.join(base, folder), 'user', false)
    }

    if (entry.name === '.cursor') {
      add('cursor-builtin', '.cursor/skills-cursor', path.join(base, 'skills-cursor'), 'builtin', false)
      add('cursor-plugins', '.cursor/plugins', path.join(base, 'plugins'), 'plugin', true)
    }
  }

  add('gemini', '.gemini/antigravity', path.join(home, '.gemini/antigravity/skills'), 'user', false)
  add('gemini', '.gemini/antigravity (global)', path.join(home, '.gemini/antigravity/global_skills'), 'user', false)

  const hermesProfiles = path.join(home, '.hermes', 'profiles')
  for (const entry of readDirents(hermesProfiles)) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (entry.name.startsWith('.')) continue
    add(`hermes-profile:${entry.name}`, `Hermes profile · ${entry.name}`, path.join(hermesProfiles, entry.name, 'skills'), 'user', false, true)
  }

  const quarantine = quarantineRoot(opts)
  for (const entry of readDirents(quarantine)) {
    if (!entry.isDirectory()) continue
    const folder = path.join(quarantine, entry.name)
    if (!pathExists(folder) || !isDir(folder)) continue
    const resolved = realPath(folder)
    if (seen.has(resolved)) continue
    seen.add(resolved)
    roots.push({
      scopeId: 'quarantine',
      scopeLabel: 'Quarantine',
      root: resolved,
      kind: 'quarantine',
      recursive: false,
      fromScope: entry.name,
    })
  }

  return roots
}

export type SkillSummary = Omit<SkillCard, 'copyCount'> & {
  skillFile: string
  frontmatter: Record<string, unknown>
  contentHash: string | null
  findings: AuditFinding[]
}

export interface ScanIndex {
  roots: Root[]
  skills: SkillSummary[]
  byId: Map<string, SkillSummary>
  census: Census
}

interface FoundItem extends InstallInfo {
  dir: string
  skillMd: string
  root: Root
  file: boolean
  dangling?: boolean
}

/** Spec §5.3: a rough token count, ceil(chars / 4) of the decoded skill file. */
export function tokenEstimateFor(text: string): number {
  return Math.ceil(text.length / 4)
}

function collectDirectSkills(root: Root, list: FoundItem[], nested = false, depth = 0): void {
  if (nested && depth > 14) return
  for (const entry of readDirents(root.root)) {
    if (SKIP_WALK.has(entry.name)) continue
    const abs = path.resolve(path.join(root.root, entry.name))
    const install = describeInstall(abs)
    if (install.link && !install.file && !isDir(abs)) {
      list.push({ dir: abs, skillMd: abs, root, ...install, file: false, dangling: true })
      continue
    }
    if (isDir(abs)) {
      const skillMd = findSkillFile(abs)
      if (skillMd) {
        list.push({ dir: abs, skillMd, root, ...install, file: false })
      } else if (nested) {
        collectDirectSkills({ ...root, root: abs }, list, true, depth + 1)
      }
      continue
    }
    if (install.file && isSkillFileName(entry.name)) {
      list.push({ dir: abs, skillMd: abs, root, ...install, file: true })
    }
  }
}

function walkSkillContainers(dir: string, root: Root, list: FoundItem[], depth = 0): void {
  if (depth > 14) return
  const entries = readDirents(dir)
  const base = path.basename(dir)
  if (base === 'skills' || base === 'skill') {
    collectDirectSkills({ ...root, root: dir }, list)
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (SKIP_WALK.has(entry.name)) continue
    walkSkillContainers(path.join(dir, entry.name), root, list, depth + 1)
  }
}

/** Files under a skill (depth ≤ 8, ≤ 250 files, symlinks skipped) and their byte total. */
export function dirSizeAndFiles(dir: string): { files: SkillFileEntry[], bytes: number } {
  try {
    const followed = fs.statSync(dir)
    if (followed.isFile()) {
      return { files: [{ path: path.basename(dir), size: followed.size, mtime: followed.mtimeMs }], bytes: followed.size }
    }
  } catch {
    /* walk as a directory when we can */
  }
  const files: SkillFileEntry[] = []
  let bytes = 0
  const walk = (current: string, rel: string, depth: number): void => {
    if (depth > 8 || files.length > 250) return
    for (const entry of readDirents(current)) {
      if (SKIP_WALK.has(entry.name)) continue
      const abs = path.join(current, entry.name)
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        walk(abs, nextRel, depth + 1)
      } else if (entry.isFile()) {
        let size = 0
        let mtime = 0
        try {
          const st = fs.statSync(abs)
          size = st.size
          mtime = st.mtimeMs
          bytes += size
        } catch {
          /* ignore */
        }
        files.push({ path: nextRel, size, mtime })
      }
    }
  }
  walk(dir, '', 0)
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { files, bytes }
}

function danglingSummary(item: FoundItem): SkillSummary {
  const { dir, root } = item
  let mtime = 0
  try {
    mtime = fs.lstatSync(dir).mtimeMs
  } catch {
    /* gone */
  }
  const base = path.basename(dir)
  const slug = base.replace(/\.md$/i, '')
  return {
    id: idFor(dir),
    name: slug,
    slug,
    description: '',
    frontmatter: {},
    scopeId: root.scopeId,
    scopeLabel: root.scopeLabel,
    kind: root.kind,
    path: dir,
    skillFile: dir,
    skillRel: base,
    file: false,
    link: true,
    linkTarget: item.linkTarget || '',
    origin: null,
    invocation: 'model',
    invocationEvidence: '',
    contentHash: null,
    risk: 'none',
    findings: [],
    copies: [],
    mtime,
    skillSize: 0,
    tokenEstimate: 0,
    physicality: 'broken',
    refTarget: '',
    refSkillId: '',
    quarantined: root.kind === 'quarantine',
    fromScope: root.fromScope || '',
  }
}

interface SharedParse {
  data: Record<string, unknown>
  mtime: number
  size: number
  text: string
  contentHash: string
  audited: ReturnType<typeof auditSkill>
}

function summarizeSkill(item: FoundItem, memo: Map<string, SharedParse>, realpaths: Map<string, string>, origins: OriginContext): SkillSummary | null {
  const { dir, skillMd, root } = item
  if (item.dangling) return danglingSummary(item)
  const identity = item.dev || item.ino ? `${item.dev}:${item.ino}` : realPath(dir)
  const memoKey = `${identity}|${item.file ? 'file' : 'dir'}`
  let shared = memo.get(memoKey)
  if (!shared) {
    let mtime = 0
    let size = 0
    let raw: Buffer
    try {
      const st = fs.statSync(skillMd)
      mtime = st.mtimeMs
      size = st.size
      raw = fs.readFileSync(skillMd)
    } catch {
      return null
    }
    const text = raw.toString('utf8')
    const { data } = parseFrontmatter(text)
    shared = {
      data,
      mtime,
      size,
      text,
      contentHash: crypto.createHash('sha256').update(raw).digest('hex'),
      audited: auditSkill({ root: dir, skillFile: skillMd, text, fileOnly: Boolean(item.file) }),
    }
    memo.set(memoKey, shared)
  }
  let refTarget = ''
  if (item.link) {
    refTarget = realpaths.get(identity) || ''
    if (!refTarget) {
      refTarget = realPath(dir)
      realpaths.set(identity, refTarget)
    }
  }
  const base = path.basename(dir)
  const slug = item.file ? base.replace(/\.md$/i, '') : base
  const name = stringField(shared.data, 'name') || stringField(shared.data, 'displayName') || slug
  const description = stringField(shared.data, 'description')
  const when = skillInvocation({ skillDir: dir, fileOnly: Boolean(item.file), frontmatter: shared.data, description })

  return {
    id: idFor(dir),
    name,
    slug,
    description,
    frontmatter: shared.data,
    scopeId: root.scopeId,
    scopeLabel: root.scopeLabel,
    kind: root.kind,
    path: dir,
    skillFile: skillMd,
    skillRel: path.basename(skillMd),
    file: Boolean(item.file),
    link: Boolean(item.link),
    linkTarget: item.linkTarget || '',
    origin: inferOrigin(dir, shared.data, item.linkTarget, origins),
    invocation: when.invocation,
    invocationEvidence: when.invocationEvidence,
    contentHash: shared.contentHash,
    risk: shared.audited.severity,
    findings: shared.audited.findings.slice(),
    copies: [],
    mtime: shared.mtime,
    skillSize: shared.size,
    tokenEstimate: tokenEstimateFor(shared.text),
    physicality: item.link ? 'reference' : 'physical',
    refTarget,
    refSkillId: '',
    quarantined: root.kind === 'quarantine',
    fromScope: root.fromScope || '',
  }
}

export interface CopyCandidate {
  id: string
  scopeLabel: string
  path: string
  contentHash: string | null
  physicality: Physicality
  copies?: CopyRef[]
}

/** Spec §5.3: physical cards with the same contentHash are mutual copies. References and broken cards never are. */
export function attachCopies<T extends CopyCandidate>(skills: T[]): (T & { copies: CopyRef[] })[] {
  const byHash = new Map<string, T[]>()
  for (const skill of skills) {
    if (skill.physicality !== 'physical') continue
    if (!skill.contentHash) continue
    const list = byHash.get(skill.contentHash) || []
    list.push(skill)
    byHash.set(skill.contentHash, list)
  }
  for (const skill of skills) {
    if (skill.physicality !== 'physical') {
      skill.copies = []
      continue
    }
    const group = (skill.contentHash && byHash.get(skill.contentHash)) || []
    skill.copies = group
      .filter(other => other.id !== skill.id)
      .map(other => ({ id: other.id, scopeLabel: other.scopeLabel, path: other.path }))
  }
  return skills as (T & { copies: CopyRef[] })[]
}

function censusOf(skills: SkillSummary[]): Census {
  const live = skills.filter(skill => !skill.quarantined)
  const physical = live.filter(skill => skill.physicality === 'physical')
  const byHash = new Map<string, number>()
  for (const skill of physical) {
    if (!skill.contentHash) continue
    byHash.set(skill.contentHash, (byHash.get(skill.contentHash) || 0) + 1)
  }
  let duplicateCopies = 0
  let duplicateBytes = 0
  let tokenEstimate = 0
  for (const skill of physical) {
    tokenEstimate += skill.tokenEstimate
    const twins = (skill.contentHash && byHash.get(skill.contentHash)) || 1
    if (twins > 1) {
      duplicateCopies += 1
      duplicateBytes += dirSizeAndFiles(skill.path).bytes
    }
  }
  return {
    total: live.length,
    physical: physical.length,
    unique: byHash.size,
    duplicateCopies,
    duplicateBytes,
    references: live.filter(skill => skill.physicality === 'reference').length,
    broken: live.filter(skill => skill.physicality === 'broken').length,
    duplicates: duplicateCopies,
    tokenEstimate,
  }
}

export function scanRoots(roots: Root[], opts?: HomeOptions): ScanIndex {
  const origins = createOriginContext(homeOf(opts))
  const memo = new Map<string, SharedParse>()
  const realpaths = new Map<string, string>()
  const found: FoundItem[] = []
  for (const root of roots) {
    if (root.deep) {
      collectDirectSkills(root, found, true)
    } else if (root.recursive) {
      walkSkillContainers(root.root, root, found)
    } else {
      collectDirectSkills(root, found)
    }
  }

  const byPath = new Map<string, FoundItem>()
  for (const item of found) byPath.set(item.dir, item)

  const skills: SkillSummary[] = []
  const byId = new Map<string, SkillSummary>()
  for (const item of byPath.values()) {
    const summary = summarizeSkill(item, memo, realpaths, origins)
    if (!summary) continue
    skills.push(summary)
    byId.set(summary.id, summary)
  }

  const byReal = new Map<string, string>()
  for (const skill of skills) {
    if (skill.physicality === 'physical') byReal.set(realPath(skill.path), skill.id)
  }
  for (const skill of skills) {
    if (skill.physicality === 'reference') skill.refSkillId = byReal.get(skill.refTarget) || ''
  }

  attachCopies(skills)

  skills.sort((a, b) => {
    const scope = a.scopeLabel.localeCompare(b.scopeLabel)
    if (scope !== 0) return scope
    return a.name.localeCompare(b.name)
  })

  return { roots, skills, byId, census: censusOf(skills) }
}

export function scanSkills(opts?: HomeOptions): ScanIndex {
  return scanRoots(discoverRoots(opts), opts)
}

export function toCatalogSkill(skill: SkillSummary): SkillCard {
  return {
    id: skill.id,
    name: skill.name,
    slug: skill.slug,
    description: skill.description,
    scopeId: skill.scopeId,
    scopeLabel: skill.scopeLabel,
    kind: skill.kind,
    path: skill.path,
    skillRel: skill.skillRel,
    file: skill.file,
    link: skill.link,
    linkTarget: skill.linkTarget,
    origin: skill.origin,
    invocation: skill.invocation,
    invocationEvidence: skill.invocationEvidence,
    risk: skill.risk,
    physicality: skill.physicality,
    refTarget: skill.refTarget,
    refSkillId: skill.refSkillId,
    copyCount: skill.copies.length,
    copies: skill.copies,
    mtime: skill.mtime,
    quarantined: Boolean(skill.quarantined),
    fromScope: skill.fromScope || '',
    skillSize: skill.skillSize,
    tokenEstimate: skill.tokenEstimate,
  }
}

export function readSkill(summary: SkillSummary): SkillDetail {
  const { skillFile, ...rest } = summary
  const base = { ...rest, copyCount: summary.copies.length }
  if (summary.physicality === 'broken') {
    return { ...base, frontmatter: {}, frontmatterRaw: '', body: '', source: '', files: [], bytes: 0 }
  }
  const text = fs.readFileSync(skillFile, 'utf8')
  const { data, content, raw } = parseFrontmatter(text)
  const { files, bytes } = dirSizeAndFiles(summary.path)
  return { ...base, frontmatter: data, frontmatterRaw: raw, body: content, source: text, files, bytes }
}

const TEXT_EXTENSIONS = /\.(md|txt|ya?ml|json|js|mjs|cjs|ts|tsx|jsx|py|sh|html|css|svg|toml|xml|csv|rst)$/i
const MAX_PREVIEW_BYTES = 1_500_000

/** Spec §5.5: resolve → realpath → prefix check; text only for known extensions without NUL bytes. */
export function readSkillFile(summary: Pick<SkillSummary, 'file' | 'skillFile' | 'path'>, relPath: string): FilePreview {
  if (summary.file) {
    const abs = realPath(summary.skillFile)
    const st = fs.statSync(abs)
    if (st.size > MAX_PREVIEW_BYTES) throw fail(413, 'File too large to preview')
    return { path: path.basename(summary.skillFile), size: st.size, binary: false, content: fs.readFileSync(abs).toString('utf8') }
  }
  const abs = realPath(path.resolve(summary.path, path.normalize(relPath)))
  const root = realPath(summary.path)
  if (abs !== root && !abs.startsWith(root + path.sep)) throw fail(400, 'Path escapes skill directory')
  if (!pathExists(abs) || isDir(abs)) throw fail(404, 'File not found')
  const st = fs.statSync(abs)
  if (st.size > MAX_PREVIEW_BYTES) throw fail(413, 'File too large to preview')
  const buf = fs.readFileSync(abs)
  const looksText = !buf.includes(0) && TEXT_EXTENSIONS.test(abs)
  return { path: path.relative(root, abs), size: st.size, binary: !looksText, content: looksText ? buf.toString('utf8') : null }
}

/**
 * Spec §5.6: the target must be inside a discovered root, not equal to it,
 * not `home`, and still look like a skill (dead link, folder with a skill
 * file, or a file with a skill file name).
 */
export function assertSkillTarget(summary: { path: string }, roots: readonly { root: string }[], action = 'delete', opts?: HomeOptions): string {
  const target = path.resolve(summary.path)
  const inside = roots.some(r => contained(target, r.root))
  if (!inside) throw fail(403, 'Skill is outside known cabinet roots')
  const isRoot = roots.some(r => path.resolve(r.root) === target)
  if (isRoot || target === homeOf(opts)) throw fail(403, `Refusing to ${action} a cabinet root`)
  const install = describeInstall(target)
  const isDeadLink = install.link && !install.file && !isDir(target)
  const isFolderSkill = isDir(target) && findSkillFile(target)
  const isFileSkill = install.file && isSkillFileName(path.basename(target))
  if (!isDeadLink && !isFolderSkill && !isFileSkill) throw fail(400, 'Not a skill path')
  return target
}

export function assertDeletable(summary: { path: string }, roots: readonly { root: string }[], opts?: HomeOptions): string {
  return assertSkillTarget(summary, roots, 'delete', opts)
}

/** Symlinks and files are unlinked (never followed); directories are removed recursively. */
export function deleteSkillDir(target: string): void {
  const st = fs.lstatSync(target)
  if (st.isSymbolicLink() || st.isFile()) {
    fs.unlinkSync(target)
    return
  }
  fs.rmSync(target, { recursive: true, force: false })
}
