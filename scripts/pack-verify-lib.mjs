// Pure helpers behind scripts/pack-verify.mjs, split out so they can be unit-tested
// without running the script's top-level pack → npx flow. Node built-ins only.
import fs from 'node:fs'
import path from 'node:path'

/** `tar -tzf` output → entries without a `./` prefix, trailing slash or blank lines. */
export function parseTarListing(text) {
  return text
    .split('\n')
    .map(line => line.trim().replace(/^\.\//, '').replace(/\/$/, ''))
    .filter(Boolean)
}

/** The required entries the tarball lacks. */
export function missingEntries(entries, required) {
  const have = new Set(entries)
  return required.filter(entry => !have.has(entry))
}

/** Entries under a top-level `package/node_modules`: a packed dependency tree, which must never ship. */
export function topLevelNodeModules(entries) {
  return entries.filter(entry => entry.startsWith('package/node_modules'))
}

/**
 * Icons must ship as inline SVG bodies in the client bundle, never be fetched at runtime.
 * Today only bundled icons put `<path ` into client JS (nothing under app/ contains an
 * inline SVG), so its presence is the proof. Returns a reason on failure, null on success.
 */
export function checkBundledIconBodies(publicDir) {
  if (!fs.existsSync(publicDir)) return `${publicDir} does not exist`
  const chunks = fs.readdirSync(publicDir).filter(name => name.endsWith('.js'))
  if (chunks.length === 0) return `${publicDir} has no .js chunks`
  const found = chunks.some(name => fs.readFileSync(path.join(publicDir, name), 'utf8').includes('<path '))
  return found ? null : `none of ${chunks.length} client chunks in ${publicDir} carries an inline icon body`
}

/**
 * npm (>= 10) redacts anything UUID-shaped in its output as `***`, including the
 * Nuxt build-meta filename under .output/public/_nuxt/builds/meta/. Mask both sides
 * so the comparison is about which files ship, not about npm's redaction.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
function maskUuids(p) {
  return p.replace(UUID, '***')
}

/**
 * `npm publish` and `pnpm pack` build their file lists independently. Compare npm's
 * dry-run paths (relative to the package root) with the tarball entries (`package/…`).
 */
export function packlistDiff(npmPaths, tarEntries) {
  const tar = new Set(tarEntries.map(entry => maskUuids(entry.replace(/^package\//, ''))))
  const npm = new Set(npmPaths.map(maskUuids))
  return {
    onlyInNpm: [...npm].filter(p => !tar.has(p)).sort(),
    onlyInTar: [...tar].filter(p => !npm.has(p)).sort(),
  }
}

/** Newest mtime in ms under the given files and directories (recursive). Missing paths count as 0. */
export function newestMtime(paths) {
  let newest = 0
  const visit = (p) => {
    let stat
    try {
      stat = fs.statSync(p)
    } catch {
      return
    }
    newest = Math.max(newest, stat.mtimeMs)
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(p)) visit(path.join(p, name))
    }
  }
  for (const p of paths) visit(p)
  return newest
}
