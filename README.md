# takenotes

Filesystem-first, Markdown-first, local-first Windows notebook with WSL
awareness. Your Markdown files stay ordinary files — the app adds an interface
around them and never makes itself necessary for accessing them.

> Status: **foundation / pre-release (v0.0.8)**. The Windows → WSL runtime
> direction is still being validated and should be tested on real Windows 11 + WSL2
> before release claims are made.

## Supported platforms (target)

- Windows 11 x64, WSL2, Ubuntu 22.04 / 24.04 x64.
- macOS, native Linux desktop, ARM, WSL1, other distros: NOT claimed.

## Architecture

The app is moving toward a structured workspace layout:

- `apps/desktop` / Electron shell
- `apps/web` / browser renderer entry
- `apps/server` / host runtime server
- `packages/*` / contracts, core policy, platform helpers, UI, and test support
- `tools/*` / build scripts and WSL helper tooling

Long term, WSL should be a first-class host runtime rather than a per-operation
`wsl.exe` helper bridge.

## Development

Requires Node 24 (`nvm use` reads `.nvmrc`).

```bash
npm ci
npm run dev        # Windows: Vite + Electron
npm test
npm run typecheck
npm run build
npm run package:win  # Windows installer (Windows host)
```

No native toolchains, no second language, and no database.

Local planning/design notes live under `docs/`. That folder is versioned in
the GitHub repository but intentionally excluded from the product website.

## Releases

Unsigned early builds; version source is `package.json`; tag `vX.Y.Z` must
match.
