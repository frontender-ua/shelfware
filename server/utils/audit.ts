/**
 * Static skill audit. Rules and context heuristics ported from skill-cabinet
 * (MIT, https://github.com/subsy/skill-cabinet), which adapted them from
 * Adaptive Skills (MIT, https://github.com/wangsoft/Adaptive-Skills).
 */
import fs from 'node:fs'
import path from 'node:path'
import type { AuditFinding, Severity } from '#shared/types/catalog'
import {
  AUDIT_RULES,
  AUDIT_SKIP_WALK,
  COMPANION_EXTENSIONS,
  DENYLIST_PATTERN,
  IMPERATIVE_LINE,
  MAX_DEPTH,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TREE_BYTES,
  PROMPT_COMMAND,
  SEVERITY_ORDER,
  SHELL_FENCE_LANGUAGES,
  SHELLISH_LINE,
  SUBSUMED,
} from './audit-rules'

export interface AuditInput {
  root: string
  skillFile: string
  text: string
  fileOnly?: boolean
}

export interface AuditResult {
  severity: Severity
  findings: AuditFinding[]
}

type LineContext = 'denylist' | 'command_invocation' | 'documentation'

export function maxSeverity(values: Iterable<Severity>): Severity {
  let best: Severity = 'none'
  for (const value of values) {
    if (SEVERITY_ORDER[value] > SEVERITY_ORDER[best]) best = value
  }
  return best
}

function isDocument(rel: string): boolean {
  const ext = path.extname(rel).toLowerCase()
  if (ext === '.md' || ext === '.txt' || ext === '.rst') return true
  return /(^|\/)skill\.md$/i.test(rel.replace(/\\/g, '/'))
}

function newlineStarts(content: string): number[] {
  const starts = [0]
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) starts.push(i + 1)
  }
  return starts
}

function lineNumberAt(starts: number[], index: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid]! <= index) lo = mid + 1
    else hi = mid - 1
  }
  return hi + 1
}

function fenceLanguage(line: string): string | null {
  const match = line.match(/^\s*```\s*([\w+-]*)/)
  return match ? match[1]!.toLowerCase() : null
}

function lineContext(rel: string, lines: string[], lineIndex: number, rule: string, inShellFence: boolean): LineContext {
  const line = lines[lineIndex] || ''
  if (DENYLIST_PATTERN.test(line)) return 'denylist'
  const previous = [...lines.slice(Math.max(0, lineIndex - 4), lineIndex)].reverse().find(item => item.trim())
  if (previous && DENYLIST_PATTERN.test(previous) && (previous.trim().endsWith(':') || previous.trim().startsWith('#'))) {
    return 'denylist'
  }

  const stripped = line.trim()
  if (isDocument(rel)) {
    if (inShellFence) return 'command_invocation'
    if (SHELLISH_LINE.test(stripped) || IMPERATIVE_LINE.test(stripped)) return 'command_invocation'
    if (rule === 'prompt.override' && PROMPT_COMMAND.test(stripped)) return 'command_invocation'
    return 'documentation'
  }

  if (stripped.startsWith('#') || stripped.startsWith('//') || stripped.startsWith('*') || stripped.startsWith('/*')) {
    return 'documentation'
  }
  return 'command_invocation'
}

function collectFromText(rel: string, content: string, findings: AuditFinding[]): void {
  const lines = content.split(/\r?\n/)
  let starts: number[] | null = null
  const fence = lines.map(() => false)
  let inFence = false
  let language = ''
  for (let i = 0; i < lines.length; i += 1) {
    const lang = fenceLanguage(lines[i]!)
    if (lang != null) {
      if (inFence) {
        inFence = false
        language = ''
      } else {
        inFence = true
        language = lang
      }
    }
    fence[i] = inFence && SHELL_FENCE_LANGUAGES.has(language)
  }
  for (const spec of AUDIT_RULES) {
    spec.pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = spec.pattern.exec(content))) {
      if (!starts) starts = newlineStarts(content)
      const line = lineNumberAt(starts, match.index)
      const lineIndex = Math.max(0, line - 1)
      const context = lineContext(rel, lines, lineIndex, spec.rule, fence[lineIndex]!)
      if (context !== 'command_invocation') continue
      if (findings.some(item => item.file === rel && item.line === line && item.rule === spec.rule)) continue
      const subsumedBy = SUBSUMED[spec.rule]
      if (subsumedBy && findings.some(item => item.file === rel && item.line === line && subsumedBy.has(item.rule))) continue
      findings.push({ severity: spec.severity, rule: spec.rule, message: spec.message, file: rel, line })
    }
  }
}

interface CompanionFile {
  abs: string
  rel: string
  size: number
}

function listTextFiles(root: string): CompanionFile[] {
  const files: CompanionFile[] = []
  const walk = (current: string, rel: string, depth: number): void => {
    if (depth > MAX_DEPTH || files.length >= MAX_FILES) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (AUDIT_SKIP_WALK.has(entry.name)) continue
      const abs = path.join(current, entry.name)
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name
      let listed: fs.Stats
      try {
        listed = fs.lstatSync(abs)
      } catch {
        continue
      }
      if (listed.isSymbolicLink()) continue
      if (listed.isDirectory()) {
        walk(abs, nextRel, depth + 1)
        continue
      }
      if (!listed.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!COMPANION_EXTENSIONS.has(ext)) continue
      files.push({ abs, rel: nextRel, size: listed.size })
    }
  }
  walk(root, '', 0)
  return files
}

function resolveWalkRoot(root: string): string {
  try {
    const listed = fs.lstatSync(root)
    if (listed.isSymbolicLink()) return fs.realpathSync(root)
  } catch {
    /* missing */
  }
  return path.resolve(root)
}

export function auditSkill(input: AuditInput): AuditResult {
  const findings: AuditFinding[] = []
  const skillRel = path.basename(input.skillFile)
  if (typeof input.text === 'string' && input.text) {
    collectFromText(skillRel, input.text, findings)
  }

  if (!input.fileOnly) {
    const start = resolveWalkRoot(input.root)
    const already = path.resolve(input.skillFile)
    let treeBytes = Buffer.byteLength(input.text || '', 'utf8')
    for (const file of listTextFiles(start)) {
      if (path.resolve(file.abs) === already) continue
      if (file.size > MAX_FILE_BYTES) continue
      if (treeBytes + file.size > MAX_TREE_BYTES) break
      let content = ''
      try {
        content = fs.readFileSync(file.abs, 'utf8')
      } catch {
        continue
      }
      treeBytes += Buffer.byteLength(content, 'utf8')
      collectFromText(file.rel.replace(/\\/g, '/'), content, findings)
    }
  }

  const hasPipe = findings.some(item => item.rule === 'shell.remote-pipe')
  const visible = hasPipe ? findings.filter(item => item.rule !== 'network.download') : findings

  return {
    severity: maxSeverity(visible.map(item => item.severity)),
    findings: visible,
  }
}
