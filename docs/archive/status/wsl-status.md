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

## Live gate — BLOCKED (needs real Windows 11 + WSL2 host)

Prerequisites: Windows 11 + WSL2, Ubuntu with Linux users A+B (distinct
HOMEs, one `chmod 700` private dir), second distro (e.g. Debian) left
Stopped. Record `winver`, `wsl --version`, `wsl -l -v` before/after,
`cat /etc/os-release`, `id A`, `id B`.

```powershell
$env:TAKENOTES_LIVE_WSL="1"; npx vitest run tests/wsl/
npx vitest run tests/filesystem/directories.test.ts
```

Checklist (all BLOCKED here): list-without-start (stopped distro stays
stopped), open-as-A vs open-as-B distinct IDs, per-user `~`, 700-home
`PERMISSION_DENIED` demo, create/rename/move/delete + folders on WSL,
two-actor `expectedRevision` CONFLICT, recovery list/restore/copy on WSL,
search V1+ operators over WSL index, second-distro connect, honest
permanent-delete labels. Until then: WSL milestone stays open.
