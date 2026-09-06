import { describe, expect, it } from 'vitest'
import type { SkillCard } from '../../shared/types/catalog'
import {
  DEFAULT_FILTERS,
  FORM_OPTIONS,
  INVOCATION_OPTIONS,
  matchesFilters,
  matchesFormFilter,
  matchesInvocationFilter,
  matchesQuery,
  matchesRiskFilter,
  RISK_OPTIONS,
} from '../../app/utils/search'

function card(over: Partial<SkillCard> = {}): SkillCard {
  return {
    id: 'id', name: 'Deep Research', slug: 'deep-research', description: 'Digs into sources',
    scopeId: 'claude', scopeLabel: '.claude', kind: 'user', path: '/home/me/.claude/skills/deep-research',
    skillRel: 'SKILL.md', file: false, link: false, linkTarget: '', origin: null,
    invocation: 'model', invocationEvidence: 'default: the model may call this', risk: 'none',
    physicality: 'physical', refTarget: '', refSkillId: '', copyCount: 0, copies: [], mtime: 0,
    quarantined: false, fromScope: '', skillSize: 100, tokenEstimate: 25,
    ...over,
  }
}

describe('matchesQuery (upstream haystack)', () => {
  it('matches name, slug, description, path and scope', () => {
    expect(matchesQuery(card(), '')).toBe(true)
    expect(matchesQuery(card(), 'deep')).toBe(true)
    expect(matchesQuery(card(), 'deep-research')).toBe(true)
    expect(matchesQuery(card(), 'sources')).toBe(true)
    expect(matchesQuery(card(), '.claude/skills')).toBe(true)
    expect(matchesQuery(card(), 'nothing here')).toBe(false)
  })

  it('matches the form, origin, risk, copies, quarantine and invocation words', () => {
    expect(matchesQuery(card({ file: true }), 'file')).toBe(true)
    expect(matchesQuery(card({ link: true, linkTarget: '/repo/x' }), 'symlink')).toBe(true)
    expect(matchesQuery(card({ link: true, linkTarget: '/repo/x' }), '/repo/x')).toBe(true)
    expect(matchesQuery(card({ physicality: 'broken' }), 'broken')).toBe(true)
    expect(matchesQuery(card({ physicality: 'reference' }), 'reference')).toBe(true)
    expect(matchesQuery(card({ origin: { kind: 'github', label: 'o/r', url: 'https://github.com/o/r', via: 'path', certainty: 'attested' } }), 'o/r')).toBe(true)
    expect(matchesQuery(card({ risk: 'high' }), 'risk high')).toBe(true)
    expect(matchesQuery(card({ risk: 'none' }), 'risk')).toBe(false)
    expect(matchesQuery(card({ copyCount: 2 }), 'copies 2')).toBe(true)
    expect(matchesQuery(card({ quarantined: true, fromScope: 'codex' }), 'held')).toBe(true)
    expect(matchesQuery(card({ quarantined: true, fromScope: 'codex' }), 'from codex')).toBe(true)
    expect(matchesQuery(card({ invocation: 'hook' }), 'every request')).toBe(true)
    expect(matchesQuery(card({ invocation: 'user' }), 'user only')).toBe(true)
    expect(matchesQuery(card({ invocation: 'off' }), 'disabled')).toBe(true)
    expect(matchesQuery(card(), 'model may call')).toBe(true)
    expect(matchesQuery(card({ invocationEvidence: 'hooks.json at /x' }), 'hooks.json')).toBe(true)
  })

  it('matches the token count', () => {
    expect(matchesQuery(card({ tokenEstimate: 25 }), 'tokens 25')).toBe(true)
    expect(matchesQuery(card({ tokenEstimate: 25 }), '25 tok')).toBe(true)
  })
})

describe('filters', () => {
  it('form filter maps to physicality', () => {
    expect(matchesFormFilter(card(), 'all')).toBe(true)
    expect(matchesFormFilter(card(), 'physical')).toBe(true)
    expect(matchesFormFilter(card({ physicality: 'reference' }), 'reference')).toBe(true)
    expect(matchesFormFilter(card({ physicality: 'reference' }), 'physical')).toBe(false)
    expect(matchesFormFilter(card({ physicality: 'broken' }), 'broken')).toBe(true)
  })

  it('risk filter means "at least"', () => {
    expect(matchesRiskFilter(card({ risk: 'none' }), 'all')).toBe(true)
    expect(matchesRiskFilter(card({ risk: 'none' }), 'low')).toBe(false)
    expect(matchesRiskFilter(card({ risk: 'low' }), 'low')).toBe(true)
    expect(matchesRiskFilter(card({ risk: 'critical' }), 'medium')).toBe(true)
    expect(matchesRiskFilter(card({ risk: 'high' }), 'critical')).toBe(false)
  })

  it('invocation filter is exact', () => {
    expect(matchesInvocationFilter(card(), 'all')).toBe(true)
    expect(matchesInvocationFilter(card(), 'model')).toBe(true)
    expect(matchesInvocationFilter(card(), 'hook')).toBe(false)
  })

  it('matchesFilters combines the three and the option lists start with any', () => {
    expect(matchesFilters(card({ risk: 'high', invocation: 'hook' }), { form: 'physical', risk: 'medium', invocation: 'hook' })).toBe(true)
    expect(matchesFilters(card({ risk: 'high', invocation: 'hook' }), { form: 'broken', risk: 'medium', invocation: 'hook' })).toBe(false)
    expect(DEFAULT_FILTERS).toEqual({ form: 'all', risk: 'all', invocation: 'all' })
    expect(FORM_OPTIONS[0]).toEqual({ label: 'Any form', value: 'all' })
    expect(RISK_OPTIONS.map(o => o.value)).toEqual(['all', 'low', 'medium', 'high', 'critical'])
    expect(INVOCATION_OPTIONS.map(o => o.value)).toEqual(['all', 'hook', 'user', 'model', 'off'])
  })
})
