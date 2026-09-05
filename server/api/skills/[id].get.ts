import { defineApiHandler } from '../../utils/api-handler'
import { getIndex } from '../../utils/catalog'
import { skillDetailFor } from '../../utils/detail'
import { fail } from '../../utils/errors'

export default defineApiHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const summary = getIndex().byId.get(id)
  if (!summary) throw fail(404, 'Skill not in the cabinet')
  return skillDetailFor(summary)
})
