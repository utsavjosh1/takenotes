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
