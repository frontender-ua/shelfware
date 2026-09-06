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

/** `tar -tzf` entries, normalised: no `./` prefix, no trailing slash, no blanks. */
function listTarball(file) {
  return execFileSync('tar', ['-tzf', file], { encoding: 'utf8' })
    .split('\n')
    .map(line => line.trim().replace(/^\.\//, '').replace(/\/$/, ''))
    .filter(Boolean)
}

/** Icons must ship as inline SVG bodies in the client bundle, not be fetched at runtime. */
function hasBundledIconBodies(publicDir) {
  if (!fs.existsSync(publicDir)) return false
  return fs
    .readdirSync(publicDir)
    .filter(name => name.endsWith('.js'))
    .some(name => fs.readFileSync(path.join(publicDir, name), 'utf8').includes('<path '))
}

try {
  if (!fs.existsSync(path.join(root, '.output', 'server', 'index.mjs'))) {
    throw new Error('run `pnpm build` first; .output/server/index.mjs is missing')
  }
  execFileSync('pnpm', ['pack'], { cwd: root, stdio: 'inherit' })
  if (!fs.existsSync(tarball)) throw new Error(`pnpm pack did not produce ${tarball}`)
  const copyName = path.basename(tarball)
  const copy = path.join(work, copyName)
  fs.copyFileSync(tarball, copy)

  const entries = listTarball(copy)
  for (const required of ['package/.output/server/index.mjs', 'package/bin/shelfware.mjs']) {
    if (!entries.includes(required)) throw new Error(`the tarball is missing ${required}`)
  }
  const bundled = entries.filter(entry => entry.startsWith('package/node_modules'))
  if (bundled.length > 0) {
    throw new Error(`the tarball carries node_modules (${bundled.length} entries, e.g. ${bundled[0]})`)
  }

  execFileSync('tar', ['-xzf', copy], { cwd: work, stdio: 'inherit' })
  if (!hasBundledIconBodies(path.join(work, 'package', '.output', 'public', '_nuxt'))) {
    throw new Error('no client chunk carries inline icon bodies; icons would be fetched from the network')
  }

  const port = await pickPort(3790)
  // npx (npm 11) reads an absolute path argument as the command to execute, but a
  // relative `./x.tgz` as a package spec whose single bin it then runs. The child's
  // cwd is `work`, where the copy lives, so pass it relative.
  child = spawn('npx', ['--yes', `./${copyName}`, '--no-open', '--port', String(port)], {
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
