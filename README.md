# takenotes

Filesystem-first, Markdown-first, local-first Windows notebook with WSL
awareness. Your Markdown files stay ordinary files — the app adds an interface
around them and never makes itself necessary for accessing them.

> Status: **foundation / pre-release (v0.1.0)**. The Windows → WSL round-trip
> has **NOT been verified on real WSL** yet — see `docs/mvp-status.md`.

## Supported platforms (target)

- Windows 11 x64, WSL2, Ubuntu 22.04 / 24.04 x64.
- macOS, native Linux desktop, ARM, WSL1, other distros: NOT claimed.

## Architecture

React + CodeMirror renderer (no Node) → narrow preload bridge → Electron main
(workspace registry, Windows fs, WSL supervisor) → `wsl.exe` → bundled Linux
Node → `helper.cjs` → Linux fs. See `docs/architecture.md`.

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

No native toolchains, no second language, no localhost server, no database.
See `docs/development.md`, `docs/security.md`, `docs/release.md`.

## Releases

Unsigned early builds; version source is `package.json`; tag `vX.Y.Z` must
match. Full flow in `docs/release.md`.
