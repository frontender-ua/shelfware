import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/upstream-quarantine', import.meta.url))

/**
 * Drops the upstream-produced quarantine (manifest + folder) into a fixture
 * home, substituting the `{{HOME}}` placeholder. Paths in the manifest are
 * absolute, as upstream writes them.
 */
export function installUpstreamFixture(home: string): { quarantinePath: string, originPath: string } {
  const dest = path.join(home, '.skill-cabinet', 'quarantine')
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(path.join(FIXTURE_DIR, 'claude'), path.join(dest, 'claude'), { recursive: true })
  const manifest = fs.readFileSync(path.join(FIXTURE_DIR, 'quarantine.json'), 'utf8').replaceAll('{{HOME}}', home)
  fs.writeFileSync(path.join(dest, 'quarantine.json'), manifest, 'utf8')
  return {
    quarantinePath: path.join(dest, 'claude', 'upstream-held'),
    originPath: path.join(home, '.claude', 'skills', 'upstream-held'),
  }
}
