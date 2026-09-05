import { randomBytes } from 'node:crypto'

/**
 * Spec §10.3 dev fallback. `bin/launch.mjs` always sets the env before the
 * server starts; under plain `nuxt dev` nothing does, so mint one here.
 * Only `useRuntimeConfig(event)` sees it (env is applied per event); the
 * argument-less form is frozen at startup. Same format as makeToken().
 */
export default defineNitroPlugin(() => {
  if (!process.env.NUXT_PUBLIC_SHELFWARE_TOKEN) {
    process.env.NUXT_PUBLIC_SHELFWARE_TOKEN = `sw_${randomBytes(32).toString('hex')}`
  }
})
