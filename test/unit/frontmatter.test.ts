import { describe, expect, it } from 'vitest'
import { FRONTMATTER_PARSE_ERROR, parseFrontmatter, stringField } from '../../server/utils/frontmatter'

describe('parseFrontmatter', () => {
  it('splits a well-formed block into data, raw and content', () => {
    const text = '---\nname: alpha\ndescription: first\n---\n\n# Alpha\n'
    const parsed = parseFrontmatter(text)
    expect(parsed.data).toEqual({ name: 'alpha', description: 'first' })
    expect(parsed.raw).toBe('name: alpha\ndescription: first')
    expect(parsed.content).toBe('# Alpha\n')
  })

  it('returns the whole text as content when there is no block', () => {
    const parsed = parseFrontmatter('# No frontmatter\n')
    expect(parsed).toEqual({ data: {}, content: '# No frontmatter\n', raw: '' })
  })

  it('treats an unterminated block as no block', () => {
    const text = '---\nname: alpha\n\n# never closed\n'
    const parsed = parseFrontmatter(text)
    expect(parsed).toEqual({ data: {}, content: text, raw: '' })
  })

  it('marks invalid YAML with _parseError and keeps the body', () => {
    const parsed = parseFrontmatter('---\nname: [unclosed\n---\n\nBody.\n')
    expect(parsed.data).toEqual({ _parseError: FRONTMATTER_PARSE_ERROR })
    expect(parsed.content).toBe('Body.\n')
    expect(parsed.raw).toBe('name: [unclosed')
  })

  it('treats non-object YAML as empty data', () => {
    expect(parseFrontmatter('---\njust a string\n---\nBody.\n').data).toEqual({})
    expect(parseFrontmatter('---\n- a\n- b\n---\nBody.\n').data).toEqual({})
  })

  it('stringField returns strings only', () => {
    expect(stringField({ name: 'x' }, 'name')).toBe('x')
    expect(stringField({ name: 3 }, 'name')).toBe('')
    expect(stringField({}, 'name')).toBe('')
  })
})
