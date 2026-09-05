import type { SkillDetail } from '#shared/types/catalog'
import { quarantineRecordFor } from './quarantine'
import { readSkill, type HomeOptions, type SkillSummary } from './scan'

/** `readSkill` plus `quarantinedFrom` / `quarantinedAt` from the manifest for held cards. */
export function skillDetailFor(summary: SkillSummary, opts?: HomeOptions): SkillDetail {
  const detail = readSkill(summary)
  if (summary.quarantined) {
    const record = quarantineRecordFor(summary.path, opts)
    if (record) {
      detail.quarantinedFrom = record.originPath
      detail.quarantinedAt = record.quarantinedAt
    }
  }
  return detail
}
