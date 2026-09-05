import { afterEach, describe, expect, it } from 'vitest'
import { errorMessage, idsFrom, runOnIds } from '../../server/utils/batch'
import { fail } from '../../server/utils/errors'
import { scanSkills } from '../../server/utils/scan'
import { createFixtureHome } from '../helpers/fixture-home'

describe('batch helpers', () => {
  let cleanup = () => {}
  afterEach(() => cleanup())

  it('idsFrom accepts only an array of ids and stringifies them', () => {
    expect(idsFrom({ ids: ['a', 2] })).toEqual(['a', '2'])
    expect(idsFrom({ ids: 'a' })).toEqual([])
    expect(idsFrom({})).toEqual([])
    expect(idsFrom(null)).toEqual([])
    expect(idsFrom('garbage')).toEqual([])
  })

  it('errorMessage unwraps errors and stringifies the rest', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('plain')).toBe('plain')
  })

  it('runOnIds reports unknown ids and per-card failures without failing the batch', () => {
    const f = createFixtureHome()
    cleanup = f.cleanup
    const index = scanSkills({ home: f.home })
    const alpha = index.skills.find(s => s.slug === 'alpha')!
    const bravo = index.skills.find(s => s.slug === 'bravo')!
    const result = runOnIds([alpha.id, 'missing', bravo.id], index, (summary) => {
      if (summary.slug === 'bravo') throw fail(409, 'nope')
      return { from: summary.path, to: '/x' }
    })
    expect(result.done).toEqual([{ id: alpha.id, name: 'alpha', from: alpha.path, to: '/x' }])
    expect(result.errors).toEqual([
      { id: 'missing', error: 'Skill not in the cabinet' },
      { id: bravo.id, error: 'nope', path: bravo.path },
    ])
  })
})
