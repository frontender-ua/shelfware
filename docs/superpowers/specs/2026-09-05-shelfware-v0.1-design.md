# shelfware v0.1 — design spec

**Date:** 2026-09-05
**Status:** approved in brainstorm, ready for implementation planning
**Upstream reference:** skill-cabinet 0.6.0 (MIT), clone at `/Users/glua/develop/reference/skill-cabinet` (read-only)
**Supersedes:** `shelfware-handoff.md` §8 (open questions) — resolved below. Handoff §2 (decisions) and §5 (security requirements) remain authoritative; this spec adds mechanics.

---

## 1. Summary

shelfware is a local catalog for AI-agent skills installed on the machine (`~/.claude/skills`, `~/.cursor/skills`, `~/.codex/skills`, `~/.agents/skills`, and friends). It scans, lists, searches, renders, **edits**, audits, quarantines, restores, and permanently deletes skills. It ships as an `npx shelfware` tool: a prebuilt Nuxt 4 SPA served by Nitro on `127.0.0.1`.

v0.1 = behavioural parity with skill-cabinet 0.6.0 (scanner, audit, quarantine, census, copies, keyboard navigation) **plus** three things upstream lacks: in-place editing of `SKILL.md`, a hardened local security model (Host check on every route, per-session token on mutations), and a token-size estimate per skill.

### Goals

- Rebuild upstream's *behaviour* in our stack; its test files are the contract. Port rules and tests, not code, except the audit/invocation rule set (ported with MIT attribution).
- Stay **restore-compatible** with upstream's quarantine: same root, same `quarantine.json` schema. A user can switch tools without losing their trash.
- Close upstream's read-side DNS-rebinding leak and add CSRF defence-in-depth.
- Zero-build `npx`: the published package contains `bin/` and a prebuilt `.output/`.

### Non-goals (v0.1)

No network features, marketplace, SSR, i18n, desktop wrapper, project-level roots, syntax highlighting, frontmatter form, WYSIWYG editing, Windows support (code stays path-portable; nothing is tested there).

---

## 2. Resolved decisions

| Question | Decision | Rationale |
|---|---|---|
| Handoff §8.1 markdown renderer | **markdown-it** with `html: false`, `linkify: false`; output via `v-html` into a `.prose` container | ~30 KB, CommonMark + GFM tables built in, raw HTML is escaped by one option, the default `validateLink` already rejects `javascript:`, `vbscript:`, `file:` and non-image `data:` URLs. MDC would pull unified/remark/rehype into the client bundle and interpret `::component` syntax inside untrusted skill bodies. |
| Handoff §8.2 edit UX | **One raw textarea** for the whole `SKILL.md` (frontmatter + body) | Lossless, zero dependencies. Server re-parses frontmatter after save and reports YAML errors as a warning, never as a blocker. Frontmatter form and CodeMirror are v0.2. |
| Handoff §8.3 audit rules | **Port upstream 1:1** as a typed `AuditRule[]` table in its own module | Upstream's rules are already declarative; the context logic around them (denylist prose, shell fences, subsumption, companion-file walk limits) is the valuable part and is tested. Own schema / user rules wait for a real need. |
| Quarantine root (handoff §2 typo) | `~/.skill-cabinet/quarantine/` with `quarantine.json` **inside** it | This is what upstream 0.6.0 actually uses; the handoff's `~/.skill-cabinet-quarantine/` was a transcription error. Compatibility is the intent. |
| Scanner scope beyond handoff §3 | **Included**: loose `*.md` file skills, dangling symlinks as `broken` cards, physicality (`physical`/`reference`/`broken`), origin inference, invocation classification, Hermes profile roots | Upstream tests cover all of these; "tests define the contract" means they are in scope. |
| Token header name | `X-Shelfware-Token` | Handoff wrote `X-Cabinet-Token`; the product is shelfware. Purely cosmetic. |
| Token transport | `NUXT_PUBLIC_SHELFWARE_TOKEN` env → `runtimeConfig.public.shelfwareToken` | Verified in Nuxt 4.5 source: with `ssr: false` and `nuxt build`, `/` is not prerendered; Nitro's `getSPARenderer` runs per request and serialises `config.public` into the served HTML. No `render:html` hook needed. |
| Fonts | `ui.fonts: false`, system font stack + monospace | Smaller tarball, no font download at build. |
| Client state | Composables on `useState`, no Pinia | Single-page local tool. |

---

## 3. Architecture

### 3.1 Project layout (Nuxt 4, `app/` + `server/`)

```
shelfware/
  bin/
    shelfware.mjs              CLI entry: parses flags, calls launch()
    launch.mjs                 pure helpers: pickPort, makeToken, openBrowser, waitForHealth
  app/
    app.vue                    <UApp> + <UDashboardGroup>
    assets/css/main.css        @import "tailwindcss"; @import "@nuxt/ui"; .prose rules
    pages/index.vue            tray + empty reader
    pages/skills/[id].vue      tray + reader for one skill (deep link)
    components/
      DrawerRail.vue           scopes, house census, quarantine shelf
      SkillTray.vue            search, filters, card list, bulk actions
      SkillCard.vue
      SkillReader.vue          cataloguing header + tabs
      SkillEditor.vue          textarea, save/revert, dirty state
      ActionSlip.vue           confirmation modal with filesystem effects
      CensusNote.vue
      FolioTree.vue            file list + text preview
    composables/
      useApi.ts                $fetch instance with token header, error normalisation
      useCatalog.ts            catalog state, refresh, scope/filter/search, marks
      useSkillDetail.ts        detail fetch, file preview, save
      useShelfKeys.ts          keyboard navigation on top of defineShortcuts
    utils/
      markdown.ts              markdown-it instance (html:false, linkify:false)
      search.ts                matchesQuery (port of upstream haystack + tokens)
      shelf-actions.ts         idsForShelfAction, crossingQuarantineShelf, deleteEffect (ports)
      format.ts                bytes, dates, token counts
  server/
    middleware/
      0.host.ts                Host check, every route
      1.mutation.ts            Origin + token + body limit, non-GET routes
    plugins/
      token.ts                 dev fallback: generate token if env is empty
    api/
      health.get.ts
      skills.get.ts
      skills/[id].get.ts
      skills/[id].put.ts
      skills/[id]/file.get.ts
      skills/quarantine.post.ts
      skills/restore.post.ts
      skills/delete.post.ts
    utils/                     pure modules, no h3 imports, unit-tested
      scan.ts
      origin.ts
      frontmatter.ts
      audit.ts
      audit-rules.ts
      invocation.ts
      delete-effect.ts
      quarantine.ts
      editor.ts
      catalog.ts
      guards.ts
      errors.ts                HttpError(status, message)
  test/
    unit/                      vitest, node environment
    component/                 vitest, nuxt environment (mountSuspended)
    e2e/                       @nuxt/test-utils/e2e against the built server
    fixtures/                  upstream-produced quarantine.json (templated), markdown XSS cases
    helpers/fixture-home.ts    builds a temporary HOME with all root shapes
  docs/superpowers/specs/      this file
  nuxt.config.ts
  vitest.config.ts
  package.json
```

### 3.2 Module map (server/utils)

Each module has one purpose, a typed public surface, and no h3/Nitro imports.

| Module | Responsibility | Depends on |
|---|---|---|
| `scan.ts` | `discoverRoots({ home })`, `scanRoots(roots)`, `scanSkills({ home })`, `attachCopies`, `readSkill`, `readSkillFile`, `assertSkillTarget`, `assertDeletable`, `deleteSkillDir`, `toCatalogSkill`, `quarantineRoot({ home })`, census | `origin`, `frontmatter`, `audit`, `invocation` |
| `origin.ts` | `inferOrigin(dir, frontmatter, linkTarget, ctx)` — frontmatter → path → link target → ancestors (plugin.json, `.git`); per-scan cache passed in `ctx` | — |
| `frontmatter.ts` | `parseFrontmatter(text) → { data, content, raw }`, tolerant, `_parseError` marker | `yaml` |
| `audit.ts` | `auditSkill({ root, skillFile, text, fileOnly }) → { severity, findings }` — context classification, fences, subsumption, companion walk | `audit-rules` |
| `audit-rules.ts` | `AUDIT_RULES: AuditRule[]`, `SEVERITY_ORDER`, `SUBSUMED`, `COMPANION_EXTENSIONS`, walk limits. MIT attribution header. | — |
| `invocation.ts` | `skillInvocation(...)`, `hasStandingOrder(text)`, `findSkillHooks(dir, { fileOnly })` | — |
| `delete-effect.ts` | `deleteEffect(card) → { action, label, path, note }` | — |
| `quarantine.ts` | `readManifest`, `writeManifest`, `quarantineSkill`, `restoreSkill`, `quarantineRecordFor`, `forgetQuarantinePath` | `scan` (`assertSkillTarget`, `contained`, `quarantineRoot`) |
| `editor.ts` | `saveSkillSource(summary, { source, baseHash }) → SaveResult` — containment, hash check, atomic write | `scan` (`contained`, `real`) |
| `catalog.ts` | in-memory index cache: `getIndex({ force })`, `invalidate()`; TTL 15 s | `scan` |
| `guards.ts` | `parseHostHeader`, `isAllowedHost(host, expectedPort)`, `isLoopbackOrigin(origin, expectedPort)`, `tokenMatches(a, b)` (timing-safe) | — |
| `errors.ts` | `HttpError` with `status`; routes map it to `createError` | — |

`home` is injectable everywhere (`{ home?: string }`, default `os.homedir()`), so unit tests never touch the real home. Upstream tests set `process.env.HOME`; Node's `os.homedir()` honours it, so ported tests keep working either way.

### 3.3 Data flow

1. Client mounts → `useCatalog().refresh()` → `GET /api/skills` → drawers, census, cards.
2. Card selected (click or `j`/`k`) → route `/skills/:id` → `GET /api/skills/:id` → reader.
3. Folio file click → `GET /api/skills/:id/file?path=…` → preview.
4. Edit → `PUT /api/skills/:id { source, baseHash }` → 200 with a fresh detail (replaces reader state) or 409.
5. Quarantine / restore / delete → `POST …` → results toast → `refresh()`.
6. Every mutation invalidates the server-side index cache before it returns.

---

## 4. Domain model

### 4.1 Root

```ts
interface Root {
  scopeId: string          // "claude", "cursor-plugins", "hermes-profile:coding", "quarantine"
  scopeLabel: string       // ".claude", ".cursor/plugins", "Hermes profile · coding", "Quarantine"
  root: string             // realpath of the drawer
  kind: 'user' | 'builtin' | 'plugin' | 'quarantine'
  recursive: boolean       // walk to find nested skills/ or skill/ containers (cursor plugins)
  deep?: boolean           // recurse into dirs without a skill file (Hermes)
  fromScope?: string       // quarantine roots only: scope folder name
}
```

### 4.2 Skill card (`toCatalogSkill`, list payload)

Upstream's fields unchanged, plus two of ours (marked ★):

```ts
interface SkillCard {
  id: string                       // sha1(abs path).slice(0, 16)
  name: string                     // frontmatter.name || frontmatter.displayName || slug
  slug: string                     // basename; ".md" stripped for file skills
  description: string
  scopeId: string; scopeLabel: string
  kind: Root['kind']
  path: string                     // abs path of the skill dir, file, or link
  skillRel: string                 // basename of the skill file
  file: boolean                    // loose .md skill
  link: boolean                    // entry is a symlink
  linkTarget: string
  origin: Origin | null
  invocation: 'hook' | 'user' | 'model' | 'off'
  invocationEvidence: string
  risk: Severity                   // max finding severity, 'none' when clean
  physicality: 'physical' | 'reference' | 'broken'
  refTarget: string                // realpath for references
  refSkillId: string               // id of the physical card at refTarget, or ''
  copyCount: number
  copies: { id: string; scopeLabel: string; path: string }[]
  mtime: number
  quarantined: boolean
  fromScope: string
  skillSize: number                // ★ bytes of the skill file
  tokenEstimate: number            // ★ Math.ceil(text.length / 4) of the skill file; 0 for broken
}
```

### 4.3 Skill detail (`GET /api/skills/:id`)

`SkillCard` plus:

```ts
interface SkillDetail extends SkillCard {
  frontmatter: Record<string, unknown>   // {} for broken; may carry _parseError: string
  frontmatterRaw: string
  body: string                            // markdown after the frontmatter block
  source: string                          // whole file, what the editor loads
  files: { path: string; size: number; mtime: number }[]   // depth ≤ 8, ≤ 250 files, symlinks skipped
  bytes: number
  findings: AuditFinding[]
  contentHash: string | null              // sha256 hex of raw bytes; editor's baseHash
  quarantinedFrom?: string                // manifest originPath
  quarantinedAt?: number
}
```

### 4.4 Census

```ts
interface Census {
  total: number            // live (non-quarantined) cards
  physical: number
  unique: number           // distinct contentHash among physical
  duplicateCopies: number  // physical cards whose hash appears more than once
  duplicateBytes: number   // sum of dir sizes of those cards
  references: number
  broken: number
  duplicates: number       // alias of duplicateCopies (upstream field, kept)
  tokenEstimate: number    // ★ sum over live physical cards
}
```

### 4.5 Audit

```ts
type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical'

interface AuditRule {
  rule: string             // "shell.remote-pipe"
  severity: Exclude<Severity, 'none'>
  pattern: RegExp          // global, case-insensitive
  message: string
}

interface AuditFinding {
  severity: Severity; rule: string; message: string
  file: string             // rel path inside the skill ("SKILL.md", "scripts/run.sh")
  line: number             // 1-based
}
```

### 4.6 Quarantine manifest (upstream schema, unchanged)

```json
{
  "version": 1,
  "entries": [
    {
      "quarantinePath": "/Users/me/.skill-cabinet/quarantine/claude/alpha",
      "originPath": "/Users/me/.claude/skills/alpha",
      "name": "alpha", "slug": "alpha",
      "scopeId": "claude", "scopeLabel": ".claude", "kind": "user",
      "file": false, "link": false,
      "quarantinedAt": 1757000000000
    }
  ]
}
```

Paths are absolute. Entries whose `quarantinePath` no longer exists (`lstat` fails) are dropped on read.

### 4.7 Origin

```ts
interface Origin {
  kind: 'github' | 'url'
  label: string            // "owner/repo" or "host/path"
  url: string
  via: 'frontmatter' | 'path' | 'plugin' | 'git'
  certainty: 'attested' | 'inferred'
}
```

---

## 5. Scanner contract

Upstream `server/scan.js` is the reference; its tests (`classify`, `census`, `copies`, `delete`, `quarantine`, `invocation`) are ported verbatim into `test/unit`. Summary of the rules for the plan:

### 5.1 Root discovery (`discoverRoots`)

- Read `$HOME` entries. For every entry that is a directory or symlink, starts with `.`, and is **not** in the denylist, add `<entry>/skills` and `<entry>/skill` as `kind: 'user'`, `scopeId` = name without the dot, `scopeLabel` = name.
- Denylist: `.cache .local .npm .nvm .rustup .cargo .docker .mozilla .config .steam .var .wine .thumbnails .Trash .android .gradle .java .skill-cabinet`. (`.skill-cabinet` is required so the quarantine is never indexed as a live drawer.)
- `.cursor` additionally adds `.cursor/skills-cursor` (`scopeId: 'cursor-builtin'`, `kind: 'builtin'`) and `.cursor/plugins` (`scopeId: 'cursor-plugins'`, `kind: 'plugin'`, `recursive: true`).
- `.gemini/antigravity/skills` (`scopeId: 'gemini'`, label `.gemini/antigravity`) and `.gemini/antigravity/global_skills` (label `.gemini/antigravity (global)`).
- `.hermes/profiles/<name>/skills` for each non-dot profile dir → `scopeId: 'hermes-profile:<name>'`, label `Hermes profile · <name>`, `deep: true`.
- Each subdirectory of `~/.skill-cabinet/quarantine/` → `kind: 'quarantine'`, `scopeId: 'quarantine'`, label `Quarantine`, `fromScope` = subdir name.
- Roots are deduplicated by realpath; missing or non-directory paths are skipped.

### 5.2 Collecting cards in a root

For each directory entry, skipping `node_modules .git dist .cache upstream`:

- Symlink whose target is neither file nor dir → **broken** card (`physicality: 'broken'`, `link: true`, `contentHash: null`, empty body/files).
- Directory containing `SKILL.md` or `skill.md` (a file, not a dir) → directory skill. Without one: in `deep` mode recurse (depth ≤ 14), otherwise ignore.
- Regular file named `SKILL.md`/`skill.md`, or any `*.md` except `readme.md changelog.md license.md licence.md` (case-insensitive) → **file skill** (`file: true`).
- `recursive` roots (cursor plugins): walk directories (depth ≤ 14, same skip set) until a directory named `skills` or `skill` is found, then collect non-recursively inside it.

### 5.3 Summarising

- `id = sha1(absPath).hex.slice(0, 16)`.
- Identity for memoisation = `dev:ino` of the followed target (falls back to realpath), suffixed with `file`/`dir`; parsing, hashing, and audit run once per identity.
- `contentHash = sha256(raw bytes)`; `physicality = link ? 'reference' : 'physical'`; references get `refTarget = realpath` and `refSkillId` = id of the physical card with the same realpath, or `''`.
- Copies: among **physical** cards only, same `contentHash` → mutual `copies` entries. References and broken cards never have copies.
- Sort: `scopeLabel` then `name` (`localeCompare`).
- `tokenEstimate = Math.ceil(text.length / 4)` where `text` is the UTF-8 decoded skill file; `skillSize` = byte size.

### 5.4 Census

`total` counts live cards; `physical`, `references`, `broken` by physicality; `unique` = distinct hashes among physical; `duplicateCopies` = physical cards whose hash count > 1; `duplicateBytes` = sum of `dirSizeAndFiles(path).bytes` over those cards; `tokenEstimate` = sum over live physical cards.

### 5.5 Reading files

- `readSkill(summary)` → detail fields (§4.3). Broken → empty strings, `files: []`, `bytes: 0`.
- `readSkillFile(summary, relPath)`: file skills always return the skill file itself. Otherwise `normalize` (strip leading `../`), join with skill dir, `realpath`, and require `abs === root || abs.startsWith(root + sep)` where `root = realpath(skillDir)`; otherwise `400 "Path escapes skill directory"`. Missing or directory → 404. Size > 1,500,000 bytes → 413. Text if no NUL byte **and** extension in `md txt yaml yml json js mjs cjs ts tsx jsx py sh html css svg toml xml csv rst`; otherwise `binary: true, content: null`.

### 5.6 Target assertions

`assertSkillTarget(summary, roots, action)`: target must be contained in some root **and** not equal to that root, and must not equal `$HOME` → else 403 (`Refusing to <action> a cabinet root` / `Skill is outside known cabinet roots`). Then it must be a dead link, a folder with a skill file, or a file with a skill file name → else 400 `Not a skill path`. `deleteSkillDir(target)`: symlink or file → `unlink`; directory → `rm -r` without `force`.

---

## 6. Audit and invocation contract

Port `server/audit.js` and `server/invocation.js` from upstream with the attribution header:

```ts
/**
 * Static skill audit. Rules and context heuristics ported from skill-cabinet
 * (MIT, https://github.com/subsy/skill-cabinet), which adapted them from
 * Adaptive Skills (MIT, https://github.com/wangsoft/Adaptive-Skills).
 */
```

### 6.1 Rules (`audit-rules.ts`)

| rule | severity | matches |
|---|---|---|
| `shell.remote-pipe` | critical | `curl`/`wget` … `\| [sudo] sh\|bash\|zsh` |
| `filesystem.broad-delete` | high | `rm -<flags>` where the flags contain `r` followed later by `f` (so `-rf`, `-rvf`, `-Rf`; not `-fr`), targeting `/`, `~`, or `$HOME` |
| `credentials.sensitive-path` | high | `.ssh/id_*`, `.ssh/config`, `.aws/credentials`, `.config/gcloud`, `login.keychain` |
| `execution.obfuscated` | high | `eval(`/`exec(` … `base64`/`b64decode` on one line |
| `prompt.override` | medium | `ignore/disregard [all] previous/prior/system instructions` |
| `git.global-config` | medium | `git config --global` |
| `network.download` | low | bare `curl`/`wget` |

`SUBSUMED = { 'network.download': ['shell.remote-pipe'] }` at the same file+line; additionally, when any remote-pipe finding exists, all `network.download` findings are hidden from the result.

### 6.2 Context classification (`audit.ts`)

A match only counts when its line context is `command_invocation`:

- Line, or the nearest non-blank line within the previous 4 that ends with `:` or starts with `#`, matches the denylist pattern (`do not`, `don't`, `never`, `must not`, `avoid`, `forbidden`, `denylist`, `blocklist`) → `denylist`, ignored.
- In documents (`.md .txt .rst` and any `skill.md`): inside a shell fence (` ``` ` with no language or `sh shell bash zsh fish console terminal`) → command; line starts (after optional bullet and `$`/`>` prompt) with a shell-ish word (`sudo curl wget rm git bash sh zsh fish python python3 node npm npx pnpm yarn eval exec`) or an imperative (`read open copy upload download delete remove write modify send execute run`) → command; for `prompt.override` a line starting with `ignore`/`disregard` → command; otherwise `documentation`.
- In non-documents: lines starting with `#`, `//`, `*`, `/*` → documentation; everything else → command.

Companion files: unless `fileOnly`, walk the skill dir (symlinks skipped, `node_modules .git dist .cache upstream __pycache__ .venv venv` skipped, depth ≤ 4, at most 12 files) for `.sh .bash .zsh .fish .ps1 .py .js .mjs .cjs`; skip files > 256,000 bytes; stop when the cumulative tree exceeds 512,000 bytes (skill file counted first). `severity` = max over visible findings.

### 6.3 Invocation (`invocation.ts`)

Evaluated in order; first hit wins:

1. `hooks/hooks.json` or `hooks.json` **inside the skill dir** (never for file skills, never a parent's) → `hook`, evidence `hooks.json at <path>`.
2. `sessionStart` or `alwaysApply` truthy (`true`, `"true"`, `"yes"`) at top level or under `metadata` → `hook`, evidence `frontmatter sessionStart|alwaysApply`.
3. Description contains a standing order (`must always apply`, `always apply`, `on|before every request|turn|message|prompt`, `hooked into every`, `injected at session start`) that is **not** negated within its clause (negation = `do not / don't / does not / … / never` with at most 5 words between it and the match; clause boundaries are `. ! ? ;` and `but`/`yet`/`, and`/`, or`) → `hook`, evidence `description standing order`.
4. `disable-model-invocation` truthy → `user`; with `user-invokable` falsy (top level or `metadata`) → `off`.
5. Otherwise `model`, evidence `default: the model may call this`.

### 6.4 Origin (`origin.ts`)

1. Frontmatter `source`/`repository` (string or `{ url }`), top level or under `metadata` → github or generic http(s) URL, `via: 'frontmatter'`, `attested`. Then `homepage`/`url`, github only.
2. Path contains `/marketplaces/github.com/<o>/<r>` or `/github.com/<o>/<r>` (owner ≠ `www`) → `via: 'path'`, `attested`.
3. For symlinks: the same path rule, then ancestor search, applied to the resolved link target.
4. Ancestor search from the skill dir upwards (≤ 14 levels, stop at `$HOME`): `plugin.json`, `.cursor-plugin/plugin.json`, `.claude-plugin/plugin.json`, `.plugin/plugin.json` (`repository`, then github-only `homepage`) → `via: 'plugin'`; `.git` dir or gitdir file → `[remote "origin"] url` → `via: 'git'`. Certainty is `attested` when found at the skill dir itself, else `inferred`. Results are cached per scan for every directory on the walked chain.

---

## 7. Quarantine, restore, delete contract

Port of upstream `quarantine.js`; the ported tests are the acceptance criteria.

- **Quarantine:** refuse already-quarantined (400). `assertSkillTarget(…, 'quarantine')`. Destination `~/.skill-cabinet/quarantine/<scopeFolder>/<basename>`, where `scopeFolder` sanitises `scopeId` to `[A-Za-z0-9._-]` (empty/`.`/`..` → `loose`); on collision append `-2`, `-3`, … before the extension (≤ 999, else 409). Move by `rename`, falling back to `cp -r` (verbatim symlinks) + `rm -r` on `EXDEV`. Symlinked skills move the **link**, never the target. Then rewrite the manifest atomically (`quarantine.json.<pid>.tmp` → `rename`); if that write fails, move the skill back and rethrow.
- **Restore:** card must be quarantined and inside the quarantine root (400). Manifest entry required (409 `No quarantine record says where this came from…`). `originPath` must be inside a discovered non-quarantine root and not equal to it (403 `No cabinet drawer holds <path> any more`); its parent dir must exist (409 `The original drawer is gone`); destination must be unoccupied by `lstat` (409 `Something is already at <path>`). Move, drop the entry, prune the empty scope folder. Failed manifest write moves the skill back.
- **Permanent delete:** `assertDeletable` + `deleteSkillDir` + `forgetQuarantinePath`. Route-level rule: a card that is **not** quarantined is skipped and reported in `errors[]` as `{ id, path, error: 'Not quarantined; pass force to delete a live card' }` unless the request body carries `force: true`. v0.1 UI never sends `force`; it exists for the API contract and is covered by a test.
- **Manifest reads** ignore stray `*.tmp` files and drop entries whose `quarantinePath` is gone.

---

## 8. Editing contract (`editor.ts` + `PUT /api/skills/:id`)

Request: `{ source: string, baseHash: string }`.

1. Card must exist (404) and not be broken (400 `Nothing to edit: the link target is gone`).
2. Target file = the card's `skillFile` (for file skills, the file itself). Containment, both kinds: the card path must pass `assertSkillTarget(summary, roots, 'edit')` (inside a discovered root, not the root, not `$HOME`, still a skill). Directory skills additionally require `realpath(skillFile)` to be inside `realpath(skillDir)` (400 `Skill file escapes its directory` when `SKILL.md` is a symlink pointing outside).
3. `sha256(current bytes)` must equal `baseHash`, else 409 `{ error: 'File changed on disk since it was loaded', currentHash }`.
4. Write `source` (UTF-8) to `<skillFile>.<pid>.tmp` in the same directory, `chmod` it to the original file's mode, `rename` over the original. On any failure remove the tmp and rethrow.
5. Invalidate the catalog cache, rescan, and return the fresh `SkillDetail` (new `contentHash`, re-parsed frontmatter incl. `_parseError`, re-run audit, new `tokenEstimate`).

Editing quarantined cards is allowed (they live inside a discovered root). Body limit 1 MB applies (§10).

---

## 9. API

All responses are JSON. Errors are `{ error: string }` with the status below; unknown failures are 500 with a generic message.

| Route | Request | Success | Errors |
|---|---|---|---|
| `GET /api/health` | — | `{ ok: true }` | — |
| `GET /api/skills` | `?refresh=1` forces a rescan | `{ home, scannedAt, quarantineRoot, total, census, scopes: { id, label, kind, count }[], skills: SkillCard[] }` — `scopes` and `total` cover live cards only; `skills` includes quarantined ones | — |
| `GET /api/skills/:id` | — | `SkillDetail` | 404 |
| `GET /api/skills/:id/file` | `?path=<rel>` | `{ path, size, binary, content }` | 400 missing/escaping path, 404, 413 |
| `PUT /api/skills/:id` | `{ source, baseHash }` | `SkillDetail` | 400, 404, 409, 413 |
| `POST /api/skills/quarantine` | `{ ids: string[] }` | `{ quarantined: { id, name, from, to }[], errors: { id, error, path? }[] }` | 400 empty ids |
| `POST /api/skills/restore` | `{ ids }` | `{ restored: [...], errors: [...] }` | 400 empty ids |
| `POST /api/skills/delete` | `{ ids, force?: boolean }` | `{ deleted: { id, path, name }[], errors: [...] }` | 400 empty ids |

Batch routes never fail as a whole for a per-card problem; each card lands in `errors` with the assertion's message. Every mutating route re-reads the index with `force: true` before acting and invalidates it after.

There is no `DELETE /api/skills/:id`; a test asserts it is 404.

---

## 10. Security mechanics

Handoff §5 lists the requirements; this is how each is met.

### 10.1 Host check — `server/middleware/0.host.ts` (every request)

- Parse `Host` with `new URL('http://' + host)`; missing or unparsable → 403.
- `hostname` must be `127.0.0.1`, `localhost`, or `[::1]` (URL keeps the brackets).
- Expected port = `NITRO_PORT ?? PORT` when either is set (the bin always sets `NITRO_PORT`; `@nuxt/test-utils` sets `PORT`). When set, the header's port must equal it exactly; when unset (plain `nuxt dev`), the port is not checked.
- Applies to `/api/**` and to `/` (the SPA shell that carries the token). Static `_nuxt/*` assets may be served by Nitro ahead of user middleware; they contain no user data, so this is acceptable and documented.

### 10.2 Mutation guard — `server/middleware/1.mutation.ts` (methods other than GET/HEAD/OPTIONS)

- `Origin` must parse and pass the same hostname/port rule as Host → else 403 `Cross-origin request blocked`.
- `X-Shelfware-Token` must equal `useRuntimeConfig(event).public.shelfwareToken`, compared with `crypto.timingSafeEqual` on equal-length buffers → else 403 `Missing or invalid session token`.
- `Content-Length` must be present and ≤ 1,048,576 → else 413. Malformed JSON → 400.

### 10.3 Token

- `bin/launch.mjs` → `makeToken()` = 32 random bytes as hex, exported as `NUXT_PUBLIC_SHELFWARE_TOKEN` before importing the server.
- `nuxt.config.ts` declares `runtimeConfig.public.shelfwareToken: ''`. Nitro's SPA renderer serialises `config.public` into `window.__NUXT__` on every request, so the token lands in the served HTML and is read on the client via `useRuntimeConfig().public.shelfwareToken`.
- `server/plugins/token.ts`: if the env var is empty at startup (dev), generate one and set `process.env.NUXT_PUBLIC_SHELFWARE_TOKEN` before the first request.
- A DNS-rebinding page cannot obtain the token: its request for `/` fails the Host check. A same-machine cross-origin page cannot read it: no CORS.

### 10.4 No CORS

No route or config sets `Access-Control-*` headers. `routeRules` contain no `cors`. A test asserts their absence on `GET /api/health` and on an `OPTIONS /api/skills/delete` preflight.

### 10.5 Containment

§5.5 (file read) and §8 (save) both use `normalize → realpath → prefix`. Quarantine/restore/delete use `assertSkillTarget` (§5.6) and the restore rules (§7). Symlinked skills are unlinked/moved as links; targets are never followed for destructive actions.

### 10.6 Logging

Nitro's production logger is left at its default (no per-request body logging). Application code never logs `source`, `body`, file contents, or request bodies; error responses carry the path and message only.

---

## 11. Client

### 11.1 Layout

`app.vue` renders `<UApp>` → `<UDashboardGroup>` with:

- `<UDashboardSidebar>` — **DrawerRail**: "All drawers" and one entry per scope with live counts; below, **CensusNote** (total, physical, unique, duplicates + wasted bytes, references, broken, ~tokens) as one cataloguing note, not a metrics row; at the bottom, the **Quarantine** shelf, excluded from "All" and from the census. Scope lives in the URL query `?scope=<id>` (`all` default).
- `<UDashboardPanel>` **tray** — search `UInput` (`/` focuses it), three `USelect` filters (form: any/physical/reference/broken; risk: any/low+/medium+/high+/critical; invocation: any/hook/user/model/off) persisted in `localStorage` via VueUse `useLocalStorage`; bulk action bar (Quarantine on live shelves; Restore and Delete on the quarantine shelf); the card list; a footer with `UKbd` hints.
- `<UDashboardPanel>` **reader** — empty state on `/`; `SkillReader` on `/skills/:id`.

Register: quiet, precise, librarian (upstream `DESIGN.md`). Status is always word + colour. Paths are monospace and wrap. Findings and inferred origin are labelled as evidence.

### 11.2 Routes and state

- `pages/index.vue` and `pages/skills/[id].vue` share the layout; the tray persists across navigation. Selecting a card pushes `/skills/:id` and keeps `?scope`.
- `useCatalog`: `catalog`, `loading`, `error`, `scopeId`, `query`, `filters`, `visible` (computed: scope → filters → `matchesQuery`), `marked: Set<string>`, `refresh(force?)`, `toggleMark(id)`, `markVisible()`. Switching between a live drawer and the quarantine shelf clears marks (`crossingQuarantineShelf`).
- `useSkillDetail(id)`: `detail`, `preview`, `tab`, `load()`, `openFile(rel)`, `save(source)`.
- `useApi`: `$fetch.create({ headers: { 'X-Shelfware-Token': token } })`; maps `{ error }` bodies to thrown `Error(message)`.

### 11.3 Cards and search

`SkillCard`: name, description, stamps for kind (user/plugin/builtin), form (file/link/broken), origin (label, attested/inferred), copies (`×N`), risk (word + colour), invocation, `~N tok`, and a mark checkbox. `matchesQuery` is the upstream haystack (name, slug, description, path, scope, form words, origin, risk, copies, quarantine words, invocation words, evidence) plus `tokens`.

### 11.4 Reader

Header: name, description, path (mono), scope/kind, physicality, origin with certainty, invocation with evidence, size and `~tokens`, findings as `rule · file:line — message` with severity word, copies with links to their cards, quarantine record (from/at) when applicable. Action buttons: Quarantine (live) / Restore + Delete (quarantine); Delete is the only red control.

`UTabs`: **Manuscript** (rendered body; empty body renders "*This skill has no body after the frontmatter.*"), **Source** (`<pre>`), **Edit**, **Folio** (`FolioTree`: files with sizes; clicking previews text, binary shows "not a text preview").

### 11.5 Markdown (`app/utils/markdown.ts`)

`new MarkdownIt({ html: false, linkify: false, typographer: false })`, default `validateLink`. Rendered with `v-html` into `div.prose`; CSS for the prose lives in `main.css` (headings, lists, tables, code). Broken cards and binary previews never reach the renderer.

### 11.6 Editor

`SkillEditor` under the Edit tab: `UTextarea` (monospace, `spellcheck="false"`, fills the panel, no autoresize), toolbar with **Save** (`meta_s`), **Revert**, a dirty indicator, and "saved hh:mm" after success. Flow:

- Load `detail.source` and `detail.contentHash` into local state.
- Save → `PUT` → replace `detail` with the response (hash, frontmatter, findings, tokens update); toast "Saved". If the response frontmatter has `_parseError`, show a `UAlert` warning "Frontmatter could not be parsed" above the textarea; saving is never blocked by it.
- 409 → toast with a **Reload** action that fetches the current detail and replaces the baseline; the textarea keeps the user's text until they press Revert.
- `beforeunload` guard and an in-app confirm (`UModal`) when navigating away with unsaved changes.

### 11.7 Action slip (`ActionSlip`, `UModal`)

Lists the affected cards with the filesystem effect from `deleteEffect` (Unlink / Delete file / Delete folder, "Target … stays", "The target is already gone") and a warning for plugin-cache and builtin cards ("may return after a tool update"). Quarantine and Restore use neutral buttons; Delete is red. Confirm runs the batch, toasts the counts and per-card errors, refreshes the catalog, and clears marks. When nothing is marked, the actions apply to the selected card.

### 11.8 Keyboard (`useShelfKeys`)

Built on Nuxt UI `defineShortcuts` (does not fire while typing; `meta` maps to `ctrl` off macOS):

| Key | Action |
|---|---|
| `/` | focus search |
| `j` / `k` | next / previous visible card, `scrollIntoView({ block: 'nearest' })` |
| `x` | toggle mark on the selected card |
| `q` | open Quarantine slip (live shelves only) |
| `r` | open Restore slip (quarantine shelf only) |
| `d` | open Delete slip (quarantine shelf only) |
| `e` | switch the reader to the Edit tab |
| `meta_s` | save (Edit tab, `usingInput: true`) |
| `escape` | close the slip; blur an input (`usingInput: true`) |

The pure part (`nextSelection(visibleIds, currentId, delta)`) lives in `app/utils/shelf-actions.ts` and is unit-tested; the composable is component-tested (§12).

### 11.9 Theme

Nuxt UI colour mode (system / light / dark) toggle in the navbar. `ui.fonts: false`; the body uses the system UI stack and `ui-monospace` for paths, source, and the editor. Upstream's ten custom skins are not ported.

---

## 12. Testing

`vitest.config.ts` defines three projects:

| Project | Environment | Scope |
|---|---|---|
| `unit` | node | `server/utils/**`, `app/utils/**`, `bin/launch.mjs` |
| `component` | nuxt (`@nuxt/test-utils/runtime`, happy-dom) | `useShelfKeys`, `SkillEditor` dirty/409 flow |
| `e2e` | `@nuxt/test-utils/e2e`, built server, `env: { HOME: <temp fixture home>, NUXT_PUBLIC_SHELFWARE_TOKEN: <known> }` | routes and security |

### 12.1 Fixture home (`test/helpers/fixture-home.ts`)

Builds a fresh temp HOME programmatically (symlinks do not survive git/npm): `.claude/skills/{alpha, twin-a, twin-b, dead → ./nowhere, linked → ../../repo/x}`, `.claude/skills/note.md` (loose), `.codex/skills/…`, `.cursor/skills-cursor/builtin-one`, `.cursor/plugins/p/skills/plug-one` with a `node_modules/` decoy, `.gemini/antigravity/{skills,global_skills}/…`, `.hermes/profiles/coding/skills/nested/deep-research`, `.cache/skills/ignored` and `.skill-cabinet/skills/ignored` (both must be ignored by the denylist), a skill with `scripts/read.sh` containing `cat ~/.ssh/id_rsa`, a skill with `hooks/hooks.json`, a skill with a `curl … | bash` fence, a skill whose frontmatter is invalid YAML, and a skill whose description is a negated standing order.

### 12.2 Unit tests

- Ports of upstream `classify`, `census`, `copies`, `delete`, `audit`, `invocation`, `quarantine`, `shelf-actions` test files (node:test → vitest, same assertions).
- `origin`: frontmatter/path/link/plugin.json/git cases, attested vs inferred.
- `frontmatter`: no block, unterminated block, invalid YAML → `_parseError`, non-object YAML → `{}`.
- `guards`: Host/Origin accept `127.0.0.1`, `localhost`, `[::1]` with the expected port; reject other hosts, wrong port, missing/garbage; `tokenMatches` rejects length mismatch and near-misses.
- `editor`: happy path preserves mode and writes atomically (no tmp left); wrong `baseHash` → 409 and file untouched; `SKILL.md` symlinked outside → 400; file skill; broken card → 400.
- `markdown`: fixtures `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `[x](javascript:alert(1))`, `[x](data:text/html;base64,…)`, raw `<a href>` — output contains no `<script`, no `onerror`, no `javascript:`; tables and fenced code render.
- `tokenEstimate`: `ceil(len/4)`, 0 for broken, census sum excludes quarantined and references.
- `catalog`: TTL expiry, `force`, `invalidate`.
- `launch`: `pickPort` skips occupied ports, `makeToken` is 64 hex chars and differs between calls.

### 12.3 E2E tests

- `GET /` with correct Host returns HTML containing the token; with `Host: evil.com` or the wrong port → 403 (sent via `node:http`, because `fetch` refuses to override `Host`).
- `GET /api/skills` with bad Host → 403; with good Host → cards, scopes, census match the fixture (counts, Hermes label, cursor plugin, denylist honoured, loose skill, broken link).
- `POST /api/skills/quarantine` without Origin, with `Origin: http://evil.com`, without token, with a wrong token → 403; with all three → 200.
- `Content-Length` > 1 MB → 413; invalid JSON → 400.
- No `Access-Control-*` headers on `GET /api/health` and on `OPTIONS /api/skills/delete`.
- `GET /api/skills/:id/file?path=../../etc/passwd` → 400; symlink inside the skill pointing outside → 400.
- Quarantine → card appears on the quarantine shelf with `fromScope`; restore → back at the exact path; restore into an occupied path → 409.
- Restore of an entry produced by **upstream**: `test/fixtures/upstream-quarantine/` holds a `quarantine.json` and skill folder generated by running the reference clone's `quarantineSkill` once; paths are stored with a `{{HOME}}` placeholder substituted at setup. shelfware restores it.
- `POST /api/skills/delete` on a live card → 200 with the card in `errors[]` (`Not quarantined; pass force…`) and the folder untouched; with `force: true` → deleted; on a quarantined card → deleted and manifest entry dropped.
- `PUT /api/skills/:id` happy path returns updated `contentHash`/`tokenEstimate`; stale `baseHash` → 409 with `currentHash`; invalid YAML in the new source → 200 with `frontmatter._parseError`.
- `DELETE /api/skills/:id` → 404.

### 12.4 Component tests

- `useShelfKeys`: keydown `j`/`k` moves selection with bounds, `x` toggles marks, keys do nothing while an input is focused, `q` is inert on the quarantine shelf, `d`/`r` inert on live shelves.
- `SkillEditor`: typing sets dirty; Save calls the API with `baseHash`; 409 shows the Reload action and keeps the text.

---

## 13. Distribution

### 13.1 `bin/shelfware.mjs` + `bin/launch.mjs` (Node built-ins only)

Flags: `--port <n>` (also `PORT`), `--no-open` (also `SHELFWARE_NO_OPEN=1`). Steps:

1. `pickPort(start = 3781)`: if `--port`/`PORT` is set use it verbatim; otherwise probe 3781, 3782, … (≤ 20) by listening on `127.0.0.1` and closing.
2. `makeToken()` → `NUXT_PUBLIC_SHELFWARE_TOKEN`; set `NITRO_HOST=127.0.0.1`, `NITRO_PORT=<port>`, `NODE_ENV=production`.
3. `await import('../.output/server/index.mjs')`; fail with a clear message if `.output` is missing.
4. `waitForHealth(port)`: poll `GET /api/health` via `node:http` with `Host: 127.0.0.1:<port>` (≤ 10 s).
5. Print `shelfware at http://127.0.0.1:<port>` and open the browser (`open` / `xdg-open` / `cmd /c start`) unless disabled.

### 13.2 `package.json`

```jsonc
{
  "name": "shelfware",
  "version": "0.1.0",
  "type": "module",
  "bin": { "shelfware": "bin/shelfware.mjs" },
  "files": ["bin", ".output"],
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:component": "vitest run --project component",
    "test:e2e": "vitest run --project e2e",
    "pack:verify": "node scripts/pack-verify.mjs",
    "prepublishOnly": "pnpm build && pnpm test"
  },
  "dependencies": {},
  "devDependencies": { "nuxt": "^4.5", "@nuxt/ui": "^4.9", "tailwindcss": "^4", "markdown-it": "^14", "yaml": "^2.8", "vitest": "latest stable", "@nuxt/test-utils": "latest stable", "happy-dom": "latest stable", "@types/markdown-it": "^14" }
}
```

Runtime `dependencies` stay empty: Nitro bundles everything into `.output`, and the bin uses only built-ins. `.output` remains in `.gitignore`; it exists only in the published tarball.

`scripts/pack-verify.mjs`: `pnpm pack` → copy the tarball to a temp dir → `npx --yes ./shelfware-<v>.tgz --no-open --port <free>` → poll `/api/health` with the right `Host` → kill → exit 0/1. v0.1 is "done" only when this passes.

Register the npm name early: publish `0.0.1` as a placeholder (bin prints "coming soon") before any public commits.

### 13.3 `nuxt.config.ts`

```ts
export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  ssr: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ui: { fonts: false },
  devtools: { enabled: false },
  nitro: { preset: 'node-server' },
  runtimeConfig: { public: { shelfwareToken: '' } },
  app: { head: { title: 'shelfware' } },
})
```

---

## 14. Suggested implementation order

Each phase ends green (tests pass) and is a sensible commit boundary for the plan:

1. **Scaffold** — Nuxt 4 + Nuxt UI + Vitest projects + fixture-home helper; `GET /api/health`; Host middleware with unit + e2e tests.
2. **Scanner core** — `frontmatter`, `scan` (roots, collect, summarise, census, copies, read), `origin`, `invocation`, `audit-rules`, `audit`; ported upstream unit tests green; `tokenEstimate`.
3. **Catalog routes** — cache, `GET /api/skills`, `GET /api/skills/:id`, `GET …/file`; e2e listing tests.
4. **Mutation guard + quarantine** — Origin/token/body-limit middleware, `quarantine.ts`, the three POST routes, upstream-manifest fixture, `force` semantics.
5. **Editor** — `editor.ts`, `PUT`, tests.
6. **Client: catalog** — layout, DrawerRail, tray, cards, search/filters, reader (Manuscript/Source/Folio), markdown with XSS tests, action slip, keyboard.
7. **Client: editor** — Edit tab, save/409 flow, component tests.
8. **Distribution** — bin, pack-verify, README, placeholder publish.

---

## 15. Deferred to v0.2

Shiki highlighting for Source/Folio; `--root <path>` project-level drawers; frontmatter form (name/description + raw YAML remainder); CodeMirror editor; user-defined audit rules; Windows testing.
