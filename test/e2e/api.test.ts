import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { createFixtureHome } from '../helpers/fixture-home'
import { rawRequest } from '../helpers/raw-http'

const FIXTURE = createFixtureHome()
export const HOME = FIXTURE.home
export const PATHS = FIXTURE.paths
export const TOKEN = `sw_${'ab'.repeat(32)}`

describe('shelfware api', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    env: { HOME, NUXT_PUBLIC_SHELFWARE_TOKEN: TOKEN },
    setupTimeout: 300_000,
  })

  describe('health', () => {
    it('answers ok', async () => {
      const res = await $fetch<{ ok: boolean }>('/api/health')
      expect(res).toEqual({ ok: true })
    })
  })

  describe('host check', () => {
    it('serves the SPA shell with the session token to a loopback Host', async () => {
      const html = await $fetch<string>('/')
      expect(html).toContain('<div id="__nuxt"')
      expect(html).toContain(TOKEN)
    })

    it('rejects a foreign Host on the shell and on the api', async () => {
      const port = new URL(url('/')).port
      const shell = await rawRequest(url('/'), { headers: { Host: 'evil.com' } })
      expect(shell.status).toBe(403)
      expect(JSON.parse(shell.text)).toEqual({ error: 'Host not allowed' })

      const api = await rawRequest(url('/api/health'), { headers: { Host: `evil.com:${port}` } })
      expect(api.status).toBe(403)
    })

    it('rejects the right host on the wrong port', async () => {
      const port = Number(new URL(url('/')).port)
      const res = await rawRequest(url('/api/health'), { headers: { Host: `127.0.0.1:${port + 1}` } })
      expect(res.status).toBe(403)
    })

    it('accepts localhost and [::1] on the right port', async () => {
      const port = new URL(url('/')).port
      for (const host of [`localhost:${port}`, `[::1]:${port}`]) {
        const res = await rawRequest(url('/api/health'), { headers: { Host: host } })
        expect(res.status, host).toBe(200)
      }
    })
  })
})
