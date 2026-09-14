# ADR-0001 — Desktop shell and frontend versions

Date: 2026-09-14 · Status: accepted

## Decision

- Electron **44.3.0** (latest stable 44.x at implementation time), pinned exact.
- React **19.3.0**, Vite **8.3.0**, electron-builder **26.15.3**, esbuild **0.28.2**.
- **TypeScript 5.9.3** (latest stable), NOT 6.x.

## Rationale / deviation

The spec asked for TypeScript 6.x, but on 2026-09-14 no stable TypeScript 6
exists — only `6.0.0-beta` / dev tags (`npm view typescript versions`). Per the
spec's own rule ("Do not use alpha, beta, nightly, or canary builds"), using
TS 6 beta would violate the stability principle. TS 5.9.3 is the newest stable
and is fully compatible with our usage. Revisit when TS 6 reaches stable.

## Consequences

- `package.json` pins exact versions; `package-lock.json` is committed.
- Electron stays on major 44 for MVP; upgrades follow the documented process.
