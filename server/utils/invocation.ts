/**
 * Invocation classification, ported from skill-cabinet server/invocation.js
 * (MIT, https://github.com/subsy/skill-cabinet).
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Invocation } from '#shared/types/catalog'

const STANDING_ORDER
  = /\b(?:must\s+always\s+apply|always\s+apply|on\s+every\s+(?:request|turn|message|prompt)|before\s+every\s+(?:request|turn|message|prompt)|hooked\s+into\s+every|injected\s+at\s+session\s+start)\b/gi

const VERBAL_NEGATION
  = /\b(?:do\s+not|don't|does\s+not|doesn't|did\s+not|didn't|can\s+not|can't|cannot|never)\b/gi

export interface InvocationInput {
  skillDir: string
  fileOnly?: boolean
  frontmatter?: Record<string, unknown>
  description?: string
}

export interface InvocationResult {
  invocation: Invocation
  invocationEvidence: string
}

function pathExists(p: string): boolean {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

function isTruthy(value: unknown): boolean {
  return value === true || value === 'true' || value === 'yes'
}

function isFalsy(value: unknown): boolean {
  return value === false || value === 'false' || value === 'no'
}

function hooksAt(dir: string): string {
  const nested = path.join(dir, 'hooks', 'hooks.json')
  if (pathExists(nested)) return nested
  const flat = path.join(dir, 'hooks.json')
  if (pathExists(flat)) return flat
  return ''
}

/** Path of the skill's own hooks.json, or ''. Never a parent's, never for file skills. */
export function findSkillHooks(skillDir: string, { fileOnly = false }: { fileOnly?: boolean } = {}): string {
  if (fileOnly) return ''
  return hooksAt(skillDir)
}

function lastClauseCut(before: string): number {
  let cut = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf(';'))
  const coord = /(?:,\s*)?\b(?:but|yet)\b|,\s*\b(?:and|or)\b/gi
  for (const match of before.matchAll(coord)) {
    cut = Math.max(cut, match.index + match[0].length - 1)
  }
  return cut
}

function clauseBefore(text: string, index: number): string {
  const before = text.slice(0, index)
  return before.slice(lastClauseCut(before) + 1)
}

function negationApplies(clause: string): boolean {
  const re = new RegExp(VERBAL_NEGATION.source, 'gi')
  let last: RegExpMatchArray | null = null
  for (const match of clause.matchAll(re)) last = match
  if (!last || last.index === undefined) return false
  const rest = clause.slice(last.index + last[0].length).trim()
  const words = rest ? rest.split(/\s+/).filter(Boolean) : []
  return words.length <= 5
}

export function hasStandingOrder(text: string): boolean {
  if (!text) return false
  const re = new RegExp(STANDING_ORDER.source, 'gi')
  for (const match of text.matchAll(re)) {
    if (match.index !== undefined && !negationApplies(clauseBefore(text, match.index))) return true
  }
  return false
}

function metadataOf(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const meta = frontmatter.metadata
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {}
}

export function skillInvocation({ skillDir, fileOnly = false, frontmatter = {}, description = '' }: InvocationInput): InvocationResult {
  const hookPath = findSkillHooks(skillDir, { fileOnly })
  if (hookPath) {
    return { invocation: 'hook', invocationEvidence: `hooks.json at ${hookPath}` }
  }

  const meta = metadataOf(frontmatter)

  if (isTruthy(frontmatter.sessionStart) || isTruthy(meta.sessionStart) || isTruthy(frontmatter.alwaysApply) || isTruthy(meta.alwaysApply)) {
    const key = isTruthy(frontmatter.sessionStart) || isTruthy(meta.sessionStart) ? 'sessionStart' : 'alwaysApply'
    return { invocation: 'hook', invocationEvidence: `frontmatter ${key}` }
  }

  const blurb = description || (typeof frontmatter.description === 'string' ? frontmatter.description : '')
  if (hasStandingOrder(blurb)) {
    return { invocation: 'hook', invocationEvidence: 'description standing order' }
  }

  if (isTruthy(frontmatter['disable-model-invocation'])) {
    const userInvokable = frontmatter['user-invokable'] ?? meta['user-invokable']
    if (isFalsy(userInvokable)) {
      return { invocation: 'off', invocationEvidence: 'frontmatter disable-model-invocation and user-invokable false' }
    }
    return { invocation: 'user', invocationEvidence: 'frontmatter disable-model-invocation' }
  }

  return { invocation: 'model', invocationEvidence: 'default: the model may call this' }
}
