/**
 * Static skill audit. Rules and context heuristics ported from skill-cabinet
 * (MIT, https://github.com/subsy/skill-cabinet), which adapted them from
 * Adaptive Skills (MIT, https://github.com/wangsoft/Adaptive-Skills).
 */
import type { AuditRule, Severity } from '#shared/types/catalog'

export const SEVERITY_ORDER: Record<Severity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

/** Directories the companion-file walk never enters. */
export const AUDIT_SKIP_WALK: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  'dist',
  '.cache',
  'upstream',
  '__pycache__',
  '.venv',
  'venv',
])

export const COMPANION_EXTENSIONS: ReadonlySet<string> = new Set([
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
  '.py',
  '.js',
  '.mjs',
  '.cjs',
])

export const MAX_FILE_BYTES = 256_000
export const MAX_TREE_BYTES = 512_000
export const MAX_DEPTH = 4
export const MAX_FILES = 12

export const SHELL_FENCE_LANGUAGES: ReadonlySet<string> = new Set([
  '',
  'sh',
  'shell',
  'bash',
  'zsh',
  'fish',
  'console',
  'terminal',
])

export const DENYLIST_PATTERN
  = /(?:\bdo\s+not\b|\bdon't\b|\bnever\b|\bmust\s+not\b|\bavoid\b|\bforbidden\b|\bdenylist\b|\bblocklist\b)/i

export const SHELLISH_LINE
  = /^(?:[-*+]\s+)?(?:[$>]\s*)?(?:sudo\s+)?(?:curl|wget|rm|git|bash|sh|zsh|fish|python(?:3)?|node|npm|npx|pnpm|yarn|eval|exec)\b/i

export const IMPERATIVE_LINE
  = /^(?:[-*+]\s+)?(?:read|open|copy|upload|download|delete|remove|write|modify|send|execute|run)\b/i

export const PROMPT_COMMAND = /^(?:[-*+]\s+)?(?:ignore|disregard)\b/i

/** Module singletons with the `g` flag: `auditSkill` resets `lastIndex` before every scan. */
export const AUDIT_RULES: readonly AuditRule[] = [
  {
    severity: 'critical',
    rule: 'shell.remote-pipe',
    pattern: /(?:curl|wget)\b[^\n|]{0,500}\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/gi,
    message: 'Downloads are piped directly to a shell',
  },
  {
    severity: 'high',
    rule: 'filesystem.broad-delete',
    pattern: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(?:\/|~|\$HOME)(?:\s|$)/gi,
    message: 'Command may recursively delete a broad filesystem root',
  },
  {
    severity: 'high',
    rule: 'credentials.sensitive-path',
    pattern: /(?:\.ssh\/(?:id_|config)|\.aws\/credentials|\.config\/gcloud|login\.keychain)/gi,
    message: 'References a sensitive credential location',
  },
  {
    severity: 'high',
    rule: 'execution.obfuscated',
    pattern: /(?:eval|exec)\s*\([^\n]{0,200}(?:base64|b64decode)/gi,
    message: 'Executes obfuscated or decoded content',
  },
  {
    severity: 'medium',
    rule: 'prompt.override',
    pattern: /(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior|system)\s+instructions/gi,
    message: 'Contains an instruction-override phrase',
  },
  {
    severity: 'medium',
    rule: 'git.global-config',
    pattern: /git\s+config\s+--global/gi,
    message: 'Modifies global Git configuration',
  },
  {
    severity: 'low',
    rule: 'network.download',
    pattern: /\b(?:curl|wget)\b/gi,
    message: 'Uses a network download command',
  },
]

/** A finding of the key rule is dropped when one of the listed rules already fired on the same file+line. */
export const SUBSUMED: Readonly<Record<string, ReadonlySet<string>>> = {
  'network.download': new Set(['shell.remote-pipe']),
}
