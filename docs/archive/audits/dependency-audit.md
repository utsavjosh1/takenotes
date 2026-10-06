# Dependency audit — takenotes

AUDIT REVISION: ca1e54e…

## Runtime dependencies (packaged) — each justified

| Package | Importer | Why |
|---|---|---|
| `react`, `react-dom` 19.3.0 | renderer | UI framework (core stack) |
| `@codemirror/{state,view,commands,language,search,lang-markdown,autocomplete}` | editor | CodeMirror 6 editor (core stack) |
| `@lezer/highlight` 1.2.3 | editor theme | Markdown syntax classes (was transitive; promoted to direct this audit) |

No axios/fetch/ws/telemetry libs. No native addons in app code.

## Build/dev dependencies

`electron` 44.3.0, `electron-builder` 26.15.3, `vite` 8.3.0, `esbuild` 0.28.2,
`typescript` 5.9.3, `eslint` + `typescript-eslint`, `vitest` 5, `@vitejs/plugin-react`,
`@types/*`. All build/test-only. Correctly separated in package.json
(electron-builder under devDependencies — verified).

## Lockfile / supply chain

- 478 packages, ALL resolved via `https://registry.npmjs.org` (script scan, zero exceptions).
- No git / http-tarball / file: / local dependencies.
- `allowScripts`: only `esbuild`, `electron-winstaller`, `electron` — expected (native postinstall for Electron toolchain).
- `.node` binaries: only inside `@electron-internal/extract-zip` (electron-builder dep, dev-only). No runtime native addons.
- `npm audit` + `npm audit --omit=dev`: **0 vulnerabilities** (both).
- Duplicates: no duplicate majors observed in `dependencies` (shallow tree: react/codemirror only).

## Special notes

- `build-config.json` pins the WSL Node runtime version; `fetch-wsl-runtime.mjs`
  verifies the archive against official `SHASUMS256.txt` and FAILS on mismatch
  (no warn-and-continue). No `/latest/` or `@latest` floating refs anywhere.
- Release-time network (fetching Node archive on the build machine) is the ONLY
  sanctioned network use, and it never runs on user machines.
