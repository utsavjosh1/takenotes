# MVP status

> **NOT VERIFIED ON REAL WSL.** Linux CI covers helper logic directly on
> Ubuntu Node; the Windows → `wsl.exe` → bundled-Node → helper round-trip has
> not been executed in this environment (Linux container, no `wsl.exe`).

## Stage 0 — Audit environment

Status: complete

### Implemented

Environment inspected; versions pinned (Electron 44.3.0, React 19.3.0,
Vite 8.3.0, TypeScript 5.9.3 stable — see ADR-0001, electron-builder 26.15.3,
Node 24.19.0, WSL runtime Node 24.19.0).

### Verification performed

`node --version`, `npm --version`, `npm view` for each pinned dependency,
SilverBullet read-only `git status`/`remote`/`rev-parse`.

### Commands executed

```bash
node --version && npm --version
npm view electron version / react / vite / typescript / electron-builder
git status --short --branch (silverbullet, read-only)
```

### Evidence

Node v24.19.0, npm 11.17.0, Ubuntu 24.04 (WSL2 kernel) container.
SilverBullet at `/home/utsav/Projects/silverbullet`, commit `e43ec4d…`, MIT.

### Remaining work / Next concrete action

Run Windows-side verification (Stage 2 gate) on a Windows 11 machine.

## Stage 1 — Inspect SilverBullet

Status: complete

### Implemented

`docs/reference/silverbullet.md` records path, remote, commit, branch, dirty
state, license, files inspected, concepts borrowed vs. intentionally not copied.
No code copied; no modification to the checkout.

### Verification performed

Read-only git inspection + source reads of editor/search/tree areas.

### Next concrete action

None (reference only).

## Stage 2 — Scaffold

Status: complete (Linux-verified; Windows packaging gate remains)

### Implemented

Full repo scaffold: Electron main/preload/renderer, Vite, esbuild builders,
electron-builder NSIS config, CodeMirror 6 editor module, command registry,
version scripts, CI + release workflows, docs, ADRs.

### Verification performed

`npm install`, `typecheck`, `lint`, `vitest`, `build` — all executed
successfully in this Linux container on 2026-09-14. PLUS, after the user
pointed out we are inside WSL: the REAL app was launched under Linux
Electron (WSLg display, NSS libs fetched rootless via `apt download` +
`dpkg -x` into git-ignored `.dev-libs/`) and verified via
`scripts/smoke-linux.mjs` (CDP, no product-code changes):

- Window opens with title "takenotes", React mounts header/tree/tabs
- `window.takenotes` exposes exactly
  `app,directory,events,file,search,workspace`
- `window.ipcRenderer`/`require`/`process` are all undefined in the renderer
- Zero renderer console errors; screenshot in `smoke-artifacts/window.png`
- The smoke caught and fixed TWO real bugs: CJS bundle emitted as `.js`
  under `"type": "module"` (now `.cjs`), and renderer path resolving to
  `/renderer` instead of `/dist/renderer`.

Environment finding: this container has NO Windows interop (`wsl.exe`
absent, `/mnt/c` contains only `Users`) — likely a Docker-Desktop-style WSL
distro. So the `wsl.exe` spawn path genuinely cannot run here; that plus
NTFS behavior plus the Windows installer remain for a Windows 11 host.

### Commands executed

```bash
npm install            # ok (esbuild/electron scripts approved)
npm run typecheck      # ok, clean
npm run lint           # ok, 0 errors (11 no-console warnings in scripts — allowed)
npm test               # ok: 5 files passed, 1 win32-only skipped; 24 passed, 9 skipped
npm run build          # ok: dist/renderer, dist-electron/main+preload, dist-helper/helper.cjs
npm run version:check  # ok: 0.1.0
npm run release:verify # ok (installer not required in this environment)
```

### Known limitations

Electron window launch requires Windows; NOT verified here.

### Next concrete action

On Windows 11: `npm ci && npm run dev`, confirm window + React render +
bridge, then record evidence here.

## Stage 3 — Local Windows workspace

Status: partial

### Implemented

Folder-open dialog, workspace registry, `directory.list`, `file.read` with
SHA-256 revision + newline/BOM handling, atomic safe write with CONFLICT,
`file.create`, path validation, symlink-escape rejection.

### Verification performed

Shared validators tested on Linux (`tests/filesystem/paths.test.ts`, pass).
`tests/filesystem/files.test.ts` is honestly gated to Windows
(`describe.runIf(process.platform === "win32")`) because the module uses
`path.win32` end-to-end and cannot execute on Linux — runs in the Windows CI
job. Real Windows NTFS behavior NOT yet executed (awaits Windows CI/host).

### Next concrete action

Open a real Windows Markdown folder in the app; edit + save; verify from
another editor.

## Stage 4 — WSL helper direct test

Status: partial

### Implemented

Helper (`hello`, `workspace.open/close`, `directory.list`, `file.read/write`,
`file.create`), framed protocol, direct-spawn round-trip test.

### Verification performed

`tests/integration/helper-roundtrip.test.ts` runs the REAL bundled helper
under Ubuntu Node (this environment) — handshake through conflict handling.
Passed on 2026-09-14 (part of `npm test`: 24 passed).

### Next concrete action

Run `npm test`; Stage 5 needs the staged runtime binary.

## Stage 5 — Bundled WSL runtime

Status: partial

### Implemented

`fetch-wsl-runtime.mjs` (official download + SHA-256 verify, fail on
mismatch), `stage-wsl-runtime.mjs` (extract node, copy helper, real-hash
`manifest.json`), `build-config.json` pin.

### Verification performed

None yet (requires network download + Linux binary execution).

### Commands to run later

```bash
npm run build:helper
node scripts/fetch-wsl-runtime.mjs
node scripts/stage-wsl-runtime.mjs
~/.local/share/takenotes-test-check  # verify staged node runs helper
```

### Next concrete action

Run the three commands above on a release machine; record hashes.

## Stage 6 — Windows → WSL

Status: blocked

Blocked on: Windows 11 host with WSL2 + Ubuntu. All code paths implemented
(`distributions.ts`, `runtime-installer.ts`, `helper-supervisor.ts`, IPC
`wsl:connect`); execution NOT performed here.

## Stages 7–10

Status: blocked (same environmental blocker).

Watching/reconciliation, notebook UI completion, release pipeline execution,
and clean-machine install test all await Windows + WSL access.
