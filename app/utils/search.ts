import type { Severity, SkillCard } from '#shared/types/catalog'

export type FormFilter = 'all' | 'physical' | 'reference' | 'broken'
export type RiskFilter = 'all' | 'low' | 'medium' | 'high' | 'critical'
export type InvocationFilter = 'all' | 'hook' | 'user' | 'model' | 'off'

export interface Filters {
  form: FormFilter
  risk: RiskFilter
  invocation: InvocationFilter
}

export const DEFAULT_FILTERS: Filters = { form: 'all', risk: 'all', invocation: 'all' }

export const FORM_OPTIONS: { label: string, value: FormFilter }[] = [
  { label: 'Any form', value: 'all' },
  { label: 'Physical', value: 'physical' },
  { label: 'References', value: 'reference' },
  { label: 'Broken', value: 'broken' },
]

export const RISK_OPTIONS: { label: string, value: RiskFilter }[] = [
  { label: 'Any risk', value: 'all' },
  { label: 'Risk low+', value: 'low' },
  { label: 'Risk medium+', value: 'medium' },
  { label: 'Risk high+', value: 'high' },
  { label: 'Risk critical', value: 'critical' },
]

export const INVOCATION_OPTIONS: { label: string, value: InvocationFilter }[] = [
  { label: 'Any invocation', value: 'all' },
  { label: 'Hook', value: 'hook' },
  { label: 'User only', value: 'user' },
  { label: 'Model', value: 'model' },
  { label: 'Off', value: 'off' },
]

/** Mirrors SEVERITY_ORDER in server/utils/audit-rules.ts (spec §4.5). */
const RISK_ORDER: Record<Severity, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 }

/** Upstream App.jsx haystack plus the token words of spec §11.3. `q` is trimmed and lower-cased by the caller. */
export function matchesQuery(skill: SkillCard, q: string): boolean {
  if (!q) return true
  const hay = [
    skill.name,
    skill.slug,
    skill.description,
    skill.path,
    skill.scopeLabel,
    skill.file ? 'file' : '',
    skill.link ? 'symlink link' : '',
    skill.linkTarget || '',
    skill.origin?.label || '',
    skill.origin?.url || '',
    skill.physicality === 'broken' ? 'broken' : '',
    skill.physicality === 'reference' ? 'reference' : '',
    skill.risk && skill.risk !== 'none' ? `risk ${skill.risk}` : '',
    skill.copyCount ? `copy copies ${skill.copyCount}` : '',
    skill.quarantined ? 'quarantine held' : '',
    skill.fromScope ? `from ${skill.fromScope}` : '',
    skill.invocation === 'hook'
      ? 'hook every request'
      : skill.invocation === 'user'
        ? 'user only'
        : skill.invocation === 'off'
          ? 'off disabled'
          : 'model may call',
    skill.invocationEvidence || '',
    `tokens ${skill.tokenEstimate} tok`,
  ]
    .join('\n')
    .toLowerCase()
  return hay.includes(q)
}

export function matchesFormFilter(skill: SkillCard, filter: FormFilter): boolean {
  if (filter === 'all') return true
  return skill.physicality === filter
}

export function matchesRiskFilter(skill: SkillCard, filter: RiskFilter): boolean {
  if (filter === 'all') return true
  return RISK_ORDER[skill.risk] >= RISK_ORDER[filter]
}

export function matchesInvocationFilter(skill: SkillCard, filter: InvocationFilter): boolean {
  if (filter === 'all') return true
  return (skill.invocation || 'model') === filter
}

export function matchesFilters(skill: SkillCard, filters: Filters): boolean {
  return matchesFormFilter(skill, filters.form) && matchesRiskFilter(skill, filters.risk) && matchesInvocationFilter(skill, filters.invocation)
}
