# shelfware

shelfware finds the shelfware in your skill drawers.

A local catalog of the AI-agent skills installed on this machine: every `~/.<tool>/skills` drawer (`~/.claude/skills`, `~/.cursor/skills`, `~/.codex/skills`, `~/.agents/skills`, a custom `~/.claude-work/skills`, …), Cursor plugins, Gemini Antigravity, Hermes profiles, and friends. It scans, lists, searches, renders, **edits**, audits, quarantines, restores, and permanently deletes skills, from a browser tab that only your machine can reach.

## Run it

```bash
npx shelfware@latest
```

Options: `--port <n>` (or `PORT`), `--no-open` (or `SHELFWARE_NO_OPEN=1`), `--help`. The server binds `127.0.0.1` on the first free port from 3781 and opens your browser. Stop it with Ctrl-C.

Node 20 or newer. No build step: the package ships the prebuilt app. For a permanent install, `npm i -g shelfware` and then `shelfware`.

### First run

Starting shelfware only reads. It walks the hidden directories directly under your home (`$HOME`), skipping caches and toolchains, and picks up every `skills/` (or `skill/`) folder it finds, plus the Cursor, Gemini Antigravity and Hermes locations above. Nothing on disk changes until you quarantine, restore, delete or save a skill yourself.

Skills outside your home directory (project-level `.claude/skills` inside a repository, an arbitrary path) are not scanned in v0.1; a `--root <path>` flag is planned. To scan a different home, run `HOME=/other/home npx shelfware@latest`.

### Troubleshooting

- **`npx shelfware` prints "coming soon".** Your npx cache still holds the `0.0.1` placeholder. Run `npx shelfware@latest` once; npx then caches the real release.
- **The browser did not open.** Copy the URL from the `shelfware at http://127.0.0.1:<port>` line, or start with `--no-open` and open it yourself.
- **Port in use.** An explicit `--port <n>` that is taken is refused at once with a one-line message; without either the flag or PORT shelfware tries 3781 through 3800. A typo in a flag prints the message and the help text instead of a stack trace.
- **The catalog is empty.** Check that your skills live under `$HOME/.<tool>/skills`; other locations are not scanned yet.

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

## Security scanners

Supply-chain scanners such as Socket.dev raise a few alerts on this package. None of them is shelfware's own code; all come from the prebuilt Nuxt server that ships in `.output/`:

- **"Obfuscated code"** in `entities/…/decode-data-html.js`: the HTML entity table of the `entities` library, stored as Base64 and decoded into a `Uint16Array` at load time. Byte-identical to the published `entities` package.
- **"Dynamic code execution"** in `source-map-js` and the Vue compiler: `new Function` used by a sort routine and by Vue's template compiler. shelfware never compiles templates at runtime (`ssr: false`, no runtime compiler).
- **"URL strings"**: the Iconify API hosts baked into `@nuxt/icon` (the provider is disabled and every icon is bundled), XML namespaces, documentation links in framework error messages, and file names such as `SKILL.md` that merely contain a dot.

The launcher itself uses only Node built-ins, binds `127.0.0.1`, spawns nothing but your browser opener, and has no install scripts. `pnpm pack:verify` rebuilds, packs and runs the exact tarball through `npx` before every release, and releases are published from GitHub Actions with npm provenance.

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
