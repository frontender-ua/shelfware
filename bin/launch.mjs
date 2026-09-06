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

/** Spec §10.3: the env var the server reads the session token from. */
export const TOKEN_ENV = 'NUXT_PUBLIC_SHELFWARE_TOKEN'

export const HELP = `shelfware — a local catalog of the AI-agent skills on this machine

Usage: shelfware [--port <n>] [--no-open] [--help]

  --port <n>   bind 127.0.0.1:<n> instead of the first free port from ${DEFAULT_PORT}
  --no-open    do not open the browser (also SHELFWARE_NO_OPEN=1)
  --help, -h   print this help and exit
  PORT=<n>     same as --port
`

/** Spec §10.3: `sw_` + 32 random bytes as hex. The letter prefix keeps destr from casting it. */
export function makeToken() {
  return `sw_${crypto.randomBytes(32).toString('hex')}`
}

/**
 * The raw text stays in the message so `--port abc` reads back as "abc", not NaN.
 * Decimal digits without a leading zero: `Number()` would otherwise accept `0x10`,
 * `1e3`, `' 4000 '` and `065535`, none of which the help text (`--port <n>`) promises.
 */
function parsePort(raw) {
  if (!/^[1-9]\d*$/.test(raw)) throw new Error(`Invalid port: ${JSON.stringify(raw)}`)
  const port = Number(raw)
  if (port > 65535) throw new Error(`Invalid port: ${JSON.stringify(raw)}`)
  return port
}

export function parseArgs(argv = [], env = {}) {
  let port = null
  let open = env.SHELFWARE_NO_OPEN !== '1'
  let optionsEnded = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (optionsEnded || !arg.startsWith('-')) {
      throw new Error(`Unexpected argument: ${arg}`)
    } else if (arg === '--') {
      optionsEnded = true
    } else if (arg === '--no-open') {
      open = false
    } else if (arg === '--port') {
      if (i + 1 >= argv.length) throw new Error('--port needs a value')
      port = parsePort(argv[i + 1])
      i += 1
    } else if (arg.startsWith('--port=')) {
      port = parsePort(arg.slice('--port='.length))
    } else if (arg === '--help' || arg === '-h') {
      return { help: true, port: null, open }
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  // Unset or empty means unset; anything else must be a real port.
  if (port === null && env.PORT !== undefined && env.PORT !== '') port = parsePort(env.PORT)
  return { help: false, port, open }
}

/** Why `port` cannot be bound, in words a user can act on. */
export function portReason(code) {
  if (code === 'EADDRINUSE') return 'is already in use'
  if (code === 'EACCES') return 'needs elevated privileges (EACCES)'
  return `cannot be bound (${code})`
}

/** Resolves null when `port` can be bound on `host`, otherwise the reason (see `portReason`). */
export function checkPort(port, host = HOST) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', err => resolve(portReason(err.code ?? 'UNKNOWN')))
    server.listen({ port, host }, () => server.close(() => resolve(null)))
  })
}

export async function isPortFree(port, host = HOST) {
  return (await checkPort(port, host)) === null
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

export async function waitForHealth(port, { timeoutMs = 10_000, intervalMs = 100, host = HOST, probe = probeHealth, signal } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && !signal?.aborted) {
    if (await probe(port, host)) return true
    await sleep(intervalMs, signal)
  }
  return false
}

/** Resolves after `ms`, or as soon as `signal` aborts — and then leaves no timer behind. */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function openBrowser(url, { platform = process.platform, spawn = spawnProcess, env = process.env } = {}) {
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url]
  // The opener execs the browser; strip the session token so it never sits in the
  // browser's environment (the served page is the only place it belongs).
  const { [TOKEN_ENV]: _token, ...childEnv } = env
  // A missing browser opener (e.g. no xdg-open on a headless box) must never take
  // the running server down with it: spawn can throw synchronously (rare) or emit
  // an async 'error' (the common ENOENT case), and an unhandled 'error' on an
  // EventEmitter is fatal. Swallow both.
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true, env: childEnv })
    child.on?.('error', () => {})
    child.unref?.()
  } catch {
    // ignore: failing to open a browser is not a launch failure
  }
  return { cmd, args }
}

export function serverEntry(binDir = path.dirname(fileURLToPath(import.meta.url))) {
  return path.resolve(binDir, '..', '.output', 'server', 'index.mjs')
}

/** One line for the user whatever was thrown: Error, string, or nothing at all. */
export function describeError(err) {
  return err instanceof Error ? err.message : String(err)
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
  let args
  try {
    args = parseArgs(argv, env)
  } catch (err) {
    log(`shelfware: ${describeError(err)}`)
    log(HELP)
    exit(1)
    return null
  }
  if (args.help) {
    log(HELP)
    return null
  }
  if (!fs.existsSync(entry)) {
    log(`shelfware: missing ${entry}. This copy was not built; install the published package or run \`pnpm build\`.`)
    exit(1)
    return null
  }
  if (args.port !== null) {
    const problem = await checkPort(args.port)
    if (problem) {
      log(`shelfware: port ${args.port} ${problem} on ${HOST}; pick another (--port or PORT)`)
      exit(1)
      return null
    }
  }
  // Both of these can fail for reasons the user can act on — every port in the
  // range is taken, or the server throws at import (a Nitro crash, or an
  // EADDRINUSE from losing the race for the auto-picked port). One line, exit 1,
  // never a stack trace.
  let port
  try {
    port = args.port ?? await pickPort(DEFAULT_PORT)
    env[TOKEN_ENV] = makeToken()
    env.NITRO_HOST = HOST
    env.NITRO_PORT = String(port)
    env.NODE_ENV = 'production'
    await importServer()
  } catch (err) {
    log(`shelfware: ${describeError(err)}`)
    exit(1)
    return null
  }
  if (!(await waitForHealth(port))) {
    log(`shelfware: the server did not answer on http://${HOST}:${port} within 10 s`)
    exit(1)
    return null
  }
  const url = `http://${HOST}:${port}`
  log(`shelfware at ${url}`)
  if (args.open) openBrowser(url, { spawn, env })
  return { port, url }
}
