import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup, url } from '@nuxt/test-utils/e2e'
import type { CatalogResponse, FilePreview, SkillDetail } from '../../shared/types/catalog'
import { createFixtureHome, TWIN_TEXT } from '../helpers/fixture-home'
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

  describe('catalog', () => {
    it('lists every live card with census and scopes matching the fixture', async () => {
      const catalog = await $fetch<CatalogResponse>('/api/skills?refresh=1')
      expect(catalog.home).toBe(HOME)
      expect(catalog.quarantineRoot).toBe(path.join(HOME, '.skill-cabinet', 'quarantine'))
      expect(catalog.scannedAt).toBeGreaterThan(0)
      expect(catalog.total).toBe(17)
      expect(catalog.census).toMatchObject({ total: 17, physical: 15, unique: 14, duplicateCopies: 2, duplicates: 2, references: 1, broken: 1 })
      expect(catalog.census.duplicateBytes).toBe(2 * Buffer.byteLength(TWIN_TEXT))
      const physicalTokens = catalog.skills
        .filter(s => !s.quarantined && s.physicality === 'physical')
        .reduce((sum, s) => sum + s.tokenEstimate, 0)
      expect(catalog.census.tokenEstimate).toBe(physicalTokens)
      expect(physicalTokens).toBeGreaterThan(0)

      expect(catalog.scopes.map(s => s.id).sort()).toEqual(
        ['claude', 'codex', 'cursor-builtin', 'cursor-plugins', 'gemini', 'hermes-profile:coding'],
      )
      expect(catalog.scopes.find(s => s.id === 'claude')).toMatchObject({ label: '.claude', kind: 'user', count: 11 })
      expect(catalog.scopes.find(s => s.id === 'gemini')?.count).toBe(2)
      expect(catalog.scopes.find(s => s.id === 'cursor-plugins')).toMatchObject({ kind: 'plugin', count: 1 })

      const by = (slug: string) => catalog.skills.find(s => s.slug === slug)!
      expect(by('deep-research').scopeLabel).toBe('Hermes profile · coding')
      expect(by('plug-one').kind).toBe('plugin')
      expect(by('builtin-one').kind).toBe('builtin')
      expect(catalog.skills.some(s => s.slug === 'nope')).toBe(false)
      expect(catalog.skills.some(s => s.slug === 'ignored')).toBe(false)
      expect(by('note')).toMatchObject({ file: true, skillRel: 'note.md' })
      expect(by('dead')).toMatchObject({ physicality: 'broken', link: true, tokenEstimate: 0 })
      expect(by('linked')).toMatchObject({ physicality: 'reference', refSkillId: '', refTarget: PATHS.linkedTarget })
      expect(by('twin-a').copies.map(c => c.id)).toEqual([by('twin-b').id])
      expect(by('twin-a').copyCount).toBe(1)
      expect(by('keys').risk).toBe('high')
      expect(by('piper').risk).toBe('critical')
      expect(by('hooked').invocation).toBe('hook')
      expect(by('negated').invocation).toBe('model')
      expect(by('badyaml').name).toBe('badyaml')
      expect(by('alpha')).not.toHaveProperty('findings')
    })

    it('serves a detail with frontmatter, body, files, findings and hash', async () => {
      const catalog = await $fetch<CatalogResponse>('/api/skills')
      const by = (slug: string) => catalog.skills.find(s => s.slug === slug)!

      const piper = await $fetch<SkillDetail>(`/api/skills/${by('piper').id}`)
      expect(piper.findings[0]).toMatchObject({ rule: 'shell.remote-pipe', file: 'SKILL.md', severity: 'critical' })
      expect(piper.contentHash).toMatch(/^[0-9a-f]{64}$/)
      expect(piper.body).toContain('curl')
      expect(piper.source.startsWith('---\n')).toBe(true)

      const bad = await $fetch<SkillDetail>(`/api/skills/${by('badyaml').id}`)
      expect(bad.frontmatter).toEqual({ _parseError: 'YAML frontmatter could not be parsed' })

      const dead = await $fetch<SkillDetail>(`/api/skills/${by('dead').id}`)
      expect(dead).toMatchObject({ body: '', source: '', files: [], bytes: 0, contentHash: null })

      const keys = await $fetch<SkillDetail>(`/api/skills/${by('keys').id}`)
      expect(keys.files.map(f => f.path)).toEqual(['scripts/read.sh', 'SKILL.md'])
      expect(keys).not.toHaveProperty('quarantinedFrom')
    })

    it('returns 404 for an unknown id with an error body', async () => {
      const res = await fetch(url('/api/skills/nope'))
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'Skill not in the cabinet' })
    })

    it('previews files inside the skill and refuses escapes', async () => {
      const catalog = await $fetch<CatalogResponse>('/api/skills')
      const keys = catalog.skills.find(s => s.slug === 'keys')!
      const preview = await $fetch<FilePreview>(`/api/skills/${keys.id}/file?path=scripts/read.sh`)
      expect(preview).toEqual({ path: 'scripts/read.sh', size: 18, binary: false, content: 'cat ~/.ssh/id_rsa\n' })

      const escape = await fetch(url(`/api/skills/${keys.id}/file?path=../../etc/passwd`))
      expect(escape.status).toBe(400)
      expect(await escape.json()).toEqual({ error: 'Path escapes skill directory' })

      const viaLink = await fetch(url(`/api/skills/${keys.id}/file?path=outside.md`))
      expect(viaLink.status).toBe(400)

      const missing = await fetch(url(`/api/skills/${keys.id}/file?path=nope.txt`))
      expect(missing.status).toBe(404)

      const noPath = await fetch(url(`/api/skills/${keys.id}/file`))
      expect(noPath.status).toBe(400)
      expect(await noPath.json()).toEqual({ error: 'Missing path' })

      fs.writeFileSync(path.join(PATHS.keys, 'big.txt'), Buffer.alloc(1_500_001, 0x61))
      const big = await fetch(url(`/api/skills/${keys.id}/file?path=big.txt`))
      expect(big.status).toBe(413)
      fs.rmSync(path.join(PATHS.keys, 'big.txt'))
    })
  })
})
