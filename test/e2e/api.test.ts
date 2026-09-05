import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, fetch, setup, url } from '@nuxt/test-utils/e2e'
import type { CatalogResponse, DeleteResult, FilePreview, QuarantineResult, RestoreResult, SkillDetail } from '../../shared/types/catalog'
import { readManifest } from '../../server/utils/quarantine'
import { createFixtureHome, TWIN_TEXT } from '../helpers/fixture-home'
import { rawRequest } from '../helpers/raw-http'
import { installUpstreamFixture } from '../helpers/upstream-fixture'

const FIXTURE = createFixtureHome()
const UPSTREAM = installUpstreamFixture(FIXTURE.home)
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

  function origin(): string {
    return new URL(url('/')).origin
  }

  function mutate(path: string, body: unknown, overrides: { origin?: string | null, token?: string | null, contentType?: string } = {}) {
    const headers: Record<string, string> = { 'Content-Type': overrides.contentType ?? 'application/json' }
    const o = overrides.origin === undefined ? origin() : overrides.origin
    if (o) headers.Origin = o
    const t = overrides.token === undefined ? TOKEN : overrides.token
    if (t) headers['X-Shelfware-Token'] = t
    return fetch(url(path), { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
  }

  describe('mutation guard', () => {
    it('rejects a mutation without Origin, with a foreign Origin, without token, with a wrong token', async () => {
      expect((await mutate('/api/skills/quarantine', { ids: ['x'] }, { origin: null })).status).toBe(403)
      expect((await mutate('/api/skills/quarantine', { ids: ['x'] }, { origin: 'http://evil.com' })).status).toBe(403)
      const noToken = await mutate('/api/skills/quarantine', { ids: ['x'] }, { token: null })
      expect(noToken.status).toBe(403)
      expect(await noToken.json()).toEqual({ error: 'Missing or invalid session token' })
      expect((await mutate('/api/skills/quarantine', { ids: ['x'] }, { token: `${TOKEN.slice(0, -1)}0` })).status).toBe(403)
      const wrongPort = await mutate('/api/skills/quarantine', { ids: ['x'] }, { origin: 'http://127.0.0.1:1' })
      expect(wrongPort.status).toBe(403)
      expect(await wrongPort.json()).toEqual({ error: 'Cross-origin request blocked' })
    })

    it('accepts loopback Origin plus token and then applies the route rules', async () => {
      for (const route of ['/api/skills/quarantine', '/api/skills/restore', '/api/skills/delete']) {
        const empty = await mutate(route, { ids: [] })
        expect(empty.status, route).toBe(400)
        expect(await empty.json()).toEqual({ error: 'No cards selected' })
      }
      const unknown = await mutate('/api/skills/quarantine', { ids: ['nope'] })
      expect(unknown.status).toBe(200)
      expect(await unknown.json()).toEqual({ quarantined: [], errors: [{ id: 'nope', error: 'Skill not in the cabinet' }] })
    })

    it('rejects bodies over 1 MiB and malformed JSON', async () => {
      const big = await mutate('/api/skills/quarantine', { ids: ['a'.repeat(1_100_000)] })
      expect(big.status).toBe(413)
      const bad = await mutate('/api/skills/quarantine', '{not json')
      expect(bad.status).toBe(400)
      expect(typeof (await bad.json()).error).toBe('string')
    })

    it('never sets CORS headers', async () => {
      const health = await fetch(url('/api/health'), { headers: { Origin: 'http://evil.com' } })
      expect(health.headers.get('access-control-allow-origin')).toBeNull()
      const preflight = await fetch(url('/api/skills/delete'), {
        method: 'OPTIONS',
        headers: { 'Origin': 'http://evil.com', 'Access-Control-Request-Method': 'POST' },
      })
      for (const name of ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-allow-credentials']) {
        expect(preflight.headers.get(name), name).toBeNull()
      }
    })
  })

  describe('quarantine flow', () => {
    it('quarantines bravo, shows it on the shelf with its record, and restores it to the exact path', async () => {
      const before = await $fetch<CatalogResponse>('/api/skills?refresh=1')
      const bravo = before.skills.find(s => s.slug === 'bravo')!

      const moved = await (await mutate('/api/skills/quarantine', { ids: [bravo.id] })).json() as QuarantineResult
      expect(moved.errors).toEqual([])
      expect(moved.quarantined).toHaveLength(1)
      expect(moved.quarantined[0]).toMatchObject({ id: bravo.id, name: 'bravo', from: PATHS.bravo })
      expect(moved.quarantined[0]!.to).toBe(path.join(HOME, '.skill-cabinet', 'quarantine', 'codex', 'bravo'))
      expect(fs.existsSync(PATHS.bravo)).toBe(false)

      const during = await $fetch<CatalogResponse>('/api/skills')
      expect(during.total).toBe(16)
      expect(during.scopes.some(s => s.id === 'codex')).toBe(false)
      const held = during.skills.find(s => s.slug === 'bravo')!
      expect(held).toMatchObject({ quarantined: true, scopeId: 'quarantine', scopeLabel: 'Quarantine', fromScope: 'codex', kind: 'quarantine' })
      expect(held.id).not.toBe(bravo.id)

      const detail = await $fetch<SkillDetail>(`/api/skills/${held.id}`)
      expect(detail.quarantinedFrom).toBe(PATHS.bravo)
      expect(detail.quarantinedAt).toBeGreaterThan(0)
      expect(readManifest({ home: HOME }).entries.some(e => e.originPath === PATHS.bravo)).toBe(true)

      const back = await (await mutate('/api/skills/restore', { ids: [held.id] })).json() as RestoreResult
      expect(back.errors).toEqual([])
      expect(back.restored[0]).toMatchObject({ id: held.id, name: 'bravo', to: PATHS.bravo })
      expect(fs.existsSync(path.join(PATHS.bravo, 'SKILL.md'))).toBe(true)
      expect(readManifest({ home: HOME }).entries.some(e => e.originPath === PATHS.bravo)).toBe(false)

      const after = await $fetch<CatalogResponse>('/api/skills')
      expect(after.total).toBe(17)
      expect(after.skills.find(s => s.slug === 'bravo')).toMatchObject({ id: bravo.id, quarantined: false, scopeId: 'codex' })
    })
  })

  describe('delete semantics and upstream compatibility', () => {
    it('restores an entry that skill-cabinet 0.6.0 quarantined', async () => {
      const catalog = await $fetch<CatalogResponse>('/api/skills?refresh=1')
      const held = catalog.skills.find(s => s.slug === 'upstream-held')!
      expect(held).toMatchObject({ quarantined: true, fromScope: 'claude' })
      const detail = await $fetch<SkillDetail>(`/api/skills/${held.id}`)
      expect(detail.quarantinedFrom).toBe(UPSTREAM.originPath)
      expect(detail.quarantinedAt).toBe(1757000000000)

      const back = await (await mutate('/api/skills/restore', { ids: [held.id] })).json() as RestoreResult
      expect(back.errors).toEqual([])
      expect(back.restored[0]!.to).toBe(UPSTREAM.originPath)
      expect(fs.existsSync(path.join(UPSTREAM.originPath, 'SKILL.md'))).toBe(true)
      expect(fs.existsSync(UPSTREAM.quarantinePath)).toBe(false)
      expect(readManifest({ home: HOME }).entries).toEqual([])

      const after = await $fetch<CatalogResponse>('/api/skills')
      expect(after.skills.find(s => s.slug === 'upstream-held')).toMatchObject({ quarantined: false, scopeId: 'claude' })
    })

    it('skips live cards unless force is set', async () => {
      const catalog = await $fetch<CatalogResponse>('/api/skills?refresh=1')
      const alpha = catalog.skills.find(s => s.slug === 'alpha')!

      const refused = await (await mutate('/api/skills/delete', { ids: [alpha.id] })).json() as DeleteResult
      expect(refused.deleted).toEqual([])
      expect(refused.errors).toEqual([{ id: alpha.id, path: PATHS.alpha, error: 'Not quarantined; pass force to delete a live card' }])
      expect(fs.existsSync(path.join(PATHS.alpha, 'SKILL.md'))).toBe(true)

      const forced = await (await mutate('/api/skills/delete', { ids: [alpha.id], force: true })).json() as DeleteResult
      expect(forced.errors).toEqual([])
      expect(forced.deleted).toEqual([{ id: alpha.id, path: PATHS.alpha, name: 'alpha' }])
      expect(fs.existsSync(PATHS.alpha)).toBe(false)
    })

    it('refuses to restore into an occupied path and deletes the held copy with its record', async () => {
      const catalog = await $fetch<CatalogResponse>('/api/skills?refresh=1')
      const gem = catalog.skills.find(s => s.slug === 'gem-one')!
      const moved = await (await mutate('/api/skills/quarantine', { ids: [gem.id] })).json() as QuarantineResult
      expect(moved.quarantined).toHaveLength(1)
      fs.mkdirSync(PATHS.gemOne, { recursive: true })
      fs.writeFileSync(path.join(PATHS.gemOne, 'SKILL.md'), '---\nname: gem-one\ndescription: reinstalled\n---\n\nNew.\n')

      const during = await $fetch<CatalogResponse>('/api/skills?refresh=1')
      const held = during.skills.find(s => s.slug === 'gem-one' && s.quarantined)!
      const blocked = await (await mutate('/api/skills/restore', { ids: [held.id] })).json() as RestoreResult
      expect(blocked.restored).toEqual([])
      expect(blocked.errors[0]).toMatchObject({ id: held.id, path: held.path })
      expect(blocked.errors[0]!.error).toMatch(/already at/)
      expect(fs.existsSync(path.join(held.path, 'SKILL.md'))).toBe(true)

      const gone = await (await mutate('/api/skills/delete', { ids: [held.id] })).json() as DeleteResult
      expect(gone.errors).toEqual([])
      expect(gone.deleted).toEqual([{ id: held.id, path: held.path, name: 'gem-one' }])
      expect(fs.existsSync(held.path)).toBe(false)
      expect(readManifest({ home: HOME }).entries.some(e => e.quarantinePath === held.path)).toBe(false)
      expect(fs.existsSync(path.join(HOME, '.skill-cabinet', 'quarantine', 'gemini'))).toBe(false)
    })

    it('has no DELETE /api/skills/:id route', async () => {
      const res = await rawRequest(url('/api/skills/nope'), {
        method: 'DELETE',
        headers: { 'Origin': origin(), 'X-Shelfware-Token': TOKEN, 'Content-Length': '0' },
      })
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/text\/html/)
      expect(res.text).toContain('<div id="__nuxt"')
    })
  })
})
