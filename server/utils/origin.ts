/**
 * Origin inference, ported from skill-cabinet server/scan.js (MIT,
 * https://github.com/subsy/skill-cabinet). Order: frontmatter → install path →
 * symlink target → ancestors (plugin.json, then .git), stopping at `home`.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Origin } from '#shared/types/catalog'

type BareOrigin = Pick<Origin, 'kind' | 'label' | 'url'>

interface CachedOrigin {
  origin: BareOrigin
  via: Origin['via']
  at: string
}

export interface OriginContext {
  home: string
  cache: Map<string, CachedOrigin | null>
}

export function createOriginContext(home: string): OriginContext {
  return { home: path.resolve(home), cache: new Map() }
}

const PLUGIN_JSON: readonly string[][] = [
  ['plugin.json'],
  ['.cursor-plugin', 'plugin.json'],
  ['.claude-plugin', 'plugin.json'],
  ['.plugin', 'plugin.json'],
]

function githubFromString(raw: unknown): BareOrigin | null {
  if (!raw) return null
  const text = String(raw).trim().replace(/^["']|["']$/g, '')
  const match = text.match(/(?:https?:\/\/|git@|ssh:\/\/git@)github\.com[:/]+([^\s#?]+)/i)
  if (match) {
    const parts = match[1]!.replace(/\.git$/i, '').split('/').filter(Boolean)
    if (parts.length >= 2) {
      const spec = `${parts[0]}/${parts[1]}`
      return { kind: 'github', label: spec, url: `https://github.com/${spec}` }
    }
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(text)) {
    return { kind: 'github', label: text, url: `https://github.com/${text}` }
  }
  return null
}

function originFromText(raw: unknown): BareOrigin | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const github = githubFromString(raw)
  if (github) return github
  const text = raw.trim().replace(/^["']|["']$/g, '')
  if (!/^https?:\/\//i.test(text)) return null
  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const label = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '')
    return { kind: 'url', label, url: parsed.href }
  } catch {
    return null
  }
}

function originFromValue(value: unknown): BareOrigin | null {
  if (typeof value === 'string') return originFromText(value)
  if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') {
    return originFromText((value as { url: string }).url)
  }
  return null
}

function withOrigin(origin: BareOrigin | null, via: Origin['via'], certainty: Origin['certainty']): Origin | null {
  if (!origin) return null
  return { ...origin, via, certainty }
}

function originFromFrontmatter(data: Record<string, unknown>): Origin | null {
  const rawMeta = data.metadata
  const meta = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta) ? (rawMeta as Record<string, unknown>) : {}
  for (const key of ['source', 'repository']) {
    const found = originFromValue(data[key]) || originFromValue(meta[key])
    if (found) return withOrigin(found, 'frontmatter', 'attested')
  }
  for (const key of ['homepage', 'url']) {
    const found = originFromValue(data[key]) || originFromValue(meta[key])
    if (found?.kind === 'github') return withOrigin(found, 'frontmatter', 'attested')
  }
  return null
}

function originFromPath(p: string): Origin | null {
  const norm = p.replace(/\\/g, '/')
  const market = norm.match(/\/marketplaces\/github\.com\/([^/]+)\/([^/]+)/)
  if (market) {
    return withOrigin(
      { kind: 'github', label: `${market[1]}/${market[2]}`, url: `https://github.com/${market[1]}/${market[2]}` },
      'path',
      'attested',
    )
  }
  const nested = norm.match(/\/github\.com\/([^/]+)\/([^/]+)/)
  if (nested && nested[1] !== 'www') {
    return withOrigin(
      { kind: 'github', label: `${nested[1]}/${nested[2]}`, url: `https://github.com/${nested[1]}/${nested[2]}` },
      'path',
      'attested',
    )
  }
  return null
}

function originFromPluginFile(file: string): BareOrigin | null {
  try {
    const st = fs.statSync(file, { throwIfNoEntry: false })
    if (!st || !st.isFile()) return null
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { repository?: unknown, homepage?: unknown }
    const repo = originFromValue(data.repository)
    if (repo) return repo
    const home = originFromText(data.homepage)
    return home?.kind === 'github' ? home : null
  } catch {
    return null
  }
}

function originFromGitDir(dir: string): BareOrigin | null {
  const gitPath = path.join(dir, '.git')
  try {
    const listed = fs.lstatSync(gitPath, { throwIfNoEntry: false })
    if (!listed) return null
    let configPath = ''
    if (listed.isFile()) {
      const text = fs.readFileSync(gitPath, 'utf8')
      const marker = text.match(/gitdir:\s*(.+)/i)
      if (!marker) return null
      let gitdir = marker[1]!.trim()
      if (!path.isAbsolute(gitdir)) gitdir = path.resolve(dir, gitdir)
      configPath = path.join(gitdir, 'config')
    } else if (listed.isDirectory()) {
      configPath = path.join(gitPath, 'config')
    } else {
      return null
    }
    const config = fs.readFileSync(configPath, 'utf8')
    const url = config.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(\S+)/)
    return url ? originFromText(url[1]!.replace(/^["']|["']$/g, '')) : null
  } catch {
    return null
  }
}

function originStartDir(start: string): string {
  const resolved = path.resolve(start)
  try {
    const listed = fs.lstatSync(resolved)
    if (listed.isSymbolicLink()) {
      try {
        if (fs.statSync(resolved).isFile()) return path.dirname(resolved)
      } catch {
        return path.dirname(resolved)
      }
    }
    if (listed.isFile()) return path.dirname(resolved)
  } catch {
    /* missing */
  }
  return resolved
}

function fromCachedOrigin(hit: CachedOrigin | null, startDir: string): Origin | null {
  if (!hit) return null
  const here = path.resolve(hit.at) === path.resolve(startDir)
  return withOrigin(hit.origin, hit.via, here ? 'attested' : 'inferred')
}

function originFromAncestors(start: string, ctx: OriginContext): Origin | null {
  const chain: string[] = []
  let current = originStartDir(start)
  const startDir = current
  for (let i = 0; i < 14; i += 1) {
    if (ctx.cache.has(current)) {
      const hit = ctx.cache.get(current) ?? null
      for (const dir of chain) ctx.cache.set(dir, hit)
      return fromCachedOrigin(hit, startDir)
    }
    chain.push(current)
    for (const parts of PLUGIN_JSON) {
      const found = originFromPluginFile(path.join(current, ...parts))
      if (found) {
        const packed: CachedOrigin = { origin: found, via: 'plugin', at: current }
        for (const dir of chain) ctx.cache.set(dir, packed)
        return fromCachedOrigin(packed, startDir)
      }
    }
    const git = originFromGitDir(current)
    if (git) {
      const packed: CachedOrigin = { origin: git, via: 'git', at: current }
      for (const dir of chain) ctx.cache.set(dir, packed)
      return fromCachedOrigin(packed, startDir)
    }
    const parent = path.dirname(current)
    if (parent === current || parent === ctx.home) break
    current = parent
  }
  for (const dir of chain) ctx.cache.set(dir, null)
  return null
}

export function inferOrigin(dir: string, data: Record<string, unknown>, linkTarget: string, ctx: OriginContext): Origin | null {
  const yaml = originFromFrontmatter(data)
  if (yaml) return yaml
  const fromHere = originFromPath(dir)
  if (fromHere) return fromHere
  if (linkTarget) {
    const resolved = path.isAbsolute(linkTarget) ? path.resolve(linkTarget) : path.resolve(path.dirname(dir), linkTarget)
    const fromLink = originFromPath(resolved) || originFromAncestors(resolved, ctx)
    if (fromLink) return fromLink
  }
  return originFromAncestors(dir, ctx)
}
