# Architecture — takenotes

Filesystem-first, Markdown-first, local-first, Windows-first, WSL-aware notebook.
User Markdown files are authoritative; the app never moves them into a database.

```
┌──────────────────────────────────────┐
│            React Renderer            │
│                                      │
│ React + CodeMirror                   │
│ no Node                              │
└─────────────────┬────────────────────┘
                  │
           contextBridge
                  │
┌─────────────────▼────────────────────┐
│               Preload                │
│ narrow typed API                     │
└─────────────────┬────────────────────┘
                  │
             Electron IPC
                  │
┌─────────────────▼────────────────────┐
│          Electron Main / Node        │
│                                      │
│ workspace registry                   │
│ Windows fs                           │
│ drafts                               │
│ WSL supervisor                       │
└──────────────┬────────────┬──────────┘
               │            │
               ▼            ▼
         Windows FS       wsl.exe
                              │
                              ▼
                       bundled Node
                              │
                              ▼
                         helper.cjs
                              │
                              ▼
                           WSL FS
```

## Layers

- **Renderer** (`src/renderer/`): React 19 + CodeMirror 6. No Node access.
  CodeMirror owns document/undo/selection; React mounts and reads on demand.
- **Preload** (`src/preload/`): one named function per permitted operation
  (`window.takenotes.workspace.openLocal`, `file.read`, …). No generic
  `invoke(channel, payload)`.
- **Main** (`src/main/`): workspace registry (trusted roots + generations),
  Windows fs via `fs/promises`, WSL supervisor spawning `wsl.exe` with
  `shell: false` and separate argv, settings/drafts under `app.getPath("userData")`.
- **WSL helper** (`wsl-helper/`): TypeScript → single `helper.cjs`, run by a
  pinned Linux Node shipped in the release. Framed stdio protocol
  (4-byte big-endian length + UTF-8 JSON, 16 MiB max). stdout = frames only,
  stderr = diagnostics.

## Key contracts

- Renderer holds `workspaceId` + `relativePath` only; main resolves roots.
- Every save carries `expectedRevision` (SHA-256); mismatch → `CONFLICT`.
- WSL install location: `~/.local/share/takenotes/` (user-owned, no sudo).
- No localhost server, no SQLite, no native addons, no plugin system in MVP.
- See `docs/protocol.md`, `docs/security.md`, and `docs/decisions/`.

## Repair-pass notes (pre-P1-11)

- **Recovery identity**: the runtime `workspaceId` is random per open. Recovery
  storage is keyed by a stable namespace (`kind + canonical root + distro +
  linuxUser`, reusing the drafts `workspaceKeyFor` identity), resolved from the
  registration at the IPC boundary. Reopening the same Workspace under a new
  runtime id keeps history; `Ubuntu/utsav` and `Ubuntu/work` stay separate.
  Legacy `recovery/<random-id>/` data from development builds is left on disk,
  never silently deleted, but is not surfaced under the new namespace.
- **Recovery reads are scoped**: `recovery:read` takes `(workspaceId,
  snapshotId)` and only searches that workspace's namespace; cross-workspace
  reads fail `NOT_FOUND`.
- **Gate A (landed)**: production native note read/update goes
  `IPC → NoteService → NativeFileAdapter → CoreNoteService →
  LocalHostFilesystem`. Directory/tree/rename/delete/trash intentionally stay
  on the existing `local-workspace` helpers until their own slices migrate.
- **Gate B**: `src/server/auth.ts` (`SingleOwnerAuth`) is a TRANSPORT PARITY
  PROOF harness, not production auth. The fuller owner-auth server
  (`auth-store.ts`: password bootstrap, persisted sessions, `authGeneration`
  invalidation, `__Host-` cookies) is proven by `tests/server/gate-c.test.ts`
  but its deployment (Docker image, TLS, real-host run) is NOT VERIFIED here.
- **WSL singleton**: one active helper session. Opening another distro/user
  disconnects the first; an identity mismatch fails closed with DISCONNECTED
  and never executes as the wrong Linux user. Phase 1 limitation, not a bug.
- **Index bounds**: bulk builds cap at 2000 listed files (`truncated`) and
  skip files over 1 MiB (`skipped`). Either bound sets a user-visible
  notice in the status strip and Search panel — never a silent partial index.
- **P1-11 is NOT VERIFIED**: real Windows 11 + WSL2 evidence is still pending
  (see `docs/tickets/P1-11-windows-verification.md`).
