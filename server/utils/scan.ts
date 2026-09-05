/**
 * Scanner core, ported from skill-cabinet server/scan.js (MIT,
 * https://github.com/subsy/skill-cabinet). Every filesystem entry point takes
 * `{ home }` so tests never touch the real home directory.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Root, RootKind } from '#shared/types/catalog'

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
