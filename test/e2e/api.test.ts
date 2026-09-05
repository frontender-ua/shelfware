import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

const HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shelfware-e2e-')))
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
})
