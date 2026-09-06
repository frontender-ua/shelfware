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
 * so the comparison is about which files ship, not about npm's redaction. This hides
 * UUID *names* only — it never hides a count difference: masking two distinct
 * UUID-named files still leaves two entries, one per side, for packlistDiff to count.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
function maskUuids(p) {
  return p.replace(UUID, '***')
}

/** Map of value → occurrence count, preserving insertion order of first sight. */
function counts(values) {
  const map = new Map()
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1)
  return map
}

/**
 * `npm publish` and `pnpm pack` build their file lists independently. Compare npm's
 * dry-run paths (relative to the package root) with the tarball entries (`package/…`)
 * as multisets, so a masked name that appears a different number of times on each side
 * — e.g. two UUID-named build-meta files on one side, one on the other — is caught even
 * though masking makes the names themselves identical.
 */
export function packlistDiff(npmPaths, tarEntries) {
  const tar = counts(tarEntries.map(entry => maskUuids(entry.replace(/^package\//, ''))))
  const npm = counts(npmPaths.map(maskUuids))
  const names = new Set([...npm.keys(), ...tar.keys()])
  const onlyInNpm = []
  const onlyInTar = []
  for (const name of names) {
    const n = npm.get(name) ?? 0
    const t = tar.get(name) ?? 0
    if (n > t) onlyInNpm.push(name)
    else if (t > n) onlyInTar.push(name)
  }
  return { onlyInNpm: onlyInNpm.sort(), onlyInTar: onlyInTar.sort() }
}

/**
 * Parse the stdout of `npm pack --dry-run --json`. Some npm versions (10.x) run the
 * `prepare` script even with `--ignore-scripts`, and its chatter (`[info] …`, `> …`)
 * lands on stdout ahead of the JSON. The JSON itself is pretty-printed, so it starts
 * at the first line that is exactly `[` or `{` (or a compact `[{…` / `{"…` line).
 */
export function parseNpmPackJson(stdout) {
  const lines = stdout.split('\n')
  const start = lines.findIndex(line => /^(\[|\{)\s*$/.test(line) || /^(\[\{|\{")/.test(line))
  if (start === -1) throw new Error(`no JSON in \`npm pack --json\` output: ${stdout.slice(0, 120)}`)
  return JSON.parse(lines.slice(start).join('\n'))
}

/**
 * File paths from `npm pack --dry-run --json`. npm 11 prints an array with one entry
 * per package; npm 12 prints an object keyed by package name. Anything else is an
 * npm we have not seen, so fail with the shape in the message rather than a TypeError.
 */
export function npmPackFiles(json, name) {
  const entry = Array.isArray(json) ? json[0] : json?.[name] ?? Object.values(json ?? {})[0]
  if (!Array.isArray(entry?.files)) {
    throw new Error(`unexpected \`npm pack --json\` output: ${JSON.stringify(json).slice(0, 120)}`)
  }
  return entry.files.map(file => file.path)
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
