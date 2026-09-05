import type { SkillDetail } from '#shared/types/catalog'
import { defineApiHandler } from '../../utils/api-handler'
import { getIndex, invalidate } from '../../utils/catalog'
import { skillDetailFor } from '../../utils/detail'
import { saveSkillSource } from '../../utils/editor'
import { fail } from '../../utils/errors'

export default defineApiHandler(async (event): Promise<SkillDetail> => {
  const id = getRouterParam(event, 'id') ?? ''
  const body = await readBody<{ source?: unknown, baseHash?: unknown }>(event)
  if (typeof body?.source !== 'string' || typeof body?.baseHash !== 'string') {
    throw fail(400, 'Expected { source, baseHash }')
  }
  const index = getIndex({ force: true })
  const summary = index.byId.get(id)
  if (!summary) throw fail(404, 'Skill not in the cabinet')

  saveSkillSource(summary, { source: body.source, baseHash: body.baseHash }, index.roots)
  invalidate()

  const fresh = getIndex({ force: true }).byId.get(id)
  if (!fresh) throw fail(500, 'Skill vanished after save')
  return skillDetailFor(fresh)
})
