import { expectedPort, isLoopbackOrigin, MAX_BODY_BYTES, tokenMatches } from '../utils/guards'

/**
 * Spec §10.2. Every method other than GET/HEAD/OPTIONS needs a loopback
 * Origin on the expected port, the session token, and a declared body of at
 * most MAX_BODY_BYTES. `useRuntimeConfig(event)` (with the event) re-applies
 * NUXT_* env per request, which is what lets the dev token plugin work.
 */
export default defineEventHandler((event) => {
  const method = event.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

  const expected = expectedPort(process.env)
  if (!isLoopbackOrigin(getRequestHeader(event, 'origin'), expected)) {
    setResponseStatus(event, 403)
    return { error: 'Cross-origin request blocked' }
  }

  const token = String(useRuntimeConfig(event).public.shelfwareToken ?? '')
  if (!tokenMatches(getRequestHeader(event, 'x-shelfware-token'), token)) {
    setResponseStatus(event, 403)
    return { error: 'Missing or invalid session token' }
  }

  const length = Number(getRequestHeader(event, 'content-length'))
  if (!Number.isInteger(length) || length < 0 || length > MAX_BODY_BYTES) {
    setResponseStatus(event, 413)
    return { error: 'Request body too large' }
  }
})
