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
