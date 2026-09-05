import { expectedPort, isAllowedHost } from '../utils/guards'

/**
 * Spec §10.1. Runs on every request that reaches Nitro's handlers (api, shell,
 * deep links). Nitro serves `_nuxt/*` assets before scanned middleware; they
 * carry no user data. Returning a value from middleware ends the response.
 */
export default defineEventHandler((event) => {
  if (!isAllowedHost(getRequestHeader(event, 'host'), expectedPort(process.env))) {
    setResponseStatus(event, 403)
    return { error: 'Host not allowed' }
  }
})
