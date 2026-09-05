import { defineApiHandler } from '../../../utils/api-handler'
import { getIndex } from '../../../utils/catalog'
import { fail } from '../../../utils/errors'
import { readSkillFile } from '../../../utils/scan'

export default defineApiHandler((event) => {
  const rel = String(getQuery(event).path || '')
  if (!rel) throw fail(400, 'Missing path')
  const id = getRouterParam(event, 'id') ?? ''
  const summary = getIndex().byId.get(id)
  if (!summary) throw fail(404, 'Skill not in the cabinet')
  return readSkillFile(summary, rel)
})
