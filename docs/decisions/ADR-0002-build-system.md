# ADR-0002 — Build system (Vite + esbuild + electron-builder)

Date: 2026-09-14 · Status: accepted

## Decision

- Vite owns the renderer bundle only.
- esbuild (small scripts in `scripts/`) owns Node-side bundles: main, preload,
  WSL helper (single `helper.cjs`).
- electron-builder (v26 stable, config in `electron-builder.yml`) owns Windows
  NSIS packaging. No experimental Vite/Electron integration, no monorepo
  framework (single root `package.json`).

## Rationale

Each tool has one clear responsibility; the build stays explainable and
debuggable. Three tiny entry points don't justify an Electron build framework.

## Consequences

- `npm run build` → `dist/renderer/`, `dist-electron/`, `dist-helper/`.
- `npm run package:win` packages only; never auto-publishes (`--publish never`).
