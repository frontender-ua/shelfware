import crypto from 'node:crypto'
import fs from 'node:fs'
import type { SaveRequest } from '#shared/types/catalog'
import { fail } from './errors'
import { assertSkillTarget, contained, homeOf, realPath, type HomeOptions, type SkillSummary } from './scan'

export interface SaveResult {
  path: string
  contentHash: string
}

export function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data).digest('hex')
}

/**
 * Spec §8 + ruling R14: containment (assertSkillTarget, plus
 * realpath(skillFile) inside realpath(skillDir) for directory skills, and —
 * for every card, loose files included — the real write target must stay
 * inside HOME), optimistic hash check, then an atomic tmp + chmod + rename
 * write. The tmp file never survives a failure.
 */
export function saveSkillSource(summary: SkillSummary, input: SaveRequest, roots: readonly { root: string }[], opts?: HomeOptions): SaveResult {
  if (summary.physicality === 'broken') throw fail(400, 'Nothing to edit: the link target is gone')
  assertSkillTarget(summary, roots, 'edit', opts)

  const target = realPath(summary.skillFile)
  if (!summary.file) {
    const dir = realPath(summary.path)
    if (target === dir || !contained(target, dir)) throw fail(400, 'Skill file escapes its directory')
  }
  if (!contained(target, realPath(homeOf(opts)))) throw fail(400, 'Skill file escapes the home directory')

  let current: Buffer
  let mode: number
  try {
    const st = fs.statSync(target)
    mode = st.mode & 0o7777
    current = fs.readFileSync(target)
  } catch {
    throw fail(404, 'Skill file not found')
  }

  const currentHash = sha256(current)
  if (currentHash !== input.baseHash) {
    throw fail(409, 'File changed on disk since it was loaded', { currentHash })
  }

  const tmp = `${target}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, input.source, { encoding: 'utf8', mode })
    fs.chmodSync(tmp, mode)
    fs.renameSync(tmp, target)
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true })
    } catch {
      /* nothing left to clean */
    }
    throw err
  }

  return { path: target, contentHash: sha256(input.source) }
}
