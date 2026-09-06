import { randomBytes } from 'node:crypto'
import { isWellFormedToken } from '../utils/guards'

/**
 * Spec §10.3 dev fallback. `bin/launch.mjs` always sets the env before the
 * server starts; under plain `nuxt dev` nothing does, so mint one here.
 * The guard is on the format, not on truthiness: a whitespace-only or
 * otherwise malformed env value is replaced rather than trusted.
 * Only `useRuntimeConfig(event)` sees it (env is applied per event); the
 * argument-less form is frozen at startup. Same format as makeToken().
 */
export default defineNitroPlugin(() => {
  if (!isWellFormedToken(process.env.NUXT_PUBLIC_SHELFWARE_TOKEN)) {
    process.env.NUXT_PUBLIC_SHELFWARE_TOKEN = `sw_${randomBytes(32).toString('hex')}`
  }
})
