import type { RestoreResult } from '#shared/types/catalog'
import { defineApiHandler } from '../../utils/api-handler'
import { idsFrom, runOnIds } from '../../utils/batch'
import { getIndex, invalidate } from '../../utils/catalog'
import { fail } from '../../utils/errors'
import { restoreSkill } from '../../utils/quarantine'

export default defineApiHandler(async (event): Promise<RestoreResult> => {
  const ids = idsFrom(await readBody(event))
  if (!ids.length) throw fail(400, 'No cards selected')
  const index = getIndex({ force: true })
  const { done, errors } = runOnIds(ids, index, (summary, roots) => restoreSkill(summary, roots))
  invalidate()
  return { restored: done, errors }
})
