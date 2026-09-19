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

`node --version`, `npm --version`, `npm view` for each pinned dependency.

### Commands executed

```bash
node --version && npm --version
npm view electron version / react / vite / typescript / electron-builder
```

### Evidence

Node v24.19.0, npm 11.17.0, Ubuntu 24.04 (WSL2 kernel) container.

### Remaining work / Next concrete action

Run Windows-side verification (Stage 2 gate) on a Windows 11 machine.

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
npm run version:check  # ok: 0.0.1
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

### P1-02 — Distro discovery update (2026-09-19, Linux-verified only)

Implemented: `wsl.exe -l -v` verbose-first discovery with `--list --quiet`
fallback, parsed to `{ name, state, version, isDefault }` records and served
through the `WorkspaceService` seam (`workspace:listWsl`); the "Open WSL
folder…" picker shows `Name · Running|Stopped · WSL2` (+ default marker).
Listing spawns list-only argv (`-l -v`, `--list --quiet`) and never starts a
distro. Logic tests (`tests/wsl/distro-discovery.test.ts`, parser +
orchestration with injected runner) and preload-surface guards pass on Linux;
the live list-while-stopped check (`tests/wsl/distro-list.windows.test.ts`)
is Windows-gated and NOT yet executed — still needs a Windows 11 host with
two distros (one stopped) to record before/after states here.

### P1-03 — Linux-user discovery update (2026-09-19, Linux-verified only)

Implemented: helper `users.list` (`/etc/passwd`-backed, uid ≥ 1000 plus the
current user, threshold overridable) with per-user `~` expansion;
`wsl.exe -d <distro> -u <user>` run-as-user spawn (no sudo); narrow
`workspace.listWslUsers(distro)` bridge; `connectWsl(distro, linuxUser,
linuxPath)` 3-arg end to end (old 2-arg form removed); registry and
`WorkspaceInfo` carry `linuxUser`; `workspaceKeyFor` includes the user, so
`Ubuntu/utsav` and `Ubuntu/work` are distinct workspaces. Picker flow is
distro → users (default preselected) → path → Connect; discovery enters only
the selected distro as its default user. Logic tests (parser, transport,
argv, registry) plus helper `users.list`/`~` direct-spawn round-trips pass on
Linux. Live Windows evidence (`users-list.windows.test.ts`, stopped-distro
stability) is Windows-gated and NOT yet executed — needs a Windows 11 host
with two Linux users to verify `-u` spawn, per-user `~`, and the picker.

## Stages 7–10

Status: blocked (same environmental blocker).

Watching/reconciliation, notebook UI completion, release pipeline execution,
and clean-machine install test all await Windows + WSL access.

## Repair pass — pre-P1-11 audit findings (2026-09-19, Linux-verified only)

Status: corrective pass only. No new product features. P1-11 real-Windows
verification is STILL NOT VERIFIED — nothing below substitutes for it.

- H-01 FIXED: recovery now uses a stable namespace (`kind + canonical root +
  distro + linuxUser` via the drafts `workspaceKeyFor` identity) resolved at
  the IPC boundary. Reopen under a new runtime `workspaceId` keeps history;
  `Ubuntu/utsav` vs `Ubuntu/work` stay isolated. Old `recovery/<random-id>/`
  development data is preserved on disk, not migrated, not surfaced.
  Tests: `tests/workspace/recovery-reopen.test.ts` (reopen, WSL isolation,
  restore-after-reopen, stale-CONFLICT).
- M-01 FIXED: `recovery:read` is now `(workspaceId, snapshotId)` scoped to the
  workspace namespace; cross-workspace reads fail `NOT_FOUND`. No global
  snapshot lookup reaches the renderer.
- H-02 FIXED (landed): production native note read/update runs
  `CoreNoteService` via `NativeFileAdapter`; `tests/contracts/` proves the
  production path satisfies the Core contract (BOM, CRLF, CONFLICT,
  TOO_LARGE, error codes). Directory/tree/rename/delete/trash stay on the
  existing host layer intentionally.
- M-04 FIXED: `app:platform` + `app:version` now enforce `senderIsOurs` like
  every other handler (`src/main/ipc/guard.ts`, tripwired by
  `tests/ipc/sender-guard.test.ts`).
- H-04 FIXED: index bounds (2000 listed files, 1 MiB per file) now produce a
  user-visible notice (`indexStatusMessage`) wired into the status strip and
  the Search panel.
- H-03 (Gate B status) CLARIFIED: `SingleOwnerAuth` is labeled TRANSPORT
  PARITY PROOF ONLY. The fuller owner-auth server (`auth-store.ts`) passes
  `tests/server/gate-c.test.ts`; its deployment (Docker/TLS/real host) is
  NOT VERIFIED. Bare server runs bind 127.0.0.1 by default.
- M-02 DOCUMENTED: single active WSL helper session is a Phase 1 limitation;
  identity mismatch fails closed (DISCONNECTED), never wrong-user execution.
  Manual scenario added to P1-11 item 9.
- M-03 DOCUMENTED + TRIPWIRED: `tests/core/confinement-vectors.test.ts` runs
  one vector table against Core, the production native adapter, and
  windows-local validation; the WSL helper is covered by its round-trip
  symlink tests. Windows reserved-name behavior is P1-11, not a vector.
