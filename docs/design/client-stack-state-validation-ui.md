# Client stack: lightweight picks only (desktop + mobile)

Date: 2026-09-21. Sources: npm registry metadata read directly on that date.
Rule for this doc: only dependencies that are zero-dep (or near), need no
new build pipeline, and can be adopted incrementally. Everything heavier was
evaluated and cut — one line each at the bottom. No cross-platform component
library: the desktop is DOM + CodeMirror, mobile will need its own editor, so
sharing components buys little (full analysis was here before trimming).

Repo constraints: desktop renderer is React 19.3 DOM + CodeMirror in
Electron; mobile is an empty Expo scaffold (`apps/mobile`); domain logic is
framework-agnostic TS in `packages/core`; tokens live in `packages/ui`.

## 1. State → zustand 5.0.15

- Peer `react >= 18` ✓ on our 19.3. Zero runtime dependencies. RN-safe.
- Vanilla (React-free) store can sit next to `packages/core` logic and be
  consumed by Electron now, Expo later.
- Adopt incrementally: one store at a time (panes, selection, palette,
  settings) out of ad-hoc hooks. No provider rewiring, no boilerplate.

## 2. Validation → valibot 1.5.0

- Zero dependencies (peer: TS >= 5). Import only the validators you use —
  smallest bundle of the options, which matters most on mobile.
- Framework-agnostic: schemas live in `packages/contracts` (protocol frames)
  and `packages/core` (workspace/note invariants), run unchanged on
  Electron, Expo, and Node. Adopt one schema at a time, replacing
  hand-rolled guards.

## 3. Forms → react-hook-form 7.88.0 (+ @hookform/resolvers 5.9.1)

- Peer react 16.8–19 ✓. Zero dependencies. Works on React Native via
  `Controller` — same API on both platforms.
- Note: this flips the earlier call. TanStack Form shares logic outside
  React, but it is v1.x with a larger dep tree and more concepts; under a
  lightweight filter, RHF's single-hook API and maturity win. The valibot
  resolver (`@hookform/resolvers` supports valibot ^1) reuses the schemas
  from §2, so validation still stays shared.
- Scope: validated forms only (settings, workspace add/connect, server
  owner-auth). Palette/search inputs stay on plain `useState`.

## 4. Styling → tokens in `packages/ui`, no library

- `tokens.css` already serves the DOM side; add a matching RN theme object
  (same names/values) when mobile starts. One thin component set per
  platform. Zero new dependencies, zero config.

## 5. Adoption (in order)

1. `packages/contracts` + `packages/core`: add `valibot`, schema-by-schema.
2. `apps/desktop`: add `zustand`, store-by-store.
3. `apps/desktop` validated forms: add `react-hook-form` + valibot resolver.
4. `apps/mobile` (when scaffolded): reuse 1–3, add RN theme tokens. Done.

## 6. Evaluated and cut as heavyweight (not implementing)

- `@reduxjs/toolkit`, `jotai`: more machinery than our coarse state needs.
- `zod`, `arktype`: fine libraries; zod ships whole-lib, arktype is
  smallest-community — valibot wins on bundle + modularity.
- `@tanstack/react-form`: better sharing story, heavier to implement (v1.x,
  larger tree). Revisit only if form logic must run outside React.
- `@tanstack/react-query`: no server state to manage yet; revisit for sync
  status/sessions. No TanStack Router (panes on desktop, expo-router later).
- `tamagui`, `nativewind`, `react-native-paper`, `react-native-unistyles`,
  `react-native-web`: each needs a compiler, a rewrite, or serves only one
  platform. Rejected.
