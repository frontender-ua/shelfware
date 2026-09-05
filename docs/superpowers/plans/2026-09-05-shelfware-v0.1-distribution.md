# shelfware v0.1 — Distribution Implementation Plan (part 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship shelfware as a zero-build `npx shelfware`: a launcher that picks a port, mints the session token, boots the prebuilt Nitro server on `127.0.0.1`, waits for health and opens the browser; a tarball check that proves it; a README.

**Architecture:** `bin/launch.mjs` holds pure, unit-tested helpers (argument parsing, port probing, token, health polling, browser opening, orchestration with injectable I/O); `bin/shelfware.mjs` is a three-line entry that passes the real server import. `scripts/pack-verify.mjs` packs the package, runs it from a temp dir through `npx`, and polls health with the right `Host`. Node built-ins only.

**Tech Stack:** Node ≥ 20 ESM, `node:net`, `node:http`, `node:crypto`, `node:child_process`; pnpm pack; vitest (`unit` project).

**Spec:** `docs/superpowers/specs/2026-09-05-shelfware-v0.1-design.md` §13 and §10.3. **Prerequisite:** the server and client plans are complete and `pnpm build` produces `.output/server/index.mjs`.

## Global Constraints

- Everything in the server plan's Global Constraints still applies.
- `bin/` uses Node built-ins only; runtime `dependencies` stay `{}`; `files: ["bin", ".output"]`; `.output` stays git-ignored and exists only in the tarball.
- Flags: `--port <n>` (also `PORT`), `--no-open` (also `SHELFWARE_NO_OPEN=1`). Default port search starts at 3781 and tries at most 20 ports, binding `127.0.0.1` only.
- Env set before importing the server: `NUXT_PUBLIC_SHELFWARE_TOKEN` (`sw_` + 64 hex), `NITRO_HOST=127.0.0.1`, `NITRO_PORT=<port>`, `NODE_ENV=production`.
- Health polling uses `node:http` with an explicit `Host: 127.0.0.1:<port>` header for at most 10 s.
- The console line on success is exactly `shelfware at http://127.0.0.1:<port>`.
- v0.1 is "done" only when `pnpm pack:verify` exits 0.
- Publishing to npm is an outward-facing action: **stop and ask the user before any `npm publish`**; never publish autonomously.
- Commit after every task with a conventional-commit message, body ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `bin/launch.mjs` | `makeToken`, `parseArgs`, `isPortFree`, `pickPort`, `probeHealth`, `waitForHealth`, `openBrowser`, `serverEntry`, `HELP`, `launch()` (Task 1) |
| `test/unit/launch.test.ts` | unit tests for every helper and for `launch()` with fakes (Task 1) |
| `bin/shelfware.mjs` | CLI entry: `launch({ importServer })` (Task 2) |
| `scripts/pack-verify.mjs` | pack → temp dir → `npx` → health → exit code (Task 2) |
| `README.md` | usage, security model, quarantine compatibility, credits (Task 2) |
| `docs/placeholder-publish.md` | the placeholder `0.0.1` recipe, executed only on the user's say-so (Task 3) |

---

### Task 1: Launcher helpers

**Files:**
- Create: `bin/launch.mjs`
- Test: `test/unit/launch.test.ts`

**Interfaces:**
- Produces: `makeToken(): string`; `parseArgs(argv: string[], env: Record<string, string | undefined>): { help: boolean; port: number | null; open: boolean }`; `isPortFree(port, host?): Promise<boolean>`; `pickPort(start = 3781, { attempts = 20, host = '127.0.0.1' }?): Promise<number>`; `probeHealth(port, host?): Promise<boolean>`; `waitForHealth(port, { timeoutMs = 10_000, intervalMs = 100, host?, probe? }?): Promise<boolean>`; `openBrowser(url, { platform?, spawn? }?): { cmd: string; args: string[] }`; `serverEntry(binDir?): string`; `HELP: string`; `launch({ argv?, env?, importServer, log?, exit?, entry? }): Promise<{ port: number; url: string } | null>`.

- [ ] **Step 1: Write the failing test**

`test/unit/launch.test.ts`:

```ts
import http from 'node:http'
import net from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HELP,
  isPortFree,
  launch,
  makeToken,
  openBrowser,
  parseArgs,
  pickPort,
  probeHealth,
  serverEntry,
  waitForHealth,
} from '../../bin/launch.mjs'

const servers: { close(): void }[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
})

function listen(handler?: http.RequestListener): Promise<{ port: number, server: http.Server }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler ?? ((_req, res) => res.end('x')))
    servers.push(server)
    server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as net.AddressInfo).port, server }))
  })
}

function healthServer(): Promise<{ port: number, server: http.Server }> {
  return listen((req, res) => {
    if (req.url === '/api/health' && req.headers.host === `127.0.0.1:${(res.socket?.localPort)}`) {
      res.setHeader('content-type', 'application/json')
      res.end('{"ok":true}')
      return
    }
    res.statusCode = 403
    res.end('{"error":"Host not allowed"}')
  })
}

describe('makeToken', () => {
  it('is sw_ plus 64 hex chars and differs between calls', () => {
    expect(makeToken()).toMatch(/^sw_[0-9a-f]{64}$/)
    expect(makeToken()).not.toBe(makeToken())
  })
})

describe('parseArgs', () => {
  it('reads --port, --port=, PORT, --no-open and SHELFWARE_NO_OPEN', () => {
    expect(parseArgs([], {})).toEqual({ help: false, port: null, open: true })
    expect(parseArgs(['--port', '4000'], {})).toEqual({ help: false, port: 4000, open: true })
    expect(parseArgs(['--port=4001'], {})).toEqual({ help: false, port: 4001, open: true })
    expect(parseArgs([], { PORT: '4002' })).toEqual({ help: false, port: 4002, open: true })
    expect(parseArgs(['--port', '4003'], { PORT: '4002' }).port).toBe(4003)
    expect(parseArgs(['--no-open'], {}).open).toBe(false)
    expect(parseArgs([], { SHELFWARE_NO_OPEN: '1' }).open).toBe(false)
    expect(parseArgs(['--help'], {}).help).toBe(true)
  })

  it('rejects a bad port', () => {
    expect(() => parseArgs(['--port', 'abc'], {})).toThrow(/Invalid port/)
    expect(() => parseArgs([], { PORT: '70000' })).toThrow(/Invalid port/)
  })
})

describe('ports', () => {
  it('pickPort skips an occupied port', async () => {
    const { port } = await listen()
    expect(await isPortFree(port)).toBe(false)
    const picked = await pickPort(port, { attempts: 5 })
    expect(picked).toBeGreaterThan(port)
    expect(picked).toBeLessThan(port + 5)
    expect(await isPortFree(picked)).toBe(true)
  })

  it('pickPort gives up after the attempts', async () => {
    const { port } = await listen()
    await expect(pickPort(port, { attempts: 1 })).rejects.toThrow(/No free port/)
  })
})

describe('health', () => {
  it('probeHealth accepts {"ok":true} with the loopback Host and nothing else', async () => {
    const { port } = await healthServer()
    expect(await probeHealth(port)).toBe(true)
    const { port: other } = await listen((_req, res) => {
      res.statusCode = 200
      res.end('nope')
    })
    expect(await probeHealth(other)).toBe(false)
    const { port: closed } = await listen()
    servers.pop()!.close()
    expect(await probeHealth(closed)).toBe(false)
  })

  it('waitForHealth polls until the probe says yes or the deadline passes', async () => {
    const probe = vi.fn<[number, string], Promise<boolean>>().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true)
    expect(await waitForHealth(1, { probe, intervalMs: 1, timeoutMs: 1000 })).toBe(true)
    expect(probe).toHaveBeenCalledTimes(3)
    const never = vi.fn().mockResolvedValue(false)
    expect(await waitForHealth(1, { probe: never, intervalMs: 1, timeoutMs: 20 })).toBe(false)
  })
})

describe('openBrowser', () => {
  it('picks the platform opener and detaches', () => {
    const spawn = vi.fn(() => ({ unref: vi.fn() }))
    expect(openBrowser('http://127.0.0.1:1', { platform: 'darwin', spawn })).toEqual({ cmd: 'open', args: ['http://127.0.0.1:1'] })
    expect(openBrowser('http://127.0.0.1:1', { platform: 'linux', spawn })).toEqual({ cmd: 'xdg-open', args: ['http://127.0.0.1:1'] })
    expect(openBrowser('http://127.0.0.1:1', { platform: 'win32', spawn })).toEqual({ cmd: 'cmd', args: ['/c', 'start', '', 'http://127.0.0.1:1'] })
    expect(spawn).toHaveBeenCalledTimes(3)
    expect(spawn.mock.calls[0]![2]).toMatchObject({ stdio: 'ignore', detached: true })
  })
})

describe('launch', () => {
  it('sets the env, imports the server, waits for health, logs the url and opens the browser', async () => {
    const env: Record<string, string | undefined> = {}
    const log = vi.fn()
    const exit = vi.fn()
    const spawn = vi.fn(() => ({ unref: vi.fn() }))
    let started: http.Server | null = null
    const importServer = vi.fn(async () => {
      const port = Number(env.NITRO_PORT)
      started = http.createServer((req, res) => {
        if (req.url === '/api/health' && req.headers.host === `127.0.0.1:${port}`) {
          res.end('{"ok":true}')
        } else {
          res.statusCode = 403
          res.end()
        }
      })
      servers.push(started)
      await new Promise<void>(resolve => started!.listen(port, env.NITRO_HOST, () => resolve()))
    })
    const result = await launch({ argv: ['--port', String(await pickPort(4100))], env, importServer, log, exit, entry: __filename, spawn })
    expect(result).not.toBeNull()
    expect(env.NUXT_PUBLIC_SHELFWARE_TOKEN).toMatch(/^sw_[0-9a-f]{64}$/)
    expect(env.NITRO_HOST).toBe('127.0.0.1')
    expect(env.NITRO_PORT).toBe(String(result!.port))
    expect(env.NODE_ENV).toBe('production')
    expect(importServer).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(`shelfware at http://127.0.0.1:${result!.port}`)
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(exit).not.toHaveBeenCalled()
  })

  it('refuses to start without a built server and prints help on --help', async () => {
    const log = vi.fn()
    const exit = vi.fn()
    const importServer = vi.fn()
    expect(await launch({ argv: [], env: {}, importServer, log, exit, entry: '/definitely/missing/index.mjs' })).toBeNull()
    expect(exit).toHaveBeenCalledWith(1)
    expect(importServer).not.toHaveBeenCalled()
    expect(log.mock.calls[0]![0]).toContain('/definitely/missing/index.mjs')

    expect(await launch({ argv: ['--help'], env: {}, importServer, log })).toBeNull()
    expect(log).toHaveBeenCalledWith(HELP)
  })

  it('serverEntry points at .output/server/index.mjs beside bin/', () => {
    expect(serverEntry('/x/bin')).toBe('/x/.output/server/index.mjs')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- launch`
Expected: FAIL, `../../bin/launch.mjs` not found.

- [ ] **Step 3: Write the launcher**

`bin/launch.mjs`:

```js
// Pure launcher helpers for `npx shelfware`. Node built-ins only (spec §13.1).
import { spawn as spawnProcess } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_PORT = 3781
export const PORT_ATTEMPTS = 20
export const HOST = '127.0.0.1'

export const HELP = `shelfware — a local catalog of the AI-agent skills on this machine

Usage: shelfware [--port <n>] [--no-open]

  --port <n>   bind 127.0.0.1:<n> instead of the first free port from ${DEFAULT_PORT}
  --no-open    do not open the browser (also SHELFWARE_NO_OPEN=1)
  PORT=<n>     same as --port
`

/** Spec §10.3: `sw_` + 32 random bytes as hex. The letter prefix keeps destr from casting it. */
export function makeToken() {
  return `sw_${crypto.randomBytes(32).toString('hex')}`
}

export function parseArgs(argv = [], env = {}) {
  let port = null
  let open = env.SHELFWARE_NO_OPEN !== '1'
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--no-open') {
      open = false
    } else if (arg === '--port') {
      port = Number(argv[i + 1])
      i += 1
    } else if (arg.startsWith('--port=')) {
      port = Number(arg.slice('--port='.length))
    } else if (arg === '--help' || arg === '-h') {
      return { help: true, port: null, open }
    }
  }
  if (port === null && env.PORT) port = Number(env.PORT)
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error(`Invalid port: ${port}`)
  }
  return { help: false, port, open }
}

export function isPortFree(port, host = HOST) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ port, host }, () => server.close(() => resolve(true)))
  })
}

export async function pickPort(start = DEFAULT_PORT, { attempts = PORT_ATTEMPTS, host = HOST } = {}) {
  for (let port = start; port < start + attempts; port += 1) {
    if (await isPortFree(port, host)) return port
  }
  throw new Error(`No free port between ${start} and ${start + attempts - 1} on ${host}`)
}

/** GET /api/health with the loopback Host the server insists on (spec §10.1). */
export function probeHealth(port, host = HOST) {
  return new Promise((resolve) => {
    const req = http.get(
      { host, port, path: '/api/health', headers: { Host: `${host}:${port}` }, timeout: 1000 },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => resolve(res.statusCode === 200 && body.includes('"ok":true')))
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

export async function waitForHealth(port, { timeoutMs = 10_000, intervalMs = 100, host = HOST, probe = probeHealth } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probe(port, host)) return true
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  return false
}

export function openBrowser(url, { platform = process.platform, spawn = spawnProcess } = {}) {
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
  child.unref?.()
  return { cmd, args }
}

export function serverEntry(binDir = path.dirname(fileURLToPath(import.meta.url))) {
  return path.resolve(binDir, '..', '.output', 'server', 'index.mjs')
}

/**
 * Orchestration with injectable I/O so it can be unit-tested end to end:
 * flags → port → env → import the prebuilt server → wait for health → open.
 */
export async function launch({
  argv = process.argv.slice(2),
  env = process.env,
  importServer,
  log = console.log,
  exit = process.exit,
  entry = serverEntry(),
  spawn = spawnProcess,
} = {}) {
  const args = parseArgs(argv, env)
  if (args.help) {
    log(HELP)
    return null
  }
  if (!fs.existsSync(entry)) {
    log(`shelfware: missing ${entry}. This copy was not built; install the published package or run \`pnpm build\`.`)
    exit(1)
    return null
  }
  const port = args.port ?? await pickPort(DEFAULT_PORT)
  env.NUXT_PUBLIC_SHELFWARE_TOKEN = makeToken()
  env.NITRO_HOST = HOST
  env.NITRO_PORT = String(port)
  env.NODE_ENV = 'production'
  await importServer()
  if (!(await waitForHealth(port))) {
    log(`shelfware: the server did not answer on http://${HOST}:${port} within 10 s`)
    exit(1)
    return null
  }
  const url = `http://${HOST}:${port}`
  log(`shelfware at ${url}`)
  if (args.open) openBrowser(url, { spawn })
  return { port, url }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- launch`
Expected: PASS, 11 tests. The `launch` test binds a real port from 4100 upward; if the machine has all of 4100–4119 busy, raise the start.

- [ ] **Step 5: Commit**

```bash
git add bin/launch.mjs test/unit/launch.test.ts
git commit -m "feat(bin): add launcher helpers (port, token, health, browser)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: CLI entry, tarball verification, README

**Files:**
- Create: `bin/shelfware.mjs`, `scripts/pack-verify.mjs`, `README.md`
- Verify: `package.json` already carries `bin`, `files`, `pack:verify`, `prepublishOnly` from the server plan's Task 1

**Interfaces:**
- Consumes: `launch`, `pickPort`, `waitForHealth` (Task 1); the built `.output/`.
- Produces: `npx shelfware` (and `node bin/shelfware.mjs`) starting the app; `pnpm pack:verify` exiting 0 only when a clean `npx` of the tarball answers health.

- [ ] **Step 1: Write the entry**

`bin/shelfware.mjs`:

```js
#!/usr/bin/env node
import { launch } from './launch.mjs'

await launch({
  importServer: () => import('../.output/server/index.mjs'),
})
```

Run: `chmod +x bin/shelfware.mjs`

- [ ] **Step 2: Write the tarball check**

`scripts/pack-verify.mjs`:

```js
// Spec §13.2: v0.1 is done only when a clean `npx` of the packed tarball answers health.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickPort, waitForHealth } from '../bin/launch.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const tarball = path.join(root, `shelfware-${pkg.version}.tgz`)
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'shelfware-pack-'))
let child = null
let code = 1

try {
  if (!fs.existsSync(path.join(root, '.output', 'server', 'index.mjs'))) {
    throw new Error('run `pnpm build` first; .output/server/index.mjs is missing')
  }
  execFileSync('pnpm', ['pack'], { cwd: root, stdio: 'inherit' })
  if (!fs.existsSync(tarball)) throw new Error(`pnpm pack did not produce ${tarball}`)
  const copy = path.join(work, path.basename(tarball))
  fs.copyFileSync(tarball, copy)

  const port = await pickPort(3790)
  child = spawn('npx', ['--yes', copy, '--no-open', '--port', String(port)], {
    cwd: work,
    stdio: 'inherit',
    detached: true,
    env: { ...process.env, npm_config_yes: 'true' },
  })
  const healthy = await waitForHealth(port, { timeoutMs: 90_000, intervalMs: 250 })
  if (!healthy) throw new Error(`no healthy answer on 127.0.0.1:${port} within 90 s`)
  console.log(`pack-verify: shelfware ${pkg.version} answered on 127.0.0.1:${port} from a clean npx install`)
  code = 0
} catch (err) {
  console.error(`pack-verify: ${err.message}`)
} finally {
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
  fs.rmSync(work, { recursive: true, force: true })
  fs.rmSync(tarball, { force: true })
}

process.exit(code)
```

- [ ] **Step 3: Write the README**

`README.md`:

````markdown
# shelfware

shelfware finds the shelfware in your skill drawers.

A local catalog of the AI-agent skills installed on this machine: `~/.claude/skills`, `~/.cursor/skills`, `~/.codex/skills`, `~/.agents/skills`, Cursor plugins, Gemini Antigravity, Hermes profiles, and friends. It scans, lists, searches, renders, **edits**, audits, quarantines, restores, and permanently deletes skills, from a browser tab that only your machine can reach.

## Run it

```bash
npx shelfware
```

Options: `--port <n>` (or `PORT`), `--no-open` (or `SHELFWARE_NO_OPEN=1`). The server binds `127.0.0.1` on the first free port from 3781 and opens your browser.

Node 20 or newer. No build step: the package ships the prebuilt app.

## What you get

- **Drawers**: one per install scope, with counts; a house census (physical cards, copies and wasted bytes, references, broken links, a rough token total).
- **Cards**: kind, form (file / link / broken), origin with its certainty, copies, static audit risk, invocation mode, `~tokens`.
- **Reader**: rendered manuscript, raw source, file folio with text previews, and a raw editor for `SKILL.md` with an optimistic save (409 when the file changed on disk).
- **Quarantine**: cards move to `~/.skill-cabinet/quarantine/` and can be restored to the exact path they came from. Permanent delete only from the quarantine shelf. The manifest format is the one skill-cabinet uses, so both tools can read each other's trash.
- **Keyboard**: `/` find, `j`/`k` move, `x` mark, `q` quarantine, `r` restore, `d` delete, `e` edit, `⌘S` save.

## Security model

- Every request must carry a loopback `Host` (`127.0.0.1`, `localhost`, `[::1]`) on the bound port; anything else is refused. This closes DNS-rebinding reads.
- Every mutation must carry a loopback `Origin` and a per-run session token that only the served page knows.
- No CORS headers, ever. File reads and saves are contained to the skill's directory; symlinks are never followed for destructive actions.
- Nothing leaves the machine. There is no network feature.

## Credits

Scanner rules, audit heuristics and the quarantine format are ported from [skill-cabinet](https://github.com/subsy/skill-cabinet) (MIT), whose audit rules were adapted from [Adaptive Skills](https://github.com/wangsoft/Adaptive-Skills) (MIT). shelfware is a rebuild in Nuxt 4 with an editor and a hardened local security model.

## Development

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm test           # unit + nuxt + e2e
pnpm build
pnpm pack:verify    # packs and runs the tarball through npx
```

MIT.
````

- [ ] **Step 4: Build, run the entry, run the tarball check**

Run: `pnpm build && node bin/shelfware.mjs --no-open`
Expected: prints `shelfware at http://127.0.0.1:3781` (or the next free port); `curl -sS http://127.0.0.1:3781/api/health` prints `{"ok":true}`; `curl -sS -H 'Host: evil.com' http://127.0.0.1:3781/api/health` prints `{"error":"Host not allowed"}`. Stop it with Ctrl-C.

Run: `pnpm pack:verify`
Expected: ends with `pack-verify: shelfware 0.1.0 answered on 127.0.0.1:<port> from a clean npx install` and exit 0. If it fails with "missing .output", the `files` whitelist did not include `.output`: check `package.json`. If `npx` cannot find the bin, check that `bin/shelfware.mjs` is executable and that `package.json#bin` points at it.

Run: `pnpm test:unit` → still green.

- [ ] **Step 5: Commit**

```bash
git add bin/shelfware.mjs scripts/pack-verify.mjs README.md
git commit -m "feat(bin): npx entry, tarball verification and README

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Placeholder publish recipe (user-gated)

**Files:**
- Create: `docs/placeholder-publish.md`

**Interfaces:**
- Produces: a written recipe; **no publish happens in this task unless the user explicitly says so**.

- [ ] **Step 1: Write the recipe**

`docs/placeholder-publish.md`:

````markdown
# Registering the npm name

Spec §13.2 asks for `shelfware@0.0.1` as a placeholder before any public commits, so the name is ours. Publishing is done by a person, from a terminal logged into npm, never by an agent.

## Placeholder package

In a scratch directory (not this repo):

```bash
mkdir shelfware-placeholder && cd shelfware-placeholder
cat > package.json <<'EOF'
{
  "name": "shelfware",
  "version": "0.0.1",
  "description": "shelfware finds the shelfware in your skill drawers. Coming soon.",
  "type": "module",
  "bin": { "shelfware": "bin/shelfware.mjs" },
  "files": ["bin"],
  "engines": { "node": ">=20" },
  "license": "MIT"
}
EOF
mkdir bin
cat > bin/shelfware.mjs <<'EOF'
#!/usr/bin/env node
console.log('shelfware: coming soon. Watch https://www.npmjs.com/package/shelfware')
EOF
chmod +x bin/shelfware.mjs
npm publish --access public
```

## Real release

From this repo, once `pnpm pack:verify` passes:

```bash
pnpm build && pnpm test && pnpm pack:verify
npm publish --access public
```

`prepublishOnly` reruns build and tests; `files` ships `bin/` and `.output/` only.
````

- [ ] **Step 2: Ask the user**

Tell the user the recipe is ready and ask whether they want to publish the placeholder now. Do not run `npm publish` yourself.

- [ ] **Step 3: Commit**

```bash
git add docs/placeholder-publish.md
git commit -m "docs: add the placeholder publish recipe

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Spec coverage (distribution plan)

| Spec section | Task(s) |
|---|---|
| §13.1 flags, `pickPort`, `makeToken`, env, server import, `waitForHealth`, console line, browser | 1, 2 |
| §13.2 `package.json` (`bin`, `files`, scripts), `pack-verify`, placeholder publish | 2, 3 (fields from the server plan's Task 1) |
| §12.2 `launch` unit tests (`pickPort` skips occupied ports, `makeToken` format and uniqueness) | 1 |
| §10.3 token minted per run, before the server starts | 1 |
| §1 "Zero-build npx" goal | 2 |
