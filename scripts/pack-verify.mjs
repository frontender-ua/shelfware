// Spec §13.2: v0.1 is done only when a clean `npx` of the packed tarball answers health.
// POSIX-only (spec §15 defers Windows): the script spawns `npx` without a shell and
// tears the child down with `process.kill(-pid)`, i.e. by POSIX process group.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickPort, waitForHealth } from '../bin/launch.mjs'
import {
  checkBundledIconBodies,
  missingEntries,
  newestMtime,
  npmPackFiles,
  packlistDiff,
  parseNpmPackJson,
  parseTarListing,
  topLevelNodeModules,
} from './pack-verify-lib.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const tarball = path.join(root, `shelfware-${pkg.version}.tgz`)
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'shelfware-pack-'))
let child = null
let code = 1
let cleaned = false

/**
 * Synchronous stderr: survives a `process.exit` right after it, unlike console.error on a pipe.
 * It is also called from `cleanup()`, where a throw (EPIPE/EBADF on a closed stderr) would skip
 * the rest of the teardown — so a failure to report is swallowed rather than propagated.
 */
function warn(message) {
  try {
    fs.writeSync(2, `pack-verify: ${message}\n`)
  } catch {
    // stderr is gone; nothing left to tell
  }
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
    // stdio is inherited, so there are no pipes to drain; the detached child handle
    // would keep this process's event loop alive after cleanup, so release it.
    child.unref()
  }
  // Each removal gets its own try/catch: a throw on the temp dir must not skip the tarball.
  try {
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 3 })
  } catch (err) {
    warn(`could not remove ${work}: ${err.message}`)
  }
  try {
    fs.rmSync(tarball, { force: true, maxRetries: 3 })
  } catch (err) {
    warn(`could not remove ${tarball}: ${err.message}`)
  }
}

// A terminal SIGINT reaches only this script (the child sits in its own process group),
// so without these the server, the temp dir and the .tgz would all survive a Ctrl-C, a
// `kill`, or a closed terminal (SIGHUP).
process.once('SIGINT', () => {
  cleanup()
  process.exit(130)
})
process.once('SIGTERM', () => {
  cleanup()
  process.exit(143)
})
process.once('SIGHUP', () => {
  cleanup()
  process.exit(129)
})

try {
  const entry = path.join(root, '.output', 'server', 'index.mjs')
  if (!fs.existsSync(entry)) throw new Error('run `pnpm build` first; .output/server/index.mjs is missing')
  // A build older than the sources would prove nothing about what `npm publish` ships.
  const built = newestMtime([path.join(root, '.output', 'nitro.json')])
  const sources = newestMtime(['app', 'server', 'shared', 'nuxt.config.ts', 'package.json', 'pnpm-lock.yaml'].map(p => path.join(root, p)))
  if (sources > built) throw new Error('.output is older than the sources; run `pnpm build` first')

  execFileSync('pnpm', ['pack'], { cwd: root, stdio: 'inherit' })
  if (!fs.existsSync(tarball)) throw new Error(`pnpm pack did not produce ${tarball}`)
  const copyName = path.basename(tarball)
  const copy = path.join(work, copyName)
  fs.copyFileSync(tarball, copy)

  // tar's own stderr stays visible so a corrupt archive or a missing tar explains itself.
  const entries = parseTarListing(execFileSync('tar', ['-tzf', copy], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
  const missing = missingEntries(entries, ['package/.output/server/index.mjs', 'package/bin/shelfware.mjs', 'package/LICENSE', 'package/README.md'])
  if (missing.length > 0) throw new Error(`the tarball is missing ${missing.join(', ')}`)
  const bundled = topLevelNodeModules(entries)
  if (bundled.length > 0) throw new Error(`the tarball carries node_modules (${bundled.length} entries, e.g. ${bundled[0]})`)

  // The gate packs with pnpm; the release publishes with npm. Their packlists must agree.
  const npmDryRun = parseNpmPackJson(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }))
  const diff = packlistDiff(npmPackFiles(npmDryRun, pkg.name), entries)
  if (diff.onlyInNpm.length > 0 || diff.onlyInTar.length > 0) {
    throw new Error(`npm and pnpm packlists differ — only npm: ${diff.onlyInNpm.join(', ') || '-'}; only pnpm: ${diff.onlyInTar.join(', ') || '-'}`)
  }

  execFileSync('tar', ['-xzf', copy], { cwd: work, stdio: 'inherit' })
  const iconProblem = checkBundledIconBodies(path.join(work, 'package', '.output', 'public', '_nuxt'))
  if (iconProblem) throw new Error(`${iconProblem}; icons would be fetched from the network`)

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
  // block and skip cleanup. Abort the health poll so the run fails at once instead of
  // idling until the 90 s deadline, and surface the failure through the normal catch.
  const abort = new AbortController()
  const spawnFailed = new Promise((_, reject) => {
    child.once('error', (err) => {
      abort.abort()
      reject(new Error(`npx could not be spawned: ${err.message}`))
    })
  })
  const healthy = await Promise.race([
    waitForHealth(port, { timeoutMs: 90_000, intervalMs: 250, signal: abort.signal }),
    spawnFailed,
  ])
  if (!healthy) throw new Error(`no healthy answer on 127.0.0.1:${port} within 90 s`)
  console.log(`pack-verify: shelfware ${pkg.version} answered on 127.0.0.1:${port} from a clean npx install`)
  code = 0
} catch (err) {
  warn(err.message)
} finally {
  cleanup()
}

process.exitCode = code
