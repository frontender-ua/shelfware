import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findSkillHooks, hasStandingOrder, skillInvocation } from '../../server/utils/invocation'
import { tempDir } from '../helpers/fixture-home'

const dirs: string[] = []
function scratch(): string {
  const dir = tempDir('shelfware-invoke-')
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('skillInvocation (upstream contract)', () => {
  it('no invocation keys means the model may call it', () => {
    const result = skillInvocation({ skillDir: scratch(), frontmatter: { name: 'adapt' }, description: 'Adapt a design. Use when the user asks.' })
    expect(result.invocation).toBe('model')
    expect(result.invocationEvidence).toBe('default: the model may call this')
  })

  it('disable-model-invocation is user only', () => {
    const result = skillInvocation({ skillDir: scratch(), frontmatter: { 'disable-model-invocation': true }, description: 'Blast radius' })
    expect(result.invocation).toBe('user')
    expect(result.invocationEvidence).toMatch(/disable-model-invocation/)
  })

  it('user-invokable alone is still model', () => {
    const result = skillInvocation({ skillDir: scratch(), frontmatter: { 'user-invokable': true }, description: 'SEO audit when the user says audit' })
    expect(result.invocation).toBe('model')
  })

  it('nested metadata.sessionStart is a hook', () => {
    const result = skillInvocation({ skillDir: scratch(), frontmatter: { metadata: { sessionStart: true } }, description: 'Corrects outdated knowledge' })
    expect(result.invocation).toBe('hook')
    expect(result.invocationEvidence).toMatch(/sessionStart/)
  })

  it('sessionStart frontmatter is a hook', () => {
    const result = skillInvocation({ skillDir: scratch(), frontmatter: { sessionStart: true }, description: 'Warm the session' })
    expect(result.invocation).toBe('hook')
    expect(result.invocationEvidence).toMatch(/sessionStart/)
  })

  it('string truthy values count', () => {
    const result = skillInvocation({ skillDir: scratch(), frontmatter: { alwaysApply: 'yes' }, description: 'Always' })
    expect(result.invocation).toBe('hook')
    expect(result.invocationEvidence).toBe('frontmatter alwaysApply')
  })

  it('standing-order description is a hook', () => {
    const result = skillInvocation({ skillDir: scratch(), frontmatter: {}, description: 'Cut AI tells from any writing. Must always apply.' })
    expect(result.invocation).toBe('hook')
    expect(result.invocationEvidence).toMatch(/standing order/)
  })

  it('hooks.json in the skill folder is a hook', () => {
    const dir = scratch()
    fs.mkdirSync(path.join(dir, 'hooks'))
    fs.writeFileSync(path.join(dir, 'hooks', 'hooks.json'), '{}\n')
    const result = skillInvocation({ skillDir: dir, frontmatter: { 'disable-model-invocation': true }, description: 'Also user-only in YAML' })
    expect(result.invocation).toBe('hook')
    expect(result.invocationEvidence).toMatch(/hooks\.json/)
  })

  it('a flat hooks.json also counts', () => {
    const dir = scratch()
    fs.writeFileSync(path.join(dir, 'hooks.json'), '{}\n')
    expect(findSkillHooks(dir)).toBe(path.join(dir, 'hooks.json'))
    expect(findSkillHooks(dir, { fileOnly: true })).toBe('')
  })

  it.each([
    'Do not always apply this. Use it when the user asks.',
    'Never on every request. Call it when needed.',
    'Do not run on every request.',
    'Never run on every request.',
    'This does not need to always apply.',
  ])('negated standing order is not a hook: %s', (description) => {
    const result = skillInvocation({ skillDir: scratch(), frontmatter: {}, description })
    expect(result.invocation).toBe('model')
  })

  it('a negated sentence does not hide a later standing order', () => {
    const result = skillInvocation({ skillDir: scratch(), frontmatter: {}, description: 'Do not run on every request. Must always apply.' })
    expect(result.invocation).toBe('hook')
  })

  it('a but-clause standing order is still a hook', () => {
    const result = skillInvocation({ skillDir: scratch(), frontmatter: {}, description: 'Do not run on every request, but must always apply.' })
    expect(result.invocation).toBe('hook')
  })

  it('disable-model-invocation and user-invokable false is off', () => {
    const result = skillInvocation({
      skillDir: scratch(),
      frontmatter: { 'disable-model-invocation': true, 'user-invokable': false },
      description: 'Held',
    })
    expect(result.invocation).toBe('off')
    expect(result.invocationEvidence).toMatch(/user-invokable/)
  })

  it("hooks.json beside a loose markdown skill is not this skill's hook", () => {
    const dir = scratch()
    const file = path.join(dir, 'note.md')
    fs.writeFileSync(file, '---\nname: note\n---\n\nBody.\n')
    fs.writeFileSync(path.join(dir, 'hooks.json'), '{}\n')
    const result = skillInvocation({ skillDir: file, fileOnly: true, frontmatter: {}, description: 'A loose note' })
    expect(result.invocation).toBe('model')
  })

  it("hooks.json in a parent plugin is not this skill's hook", () => {
    const plugin = scratch()
    fs.mkdirSync(path.join(plugin, 'hooks'))
    fs.writeFileSync(path.join(plugin, 'hooks', 'hooks.json'), '{}\n')
    const skillDir = path.join(plugin, 'skills', 'knowledge-update')
    fs.mkdirSync(skillDir, { recursive: true })
    const result = skillInvocation({ skillDir, frontmatter: {}, description: 'Update knowledge when asked' })
    expect(result.invocation).toBe('model')
  })

  it('falls back to frontmatter.description when no description is passed', () => {
    const result = skillInvocation({ skillDir: scratch(), frontmatter: { description: 'Injected at session start.' } })
    expect(result.invocation).toBe('hook')
  })
})

describe('hasStandingOrder', () => {
  it('detects the phrases and respects clause negation', () => {
    expect(hasStandingOrder('')).toBe(false)
    expect(hasStandingOrder('Hooked into every session.')).toBe(true)
    expect(hasStandingOrder('Before every prompt, load context.')).toBe(true)
    expect(hasStandingOrder("It doesn't always apply.")).toBe(false)
    expect(hasStandingOrder('Not the kind of thing you always apply; still, must always apply.')).toBe(true)
  })
})
