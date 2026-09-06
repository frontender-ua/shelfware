# shelfware

shelfware finds the shelfware in your skill drawers.

A local catalog of the AI-agent skills installed on this machine: `~/.claude/skills`, `~/.cursor/skills`, `~/.codex/skills`, `~/.agents/skills`, Cursor plugins, Gemini Antigravity, Hermes profiles, and friends. It scans, lists, searches, renders, **edits**, audits, quarantines, restores, and permanently deletes skills, from a browser tab that only your machine can reach.

## Run it

```bash
npx shelfware
```

Options: `--port <n>` (or `PORT`), `--no-open` (or `SHELFWARE_NO_OPEN=1`), `--help`. The server binds `127.0.0.1` on the first free port from 3781 and opens your browser.

Node 20 or newer. No build step: the package ships the prebuilt app.

## What you get

- **Drawers**: one per install scope, with counts; a house census (physical cards, copies and wasted bytes, references, broken links, a rough token total).
- **Cards**: kind, form (file / link / broken), origin with its certainty, copies, static audit risk, invocation mode, `~tokens`.
- **Reader**: rendered manuscript, raw source, file folio with text previews, and a raw editor for `SKILL.md` with an optimistic save (409 when the file changed on disk).
- **Quarantine**: cards move to `~/.skill-cabinet/quarantine/` and can be restored to the exact path they came from. Permanent delete only from the quarantine shelf. The manifest format is the one skill-cabinet uses, so both tools can read each other's trash.
- **Keyboard**: `/` find, `j`/`k` move, `x` mark, `q` quarantine, `r` restore, `d` delete, `e` edit, `⌘S` / `Ctrl+S` save.

## Security model

- Every request that reaches the app must carry a loopback `Host` (`127.0.0.1`, `localhost`, `[::1]`) on the bound port; anything else is refused. This closes DNS-rebinding reads.
- Every mutation must carry a loopback `Origin` and a per-run session token that only the served page knows.
- No CORS headers, ever. File reads and saves are contained to the skill's directory; symlinks are never followed for destructive actions.
- Nothing leaves the machine. There is no network feature.

## Credits

Scanner rules, audit heuristics and the quarantine format are ported from [skill-cabinet](https://github.com/subsy/skill-cabinet) (MIT), whose audit rules were adapted from [Adaptive Skills](https://github.com/wangsoft/Adaptive-Skills) (MIT). shelfware is a rebuild in Nuxt 4 with an editor and a hardened local security model.

## Development

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm test           # unit + nuxt + e2e
pnpm build
pnpm pack:verify    # packs and runs the tarball through npx
```

MIT.
