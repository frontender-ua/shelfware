# shelfware v0.1 — Client Implementation Plan (part 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shelfware SPA of spec §11 on top of the API delivered by the server plan: drawers, tray, reader, action slip, keyboard navigation, and the raw `SKILL.md` editor with its save/409 flow.

**Architecture:** Nuxt UI 4 dashboard layout (`UDashboardGroup` with a sidebar and two panels) rendered once in `app/app.vue`; the pages only swap the reader panel's content, so the tray never remounts. Client state lives in composables on `useState`; every rule that can be pure (`matchesQuery`, filters, shelf actions, markdown rendering, formatting, API error mapping) lives in `app/utils/` and is unit-tested in the `unit` vitest project. The keyboard composable and the editor are component-tested in the `nuxt` project.

**Tech Stack:** Nuxt 4.5 (`ssr: false`), @nuxt/ui 4.9 (`UDashboard*`, `UTabs`, `UModal`, `UTextarea`, `UKbd`, `UAlert`, `useToast`, `defineShortcuts`, `UColorModeButton`), Tailwind 4, markdown-it 14, @vueuse/core 14 (`useLocalStorage`, `useEventListener`), vitest + `@nuxt/test-utils/runtime` (`mountSuspended`, happy-dom).

**Spec:** `docs/superpowers/specs/2026-09-05-shelfware-v0.1-design.md` — read §3.3, §4, §9, §11, §12.2 (markdown, shelf-actions), §12.4 and §16 before starting. **Prerequisite:** the server plan (`2026-09-05-shelfware-v0.1-server.md`) is complete: `shared/types/catalog.ts`, `shared/utils/delete-effect.ts`, the API routes and `test/e2e/api.test.ts` all exist and pass.

**Upstream reference:** skill-cabinet 0.6.0 at `/Users/glua/develop/reference/skill-cabinet` (read-only). `src/App.jsx` holds the search haystack, filter semantics, keyboard rules and the slip copy that this plan ports; `DESIGN.md` holds the register.

## Global Constraints

- Everything in the server plan's Global Constraints still applies (pnpm, no runtime dependencies, `{ error }` bodies, no CORS, commit per task).
- Register: quiet, precise, librarian. Status is **always word + colour** (the two-signal rule); a coloured mark without its word is a defect. Paths are monospace and wrap. Findings and inferred origins are labelled as evidence. Delete is the only red control. No cute confirmations.
- Nuxt UI colour/utility tokens only: `text-highlighted`, `text-default`, `text-muted`, `text-dimmed`, `bg-default`, `bg-elevated`, `bg-muted`, `border-default`, `text-error`, `text-warning`, `text-info`, `text-success`. No custom skins, no hex colours in components.
- Fonts: `ui.fonts: false` (already set); body uses Tailwind's `font-sans` system stack; paths, source, previews and the editor use `font-mono`.
- Markdown: `markdown-it` with `html: false`, `linkify: false`, `typographer: false`, default `validateLink`, rendered with `v-html` into `div.prose`. Broken cards and binary previews never reach the renderer.
- Filters persist in `localStorage` under the key `shelfware-filters` via `useLocalStorage` imported from `@vueuse/core`. Scope lives in the URL query `?scope=<id>` (`all` when absent).
- Keyboard map (spec §11.8): `/` focus search; `j`/`k` next/previous visible card with `scrollIntoView({ block: 'nearest' })`; `x` toggle mark; `q` Quarantine slip (live shelves only); `r` Restore slip (quarantine shelf only); `d` Delete slip (quarantine shelf only); `e` Edit tab; `meta_s` save (Edit tab, `usingInput: true`, handler calls `e.preventDefault()`); `escape` close slip / blur input (`usingInput: true`). Built on Nuxt UI `defineShortcuts`, which skips inputs unless `usingInput` and maps `meta` to `ctrl` off macOS.
- API access only through `useApi()`; the token comes from `useRuntimeConfig().public.shelfwareToken` and rides in `X-Shelfware-Token`. Errors surface as `ApiError { status, data }`.
- Every mutation: run the batch → toast counts and per-card errors → `refresh()` → clear marks. Every save: replace the reader's detail with the response.
- Tests: pure utils in `test/unit/`, component tests in `test/nuxt/` (`mountSuspended`), no new e2e files (the server plan's single e2e file stays the only one).
- Commit after every task with a conventional-commit message, body ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `app/utils/markdown.ts` | `renderMarkdown(source)` — the only markdown-it instance (Task 1) |
| `app/utils/format.ts` | `formatBytes`, `formatWhen`, `formatTokens`, `kindStamp` (Task 1) |
| `app/utils/search.ts` | `matchesQuery`, `matchesFormFilter`, `matchesRiskFilter`, `matchesInvocationFilter`, filter option lists (Task 2) |
| `app/utils/shelf-actions.ts` | `idsForShelfAction`, `crossingQuarantineShelf`, `nextSelection` (Task 2) |
| `app/utils/api-error.ts` | `ApiError`, `toApiError(err)` (Task 3) |
| `app/composables/useApi.ts` | `$fetch.create` with the token header; typed calls (Task 3) |
| `app/composables/useCatalog.ts` | catalog state, scope, query, filters, `visible`, marks, `refresh`, `select` (Task 3) |
| `app/composables/useSkillDetail.ts` | detail fetch, file preview, `save`, `reload` (Task 3) |
| `app/composables/useReaderTab.ts` | the reader's active tab as shared state (Task 3) |
| `app/composables/useSlip.ts` | the action slip's open state and target ids (Task 3) |
| `app/assets/css/main.css` | Tailwind + Nuxt UI imports plus `.prose` rules (Task 4) |
| `app/app.vue` | `UApp` → `UDashboardGroup` → sidebar (DrawerRail), tray, reader panel with `NuxtPage`, `ActionSlip` (Task 4) |
| `app/components/DrawerRail.vue`, `app/components/CensusNote.vue` | scopes with counts, the house census note, the quarantine shelf (Task 4) |
| `app/pages/index.vue`, `app/pages/skills/[id].vue` | empty reader / `SkillReader` for one id (Task 4) |
| `app/components/SkillTray.vue`, `app/components/SkillCard.vue` | search, filters, bulk bar, card list, kbd footer (Task 5) |
| `app/components/SkillReader.vue`, `app/components/FolioTree.vue` | cataloguing header, tabs Manuscript / Source / Edit / Folio (Task 6) |
| `app/components/ActionSlip.vue` | confirmation modal with filesystem effects; runs the batch (Task 7) |
| `app/composables/useShelfKeys.ts` | keyboard navigation on `defineShortcuts` (Task 8) |
| `app/components/SkillEditor.vue` | textarea, Save/Revert, dirty state, 409 reload, leave guards (Task 9) |
| `test/unit/markdown.test.ts`, `format.test.ts`, `search.test.ts`, `shelf-actions.test.ts`, `api-error.test.ts` | pure-module tests |
| `test/nuxt/use-catalog.test.ts`, `use-shelf-keys.test.ts`, `skill-editor.test.ts` | Nuxt-environment tests |

---

### Task 1: Markdown renderer and formatting helpers

**Files:**
- Create: `app/utils/markdown.ts`, `app/utils/format.ts`
- Test: `test/unit/markdown.test.ts`, `test/unit/format.test.ts`

**Interfaces:**
- Produces: `renderMarkdown(source: string): string`; `formatBytes(n: number): string` (`0 B`, `1.5 KB`, `12 MB`); `formatWhen(ms: number): string` (`—` for 0); `formatTokens(n: number): string` (`~0 tok`, `~842 tok`, `~1.2k tok`); `kindStamp(kind: RootKind): 'user' | 'builtin' | 'plugin cache' | 'quarantine'`.

- [ ] **Step 1: Write the failing tests**

`test/unit/markdown.test.ts` (the spec §12.2 XSS fixtures; the security property is that no executable attribute or scheme survives as markup):

```ts
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../app/utils/markdown'

describe('renderMarkdown', () => {
  it('escapes raw HTML instead of emitting it', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<a href="https://x.invalid">raw</a>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror=')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<a href')
    expect(html).toContain('&lt;script&gt;')
  })

  it('refuses javascript:, vbscript:, file: and non-image data: links', () => {
    const html = renderMarkdown([
      '[x](javascript:alert(1))',
      '[y](vbscript:msgbox)',
      '[z](file:///etc/passwd)',
      '[w](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    ].join('\n\n'))
    expect(html).not.toMatch(/href="(javascript|vbscript|file|data):/i)
    expect(html).not.toContain('<a ')
  })

  it('keeps ordinary links, tables and fenced code', () => {
    const html = renderMarkdown([
      '[docs](https://example.com/docs)',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '```sh',
      'echo "<b>not bold</b>"',
      '```',
    ].join('\n'))
    expect(html).toContain('<a href="https://example.com/docs">docs</a>')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
    expect(html).toContain('<pre><code class="language-sh">')
    expect(html).toContain('&lt;b&gt;not bold&lt;/b&gt;')
  })

  it('leaves quotes and dashes alone (no typographer)', () => {
    expect(renderMarkdown('"quoted" -- dash')).toContain('&quot;quoted&quot; -- dash')
  })
})
```

`test/unit/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatBytes, formatTokens, formatWhen, kindStamp } from '../../app/utils/format'

describe('format helpers', () => {
  it('formatBytes mirrors upstream', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10 * 1024)).toBe('10 KB')
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB')
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5120 MB')
  })

  it('formatWhen renders a date or a dash', () => {
    expect(formatWhen(0)).toBe('—')
    expect(formatWhen(Date.UTC(2026, 8, 5, 12))).toMatch(/2026/)
  })

  it('formatTokens abbreviates thousands', () => {
    expect(formatTokens(0)).toBe('~0 tok')
    expect(formatTokens(842)).toBe('~842 tok')
    expect(formatTokens(1234)).toBe('~1.2k tok')
    expect(formatTokens(15_000)).toBe('~15k tok')
  })

  it('kindStamp names the drawer kind', () => {
    expect(kindStamp('user')).toBe('user')
    expect(kindStamp('builtin')).toBe('builtin')
    expect(kindStamp('plugin')).toBe('plugin cache')
    expect(kindStamp('quarantine')).toBe('quarantine')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:unit -- markdown format`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the modules**

`app/utils/markdown.ts`:

```ts
import MarkdownIt from 'markdown-it'

/**
 * Spec §2 / §11.5: html:false escapes raw HTML, linkify:false leaves bare
 * URLs as text, and markdown-it's default validateLink refuses javascript:,
 * vbscript:, file: and non-image data: URLs. GFM tables and fences are on
 * by default.
 */
const md = new MarkdownIt({ html: false, linkify: false, typographer: false })

export function renderMarkdown(source: string): string {
  return md.render(source)
}
```

`app/utils/format.ts`:

```ts
import type { RootKind } from '#shared/types/catalog'

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v < 10 && i ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

export function formatWhen(ms: number): string {
  if (!ms) return '—'
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(ms))
}

export function formatTokens(n: number): string {
  if (n < 1000) return `~${n} tok`
  const k = n / 1000
  return `~${k < 10 ? k.toFixed(1) : Math.round(k)}k tok`
}

export function kindStamp(kind: RootKind): 'user' | 'builtin' | 'plugin cache' | 'quarantine' {
  if (kind === 'builtin') return 'builtin'
  if (kind === 'plugin') return 'plugin cache'
  if (kind === 'quarantine') return 'quarantine'
  return 'user'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:unit -- markdown format`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add app/utils/markdown.ts app/utils/format.ts test/unit/markdown.test.ts test/unit/format.test.ts
git commit -m "feat(app): add safe markdown renderer and formatting helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Search, filters and shelf actions

**Files:**
- Create: `app/utils/search.ts`, `app/utils/shelf-actions.ts`
- Test: `test/unit/search.test.ts`, `test/unit/shelf-actions.test.ts` (port of upstream `server/shelf-actions.test.js` plus `nextSelection`)

**Interfaces:**
- Produces (`search.ts`): `matchesQuery(card: SkillCard, q: string): boolean` (`q` already trimmed and lower-cased), `type FormFilter = 'all' | 'physical' | 'reference' | 'broken'`, `type RiskFilter = 'all' | 'low' | 'medium' | 'high' | 'critical'` (meaning "at least"), `type InvocationFilter = 'all' | 'hook' | 'user' | 'model' | 'off'`, `interface Filters { form; risk; invocation }`, `DEFAULT_FILTERS`, `FORM_OPTIONS`, `RISK_OPTIONS`, `INVOCATION_OPTIONS` (each `{ label, value }[]`), `matchesFormFilter`, `matchesRiskFilter`, `matchesInvocationFilter`, `matchesFilters(card, filters)`.
- Produces (`shelf-actions.ts`): `type ShelfAction = 'quarantine' | 'restore' | 'delete'`, `idsForShelfAction(ids, cards, mode): string[]`, `crossingQuarantineShelf(from, to): boolean`, `nextSelection(visibleIds: string[], currentId: string | undefined, delta: number): string | null`.

- [ ] **Step 1: Write the failing tests**

`test/unit/search.test.ts`:

```ts
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
```

`test/unit/shelf-actions.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:unit -- search shelf-actions`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the modules**

`app/utils/search.ts`:

```ts
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
```

`app/utils/shelf-actions.ts`:

```ts
export type ShelfAction = 'quarantine' | 'restore' | 'delete'

/** Upstream src/shelf-actions.js: which of the marked ids the action may touch. */
export function idsForShelfAction(ids: string[], cards: { id: string, quarantined: boolean }[], mode: ShelfAction): string[] {
  const byId = new Map(cards.map(card => [card.id, card]))
  return ids.filter((id) => {
    const card = byId.get(id)
    if (!card) return false
    if (mode === 'restore') return Boolean(card.quarantined)
    if (mode === 'quarantine') return !card.quarantined
    return true
  })
}

export function crossingQuarantineShelf(fromScopeId: string, toScopeId: string): boolean {
  return (fromScopeId === 'quarantine') !== (toScopeId === 'quarantine')
}

/** Spec §11.8: j/k move by one visible card, clamped; an unknown selection starts at the first card. */
export function nextSelection(visibleIds: string[], currentId: string | undefined, delta: number): string | null {
  if (!visibleIds.length) return null
  const i = currentId ? visibleIds.indexOf(currentId) : -1
  if (i === -1) return visibleIds[0]!
  const next = Math.max(0, Math.min(visibleIds.length - 1, i + delta))
  return visibleIds[next]!
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:unit -- search shelf-actions`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add app/utils/search.ts app/utils/shelf-actions.ts test/unit/search.test.ts test/unit/shelf-actions.test.ts
git commit -m "feat(app): port search haystack, filters and shelf actions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: API client and state composables

**Files:**
- Create: `app/utils/api-error.ts`, `app/composables/useApi.ts`, `app/composables/useCatalog.ts`, `app/composables/useSkillDetail.ts`, `app/composables/useReaderTab.ts`, `app/composables/useSlip.ts`
- Create: `app/pages/index.vue`, `app/pages/skills/[id].vue` (pages make Nuxt install vue-router, which `useCatalog` needs for `?scope`)
- Test: `test/unit/api-error.test.ts`, `test/nuxt/use-catalog.test.ts`

**Interfaces:**
- Consumes: `matchesQuery`, `matchesFilters`, `DEFAULT_FILTERS`, `Filters` (Task 2); `crossingQuarantineShelf`, `ShelfAction` (Task 2); API payload types from `#shared/types/catalog`.
- Produces:
  - `class ApiError extends Error { status: number; data: Record<string, unknown> }`, `toApiError(err: unknown): ApiError`.
  - `useApi(): { catalog(refresh?), skill(id), file(id, rel), save(id, source, baseHash), quarantine(ids), restore(ids), remove(ids) }`, all returning the spec §9 payloads and throwing `ApiError`.
  - `useCatalog()` returning `{ catalog, loading, error, query, filters, scopeId, inQuarantine, selectedId, selected, skills, live, held, heldCount, scopes, visible, visibleIds, scopeCounts, marked, markedOnShelf, refresh(force?), setScope(id), select(id), isMarked(id), toggleMark(id), markVisible(), clearMarks() }`.
  - `useSkillDetail(id: Ref<string | undefined>)` returning `{ detail, error, loading, preview, previewError, load(), openFile(rel), save(source, baseHash), reload() }`.
  - `useReaderTab(): Ref<'manuscript' | 'source' | 'edit' | 'folio'>`.
  - `useSlip(): { slip, open, openSlip(mode, ids), closeSlip() }` with `SlipState = { mode: ShelfAction; ids: string[] }`.

- [ ] **Step 1: Write the failing tests**

`test/unit/api-error.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ApiError, toApiError } from '../../app/utils/api-error'

describe('toApiError', () => {
  it('maps an ofetch error with an { error } body to status and message', () => {
    const err = toApiError({ statusCode: 409, message: '409 Conflict', data: { error: 'File changed on disk since it was loaded', currentHash: 'abc' } })
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.message).toBe('File changed on disk since it was loaded')
    expect(err.data).toEqual({ error: 'File changed on disk since it was loaded', currentHash: 'abc' })
  })

  it('falls back to the error message and status 0 for network failures', () => {
    const err = toApiError(new Error('fetch failed'))
    expect(err.status).toBe(0)
    expect(err.message).toBe('fetch failed')
    expect(err.data).toEqual({})
  })

  it('never throws on garbage and passes ApiError through', () => {
    expect(toApiError('boom').message).toBe('Request failed')
    expect(toApiError(null).status).toBe(0)
    const original = new ApiError('x', 418, {})
    expect(toApiError(original)).toBe(original)
  })
})
```

`test/nuxt/use-catalog.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { CatalogResponse, SkillCard } from '#shared/types/catalog'
import { useCatalog } from '~/composables/useCatalog'
import { DEFAULT_FILTERS } from '~/utils/search'

function card(over: Partial<SkillCard>): SkillCard {
  return {
    id: over.slug ?? 'id', name: over.slug ?? 'name', slug: 'slug', description: '', scopeId: 'claude', scopeLabel: '.claude',
    kind: 'user', path: `/h/.claude/skills/${over.slug}`, skillRel: 'SKILL.md', file: false, link: false, linkTarget: '',
    origin: null, invocation: 'model', invocationEvidence: '', risk: 'none', physicality: 'physical', refTarget: '',
    refSkillId: '', copyCount: 0, copies: [], mtime: 0, quarantined: false, fromScope: '', skillSize: 4, tokenEstimate: 1,
    ...over,
  }
}

function fakeCatalog(): CatalogResponse {
  const skills = [
    card({ slug: 'alpha' }),
    card({ slug: 'bravo', scopeId: 'codex', scopeLabel: '.codex' }),
    card({ slug: 'broken', physicality: 'broken', risk: 'high' }),
    card({ slug: 'held', quarantined: true, scopeId: 'quarantine', scopeLabel: 'Quarantine', fromScope: 'codex', kind: 'quarantine' }),
  ]
  return {
    home: '/h', scannedAt: 1, quarantineRoot: '/h/.skill-cabinet/quarantine', total: 3,
    census: { total: 3, physical: 2, unique: 2, duplicateCopies: 0, duplicateBytes: 0, references: 0, broken: 1, duplicates: 0, tokenEstimate: 2 },
    scopes: [{ id: 'claude', label: '.claude', kind: 'user', count: 2 }, { id: 'codex', label: '.codex', kind: 'user', count: 1 }],
    skills,
  }
}

const Host = defineComponent({
  setup() {
    const c = useCatalog()
    return { c }
  },
  render() {
    return h('div')
  },
})

describe('useCatalog', () => {
  afterEach(() => {
    clearNuxtState()
    localStorage.clear()
  })

  it('derives visible cards from the route scope, the filters and the query', async () => {
    const wrapper = await mountSuspended(Host, { route: '/?scope=claude' })
    const c = wrapper.vm.c
    c.catalog.value = fakeCatalog()
    await nextTick()
    expect(c.scopeId.value).toBe('claude')
    expect(c.visible.value.map(s => s.slug)).toEqual(['alpha', 'broken'])
    expect(c.scopeCounts.value.get('claude')).toBe(2)
    expect(c.heldCount.value).toBe(1)

    c.filters.value = { ...DEFAULT_FILTERS, form: 'broken' }
    await nextTick()
    expect(c.visible.value.map(s => s.slug)).toEqual(['broken'])
    expect(c.scopeCounts.value.get('claude')).toBe(1)
    expect(JSON.parse(localStorage.getItem('shelfware-filters') ?? '{}').form).toBe('broken')

    c.filters.value = { ...DEFAULT_FILTERS }
    c.query.value = '  ALPHA '
    await nextTick()
    expect(c.visible.value.map(s => s.slug)).toEqual(['alpha'])
  })

  it('switches shelves through the URL and clears marks when crossing the quarantine shelf', async () => {
    const wrapper = await mountSuspended(Host, { route: '/' })
    const c = wrapper.vm.c
    c.catalog.value = fakeCatalog()
    await nextTick()
    expect(c.scopeId.value).toBe('all')
    expect(c.visible.value.map(s => s.slug)).toEqual(['alpha', 'bravo', 'broken'])

    c.toggleMark('alpha')
    c.toggleMark('bravo')
    expect(c.isMarked('alpha')).toBe(true)
    expect(c.markedOnShelf.value).toEqual(['alpha', 'bravo'])

    await c.setScope('codex')
    await nextTick()
    expect(c.visible.value.map(s => s.slug)).toEqual(['bravo'])
    expect(c.marked.value).toEqual(['alpha', 'bravo'])
    expect(c.markedOnShelf.value).toEqual(['bravo'])

    await c.setScope('quarantine')
    await nextTick()
    expect(c.inQuarantine.value).toBe(true)
    expect(c.visible.value.map(s => s.slug)).toEqual(['held'])
    expect(c.marked.value).toEqual([])

    c.markVisible()
    expect(c.marked.value).toEqual(['held'])
    c.clearMarks()
    expect(c.marked.value).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:unit -- api-error` → FAIL, module not found.
Run: `pnpm test:nuxt` → FAIL, `~/composables/useCatalog` not found.

- [ ] **Step 3: Write the API error mapper and the client**

`app/utils/api-error.ts`:

```ts
export class ApiError extends Error {
  readonly status: number
  readonly data: Record<string, unknown>

  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

/** Maps ofetch's FetchError (statusCode + parsed `data`) or anything else to ApiError. Never throws. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  const fe = (err && typeof err === 'object' ? err : {}) as { statusCode?: unknown, status?: unknown, data?: unknown, message?: unknown }
  const data = fe.data && typeof fe.data === 'object' && !Array.isArray(fe.data) ? (fe.data as Record<string, unknown>) : {}
  const status = typeof fe.statusCode === 'number' ? fe.statusCode : typeof fe.status === 'number' ? fe.status : 0
  const message = typeof data.error === 'string' && data.error
    ? data.error
    : typeof fe.message === 'string' && fe.message
      ? fe.message
      : 'Request failed'
  return new ApiError(message, status, data)
}
```

`app/composables/useApi.ts`:

```ts
import type { CatalogResponse, DeleteResult, FilePreview, QuarantineResult, RestoreResult, SkillDetail } from '#shared/types/catalog'
import { toApiError } from '~/utils/api-error'

interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT'
  body?: unknown
  query?: Record<string, string>
}

/** Spec §11.2: one `$fetch.create` with the session token; `{ error }` bodies become ApiError. */
export function useApi() {
  const config = useRuntimeConfig()
  const client = $fetch.create({
    headers: { 'X-Shelfware-Token': String(config.public.shelfwareToken ?? '') },
  })

  async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
    try {
      return await client<T>(path, options)
    } catch (err) {
      throw toApiError(err)
    }
  }

  return {
    catalog: (refresh = false) => call<CatalogResponse>(refresh ? '/api/skills?refresh=1' : '/api/skills'),
    skill: (id: string) => call<SkillDetail>(`/api/skills/${id}`),
    file: (id: string, rel: string) => call<FilePreview>(`/api/skills/${id}/file`, { query: { path: rel } }),
    save: (id: string, source: string, baseHash: string) =>
      call<SkillDetail>(`/api/skills/${id}`, { method: 'PUT', body: { source, baseHash } }),
    quarantine: (ids: string[]) => call<QuarantineResult>('/api/skills/quarantine', { method: 'POST', body: { ids } }),
    restore: (ids: string[]) => call<RestoreResult>('/api/skills/restore', { method: 'POST', body: { ids } }),
    remove: (ids: string[]) => call<DeleteResult>('/api/skills/delete', { method: 'POST', body: { ids } }),
  }
}

export type Api = ReturnType<typeof useApi>
```

- [ ] **Step 4: Write the small state composables**

`app/composables/useReaderTab.ts`:

```ts
export type ReaderTab = 'manuscript' | 'source' | 'edit' | 'folio'

/** The reader's active tab, shared so the `e` shortcut can switch it from the tray. */
export function useReaderTab() {
  return useState<ReaderTab>('reader-tab', () => 'manuscript')
}
```

`app/composables/useSlip.ts`:

```ts
import type { ShelfAction } from '~/utils/shelf-actions'

export interface SlipState {
  mode: ShelfAction
  ids: string[]
}

/** The action slip (spec §11.7): which action, for which ids. Null when closed. */
export function useSlip() {
  const slip = useState<SlipState | null>('slip', () => null)
  const open = computed(() => slip.value !== null)

  function openSlip(mode: ShelfAction, ids: string[]): void {
    if (!ids.length) return
    slip.value = { mode, ids: [...ids] }
  }

  function closeSlip(): void {
    slip.value = null
  }

  return { slip, open, openSlip, closeSlip }
}
```

- [ ] **Step 5: Write `useCatalog` and `useSkillDetail`**

`app/composables/useCatalog.ts`:

```ts
import { useLocalStorage } from '@vueuse/core'
import type { CatalogResponse, ScopeSummary, SkillCard } from '#shared/types/catalog'
import { DEFAULT_FILTERS, matchesFilters, matchesQuery, type Filters } from '~/utils/search'
import { crossingQuarantineShelf } from '~/utils/shelf-actions'

export const FILTERS_STORAGE_KEY = 'shelfware-filters'

/**
 * Spec §11.2. Catalog state on useState, scope in the URL query, filters in
 * localStorage. `visible` = shelf (live or quarantine) → scope → filters → query.
 */
export function useCatalog() {
  const api = useApi()
  const route = useRoute()
  const router = useRouter()

  const catalog = useState<CatalogResponse | null>('catalog', () => null)
  const loading = useState<boolean>('catalog-loading', () => false)
  const error = useState<string>('catalog-error', () => '')
  const query = useState<string>('catalog-query', () => '')
  const marked = useState<string[]>('catalog-marked', () => [])
  const filters = useLocalStorage<Filters>(FILTERS_STORAGE_KEY, { ...DEFAULT_FILTERS }, { mergeDefaults: true })

  const scopeId = computed(() => (typeof route.query.scope === 'string' && route.query.scope) || 'all')
  const inQuarantine = computed(() => scopeId.value === 'quarantine')
  const selectedId = computed(() => (typeof route.params.id === 'string' ? route.params.id : undefined))

  const skills = computed<SkillCard[]>(() => catalog.value?.skills ?? [])
  const live = computed(() => skills.value.filter(s => !s.quarantined))
  const held = computed(() => skills.value.filter(s => s.quarantined))
  const heldCount = computed(() => held.value.length)
  const scopes = computed<ScopeSummary[]>(() => catalog.value?.scopes ?? [])
  const selected = computed(() => skills.value.find(s => s.id === selectedId.value) ?? null)

  const filteredLive = computed(() => live.value.filter(s => matchesFilters(s, filters.value)))
  const visible = computed(() => {
    const q = query.value.trim().toLowerCase()
    const pool = inQuarantine.value ? held.value.filter(s => matchesFilters(s, filters.value)) : filteredLive.value
    return pool.filter((s) => {
      if (!inQuarantine.value && scopeId.value !== 'all' && s.scopeId !== scopeId.value) return false
      return matchesQuery(s, q)
    })
  })
  const visibleIds = computed(() => visible.value.map(s => s.id))

  /** Drawer counts follow the tray filters (DESIGN.md); the census does not. */
  const scopeCounts = computed(() => {
    const by = new Map<string, number>()
    for (const s of filteredLive.value) by.set(s.scopeId, (by.get(s.scopeId) ?? 0) + 1)
    return by
  })

  const markedOnShelf = computed(() => visibleIds.value.filter(id => marked.value.includes(id)))

  async function refresh(force = false): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      catalog.value = await api.catalog(force)
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      loading.value = false
    }
  }

  function setScope(id: string) {
    if (crossingQuarantineShelf(scopeId.value, id)) marked.value = []
    const nextQuery: Record<string, string> = {}
    for (const [key, value] of Object.entries(route.query)) {
      if (typeof value === 'string' && key !== 'scope') nextQuery[key] = value
    }
    if (id !== 'all') nextQuery.scope = id
    return router.push({ path: '/', query: nextQuery })
  }

  function select(id: string) {
    return router.push({ path: `/skills/${id}`, query: route.query })
  }

  function isMarked(id: string): boolean {
    return marked.value.includes(id)
  }

  function toggleMark(id: string): void {
    marked.value = isMarked(id) ? marked.value.filter(x => x !== id) : [...marked.value, id]
  }

  function markVisible(): void {
    marked.value = [...new Set([...marked.value, ...visibleIds.value])]
  }

  function clearMarks(): void {
    marked.value = []
  }

  return {
    catalog, loading, error, query, filters,
    scopeId, inQuarantine, selectedId, selected,
    skills, live, held, heldCount, scopes, visible, visibleIds, scopeCounts,
    marked, markedOnShelf,
    refresh, setScope, select, isMarked, toggleMark, markVisible, clearMarks,
  }
}
```

`app/composables/useSkillDetail.ts`:

```ts
import type { Ref } from 'vue'
import type { FilePreview, SkillDetail } from '#shared/types/catalog'

/** Spec §11.2: detail fetch, file preview, save and reload for one card id. */
export function useSkillDetail(id: Ref<string | undefined>) {
  const api = useApi()
  const detail = ref<SkillDetail | null>(null)
  const error = ref('')
  const loading = ref(false)
  const preview = ref<FilePreview | null>(null)
  const previewError = ref('')

  async function load(): Promise<void> {
    preview.value = null
    previewError.value = ''
    error.value = ''
    if (!id.value) {
      detail.value = null
      return
    }
    loading.value = true
    try {
      detail.value = await api.skill(id.value)
    } catch (err) {
      detail.value = null
      error.value = (err as Error).message
    } finally {
      loading.value = false
    }
  }

  async function openFile(rel: string): Promise<void> {
    if (!id.value) return
    previewError.value = ''
    try {
      preview.value = await api.file(id.value, rel)
    } catch (err) {
      preview.value = null
      previewError.value = (err as Error).message
    }
  }

  async function save(source: string, baseHash: string): Promise<SkillDetail> {
    if (!id.value) throw new Error('No card selected')
    const fresh = await api.save(id.value, source, baseHash)
    detail.value = fresh
    return fresh
  }

  async function reload(): Promise<SkillDetail | null> {
    await load()
    return detail.value
  }

  watch(id, load, { immediate: true })

  return { detail, error, loading, preview, previewError, load, openFile, save, reload }
}
```

- [ ] **Step 6: Write the pages**

`app/pages/index.vue` (the empty reader state; the layout around it arrives in Task 4):

```vue
<template>
  <div class="flex h-full items-center justify-center text-sm text-muted">
    <p>
      Select a card. <UKbd value="j" /> <UKbd value="k" /> move, <UKbd value="/" /> finds.
    </p>
  </div>
</template>
```

`app/pages/skills/[id].vue` (placeholder until Task 6 swaps in `SkillReader`):

```vue
<script setup lang="ts">
const route = useRoute()
const id = computed(() => String(route.params.id))
</script>

<template>
  <pre class="font-mono text-xs">{{ id }}</pre>
</template>
```

Also replace the placeholder `app/app.vue` from the server plan with a router-aware shell (Task 4 replaces it again with the dashboard):

```vue
<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test:unit -- api-error` → PASS, 3 tests.
Run: `pnpm test:nuxt` → PASS, 2 tests. If `scopeId` stays `all` under `route: '/?scope=claude'`, the pages directory was not picked up: confirm `app/pages/index.vue` exists and rerun `pnpm nuxt prepare`.

- [ ] **Step 8: Commit**

```bash
git add app/utils/api-error.ts app/composables app/pages app/app.vue test/unit/api-error.test.ts test/nuxt/use-catalog.test.ts
git commit -m "feat(app): add API client, catalog/detail/slip state composables and pages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Dashboard layout, drawers and the house census

**Files:**
- Modify: `app/app.vue`, `app/assets/css/main.css`
- Create: `app/components/DrawerRail.vue`, `app/components/CensusNote.vue`

**Interfaces:**
- Consumes: `useCatalog()` (Task 3); `formatBytes`, `formatTokens` (Task 1).
- Produces: the `UDashboardGroup` shell with sidebar id `drawers`, a placeholder tray panel id `tray` (replaced by `SkillTray` in Task 5), reader panel id `reader` rendering `NuxtPage`; `.prose` CSS used by the reader in Task 6.

- [ ] **Step 1: Write the prose CSS**

Append to `app/assets/css/main.css` (keep the two `@import` lines at the top):

```css
/* Spec §11.5: the rendered manuscript. Quiet, readable measure, no chrome. */
.prose {
  max-width: 68ch;
  line-height: 1.6;
  font-size: 0.95rem;
}
.prose > * + * {
  margin-top: 0.75em;
}
.prose h1, .prose h2, .prose h3, .prose h4 {
  font-weight: 600;
  line-height: 1.25;
  margin-top: 1.4em;
}
.prose h1 { font-size: 1.4rem; }
.prose h2 { font-size: 1.2rem; }
.prose h3 { font-size: 1.05rem; }
.prose ul, .prose ol {
  padding-inline-start: 1.5em;
}
.prose ul { list-style: disc; }
.prose ol { list-style: decimal; }
.prose li + li { margin-top: 0.25em; }
.prose blockquote {
  border-inline-start: 2px solid var(--ui-border);
  padding-inline-start: 1em;
  color: var(--ui-text-muted);
}
.prose code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.875em;
  background: var(--ui-bg-elevated);
  padding: 0.1em 0.3em;
  border-radius: 0.25rem;
}
.prose pre {
  background: var(--ui-bg-elevated);
  padding: 0.75rem;
  border-radius: 0.375rem;
  overflow-x: auto;
}
.prose pre code {
  background: none;
  padding: 0;
  font-size: 0.8125rem;
}
.prose table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875em;
}
.prose th, .prose td {
  border: 1px solid var(--ui-border);
  padding: 0.3em 0.6em;
  text-align: start;
  vertical-align: top;
}
.prose th { background: var(--ui-bg-elevated); }
.prose a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prose img { max-width: 100%; }
.prose hr {
  border: 0;
  border-top: 1px solid var(--ui-border);
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

`--ui-border`, `--ui-bg-elevated` and `--ui-text-muted` are Nuxt UI 4 design tokens, so the prose follows light/dark mode.

- [ ] **Step 2: Write the census note**

`app/components/CensusNote.vue` (the house-census rule: one cataloguing note, never a metrics row):

```vue
<script setup lang="ts">
const { catalog } = useCatalog()
const census = computed(() => catalog.value?.census ?? null)
</script>

<template>
  <p v-if="census" class="text-xs leading-5 text-muted" data-testid="census">
    <span class="font-medium text-highlighted">{{ census.total }}</span> cards in the house:
    {{ census.physical }} physical,
    {{ census.duplicateCopies }} copies wasting {{ formatBytes(census.duplicateBytes) }},
    {{ census.references }} references,
    {{ census.broken }} broken,
    {{ formatTokens(census.tokenEstimate) }} across the physical cards.
  </p>
  <p v-else class="text-xs text-muted">Counting the house…</p>
</template>
```

- [ ] **Step 3: Write the drawer rail**

`app/components/DrawerRail.vue`:

```vue
<script setup lang="ts">
const { scopes, scopeId, scopeCounts, setScope, heldCount } = useCatalog()

const drawers = computed(() => scopes.value.filter(s => s.id !== 'quarantine'))
const allCount = computed(() => [...scopeCounts.value.values()].reduce((sum, n) => sum + n, 0))

function variantFor(id: string) {
  return scopeId.value === id ? 'soft' : 'ghost'
}
</script>

<template>
  <nav class="flex flex-col gap-1" aria-label="Drawers">
    <UButton block color="neutral" :variant="variantFor('all')" class="justify-between" @click="setScope('all')">
      <span>All drawers</span>
      <span class="tabular-nums text-muted">{{ allCount }}</span>
    </UButton>
    <UButton
      v-for="scope in drawers"
      :key="scope.id"
      block
      color="neutral"
      :variant="variantFor(scope.id)"
      :title="scope.label"
      class="justify-between"
      @click="setScope(scope.id)"
    >
      <span class="truncate font-mono text-xs">{{ scope.label }}</span>
      <span class="tabular-nums text-muted">{{ scopeCounts.get(scope.id) ?? 0 }}</span>
    </UButton>
  </nav>

  <CensusNote class="mt-4" />

  <div class="mt-auto border-t border-default pt-3">
    <UButton block color="neutral" :variant="variantFor('quarantine')" class="justify-between" @click="setScope('quarantine')">
      <span>Quarantine</span>
      <span class="tabular-nums text-muted">{{ heldCount }}</span>
    </UButton>
  </div>
</template>
```

- [ ] **Step 4: Write the shell**

Replace `app/app.vue` with:

```vue
<script setup lang="ts">
const { refresh } = useCatalog()

onMounted(() => {
  refresh()
})
</script>

<template>
  <UApp>
    <UDashboardGroup>
      <UDashboardSidebar id="drawers" resizable collapsible :default-size="18" :min-size="14" :max-size="30">
        <template #header>
          <span class="font-semibold tracking-tight">shelfware</span>
          <UColorModeButton class="ms-auto" />
        </template>
        <DrawerRail />
      </UDashboardSidebar>

      <UDashboardPanel id="tray" resizable :default-size="34" :min-size="24" :max-size="50">
        <template #body>
          <p class="text-sm text-muted">The tray arrives in Task 5.</p>
        </template>
      </UDashboardPanel>

      <UDashboardPanel id="reader">
        <template #body>
          <NuxtPage />
        </template>
      </UDashboardPanel>
    </UDashboardGroup>
  </UApp>
</template>
```

- [ ] **Step 5: Build and look at it**

Run: `pnpm build`
Expected: builds without errors (unresolved-component warnings are not acceptable; `DrawerRail`, `CensusNote`, `UColorModeButton` must all resolve).

Run: `NUXT_PUBLIC_SHELFWARE_TOKEN=sw_dev pnpm dev` and open `http://localhost:3000/`. Expected: the sidebar lists every drawer of your real home with counts, the census sentence appears under them, the Quarantine shelf sits at the bottom, the colour-mode button toggles the theme, clicking a drawer changes `?scope=` in the URL. Stop the dev server.

Run: `pnpm test:nuxt` → still PASS (the layout does not affect the composable test).

- [ ] **Step 6: Commit**

```bash
git add app/app.vue app/assets/css/main.css app/components/DrawerRail.vue app/components/CensusNote.vue
git commit -m "feat(app): dashboard shell with drawer rail, census note and colour mode

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The tray — search, filters, bulk bar, cards

**Files:**
- Create: `app/components/SkillTray.vue`, `app/components/SkillCard.vue`
- Modify: `app/app.vue` (replace the placeholder tray panel with `<SkillTray />`)

**Interfaces:**
- Consumes: `useCatalog()`, `useSlip()` (Task 3); `FORM_OPTIONS`, `RISK_OPTIONS`, `INVOCATION_OPTIONS` (Task 2); `kindStamp`, `formatTokens` (Task 1).
- Produces: `SkillTray` (renders its own `UDashboardPanel id="tray"`; exposes `focusSearch()`), `SkillCard` (`props: { card: SkillCard; selected: boolean; marked: boolean }`, emits `select`, `toggle`; root `<li :data-id="card.id">` which the keyboard composable scrolls to). Task 8 adds the `useShelfKeys` call inside `SkillTray`.

- [ ] **Step 1: Write the card**

`app/components/SkillCard.vue`:

```vue
<script setup lang="ts">
import type { SkillCard as Card } from '#shared/types/catalog'

const props = defineProps<{
  card: Card
  selected: boolean
  marked: boolean
}>()

const emit = defineEmits<{
  select: []
  toggle: []
}>()

const form = computed(() => {
  if (props.card.physicality === 'broken') return 'broken'
  if (props.card.link) return 'link'
  if (props.card.file) return 'file'
  return ''
})

/** The two-signal rule: the word "risk" always travels with the colour. */
const RISK_CLASS: Record<Card['risk'], string> = {
  none: 'text-muted',
  low: 'text-info',
  medium: 'text-warning',
  high: 'text-error',
  critical: 'text-error font-semibold',
}
</script>

<template>
  <li
    :data-id="card.id"
    :class="[
      'rounded-md border px-3 py-2 text-sm',
      selected ? 'border-default bg-elevated' : 'border-transparent hover:bg-muted',
    ]"
  >
    <div class="flex items-start gap-2">
      <UCheckbox
        :model-value="marked"
        size="sm"
        class="mt-0.5"
        :aria-label="`Mark ${card.name}`"
        @update:model-value="emit('toggle')"
      />
      <button type="button" class="min-w-0 flex-1 text-start" @click="emit('select')">
        <div class="flex items-baseline gap-2">
          <span class="truncate font-medium text-highlighted">{{ card.name }}</span>
          <span class="truncate font-mono text-xs text-dimmed" :title="card.path">{{ card.scopeLabel }}</span>
        </div>
        <p v-if="card.description" class="line-clamp-2 text-xs text-muted">{{ card.description }}</p>
        <div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] uppercase tracking-wide text-dimmed">
          <span>{{ kindStamp(card.kind) }}</span>
          <span v-if="form">{{ form }}</span>
          <span v-if="card.origin" :title="`${card.origin.url} · ${card.origin.certainty} via ${card.origin.via}`">
            {{ card.origin.label }} · {{ card.origin.certainty }}
          </span>
          <span v-if="card.copyCount" :title="`${card.copyCount + 1} identical cards`">×{{ card.copyCount + 1 }}</span>
          <span v-if="card.risk !== 'none'" :class="RISK_CLASS[card.risk]">risk {{ card.risk }}</span>
          <span :title="card.invocationEvidence">{{ card.invocation }}</span>
          <span class="normal-case tabular-nums">{{ formatTokens(card.tokenEstimate) }}</span>
        </div>
      </button>
    </div>
  </li>
</template>
```

- [ ] **Step 2: Write the tray**

`app/components/SkillTray.vue`:

```vue
<script setup lang="ts">
import { FORM_OPTIONS, INVOCATION_OPTIONS, RISK_OPTIONS } from '~/utils/search'

const catalog = useCatalog()
const { query, filters, visible, inQuarantine, markedOnShelf, loading, error, selectedId } = catalog
const { openSlip } = useSlip()

const searchRef = ref<{ inputRef: HTMLInputElement | null } | null>(null)

const allMarked = computed(() => visible.value.length > 0 && markedOnShelf.value.length === visible.value.length)
const someMarked = computed(() => markedOnShelf.value.length > 0 && !allMarked.value)
const markAll = computed<boolean | 'indeterminate'>({
  get: () => (allMarked.value ? true : someMarked.value ? 'indeterminate' : false),
  set: (value) => {
    if (value === true) catalog.markVisible()
    else catalog.clearMarks()
  },
})

/** Spec §11.7: the actions apply to the marked cards, or to the selected card when nothing is marked. */
const targetIds = computed(() => {
  if (markedOnShelf.value.length) return markedOnShelf.value
  return selectedId.value ? [selectedId.value] : []
})

const emptyText = computed(() => {
  if (inQuarantine.value && !query.value) return 'The quarantine shelf is empty.'
  return `No cards in this drawer${query.value ? ' match the search.' : '.'}`
})

function focusSearch(): void {
  searchRef.value?.inputRef?.focus()
}

defineExpose({ focusSearch })
</script>

<template>
  <UDashboardPanel id="tray" resizable :default-size="34" :min-size="24" :max-size="50">
    <template #header>
      <div class="flex flex-col gap-2 border-b border-default p-3">
        <UInput
          ref="searchRef"
          v-model="query"
          name="search"
          placeholder="Find a card"
          icon="i-lucide-search"
          class="w-full"
        >
          <template #trailing>
            <UKbd value="/" />
          </template>
        </UInput>

        <div class="grid grid-cols-3 gap-2">
          <USelect v-model="filters.form" :items="FORM_OPTIONS" size="sm" aria-label="Form" />
          <USelect v-model="filters.risk" :items="RISK_OPTIONS" size="sm" aria-label="Risk" />
          <USelect v-model="filters.invocation" :items="INVOCATION_OPTIONS" size="sm" aria-label="Invocation" />
        </div>

        <div class="flex items-center gap-2 text-xs">
          <UCheckbox v-model="markAll" :disabled="!visible.length" aria-label="Mark all visible cards" />
          <span class="text-muted">{{ markedOnShelf.length }} marked · {{ visible.length }} shown</span>
          <div class="ms-auto flex gap-1">
            <UButton
              v-if="!inQuarantine"
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="!targetIds.length"
              @click="openSlip('quarantine', targetIds)"
            >
              Quarantine
            </UButton>
            <template v-else>
              <UButton size="xs" color="neutral" variant="outline" :disabled="!targetIds.length" @click="openSlip('restore', targetIds)">
                Restore
              </UButton>
              <UButton size="xs" color="error" :disabled="!targetIds.length" @click="openSlip('delete', targetIds)">
                Delete
              </UButton>
            </template>
          </div>
        </div>
      </div>
    </template>

    <template #body>
      <p v-if="error" class="text-sm text-error">{{ error }}</p>
      <p v-else-if="loading && !visible.length" class="text-sm text-muted">Scanning the drawers…</p>
      <p v-else-if="!visible.length" class="text-sm text-muted">{{ emptyText }}</p>
      <ul v-else class="flex flex-col gap-1" role="list">
        <SkillCard
          v-for="card in visible"
          :key="card.id"
          :card="card"
          :selected="card.id === selectedId"
          :marked="catalog.isMarked(card.id)"
          @select="catalog.select(card.id)"
          @toggle="catalog.toggleMark(card.id)"
        />
      </ul>
    </template>

    <template #footer>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-default p-3 text-xs text-muted">
        <span><UKbd value="j" /> <UKbd value="k" /> move</span>
        <span><UKbd value="x" /> mark</span>
        <span><UKbd value="q" /> quarantine</span>
        <span><UKbd value="r" /> restore</span>
        <span><UKbd value="d" /> delete</span>
        <span><UKbd value="e" /> edit</span>
        <span><UKbd value="/" /> find</span>
      </div>
    </template>
  </UDashboardPanel>
</template>
```

- [ ] **Step 3: Mount the tray in the shell**

In `app/app.vue`, replace the whole placeholder block

```vue
      <UDashboardPanel id="tray" resizable :default-size="34" :min-size="24" :max-size="50">
        <template #body>
          <p class="text-sm text-muted">The tray arrives in Task 5.</p>
        </template>
      </UDashboardPanel>
```

with

```vue
      <SkillTray />
```

- [ ] **Step 4: Build and look at it**

Run: `pnpm build` → no errors, no unresolved components.

Run: `NUXT_PUBLIC_SHELFWARE_TOKEN=sw_dev pnpm dev`, open the app. Expected: cards list with stamps in the middle panel; typing in the search narrows the list; the three selects narrow it and survive a reload (localStorage); the mark-all checkbox goes indeterminate when some cards are marked; clicking a card navigates to `/skills/<id>` keeping `?scope`; on the Quarantine shelf the buttons read Restore and Delete (Delete red). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add app/components/SkillTray.vue app/components/SkillCard.vue app/app.vue
git commit -m "feat(app): tray with search, persisted filters, bulk bar and index cards

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The reader — cataloguing header, Manuscript, Source, Folio

**Files:**
- Create: `app/components/SkillReader.vue`, `app/components/FolioTree.vue`
- Modify: `app/pages/skills/[id].vue` (render `SkillReader`)

**Interfaces:**
- Consumes: `useSkillDetail`, `useReaderTab`, `useSlip`, `useCatalog` (Task 3); `renderMarkdown`, `formatBytes`, `formatTokens`, `formatWhen`, `kindStamp` (Task 1).
- Produces: `SkillReader` (`props: { id: string }`), `FolioTree` (`props: { files: SkillFileEntry[]; preview: FilePreview | null; previewError: string }`, emits `open(rel)`). The `#edit` tab slot holds a placeholder that Task 9 replaces with `SkillEditor`.

- [ ] **Step 1: Write the folio**

`app/components/FolioTree.vue`:

```vue
<script setup lang="ts">
import type { FilePreview, SkillFileEntry } from '#shared/types/catalog'

defineProps<{
  files: SkillFileEntry[]
  preview: FilePreview | null
  previewError: string
}>()

const emit = defineEmits<{
  open: [rel: string]
}>()
</script>

<template>
  <div class="grid gap-4 md:grid-cols-[minmax(12rem,1fr)_2fr]">
    <ul class="flex flex-col gap-0.5 text-sm" role="list">
      <li v-for="file in files" :key="file.path">
        <button
          type="button"
          :class="['flex w-full justify-between gap-2 rounded px-1 py-0.5 text-start hover:bg-muted', preview?.path === file.path ? 'bg-elevated' : '']"
          @click="emit('open', file.path)"
        >
          <span class="break-all font-mono">{{ file.path }}</span>
          <span class="shrink-0 tabular-nums text-muted">{{ formatBytes(file.size) }}</span>
        </button>
      </li>
      <li v-if="!files.length" class="text-muted">No files.</li>
    </ul>

    <div class="min-w-0">
      <p v-if="previewError" class="text-sm text-error">{{ previewError }}</p>
      <p v-else-if="!preview" class="text-sm text-muted">Choose a file to preview it.</p>
      <p v-else-if="preview.binary" class="text-sm text-muted">
        <span class="font-mono">{{ preview.path }}</span> · {{ formatBytes(preview.size) }} · not a text preview
      </p>
      <template v-else>
        <p class="mb-1 text-xs text-muted">
          <span class="font-mono">{{ preview.path }}</span> · {{ formatBytes(preview.size) }}
        </p>
        <pre class="whitespace-pre-wrap break-all font-mono text-xs">{{ preview.content }}</pre>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Write the reader**

`app/components/SkillReader.vue`:

```vue
<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'
import type { SkillDetail } from '#shared/types/catalog'

const props = defineProps<{ id: string }>()

const idRef = toRef(props, 'id')
const { detail, error, loading, preview, previewError, openFile, save, reload } = useSkillDetail(idRef)
const tab = useReaderTab()
const { openSlip } = useSlip()
const { refresh } = useCatalog()
const route = useRoute()

const items: TabsItem[] = [
  { label: 'Manuscript', value: 'manuscript', slot: 'manuscript' },
  { label: 'Source', value: 'source', slot: 'source' },
  { label: 'Edit', value: 'edit', slot: 'edit' },
  { label: 'Folio', value: 'folio', slot: 'folio' },
]

const RISK_CLASS: Record<SkillDetail['risk'], string> = {
  none: 'text-muted',
  low: 'text-info',
  medium: 'text-warning',
  high: 'text-error',
  critical: 'text-error font-semibold',
}

/** Spec §11.5: broken cards never reach the renderer. */
const rendered = computed(() => {
  if (!detail.value || detail.value.physicality === 'broken') return ''
  return renderMarkdown(detail.value.body || '*This skill has no body after the frontmatter.*')
})

async function onSaved(): Promise<void> {
  await refresh()
}
</script>

<template>
  <p v-if="error" class="text-sm text-error">{{ error }}</p>
  <p v-else-if="!detail" class="text-sm text-muted">{{ loading ? 'Reading the card…' : 'No card.' }}</p>
  <article v-else class="flex max-w-3xl flex-col gap-4">
    <header class="flex flex-col gap-3">
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="text-xl font-semibold text-highlighted">{{ detail.name }}</h1>
          <p v-if="detail.description" class="text-muted">{{ detail.description }}</p>
        </div>
        <div class="flex shrink-0 gap-1">
          <UButton v-if="!detail.quarantined" color="neutral" variant="outline" size="sm" @click="openSlip('quarantine', [detail.id])">
            Quarantine
          </UButton>
          <template v-else>
            <UButton color="neutral" variant="outline" size="sm" @click="openSlip('restore', [detail.id])">Restore</UButton>
            <UButton color="error" size="sm" @click="openSlip('delete', [detail.id])">Delete</UButton>
          </template>
        </div>
      </div>

      <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-muted">Path</dt>
        <dd class="break-all font-mono">{{ detail.path }}</dd>

        <dt class="text-muted">Drawer</dt>
        <dd>{{ detail.scopeLabel }} · {{ kindStamp(detail.kind) }}</dd>

        <dt class="text-muted">Form</dt>
        <dd>
          {{ detail.physicality }}
          <span v-if="detail.link"> · link → <span class="break-all font-mono">{{ detail.linkTarget }}</span></span>
          <span v-if="detail.file"> · single file</span>
        </dd>

        <template v-if="detail.origin">
          <dt class="text-muted">Origin</dt>
          <dd>
            <a :href="detail.origin.url" target="_blank" rel="noopener noreferrer" class="underline">{{ detail.origin.label }}</a>
            · {{ detail.origin.certainty }} via {{ detail.origin.via }}
            <span v-if="detail.origin.certainty === 'inferred'" class="text-muted">— taken from a parent plugin or git remote; it may name the wrapper rather than this skill's own repository</span>
          </dd>
        </template>

        <dt class="text-muted">Invocation</dt>
        <dd>{{ detail.invocation }} <span class="text-muted">— {{ detail.invocationEvidence }}</span></dd>

        <dt class="text-muted">Size</dt>
        <dd class="tabular-nums">
          {{ formatBytes(detail.skillSize) }} · {{ formatTokens(detail.tokenEstimate) }} · {{ formatBytes(detail.bytes) }} on disk · {{ formatWhen(detail.mtime) }}
        </dd>

        <dt class="text-muted">Risk</dt>
        <dd :class="RISK_CLASS[detail.risk]">risk {{ detail.risk }}</dd>

        <template v-if="detail.findings.length">
          <dt class="text-muted">Findings</dt>
          <dd>
            <ul class="flex flex-col gap-0.5">
              <li v-for="f in detail.findings" :key="`${f.file}:${f.line}:${f.rule}`" class="font-mono text-xs">
                {{ f.rule }} · {{ f.file }}:{{ f.line }} — {{ f.message }}
                <span :class="RISK_CLASS[f.severity]">{{ f.severity }}</span>
              </li>
            </ul>
            <p class="text-xs text-muted">Static audit evidence, not a score.</p>
          </dd>
        </template>

        <template v-if="detail.copies.length">
          <dt class="text-muted">Copies</dt>
          <dd>
            <ul class="flex flex-col gap-0.5">
              <li v-for="copy in detail.copies" :key="copy.id">
                <NuxtLink :to="{ path: `/skills/${copy.id}`, query: route.query }" class="underline">{{ copy.scopeLabel }}</NuxtLink>
                <span class="break-all font-mono text-xs text-muted"> {{ copy.path }}</span>
              </li>
            </ul>
          </dd>
        </template>

        <template v-if="detail.quarantined">
          <dt class="text-muted">Quarantined</dt>
          <dd>
            from <span class="break-all font-mono">{{ detail.quarantinedFrom ?? 'an unknown drawer' }}</span>
            · {{ formatWhen(detail.quarantinedAt ?? 0) }}
          </dd>
        </template>
      </dl>
    </header>

    <UTabs v-model="tab" :items="items" color="neutral" variant="link" :unmount-on-hide="false" class="w-full">
      <template #manuscript>
        <p v-if="detail.physicality === 'broken'" class="text-sm text-muted">The link target is gone; there is nothing to read.</p>
        <!-- eslint-disable-next-line vue/no-v-html -- markdown-it with html:false; see spec §11.5 -->
        <div v-else class="prose" v-html="rendered" />
      </template>

      <template #source>
        <pre class="whitespace-pre-wrap break-all font-mono text-xs">{{ detail.source }}</pre>
      </template>

      <template #edit>
        <p class="text-sm text-muted">The editor arrives in Task 9.</p>
      </template>

      <template #folio>
        <FolioTree :files="detail.files" :preview="preview" :preview-error="previewError" @open="openFile" />
      </template>
    </UTabs>
  </article>
</template>
```

`save`, `reload` and `onSaved` are unused until Task 9 wires the editor; keep them so the diff there is one line.

- [ ] **Step 3: Render the reader from the page**

Replace `app/pages/skills/[id].vue` with:

```vue
<script setup lang="ts">
const route = useRoute()
const id = computed(() => String(route.params.id))
</script>

<template>
  <SkillReader :id="id" :key="id" />
</template>
```

- [ ] **Step 4: Build and look at it**

Run: `pnpm build` → no errors.

Run: `NUXT_PUBLIC_SHELFWARE_TOKEN=sw_dev pnpm dev`, open a card. Expected: the header lists path (mono, wrapping), drawer, form, origin with certainty, invocation with evidence, size and tokens, risk word coloured, findings labelled as evidence, copies as links; Manuscript renders the body (headings, lists, tables); a skill with an empty body shows the italic note; Source shows the raw file; Folio lists files with sizes, clicking previews text and a binary says "not a text preview"; a broken card shows the gone-target note and no renderer output. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add app/components/SkillReader.vue app/components/FolioTree.vue "app/pages/skills/[id].vue"
git commit -m "feat(app): reader with cataloguing header, manuscript, source and folio tabs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The action slip

**Files:**
- Create: `app/components/ActionSlip.vue`
- Modify: `app/app.vue` (mount `<ActionSlip />` after `UDashboardGroup`)

**Interfaces:**
- Consumes: `useSlip`, `useCatalog`, `useApi` (Task 3); `idsForShelfAction` (Task 2); `deleteEffect` from `shared/utils/delete-effect.ts` (auto-imported); Nuxt UI `UModal`, `useToast`.
- Produces: the modal of spec §11.7. Confirm runs the batch, toasts counts and per-card errors, refreshes the catalog, clears marks, closes; if the selected card vanished it navigates to `/`.

- [ ] **Step 1: Write the slip**

`app/components/ActionSlip.vue`:

```vue
<script setup lang="ts">
import type { BatchError } from '#shared/types/catalog'
import { idsForShelfAction, type ShelfAction } from '~/utils/shelf-actions'

const { slip, open, closeSlip } = useSlip()
const { skills, catalog, selectedId, clearMarks, refresh } = useCatalog()
const api = useApi()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const busy = ref(false)
const mode = computed<ShelfAction>(() => slip.value?.mode ?? 'quarantine')
const quarantineRoot = computed(() => catalog.value?.quarantineRoot ?? '~/.skill-cabinet/quarantine')

/** Only the cards this action may touch (upstream shelf-actions rule). */
const cards = computed(() => {
  if (!slip.value) return []
  const byId = new Map(skills.value.map(s => [s.id, s]))
  return idsForShelfAction(slip.value.ids, skills.value, slip.value.mode)
    .map(id => byId.get(id))
    .filter((card): card is NonNullable<typeof card> => Boolean(card))
})

const unlinkCount = computed(() => (mode.value === 'delete' ? cards.value.filter(c => c.link).length : 0))
const managedCount = computed(() =>
  mode.value === 'restore' ? 0 : cards.value.filter(c => c.kind === 'plugin' || c.kind === 'builtin').length,
)

function plural(n: number): string {
  return `${n} card${n === 1 ? '' : 's'}`
}

interface SlipCopy {
  heading: (n: number) => string
  note: (where: string) => string
  button: string
  busy: string
  done: (n: number) => string
  none: string
}

/** Upstream App.jsx ACTIONS copy, verbatim. */
const COPY: Record<ShelfAction, SlipCopy> = {
  delete: {
    heading: n => `Delete ${plural(n)} from disk`,
    note: () => 'There is no undo. Each card names its filesystem effect below.',
    button: 'Delete',
    busy: 'Deleting…',
    done: n => `Deleted ${plural(n)} from disk.`,
    none: 'Nothing was deleted.',
  },
  quarantine: {
    heading: n => `Quarantine ${plural(n)} out of the drawers`,
    note: where => `The cards move to ${where}. No agent reads that folder. Restore puts them back where they came from.`,
    button: 'Quarantine',
    busy: 'Quarantining…',
    done: n => `Quarantined ${plural(n)}.`,
    none: 'Nothing was quarantined.',
  },
  restore: {
    heading: n => `Restore ${plural(n)} to their drawers`,
    note: () => 'Each card goes back to the path it was filed from. A card whose path is already taken stays in the quarantine.',
    button: 'Restore',
    busy: 'Restoring…',
    done: n => `Restored ${plural(n)}.`,
    none: 'Nothing was restored.',
  },
}
const copy = computed(() => COPY[mode.value])

const openModel = computed({
  get: () => open.value,
  set: (value: boolean) => {
    if (!value && !busy.value) closeSlip()
  },
})

async function confirm(): Promise<void> {
  if (!slip.value || !cards.value.length || busy.value) return
  busy.value = true
  const ids = cards.value.map(c => c.id)
  try {
    let done = 0
    let errors: BatchError[] = []
    if (mode.value === 'delete') {
      const result = await api.remove(ids)
      done = result.deleted.length
      errors = result.errors
    } else if (mode.value === 'restore') {
      const result = await api.restore(ids)
      done = result.restored.length
      errors = result.errors
    } else {
      const result = await api.quarantine(ids)
      done = result.quarantined.length
      errors = result.errors
    }
    toast.add({ title: done ? copy.value.done(done) : copy.value.none, color: done ? 'success' : 'neutral' })
    for (const err of errors) {
      toast.add({ title: err.error, description: err.path, color: 'error', duration: 0 })
    }
    clearMarks()
    await refresh()
    if (selectedId.value && !skills.value.some(s => s.id === selectedId.value)) {
      await router.push({ path: '/', query: route.query })
    }
    closeSlip()
  } catch (err) {
    toast.add({ title: (err as Error).message, color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal v-model:open="openModel" :title="slip ? copy.heading(cards.length) : ''" :dismissible="!busy">
    <template #body>
      <p class="text-sm text-muted">{{ copy.note(quarantineRoot) }}</p>
      <p v-if="unlinkCount" class="mt-2 text-sm text-warning">Unlink removes the link only. The target stays.</p>
      <p v-if="managedCount" class="mt-2 text-sm text-warning">
        {{ managedCount }} of these live in a plugin cache or builtin drawer and may return the next time that tool updates.
      </p>

      <ol class="mt-3 flex flex-col gap-2 text-sm">
        <li v-for="card in cards" :key="card.id">
          <div class="font-medium text-highlighted">
            {{ card.name }} <span class="font-normal text-muted">· {{ card.scopeLabel }}</span>
          </div>
          <div class="break-all font-mono text-xs text-muted">{{ card.path }}</div>
          <div v-if="mode === 'delete'" class="text-xs">
            <span class="text-error">{{ deleteEffect(card).label }}</span>
            <span v-if="deleteEffect(card).note" class="text-muted"> · {{ deleteEffect(card).note }}</span>
          </div>
        </li>
      </ol>
      <p v-if="!cards.length" class="mt-3 text-sm text-muted">No card on this shelf can take that action.</p>
    </template>

    <template #footer>
      <UButton color="neutral" variant="ghost" :disabled="busy" @click="closeSlip()">Cancel</UButton>
      <UButton
        :color="mode === 'delete' ? 'error' : 'neutral'"
        :variant="mode === 'delete' ? 'solid' : 'outline'"
        :loading="busy"
        :disabled="!cards.length"
        @click="confirm"
      >
        {{ busy ? copy.busy : copy.button }}
      </UButton>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Mount it**

In `app/app.vue`, add `<ActionSlip />` as the last child of `<UApp>`, right after `</UDashboardGroup>`.

- [ ] **Step 3: Build and exercise it against a scratch home**

Run: `pnpm build` → no errors.

Run with a throwaway home so nothing real moves: `HOME=$(mktemp -d) NUXT_PUBLIC_SHELFWARE_TOKEN=sw_dev pnpm dev`, then in another shell create `$HOME/.claude/skills/scratch/SKILL.md` (use the same `$HOME`) and reload. Expected: Quarantine on the card opens the slip with the note naming the quarantine root; Confirm toasts "Quarantined 1 card.", the card appears on the Quarantine shelf; Restore puts it back; Delete on the shelf is red, names "Delete folder", and removes it; a card that cannot take the action never appears in the slip. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add app/components/ActionSlip.vue app/app.vue
git commit -m "feat(app): action slip with filesystem effects for quarantine, restore and delete

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Keyboard navigation

**Files:**
- Create: `app/composables/useShelfKeys.ts`
- Modify: `app/components/SkillTray.vue` (register the keys)
- Test: `test/nuxt/use-shelf-keys.test.ts`

**Interfaces:**
- Consumes: `nextSelection`, `ShelfAction` (Task 2); Nuxt UI `defineShortcuts`.
- Produces: `useShelfKeys(options: ShelfKeyOptions): { move(delta: number): void }` where `ShelfKeyOptions = { visibleIds: Ref<string[]>; selectedId: Ref<string | undefined>; inQuarantine: Ref<boolean>; slipOpen: Ref<boolean>; select(id): void; toggleMark(id): void; openSlip(mode: ShelfAction): void; closeSlip(): void; focusSearch(): void; openEditor(): void }`.

- [ ] **Step 1: Write the failing component test**

`test/nuxt/use-shelf-keys.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useShelfKeys } from '~/composables/useShelfKeys'

function press(key: string, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

async function mountKeys(over: Partial<{ selectedId: string | undefined, inQuarantine: boolean, slipOpen: boolean }> = {}) {
  const spies = {
    select: vi.fn(),
    toggleMark: vi.fn(),
    openSlip: vi.fn(),
    closeSlip: vi.fn(),
    focusSearch: vi.fn(),
    openEditor: vi.fn(),
  }
  const state = {
    visibleIds: ref(['a', 'b', 'c']),
    selectedId: ref<string | undefined>('selectedId' in over ? over.selectedId : 'b'),
    inQuarantine: ref(over.inQuarantine ?? false),
    slipOpen: ref(over.slipOpen ?? false),
  }
  const Host = defineComponent({
    setup() {
      useShelfKeys({ ...state, ...spies })
      return () => h('div', [h('input', { id: 'search', name: 'search' })])
    },
  })
  const wrapper = await mountSuspended(Host, { attachTo: document.body })
  return { wrapper, spies, state }
}

describe('useShelfKeys', () => {
  const wrappers: { unmount(): void }[] = []
  afterEach(() => {
    for (const w of wrappers.splice(0)) w.unmount()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  })

  it('j and k move the selection and clamp at the ends', async () => {
    const { wrapper, spies, state } = await mountKeys()
    wrappers.push(wrapper)
    press('j')
    expect(spies.select).toHaveBeenLastCalledWith('c')
    state.selectedId.value = 'c'
    press('j')
    expect(spies.select).toHaveBeenLastCalledWith('c')
    state.selectedId.value = 'a'
    press('k')
    expect(spies.select).toHaveBeenLastCalledWith('a')
    expect(spies.select).toHaveBeenCalledTimes(3)
  })

  it('x toggles the mark on the selected card only', async () => {
    const { wrapper, spies, state } = await mountKeys()
    wrappers.push(wrapper)
    press('x')
    expect(spies.toggleMark).toHaveBeenCalledWith('b')
    state.selectedId.value = undefined
    press('x')
    expect(spies.toggleMark).toHaveBeenCalledTimes(1)
  })

  it('does nothing while an input is focused, except escape which blurs it', async () => {
    const { wrapper, spies } = await mountKeys()
    wrappers.push(wrapper)
    const input = wrapper.find('input').element as HTMLInputElement
    input.focus()
    expect(document.activeElement).toBe(input)
    press('j', input)
    press('x', input)
    press('q', input)
    expect(spies.select).not.toHaveBeenCalled()
    expect(spies.toggleMark).not.toHaveBeenCalled()
    expect(spies.openSlip).not.toHaveBeenCalled()
    press('Escape', input)
    expect(document.activeElement).not.toBe(input)
  })

  it('q opens the quarantine slip on live shelves only; r and d only on the quarantine shelf', async () => {
    const live = await mountKeys({ inQuarantine: false })
    wrappers.push(live.wrapper)
    press('q')
    press('r')
    press('d')
    expect(live.spies.openSlip).toHaveBeenCalledTimes(1)
    expect(live.spies.openSlip).toHaveBeenCalledWith('quarantine')
    live.wrapper.unmount()
    wrappers.pop()

    const held = await mountKeys({ inQuarantine: true })
    wrappers.push(held.wrapper)
    press('q')
    press('r')
    press('d')
    expect(held.spies.openSlip.mock.calls).toEqual([['restore'], ['delete']])
  })

  it('escape closes an open slip and slip keys are inert while it is open', async () => {
    const { wrapper, spies } = await mountKeys({ slipOpen: true })
    wrappers.push(wrapper)
    press('q')
    expect(spies.openSlip).not.toHaveBeenCalled()
    press('Escape')
    expect(spies.closeSlip).toHaveBeenCalledTimes(1)
  })

  it('/ focuses the search and e opens the editor', async () => {
    const { wrapper, spies } = await mountKeys()
    wrappers.push(wrapper)
    press('/')
    expect(spies.focusSearch).toHaveBeenCalledTimes(1)
    press('e')
    expect(spies.openEditor).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:nuxt -- use-shelf-keys`
Expected: FAIL, `~/composables/useShelfKeys` not found.

- [ ] **Step 3: Write the composable**

`app/composables/useShelfKeys.ts`:

```ts
import type { Ref } from 'vue'
import { nextSelection, type ShelfAction } from '~/utils/shelf-actions'

export interface ShelfKeyOptions {
  visibleIds: Ref<string[]>
  selectedId: Ref<string | undefined>
  inQuarantine: Ref<boolean>
  slipOpen: Ref<boolean>
  select: (id: string) => void
  toggleMark: (id: string) => void
  openSlip: (mode: ShelfAction) => void
  closeSlip: () => void
  focusSearch: () => void
  openEditor: () => void
}

/**
 * Spec §11.8 on Nuxt UI defineShortcuts: shortcuts skip inputs unless
 * `usingInput`, `meta` becomes `ctrl` off macOS, and a `false` entry in the
 * reactive config disables that key (q on the quarantine shelf, r/d on live
 * shelves, all three while the slip is open).
 */
export function useShelfKeys(options: ShelfKeyOptions) {
  function move(delta: number): void {
    const next = nextSelection(options.visibleIds.value, options.selectedId.value, delta)
    if (!next) return
    options.select(next)
    nextTick(() => {
      const el = document.querySelector<HTMLElement>(`[data-id="${next}"]`)
      el?.scrollIntoView?.({ block: 'nearest' })
    })
  }

  function blurActive(): void {
    const active = document.activeElement as HTMLElement | null
    active?.blur?.()
  }

  defineShortcuts(computed(() => {
    const slipOpen = options.slipOpen.value
    const held = options.inQuarantine.value
    return {
      '/': () => options.focusSearch(),
      'j': () => move(1),
      'k': () => move(-1),
      'x': () => {
        if (options.selectedId.value) options.toggleMark(options.selectedId.value)
      },
      'q': slipOpen || held ? false : () => options.openSlip('quarantine'),
      'r': slipOpen || !held ? false : () => options.openSlip('restore'),
      'd': slipOpen || !held ? false : () => options.openSlip('delete'),
      'e': () => options.openEditor(),
      'escape': {
        usingInput: true,
        handler: () => {
          if (options.slipOpen.value) options.closeSlip()
          else blurActive()
        },
      },
    }
  }))

  return { move }
}
```

- [ ] **Step 4: Register the keys in the tray**

In `app/components/SkillTray.vue`, add after `const { openSlip } = useSlip()`:

```ts
const slipState = useSlip()
const readerTab = useReaderTab()
```

and replace `const { openSlip } = useSlip()` with `const { openSlip } = slipState`. Then, after `defineExpose({ focusSearch })`, add:

```ts
useShelfKeys({
  visibleIds: catalog.visibleIds,
  selectedId: catalog.selectedId,
  inQuarantine: catalog.inQuarantine,
  slipOpen: slipState.open,
  select: (id) => {
    catalog.select(id)
  },
  toggleMark: id => catalog.toggleMark(id),
  openSlip: mode => slipState.openSlip(mode, targetIds.value),
  closeSlip: slipState.closeSlip,
  focusSearch,
  openEditor: () => {
    readerTab.value = 'edit'
  },
})
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:nuxt -- use-shelf-keys`
Expected: PASS, 6 tests. If `does nothing while an input is focused` fails because `j` fired, Nuxt UI's input detection needs the event to originate from the input; the test already dispatches on the input, so check that `usingInput` is absent on `j` (it must be) and that the component is mounted with `attachTo: document.body`.

Run: `pnpm build` → no errors. Manual pass under `pnpm dev`: `/` focuses the search, `j`/`k` walk the tray and scroll it, `x` marks, `q` opens the slip on a live drawer and is inert on the Quarantine shelf, `r`/`d` the other way round, `e` switches to the Edit tab, Escape closes the slip.

- [ ] **Step 6: Commit**

```bash
git add app/composables/useShelfKeys.ts app/components/SkillTray.vue test/nuxt/use-shelf-keys.test.ts
git commit -m "feat(app): keyboard navigation on defineShortcuts with shelf-aware keys

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The editor — Edit tab, save, revert, 409 reload, leave guards

**Files:**
- Create: `app/components/SkillEditor.vue`
- Modify: `app/components/SkillReader.vue` (wire the `#edit` slot)
- Test: `test/nuxt/skill-editor.test.ts`

**Interfaces:**
- Consumes: `ApiError` (Task 3); `useSkillDetail().save/reload` (Task 3, passed in as props); Nuxt UI `UTextarea`, `UAlert`, `UModal`, `useToast`, `defineShortcuts`; VueUse `useEventListener`; vue-router `onBeforeRouteLeave`, `onBeforeRouteUpdate`.
- Produces: `SkillEditor` with `props: { detail: SkillDetail; save: (source: string, baseHash: string) => Promise<SkillDetail>; reload: () => Promise<SkillDetail | null> }`, emitting `saved(detail)`. Test ids: `dirty`, `saved-at`, `conflict`.

- [ ] **Step 1: Write the failing component test**

`test/nuxt/skill-editor.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { SkillDetail } from '#shared/types/catalog'
import SkillEditor from '~/components/SkillEditor.vue'
import { ApiError } from '~/utils/api-error'

function detailWith(over: Partial<SkillDetail> = {}): SkillDetail {
  return {
    id: 'id', name: 'x', slug: 'x', description: '', scopeId: 'claude', scopeLabel: '.claude', kind: 'user',
    path: '/h/.claude/skills/x', skillRel: 'SKILL.md', file: false, link: false, linkTarget: '', origin: null,
    invocation: 'model', invocationEvidence: '', risk: 'none', physicality: 'physical', refTarget: '', refSkillId: '',
    copyCount: 0, copies: [], mtime: 0, quarantined: false, fromScope: '', skillSize: 20, tokenEstimate: 5,
    frontmatter: { name: 'x' }, frontmatterRaw: 'name: x', body: 'Body.\n', source: '---\nname: x\n---\n\nBody.\n',
    files: [], bytes: 20, findings: [], contentHash: 'hash1',
    ...over,
  }
}

function buttonNamed(wrapper: { findAll: (s: string) => { text(): string, trigger(e: string): Promise<void> }[] }, label: string) {
  const button = wrapper.findAll('button').find(b => b.text().trim() === label)
  if (!button) throw new Error(`no button "${label}"`)
  return button
}

describe('SkillEditor', () => {
  it('typing sets dirty and Save calls save with the baseline hash', async () => {
    const detail = detailWith()
    const save = vi.fn(async (source: string) => detailWith({ source, contentHash: 'hash2' }))
    const wrapper = await mountSuspended(SkillEditor, { props: { detail, save, reload: vi.fn(async () => detail) } })

    expect(wrapper.find('[data-testid="dirty"]').exists()).toBe(false)
    await wrapper.find('textarea').setValue('new text')
    expect(wrapper.find('[data-testid="dirty"]').exists()).toBe(true)

    await buttonNamed(wrapper, 'Save').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledWith('new text', 'hash1')
    expect(wrapper.find('[data-testid="dirty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="saved-at"]').exists()).toBe(true)
    expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ contentHash: 'hash2' })
  })

  it('Revert restores the baseline', async () => {
    const detail = detailWith()
    const wrapper = await mountSuspended(SkillEditor, { props: { detail, save: vi.fn(), reload: vi.fn() } })
    await wrapper.find('textarea').setValue('scratch')
    await buttonNamed(wrapper, 'Revert').trigger('click')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe(detail.source)
    expect(wrapper.find('[data-testid="dirty"]').exists()).toBe(false)
  })

  it('a 409 shows the conflict alert with Reload and keeps the text; Reload moves the baseline', async () => {
    const detail = detailWith()
    const save = vi.fn(async () => {
      throw new ApiError('File changed on disk since it was loaded', 409, { error: 'File changed on disk since it was loaded', currentHash: 'disk' })
    })
    const reload = vi.fn(async () => detailWith({ source: 'disk version', contentHash: 'disk' }))
    const wrapper = await mountSuspended(SkillEditor, { props: { detail, save, reload } })

    await wrapper.find('textarea').setValue('my text')
    await buttonNamed(wrapper, 'Save').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="conflict"]').exists()).toBe(true)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('my text')

    await buttonNamed(wrapper, 'Reload').trigger('click')
    await flushPromises()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="conflict"]').exists()).toBe(false)
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('my text')

    save.mockImplementationOnce(async () => detailWith({ source: 'my text', contentHash: 'hash3' }))
    await buttonNamed(wrapper, 'Save').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenLastCalledWith('my text', 'disk')
  })

  it('shows the frontmatter warning without blocking', async () => {
    const detail = detailWith({ frontmatter: { _parseError: 'YAML frontmatter could not be parsed' } })
    const wrapper = await mountSuspended(SkillEditor, { props: { detail, save: vi.fn(), reload: vi.fn() } })
    expect(wrapper.text()).toContain('Frontmatter could not be parsed')
    await wrapper.find('textarea').setValue('x')
    expect(buttonNamed(wrapper, 'Save')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:nuxt -- skill-editor`
Expected: FAIL, `~/components/SkillEditor.vue` not found.

- [ ] **Step 3: Write the editor**

`app/components/SkillEditor.vue`:

```vue
<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import type { SkillDetail } from '#shared/types/catalog'
import { ApiError } from '~/utils/api-error'

const props = defineProps<{
  detail: SkillDetail
  save: (source: string, baseHash: string) => Promise<SkillDetail>
  reload: () => Promise<SkillDetail | null>
}>()

const emit = defineEmits<{
  saved: [detail: SkillDetail]
}>()

const toast = useToast()

const text = ref(props.detail.source)
const baseline = ref({ source: props.detail.source, hash: props.detail.contentHash ?? '' })
const saving = ref(false)
const savedAt = ref('')
const conflict = ref<string | null>(null)

const dirty = computed(() => text.value !== baseline.value.source)
const parseError = computed(() => {
  const value = props.detail.frontmatter?._parseError
  return typeof value === 'string' ? value : ''
})

/** Spec §11.6: a fresh detail moves the baseline; the user's unsaved text stays until Revert. */
watch(() => props.detail, (fresh) => {
  if (!dirty.value) text.value = fresh.source
  baseline.value = { source: fresh.source, hash: fresh.contentHash ?? '' }
})

function stamp(): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date())
}

async function doReload(): Promise<void> {
  const fresh = await props.reload()
  if (!fresh) return
  baseline.value = { source: fresh.source, hash: fresh.contentHash ?? '' }
  conflict.value = null
}

async function doSave(): Promise<void> {
  if (!dirty.value || saving.value) return
  saving.value = true
  conflict.value = null
  try {
    const fresh = await props.save(text.value, baseline.value.hash)
    baseline.value = { source: fresh.source, hash: fresh.contentHash ?? '' }
    text.value = fresh.source
    savedAt.value = stamp()
    toast.add({ title: 'Saved', color: 'success' })
    emit('saved', fresh)
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      conflict.value = typeof err.data.currentHash === 'string' ? err.data.currentHash : ''
      toast.add({
        title: 'File changed on disk since it was loaded',
        description: 'Reload takes the disk version as the new baseline. Your text stays in the editor.',
        color: 'warning',
        duration: 0,
        actions: [{ label: 'Reload', color: 'neutral', variant: 'outline', onClick: () => { doReload() } }],
      })
    } else {
      toast.add({ title: (err as Error).message, color: 'error' })
    }
  } finally {
    saving.value = false
  }
}

function revert(): void {
  text.value = baseline.value.source
  conflict.value = null
}

defineShortcuts({
  meta_s: {
    usingInput: true,
    handler: (e?: KeyboardEvent) => {
      e?.preventDefault()
      doSave()
    },
  },
})

useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
})

const leaveOpen = ref(false)
let pendingLeave: ((ok: boolean) => void) | null = null

function guard(next: (ok?: boolean) => void): void {
  if (!dirty.value) {
    next()
    return
  }
  leaveOpen.value = true
  pendingLeave = (ok) => {
    leaveOpen.value = false
    pendingLeave = null
    next(ok)
  }
}

onBeforeRouteLeave((_to, _from, next) => guard(next))
onBeforeRouteUpdate((_to, _from, next) => guard(next))
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <div class="flex items-center gap-2">
      <UButton size="sm" :disabled="!dirty || saving" :loading="saving" @click="doSave">Save</UButton>
      <UButton size="sm" color="neutral" variant="ghost" :disabled="!dirty || saving" @click="revert">Revert</UButton>
      <span v-if="dirty" class="text-xs text-warning" data-testid="dirty">unsaved changes</span>
      <span v-else-if="savedAt" class="text-xs text-muted" data-testid="saved-at">saved {{ savedAt }}</span>
      <span class="ms-auto text-xs text-muted"><UKbd value="meta" /> <UKbd value="S" /> save</span>
    </div>

    <UAlert
      v-if="conflict !== null"
      data-testid="conflict"
      color="warning"
      variant="subtle"
      title="File changed on disk since it was loaded"
      description="Reload takes the disk version as the new baseline. Your text stays until you press Revert."
      :actions="[{ label: 'Reload', color: 'neutral', variant: 'outline', onClick: () => { doReload() } }]"
    />

    <UAlert
      v-if="parseError"
      color="warning"
      variant="subtle"
      title="Frontmatter could not be parsed"
      :description="`${parseError}. The file is saved as written; only the parsed fields are affected.`"
    />

    <UTextarea
      v-model="text"
      name="editor"
      :rows="24"
      spellcheck="false"
      class="w-full flex-1"
      :ui="{ base: 'font-mono text-sm leading-5' }"
    />

    <UModal v-model:open="leaveOpen" title="Discard unsaved changes?" :dismissible="false">
      <template #body>
        <p class="text-sm text-muted">The card has edits that are not on disk yet.</p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="pendingLeave?.(false)">Stay</UButton>
        <UButton color="error" @click="pendingLeave?.(true)">Discard</UButton>
      </template>
    </UModal>
  </div>
</template>
```

`onBeforeRouteLeave` / `onBeforeRouteUpdate` are vue-router auto-imports in Nuxt; outside a routed page (the component test) they only warn.

- [ ] **Step 4: Wire the Edit tab**

In `app/components/SkillReader.vue`, replace

```vue
      <template #edit>
        <p class="text-sm text-muted">The editor arrives in Task 9.</p>
      </template>
```

with

```vue
      <template #edit>
        <p v-if="detail.physicality === 'broken'" class="text-sm text-muted">Nothing to edit: the link target is gone.</p>
        <SkillEditor v-else :detail="detail" :save="save" :reload="reload" @saved="onSaved" />
      </template>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:nuxt -- skill-editor`
Expected: PASS, 4 tests. If the Reload button is not found, `UAlert` renders actions in its default slot layout; look for a button whose text includes "Reload" rather than equals it.

Run: `pnpm build` → no errors. Manual pass under `pnpm dev` with a scratch `HOME`: edit a card, `⌘S` saves without the browser's save dialog and toasts "Saved"; the Source tab and the token count update; edit the file on disk in another editor, save again → the conflict alert appears with Reload, the text stays; Reload then Save succeeds; navigating with `j` while dirty opens the Discard/Stay modal; a card with broken YAML shows the frontmatter warning and still saves.

- [ ] **Step 6: Commit**

```bash
git add app/components/SkillEditor.vue app/components/SkillReader.vue test/nuxt/skill-editor.test.ts
git commit -m "feat(app): raw SKILL.md editor with atomic save, 409 reload and leave guards

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Type-check, full test run, smoke pass

**Files:**
- Modify: whatever `pnpm typecheck` points at (types only; no behaviour changes)

**Interfaces:**
- Consumes: everything above.
- Produces: a green `pnpm typecheck`, `pnpm test` and `pnpm build`; the client is ready for the distribution plan.

- [ ] **Step 1: Type-check**

Run: `pnpm typecheck`
Expected: exit 0. Typical fixes if it fails: import `Ref` types from `vue` where a composable option is typed; add `as const` to the `RISK_CLASS` maps; give `wrapper.vm.c` in `test/nuxt/use-catalog.test.ts` an explicit type via `wrapper.vm as unknown as { c: ReturnType<typeof useCatalog> }`. Do not silence errors with `any` or `// @ts-ignore`.

- [ ] **Step 2: Run every project**

Run: `pnpm test`
Expected: `unit`, `nuxt` and `e2e` all green (the e2e run rebuilds the app; allow a couple of minutes).

- [ ] **Step 3: Build and smoke-test against a scratch home**

Run: `pnpm build && HOME=$(mktemp -d) NUXT_PUBLIC_SHELFWARE_TOKEN=sw_dev NITRO_PORT=3781 node .output/server/index.mjs`, then open `http://127.0.0.1:3781/` (and confirm `http://localhost:3781/` works while `http://<your LAN ip>:3781/` is refused with 403). Populate `$HOME/.claude/skills/` in another shell and press Refresh (reload the page). Walk this list once:

1. Drawers list with counts; census sentence; Quarantine shelf at the bottom.
2. Search, the three filters (survive a reload), mark-all with the indeterminate state.
3. `/`, `j`, `k`, `x`, `q`, `r`, `d`, `e`, Escape as in spec §11.8.
4. Reader header facts, Manuscript / Source / Folio, a binary preview, a broken card.
5. Quarantine → Restore → Delete round trip through the slip, toasts included.
6. Edit → save → conflict → reload → save; the Discard/Stay guard; the beforeunload prompt on tab close.
7. Colour mode toggle; the page still reads in both themes (word + colour everywhere).

Stop the server.

- [ ] **Step 4: Commit whatever the type-check touched**

```bash
git add -A
git commit -m "chore(app): type-check fixes after the client build

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Skip the commit if nothing changed.)

---

## Spec coverage (client plan)

| Spec section | Task(s) |
|---|---|
| §2 markdown-it decision, §11.5 renderer, §12.2 markdown XSS tests | 1 |
| §3.1 `app/` layout (pages, components, composables, utils) | 3–9 |
| §3.3 data flow steps 1–5 (client side) | 3, 5, 6, 7, 9 |
| §11.1 layout: sidebar, tray, reader, scope in the URL, filters in localStorage, register | 3, 4, 5 |
| §11.2 routes and state (`useCatalog`, `useSkillDetail`, `useApi`) | 3 |
| §11.3 cards and the search haystack incl. tokens | 2, 5 |
| §11.4 reader header, tabs, empty body note, Folio previews | 6 |
| §11.6 editor flow (load, save, warning, 409 reload, guards) | 9 |
| §11.7 action slip copy, effects, warnings, confirm semantics | 7 |
| §11.8 keyboard map on `defineShortcuts` incl. `meta_s` preventDefault | 8, 9 |
| §11.9 colour mode, system fonts, monospace paths | 4 |
| §12.2 `shelf-actions`, `markdown` unit tests | 1, 2 |
| §12.4 component tests (`useShelfKeys`, `SkillEditor`) | 8, 9 |
| §16 facts used: `ui.fonts`, `defineShortcuts` semantics, `$fetch.create`, `shared/` boundaries | 1, 3, 8 |

Not in this plan: §13.1 bin and pack-verify, README, placeholder publish — see `2026-09-05-shelfware-v0.1-distribution.md`.
