# Registering the npm name

Spec §13.2 asks for `shelfware@0.0.1` as a placeholder before any public commits, so the name is ours. Publishing is done by a person, from a terminal logged into npm, never by an agent.

## Placeholder package

In a scratch directory (not this repo):

```bash
mkdir shelfware-placeholder && cd shelfware-placeholder
cat > package.json <<'EOF'
{
  "name": "shelfware",
  "version": "0.0.1",
  "description": "shelfware finds the shelfware in your skill drawers. Coming soon.",
  "type": "module",
  "bin": { "shelfware": "bin/shelfware.mjs" },
  "files": ["bin"],
  "engines": { "node": ">=20" },
  "license": "MIT"
}
EOF
mkdir bin
cat > bin/shelfware.mjs <<'EOF'
#!/usr/bin/env node
console.log('shelfware: coming soon. Watch https://www.npmjs.com/package/shelfware')
EOF
chmod +x bin/shelfware.mjs
cp /path/to/shelfware/LICENSE . && npm publish --access public
```

## Real release

From this repo, once `pnpm pack:verify` passes:

```bash
pnpm build && pnpm test && pnpm pack:verify
npm publish --access public
```

`prepublishOnly` reruns build and tests; `files` ships `bin/` and `.output/`, and npm always adds `package.json`, `README.md` and `LICENSE` on top of it.
