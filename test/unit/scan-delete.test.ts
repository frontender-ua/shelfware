import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertDeletable, assertSkillTarget, deleteSkillDir } from '../../server/utils/scan'
import { deleteEffect } from '../../shared/utils/delete-effect'
import { tempDir } from '../helpers/fixture-home'

const dirs: string[] = []
function scratch(): string {
  const dir = tempDir('shelfware-del-')
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function skillMarkdown(): string {
  return '---\nname: sample\ndescription: a sample skill\n---\n\nBody.\n'
}

describe('deleteEffect (upstream contract)', () => {
  it('names unlink, file, and folder', () => {
    expect(deleteEffect({ link: true, path: '/tmp/link', linkTarget: '/tmp/real' })).toEqual({
      action: 'unlink', label: 'Unlink', path: '/tmp/link', note: 'Target /tmp/real stays',
    })
    expect(deleteEffect({ link: true, path: '/tmp/link' }).note).toBe('The target stays')
    expect(deleteEffect({ file: true, path: '/tmp/note.md', link: false })).toEqual({
      action: 'delete-file', label: 'Delete file', path: '/tmp/note.md', note: '',
    })
    expect(deleteEffect({ path: '/tmp/folder' })).toEqual({
      action: 'delete-folder', label: 'Delete folder', path: '/tmp/folder', note: '',
    })
  })

  it('a dead shortcut unlinks and says the target is gone', () => {
    const effect = deleteEffect({ link: true, path: '/tmp/dead', linkTarget: '/tmp/gone', physicality: 'broken' })
    expect(effect.action).toBe('unlink')
    expect(effect.note).toBe('The target is already gone')
  })
})

describe('assertDeletable + deleteSkillDir (upstream contract)', () => {
  it('unlinking a symlink keeps the target folder', () => {
    const root = scratch()
    const cabinet = path.join(root, 'cabinet')
    const realSkill = path.join(cabinet, 'real-skill')
    const linkSkill = path.join(cabinet, 'link-skill')
    fs.mkdirSync(realSkill, { recursive: true })
    fs.writeFileSync(path.join(realSkill, 'SKILL.md'), skillMarkdown())
    fs.symlinkSync(realSkill, linkSkill)
    const target = assertDeletable({ path: linkSkill }, [{ root: cabinet }], { home: root })
    deleteSkillDir(target)
    expect(fs.existsSync(linkSkill)).toBe(false)
    expect(fs.existsSync(path.join(realSkill, 'SKILL.md'))).toBe(true)
  })

  it('folder delete removes the skill directory', () => {
    const root = scratch()
    const cabinet = path.join(root, 'cabinet')
    const skill = path.join(cabinet, 'doomed')
    fs.mkdirSync(skill, { recursive: true })
    fs.writeFileSync(path.join(skill, 'SKILL.md'), skillMarkdown())
    deleteSkillDir(assertDeletable({ path: skill }, [{ root: cabinet }], { home: root }))
    expect(fs.existsSync(skill)).toBe(false)
  })

  it('file delete removes a loose skill file', () => {
    const root = scratch()
    const cabinet = path.join(root, 'cabinet')
    fs.mkdirSync(cabinet, { recursive: true })
    const file = path.join(cabinet, 'note.md')
    fs.writeFileSync(file, skillMarkdown())
    deleteSkillDir(assertDeletable({ path: file }, [{ root: cabinet }], { home: root }))
    expect(fs.existsSync(file)).toBe(false)
  })

  it('assertDeletable refuses a cabinet root', () => {
    const root = scratch()
    fs.writeFileSync(path.join(root, 'SKILL.md'), skillMarkdown())
    expect(() => assertDeletable({ path: root }, [{ root }], { home: path.dirname(root) })).toThrow(/cabinet root/)
  })

  it('assertSkillTarget refuses home, foreign paths, and non-skill paths with the right statuses', () => {
    const home = scratch()
    const cabinet = path.join(home, '.claude', 'skills')
    const skill = path.join(cabinet, 'ok')
    fs.mkdirSync(skill, { recursive: true })
    fs.writeFileSync(path.join(skill, 'SKILL.md'), skillMarkdown())
    fs.mkdirSync(path.join(cabinet, 'plain'))
    const roots = [{ root: cabinet }]

    expect(assertSkillTarget({ path: skill }, roots, 'quarantine', { home })).toBe(skill)
    expect(() => assertSkillTarget({ path: home }, roots, 'quarantine', { home })).toThrow(expect.objectContaining({ status: 403 }))
    expect(() => assertSkillTarget({ path: path.join(home, 'elsewhere', 'x') }, roots, 'delete', { home })).toThrow(
      expect.objectContaining({ status: 403, message: 'Skill is outside known cabinet roots' }),
    )
    expect(() => assertSkillTarget({ path: cabinet }, roots, 'edit', { home })).toThrow(
      expect.objectContaining({ status: 403, message: 'Refusing to edit a cabinet root' }),
    )
    expect(() => assertSkillTarget({ path: path.join(cabinet, 'plain') }, roots, 'delete', { home })).toThrow(
      expect.objectContaining({ status: 400, message: 'Not a skill path' }),
    )
  })
})
