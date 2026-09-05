import type { QuarantineResult } from '#shared/types/catalog'
import { defineApiHandler } from '../../utils/api-handler'
import { idsFrom, runOnIds } from '../../utils/batch'
import { getIndex, invalidate } from '../../utils/catalog'
import { fail } from '../../utils/errors'
import { quarantineSkill } from '../../utils/quarantine'

export default defineApiHandler(async (event): Promise<QuarantineResult> => {
  const ids = idsFrom(await readBody(event))
  if (!ids.length) throw fail(400, 'No cards selected')
  const index = getIndex({ force: true })
  const { done, errors } = runOnIds(ids, index, (summary, roots) => quarantineSkill(summary, roots))
  invalidate()
  return { quarantined: done, errors }
})
