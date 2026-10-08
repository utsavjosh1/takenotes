# Post-MVP WSL — status

Status: logic-implemented, Linux-verified. Live Windows 11 + WSL2 gate NOT
executed in this environment (Linux container, no `wsl.exe`, no NTFS, no
`TAKENOTES_LIVE_WSL=1` run) — no live-WSL claim is made. Logic counterparts
pass here; every live item below is BLOCKED, not passed.

## Slice 7a — Audit (this slice, docs only, no prod behavior change)

Inventory of the shipped WSL stack against the roadmap Post-MVP gate:

- Discovery (`apps/desktop/src/main/wsl/distributions.ts`,
  `output-decoder.ts`): verbose-first `wsl.exe -l -v` with `--list --quiet`
  fallback, parsed to `{name, state, version, isDefault}`. Spawn is
  `shell:false`, list-only argv (`-l -v`, `--list --quiet`) — listing never
  starts a distro. Served through the `WorkspaceService` seam
  (`workspace:listWsl`); picker shows `Name · Running|Stopped · WSL2`.
- Linux users (`tools/wsl-helper/src/index.ts` `users.list`,
  `tools/wsl-helper/src/users.ts`, `apps/desktop/src/main/wsl/user-discovery.ts`):
  `/etc/passwd`-backed, uid ≥ 1000 plus current/default always, bad lines
  skipped. Ephemeral helper enters only the selected distro as its default
  user; `connectWsl(distro, linuxUser, linuxPath)` 3-arg end to end
  (old 2-arg form removed). Registry + `WorkspaceInfo` carry `linuxUser`;
  `workspaceKeyFor` includes the user, so `Ubuntu/utsav` vs `Ubuntu/work`
  are distinct workspaces.
- Spawn (`launch-security.ts`, `helper-supervisor.ts`): `wsl.exe -d
  <distro> -u <user> --exec <node> <helper> --stdio`, separate argv,
  `shell:false`, no sudo. Ephemeral spawn (user discovery) uses `-u`-less
  form as the distro default user and never disturbs the singleton session.
  `resolveWslExe` pins System32 `wsl.exe` on win32; `helperEnv` strips
  `NODE_*`/proxy vars. Distro/user validators reject hostile ids before
  spawn.
- Handshake (`helper-supervisor.ts checkHandshake`): nonce echo +
  `PROTOCOL_VERSION` match + `execPath` under the app-owned runtime
  (`~/.local/share/takenotes/` staged node). Mismatch → `incompatible`,
  child killed, never trusted. Stdout garbage → kill immediately.
- Helper ops (`tools/wsl-helper/src/index.ts`, framed 4-byte BE + UTF-8
  JSON, 16 MiB max, stdout=frames only, diagnostics on stderr):
  `workspace.open/close`, `directory.list/create/rename/delete`,
  `file.read/write/create/rename/delete`, `users.list`. `~` expands in the
  helper under the selected user (main forwards verbatim). Confinement:
  `validatePosixRel` + `resolveInside` (lstat walk, symlinked components
  refused, realpath containment). `file.write` is revision-checked
  (`expectedHash` mismatch → `CONFLICT`); atomic tmp + fsync + rename;
  BOM/newline preserved. `file.delete`/`directory.delete` are permanent —
  renderer labels honestly, never OS-trash.
- Error model (`helper-errors.ts`, helper `mapErrno`): structured codes
  preserved (`NOT_FOUND`, `PERMISSION_DENIED`, `OUTSIDE_ROOT`,
  `DIRECTORY_NOT_EMPTY`, `CONFLICT`, `TOO_LARGE`, `DISCONNECTED`,
  `INVALID_REQUEST`, …). No privilege escalation: EACCES/EPERM stay
  `PERMISSION_DENIED`. Identity mismatch (request vs connected session)
  fails closed `DISCONNECTED`, never wrong-user exec (singleton limitation
  documented).
- Recovery (`workspace/recovery.ts`, `drafts.ts`): stable namespace
  `kind + canonical root + distro + linuxUser` resolved at the IPC
  boundary; reopen under a new runtime `workspaceId` keeps history;
  per-user isolation. `recovery:read` is `(workspaceId, snapshotId)`
  scoped — no cross-workspace reads.
- Renderer (`use-wsl-connect.ts`, picker dialog): distro → users (default
  preselected) → path → Connect flow with stale-response guard. WSL deletes
  confirm `Permanently delete …? This cannot be undone.` Search/index
  (`workspace-index.ts`) parses WSL reads identically (no main module, no
  new IPC for index).

## Verification performed here (7a)

```bash
npx vitest run tests/wsl/distro-discovery.test.ts tests/wsl/linux-users.test.ts tests/wsl/passwd-users.test.ts tests/wsl/preload-surface.test.ts tests/integration/helper-roundtrip.test.ts tests/integration/helper-mutations.test.ts tests/ipc/helper-errors.test.ts
npm run typecheck
npm run lint -- --quiet
```

Results: 7 files, 52 tests passed (parser, orchestration with injected
runner, helper `users.list`/`~` direct-spawn round-trips, error mapping,
preload surface). Typecheck and lint clean. Full-suite perf flakes
(`tests/index/scale.test.ts` 10s budget, `conformance.test.ts` 8 ms p95)
are machine-load only and pass in isolation — unrelated to this slice
(docs-only).

## Slice 7b — Connection record (this slice)

- New pure module `apps/desktop/src/main/wsl/connections.ts`: explicit
  `WslConnection {id, distro, linuxUser, status}` with NUL-joined stable
  keys (distro names may contain spaces, so space-join would be
  ambiguous), `ConnectionStore` (ensure → connecting → connected /
  failed / disconnected / reconnecting / incompatible with an enforced
  edge matrix; attach/detach workspaces; closing the last workspace never
  deletes the record), `connectionStatusForHelperState` (covers both the
  helper supervisor and the runtime supervisor's `failed` state), and
  `workspaceConnectionFor` (projects onto the renderer
  `WorkspaceInfo.connection` union: `connecting` → `reconnecting`,
  `incompatible` → `failed`).
- Wiring (`ipc/register.ts`): store marked `connecting` before any spawn
  (both runtime and helper branches), `connected` + workspace attach on
  open success, `disconnected` on open failure, `failed` on spawn/hello
  failure; supervisor state callbacks project onto the active record while
  the string `wsl-state` broadcast payload is unchanged (renderer
  contract untouched); `workspace:close` detaches but keeps the record.
  Registry + `WorkspaceInfo` carry optional `connectionId` (native
  workspaces: absent; existing deep-equal tests unaffected).
- Tests: `tests/wsl/connections.test.ts`, 13 cases (key vectors +
  ambiguity/distinctness, hostile-identity rejection, both state mappings,
  one-connection-many-workspaces, close-keeps-record, per-user isolation,
  edge-matrix enforcement, unknown-key quiet-ignore). No new IPC surface —
  no sender-guard changes needed.

## Verification performed here (7b)

```bash
npx vitest run tests/wsl/ tests/integration/helper-roundtrip.test.ts tests/integration/helper-mutations.test.ts tests/ipc/ tests/workspace/
npm run typecheck
npm run lint -- --quiet
```

Results: 18 files passed, 3 windows-gated skipped; 129 passed, 4 skipped.
Typecheck and lint clean. Live gate still BLOCKED (see below).

## Slice 7c — Friendly path-error hints (this slice)

- Naming decision (recorded, not deferred): wire codes stay canonical
  (`NOT_FOUND`, `INVALID_REQUEST`, `DISCONNECTED`, … — native parity,
  contract-stable). The roadmap's `PATH_NOT_FOUND`, `NOT_A_DIRECTORY`,
  `CONNECTION_FAILED`, `DISTRO_NOT_RUNNING`, `HELPER_FAILED` are UI-facing
  synonyms produced by the presentation layer — no silent rename, no
  contract churn. Each mapping is pinned by a test name.
- `renderer/error-text.ts`: new pure `wslErrorHint(code, ctx)` (null when
  nothing specific applies; degrades without context, never wrong) +
  `describeWslError` (`Headline — message. Hint.`, identical to
  `friendlyError` when no hint). EACCES→`PERMISSION_DENIED` itself was
  already logic-tested (mode-000 fixture); 7c adds the 700-home/run-as-user
  guidance copy on top of it. Discovery (list-distros/users) errors stay
  raw — hints cover the connect/open path only.
- Wiring: `use-wsl-connect` composes connect failures via
  `describeWslError` with `{operation: "open", distro, linuxUser, path}`;
  the dialog renders the composed string unchanged (no dialog/contract change).
- Tests: `tests/renderer/wsl-error-hint.test.ts`, 12 cases.

## Verification performed here (7c)

```bash
npx vitest run tests/renderer/
npm run typecheck
npm run lint -- --quiet
```

Results: 15 files, 166 tests passed. Typecheck and lint clean.
Live gate still BLOCKED (see below).

## Slice 7d — Service-seam parity proof (this slice)

- `tests/workspace/wsl-seam-parity.test.ts`, 3 cases proving WSL
  workspaces get full Step 0/3/5 behavior through the `NoteService` seam
  (no native fallback, identity on every call):
  1. Two-actor `CONFLICT` over the real helper wire (POSIX-gated, direct
     spawn): stale write fails `CONFLICT` with bytes untouched, fresh
     read-then-write wins.
  2. WSL reads index identically: `readFile` through the seam (Ubuntu/utsav
     identity asserted per call) → `WorkspaceIndex.upsert` → V1 operators
     (`tag:`, `"phrase"`, `task-todo:`, `task-done:`, word-AND, `path:`,
     `[status:]`, `file:`) return the WSL-sourced notes.
  3. Recovery restore on WSL writes back through `notes.writeFile`:
     `file.write` reaches the helper with the snapshot's `expectedHash` +
     identity, content lands, and a restore-before snapshot is retained.
- No prod changes (seam already correct; 7d pins it). Prior coverage this
  relies on: `wsl-mutations` (routing/identity/mismatch), `recovery-reopen`
  (per-user isolation), `search.test.ts` wsl parity block.

## Verification performed here (7d)

```bash
npx vitest run tests/workspace/ tests/index/ tests/search/ tests/wsl/ tests/integration/ tests/ipc/
npm run typecheck
npm run lint -- --quiet
```

Results: 33 files passed, 3 windows-gated skipped; 382 passed, 4 skipped.
Typecheck and lint clean. Live gate still BLOCKED (see below).

## Slice 7e — Operation gating + staged-runtime provenance (this slice)

- `HELPER_OPERATIONS` was declared but enforced nowhere — now both ends:
  helper rejects anything outside the list at the top of `handle()` (so a
  future branch added without updating the list still fails closed), and
  main's `HelperSupervisor.request` rejects before touching the transport
  (fail fast, names the op). Shared `isHelperOperation` guard in
  `contracts/protocol.ts`. Planned ops (`file.trash`, `watch.subscribe`,
  …) and typos fail `INVALID_REQUEST` on both sides.
- Staged provenance (`wsl/runtime-installer.ts`): new `verifyStagedRuntime`
  over the `stage-wsl-runtime.mjs` manifest — fields valid, app protocol
  matches, `node` + `helper.cjs` + `runtime.cjs` hashes match, every
  failure names the file. Wired fail-closed into both `connect()` paths
  (helper + runtime supervisors): packaged installs without a valid stage
  never spawn; dev (no manifest) logs the skip and proceeds unchanged.
- Tests: `tests/wsl/helper-operations.test.ts` (8: guard vectors + main
  gate incl. no-session-touched proof), `tests/wsl/staged-manifest.test.ts`
  (7: intact/tampered/missing/protocol-mismatch/corrupt/dev-skip), plus a
  helper-side gate case in `helper-mutations.test.ts` against a freshly
  built bundle (also proves the new contracts import bundles cleanly).

## Verification performed here (7e)

```bash
npx vitest run tests/wsl/ tests/integration/ tests/ipc/ tests/workspace/ tests/protocol/
npm run typecheck
npm run lint -- --quiet
```

Results: 24 files passed, 3 windows-gated skipped; 161 passed, 4 skipped.
Typecheck and lint clean. Full suite after 7e: 103 files passed, 3 skipped;
1159 passed, 6 skipped — zero failures. Live gate still BLOCKED (see below).

## Known gaps / candidates for 7c+ (not changed in 7b)

- Connection record formalization (ADR-0007): `{distro, linuxUser,
  status}` exists implicitly (supervisor singleton session + per-workspace
  registry) but has no explicit Connection store with status transitions.
  One-connection → many-workspaces holds by construction; status surfacing
  is minimal (`connection: "connected"`, `wsl-state` events).
- Error-code naming: roadmap lists `PATH_NOT_FOUND, NOT_A_DIRECTORY,
  CONNECTION_FAILED, DISTRO_NOT_RUNNING, HELPER_FAILED`; shipped codes use
  `NOT_FOUND`, `INVALID_REQUEST` (not-a-directory), `DISCONNECTED`,
  `INTERNAL_ERROR`. Semantics match, names differ — needs a mapping
  decision, not a silent rename.
- Runtime vs helper transport duality (`runtime-supervisor.ts` +
  `TAKENOTES_WSL_RUNTIME`): bootstrap path exists alongside the helper
  transport; staged-runtime install/verify flow is placeholder-grade.
- `700`-home separation relies on OS enforcement (helper runs as the
  selected user); no dedicated PERMISSION_DENIED demo test exists yet.
- Live evidence suites (`tests/wsl/*.windows.test.ts`,
  `tests/filesystem/directories.test.ts` windows-local) are gated on
  `process.platform === "win32" && TAKENOTES_LIVE_WSL === "1"` and skip
  here by design.

## Slice 7f — Live-suite refresh + host runbook (this slice, no prod change)

- `tests/wsl/mutations.windows.test.ts` was a placeholder (`whoami`
  non-empty only) — replaced with the real CLI-level ground-truth matrix
  (`wsl.exe` only, no Electron, no staged runtime): `-u` identity +
  unprivileged uid per user, per-user `~` matching passwd homes, and the
  700-private tree with a positive control (owner reads `secret`, other
  user denied — the EACCES the helper maps to `PERMISSION_DENIED`).
  Two-user provisioning is fail-loud: fewer than two non-root interactive
  users fails with the runbook pointer, never a silent pass.
- Stale evidence pointers fixed: all three live suites referenced
  `docs/mvp-status.md`; the gate record is this file.
- `distro-list` (list-twice no-autostart) and `users-list` (live passwd +
  filter) suites re-verified current — no API drift.

## Verification performed here (7f)

```bash
npx vitest run tests/wsl/
npm run typecheck
npm run lint -- --quiet
```

Results: 7 files passed, 3 live suites skipped by design (gated on
`process.platform === "win32" && TAKENOTES_LIVE_WSL === "1"`); 53 passed,
6 skipped. Typecheck and lint clean.

## Live gate — BLOCKED (host runbook, needs real Windows 11 + WSL2 host)

### Provision (one-time, on the host)

```powershell
# Distros: Ubuntu (primary) + Debian left Stopped.
wsl --install -d Ubuntu
wsl --install -d Debian
wsl --terminate Debian

# Two non-root interactive users in Ubuntu (runbook names; tests discover
# the first two uid>=1000 users generically, so any two names work).
wsl -d Ubuntu --exec bash -lc "sudo useradd -m wslA 2>/dev/null; sudo useradd -m wslB 2>/dev/null; id wslA; id wslB"

# Repo + deps.
git clone <repo>; cd takenote; npm ci
```

### Automated evidence (PowerShell, repo root)

```powershell
$env:TAKENOTES_LIVE_WSL="1"; npx vitest run tests/wsl/
npx vitest run tests/filesystem/directories.test.ts  # windows-local suite
```

Expected: distro list-twice identical with Debian `Stopped` throughout;
`-u wslA/wslB` whoami match; distinct `$HOME`s matching passwd; 700 probe
owner-reads/other-denied with cleanup. Any failure pastes the runbook
pointer from the assertion — provision, don't edit around it.

### Capture with the evidence (paste into this file on the run)

`winver`, `wsl --version`, `wsl -l -v` before AND after the picker run,
`cat /etc/os-release`, `id wslA`, `id wslB`, full vitest output.

### App-level manual checklist (packaged app, all BLOCKED here)

Open WSL folder via the picker (distro → users with default preselected →
path → Connect): open-as-A vs open-as-B yield distinct workspace IDs and
status-strip identities; per-user `~` lands in each home; browsing the
other user's 700 home shows the friendly denial hint (7c); create/rename/
move/delete + folders; two-actor `expectedRevision` CONFLICT banner;
recovery list/restore/copy; search V1+ operators; second-distro connect;
honest `Permanently delete` labels (never OS-trash wording). Until then:
WSL milestone stays open.
