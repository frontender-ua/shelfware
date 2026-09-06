// Spec §13.2: v0.1 is done only when a clean `npx` of the packed tarball answers health.
// POSIX-only (spec §15 defers Windows): the script spawns `npx` without a shell and
// tears the child down with `process.kill(-pid)`, i.e. by POSIX process group.
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
let cleaned = false

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

/** Kill the npx process group and remove both artefacts. Idempotent: `finally` and a signal may both call it. */
function cleanup() {
  if (cleaned) return
  cleaned = true
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      try {
        child.kill('SIGTERM')
      } catch {
        // the child is already gone
      }
    }
    // Release the handle instead of exiting hard, so piped stdout is flushed in full.
    child.unref()
  }
  // Each removal gets its own try/catch: a throw on the temp dir must not skip the tarball.
  try {
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 3 })
  } catch (err) {
    console.error(`pack-verify: could not remove ${work}: ${err.message}`)
  }
  try {
    fs.rmSync(tarball, { force: true, maxRetries: 3 })
  } catch (err) {
    console.error(`pack-verify: could not remove ${tarball}: ${err.message}`)
  }
}

// A terminal SIGINT reaches only this script (the child sits in its own process group),
// so without these the server, the temp dir and the .tgz would all survive a Ctrl-C.
process.once('SIGINT', () => {
  cleanup()
  process.exit(130)
})
process.once('SIGTERM', () => {
  cleanup()
  process.exit(143)
})

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
  // spawn reports failure asynchronously; an unhandled 'error' would escape the try
  // block and skip cleanup, so race it against the wait and fail the run properly.
  const spawnFailed = new Promise((_, reject) => {
    child.once('error', err => reject(new Error(`npx could not be spawned: ${err.message}`)))
  })
  const healthy = await Promise.race([
    waitForHealth(port, { timeoutMs: 90_000, intervalMs: 250 }),
    spawnFailed,
  ])
  if (!healthy) throw new Error(`no healthy answer on 127.0.0.1:${port} within 90 s`)
  console.log(`pack-verify: shelfware ${pkg.version} answered on 127.0.0.1:${port} from a clean npx install`)
  code = 0
} catch (err) {
  console.error(`pack-verify: ${err.message}`)
} finally {
  cleanup()
}

process.exitCode = code
