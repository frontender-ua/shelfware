import { describe, expect, it } from 'vitest'
import { crossingQuarantineShelf, idsForShelfAction, nextSelection } from '../../app/utils/shelf-actions'

const live = { id: 'live', quarantined: false }
const held = { id: 'held', quarantined: true }

describe('shelf actions (upstream contract)', () => {
  it('quarantine only acts on live cards', () => {
    expect(idsForShelfAction(['live', 'held', 'gone'], [live, held], 'quarantine')).toEqual(['live'])
  })

  it('restore only acts on quarantined cards', () => {
    expect(idsForShelfAction(['live', 'held'], [live, held], 'restore')).toEqual(['held'])
  })

  it('delete acts on either shelf', () => {
    expect(idsForShelfAction(['live', 'held', 'gone'], [live, held], 'delete')).toEqual(['live', 'held'])
  })

  it('crossing the quarantine shelf clears marks; live drawers do not', () => {
    expect(crossingQuarantineShelf('all', 'quarantine')).toBe(true)
    expect(crossingQuarantineShelf('quarantine', 'claude')).toBe(true)
    expect(crossingQuarantineShelf('all', 'claude')).toBe(false)
    expect(crossingQuarantineShelf('quarantine', 'quarantine')).toBe(false)
  })
})

describe('nextSelection', () => {
  const ids = ['a', 'b', 'c']

  it('moves by delta and clamps at both ends', () => {
    expect(nextSelection(ids, 'a', 1)).toBe('b')
    expect(nextSelection(ids, 'b', -1)).toBe('a')
    expect(nextSelection(ids, 'c', 1)).toBe('c')
    expect(nextSelection(ids, 'a', -1)).toBe('a')
  })

  it('starts from the first card when nothing or an unknown id is selected', () => {
    expect(nextSelection(ids, undefined, 1)).toBe('a')
    expect(nextSelection(ids, undefined, -1)).toBe('a')
    expect(nextSelection(ids, 'zzz', 1)).toBe('a')
  })

  it('returns null for an empty list', () => {
    expect(nextSelection([], 'a', 1)).toBeNull()
  })
})
