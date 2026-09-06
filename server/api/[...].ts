import { defineApiHandler } from '../utils/api-handler'
import { fail } from '../utils/errors'

/** Spec §9 + R15: every unknown /api path answers JSON, never the SPA shell. */
export default defineApiHandler(() => {
  throw fail(404, 'Not found')
})
