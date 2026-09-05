import type { BatchError, DeleteResult } from '#shared/types/catalog'
import { defineApiHandler } from '../../utils/api-handler'
import { errorMessage, idsFrom } from '../../utils/batch'
import { getIndex, invalidate } from '../../utils/catalog'
import { fail } from '../../utils/errors'
import { forgetQuarantinePath } from '../../utils/quarantine'
import { assertDeletable, deleteSkillDir } from '../../utils/scan'

export default defineApiHandler(async (event): Promise<DeleteResult> => {
  const body = await readBody<{ ids?: unknown, force?: unknown }>(event)
  const ids = idsFrom(body)
  if (!ids.length) throw fail(400, 'No cards selected')
  const force = body?.force === true
  const index = getIndex({ force: true })
  const deleted: DeleteResult['deleted'] = []
  const errors: BatchError[] = []
  for (const id of ids) {
    const summary = index.byId.get(id)
    if (!summary) {
      errors.push({ id, error: 'Skill not in the cabinet' })
      continue
    }
    if (!summary.quarantined && !force) {
      errors.push({ id, path: summary.path, error: 'Not quarantined; pass force to delete a live card' })
      continue
    }
    try {
      const target = assertDeletable(summary, index.roots)
      deleteSkillDir(target)
      forgetQuarantinePath(target)
      deleted.push({ id, path: target, name: summary.name })
    } catch (err) {
      errors.push({ id, error: errorMessage(err), path: summary.path })
    }
  }
  invalidate()
  return { deleted, errors }
})
