# Proposal: WSL-hosted runtime structure

Status: proposal  
Reference branch: `research-pichamber-wsl`  
External reference studied: `reference/PiChamber`

## Summary

The current takenotes WSL architecture is a Windows-owned desktop app that reaches Linux files through a narrow helper:

```txt
React renderer
  -> preload IPC
  -> Electron main
  -> wsl.exe
  -> bundled Linux Node
  -> helper.cjs
  -> WSL filesystem
```

This works for a small MVP, but it makes every WSL feature a special bridge operation. For a user whose notes, projects, shells, git state, and productivity live primarily in WSL, a cleaner long-term structure is:

```txt
Windows Electron shell
  -> authenticated HTTP/WebSocket runtime endpoint
  -> takenotes runtime running inside WSL
  -> Linux filesystem
```

In this model, WSL is not treated as a foreign filesystem behind `wsl.exe` RPC. WSL becomes a first-class host runtime. The Windows app becomes a secure desktop shell/client.

## Why change

The current helper design is good for early validation because it is narrow and avoids a server. But it has pressure points:

- every new feature needs native + WSL versions or helper protocol additions;
- long-lived features like indexing, file watching, search, terminal, git, and sync fit better inside the host where files live;
- only one WSL helper session is active today;
- helper lifecycle and identity are coupled to Electron main;
- Windows path state can accidentally leak into WSL flows unless every feature is careful;
- real WSL verification remains a separate burden for every helper operation.

The PiChamber structure suggests a useful alternative: place the runtime next to the files and make the UI talk to the active runtime endpoint.

## PiChamber findings that matter

PiChamber does **not** use a Windows Electron -> `wsl.exe` -> helper bridge for all operations. Its main pattern is:

```txt
UI -> runtime HTTP/WebSocket API -> server process where files live
```

Important reusable ideas:

1. Runtime endpoint abstraction: the UI talks to an active runtime, not directly to local OS assumptions.
2. Runtime switch reset: when changing host/runtime, clear host-owned state so paths from one host are never sent to another.
3. Server-owned filesystem, terminal, git, and session APIs.
4. WebSocket streams for long-lived terminal/session/event state.
5. WSL-aware folder picker only as a convenience: use `powershell.exe` from WSL and convert paths with `wslpath`.

Reference files in PiChamber:

```txt
reference/PiChamber/packages/electron/main.mjs
reference/PiChamber/packages/web/server/index.js
reference/PiChamber/packages/web/server/lib/workspace/host.js
reference/PiChamber/packages/web/server/lib/fs/routes.js
reference/PiChamber/packages/web/server/lib/fs/pick-directory.js
reference/PiChamber/packages/ui/src/lib/runtime-switch.ts
reference/PiChamber/packages/ui/src/lib/runtime-fetch.ts
reference/PiChamber/packages/ui/src/lib/runtime-url.ts
```

## Target architecture

### Runtime roles

```txt
┌──────────────────────────────────────┐
│ Windows Electron desktop shell        │
│ - windows, menu, updates              │
│ - runtime discovery/launch            │
│ - secure token bootstrap              │
│ - optional native Windows workspace   │
└──────────────────┬───────────────────┘
                   │ HTTP/WebSocket
                   │ localhost / WSL-host bridge
┌──────────────────▼───────────────────┐
│ takenotes runtime                     │
│ - REST/RPC filesystem API             │
│ - file index/search/watch             │
│ - recovery/drafts for that host       │
│ - optional git/terminal later         │
│ - runs on native Windows or in WSL     │
└──────────────────┬───────────────────┘
                   │ direct fs APIs
┌──────────────────▼───────────────────┐
│ Host filesystem                       │
│ - Windows NTFS for native runtime     │
│ - Linux ext4 for WSL runtime          │
└──────────────────────────────────────┘
```

### WSL path

```txt
Windows Electron
  -> wsl.exe launch/check runtime
  -> runtime listens inside WSL
  -> Windows connects to WSL runtime endpoint
  -> runtime reads/writes Linux paths directly
```

The key change: `wsl.exe` is used for runtime lifecycle, not for every file operation.

## Proposed repo structure

The codebase can be gradually reshaped into runtime/client packages without a big-bang rewrite.

```txt
src/
  renderer/                 UI only
  preload/                  desktop bridge only
  main/                     Electron shell + runtime lifecycle
  shared/                   contracts, errors, platform-neutral utilities
  core/                     host-independent note policy/services
  runtime/                  NEW: host runtime server
    app.ts                  create runtime app
    auth.ts                 loopback/token auth
    routes/
      workspace.ts
      directory.ts
      file.ts
      recovery.ts
      index.ts
    host/
      native-host.ts        Windows/macOS/Linux direct host
      wsl-host.ts           mostly same code, but launched in WSL
    protocol.ts             runtime API contract
  client/                   NEW: renderer-side runtime client wrappers
    runtime-url.ts
    runtime-fetch.ts
    runtime-switch.ts
    files-client.ts
    workspace-client.ts
```

Later, if the app grows, this can become a workspace split:

```txt
apps/desktop/               Electron shell
apps/runtime/               takenotes runtime server
packages/core/              note policy/services
packages/shared/            contracts/errors
packages/ui/                renderer components
```

But the first step should stay inside `src/` to avoid unnecessary churn.

## Runtime API shape

The runtime API should mirror the existing preload capabilities so migration is incremental.

Initial routes/RPC operations:

```txt
GET  /health
POST /api/workspace/open
POST /api/workspace/close
GET  /api/directory/list?workspaceId=&relativePath=
POST /api/directory/create
POST /api/directory/rename
POST /api/directory/delete
GET  /api/file/read?workspaceId=&relativePath=
POST /api/file/write
POST /api/file/create
POST /api/file/rename
POST /api/file/delete-or-trash
POST /api/recovery/captureChanged
GET  /api/recovery/list
GET  /api/recovery/read
POST /api/recovery/restore
```

The response envelope should stay compatible with current IPC:

```ts
type RuntimeResult<T> =
  | { ok: true; result: T }
  | { ok: false; error: AppError };
```

Keep existing shared contracts where possible:

```ts
DirectoryEntry
FileReadResult
FileRevision
RecoverySnapshotMeta
WorkspaceInfo
AppError
```

## Runtime identity model

Introduce a runtime identity separate from workspace identity:

```ts
type RuntimeInfo = {
  runtimeId: string;
  kind: 'windows-local-runtime' | 'wsl-runtime' | 'server-runtime';
  label: string;
  endpoint: string;
  distro?: string;
  linuxUser?: string;
  status: 'starting' | 'connected' | 'disconnected' | 'failed';
};
```

A workspace then belongs to a runtime:

```ts
type WorkspaceInfo = {
  workspaceId: string;
  runtimeId: string;
  displayName: string;
  type: 'windows-local' | 'windows-wsl' | 'linux-local' | 'macos-local';
  connection: 'connected' | 'disconnected' | 'reconnecting' | 'failed';
  distro?: string;
  linuxUser?: string;
};
```

Rule: renderer state keyed by paths must also be scoped by runtime/workspace. A path from one runtime must never be reused against another runtime.

## Desktop responsibilities after the change

Electron main should own:

- creating windows;
- app menu and updates;
- trusted runtime launch/discovery;
- secure token bootstrap;
- native OS dialogs when needed;
- focusing existing instance;
- optional Windows-local runtime startup.

Electron main should **not** own WSL file semantics long-term.

## WSL runtime lifecycle

Electron main can manage a WSL runtime using `wsl.exe`, but only at lifecycle boundaries.

Possible startup flow:

1. User chooses distro + Linux user.
2. Main validates distro/user like today.
3. Main installs/stages the runtime under:

   ```txt
   ~/.local/share/takenotes/runtime/
   ```

4. Main starts runtime inside WSL:

   ```txt
   wsl.exe -d <distro> -u <linuxUser> -- <node> <runtime-server.cjs> --stdio-bootstrap
   ```

5. Runtime prints a bootstrap JSON frame on stdout with:

   ```json
   {
     "endpoint": "http://127.0.0.1:<port>",
     "token": "...",
     "runtimeId": "..."
   }
   ```

6. Main verifies nonce/token and passes endpoint to renderer.
7. Renderer uses runtime client APIs for all file operations.

Alternative: avoid exposing a TCP port by using stdio or named pipe transport behind a runtime client. But HTTP/WebSocket gives simpler browser/mobile/future-server parity.

## Security requirements

If a local HTTP runtime is introduced, the old “no localhost server” MVP rule must be explicitly superseded for this architecture.

Minimum requirements:

- Bind only loopback by default.
- Use a random high-entropy bearer token per runtime launch.
- Token never appears in renderer logs.
- Runtime rejects requests without token.
- WebSocket/SSE uses short-lived URL tokens or an equivalent handshake because browser WebSockets cannot set arbitrary headers reliably.
- CORS only permits the packaged app/dev origin.
- Main validates runtime bootstrap with nonce echo.
- Runtime exposes no arbitrary shell command API in the notes MVP.
- Filesystem confinement remains inside runtime `CoreNoteService`/host adapter.
- WSL runtime runs as selected Linux user; no sudo/escalation.
- Never run `wsl --shutdown`.

## Host state reset rule

On runtime switch, the renderer must clear or re-scope:

- active workspace;
- open tabs/panes;
- file tree;
- search index;
- recovery UI state;
- recents tied to runtime;
- pending saves;
- any current directory/root hints;
- terminal/session handles if added later.

This mirrors PiChamber’s important rule: a Windows path must never be sent to a WSL/Linux runtime.

## Migration plan

### Phase 0 — document and keep current behavior

- Keep existing helper architecture working.
- Add this proposal.
- Do not remove current WSL helper yet.

### Phase 1 — introduce runtime client seam in renderer

Create a renderer-side `RuntimeClient` interface that matches current `window.takenotes` operations:

```ts
type RuntimeClient = {
  directory: { list(...): Promise<IpcResult<DirectoryEntry[]>>; ... };
  file: { read(...): Promise<IpcResult<FileReadResult>>; write(...): Promise<IpcResult<FileRevision>>; ... };
  recovery: { ... };
};
```

Initial implementation delegates to existing preload IPC. No behavior change.

Goal: `App.tsx` stops caring whether operations are IPC or HTTP.

### Phase 2 — extract runtime server from current server/core code

Reuse existing pieces:

- `src/server/app.ts`
- `src/core/services/note-service.ts`
- `src/main/workspace/local-host-filesystem.ts` logic, moved behind a host adapter
- shared contracts/errors

Create `src/runtime/app.ts` with file/directory/recovery routes.

First target: native local runtime on the same OS for tests.

### Phase 3 — make Electron main start/connect to local runtime

Electron main starts the runtime in-process or child-process and injects endpoint/token into renderer.

At this stage, Windows-local workspaces can still use old IPC. The goal is proving the runtime transport.

### Phase 4 — WSL runtime prototype

Add a new WSL connection mode:

```txt
Open WSL folder (runtime prototype)
```

Main launches the runtime inside WSL. Renderer uses HTTP runtime client.

Keep old helper WSL mode behind a fallback flag.

### Phase 5 — move index/search/recovery to runtime-aware model

Options:

- keep renderer-side index but feed it through runtime client;
- or move indexing into runtime and stream index status to renderer.

Recommended for WSL-first: move indexing into runtime eventually, because file watching and large workspace scans belong near the filesystem.

### Phase 6 — retire WSL helper for normal file ops

When WSL runtime passes Windows evidence:

- remove WSL file read/write/list helper path;
- keep tiny WSL launcher/bootstrap code;
- update docs from helper model to runtime model.

## Compatibility strategy

During migration, support both transports:

```ts
type WorkspaceTransport = 'ipc-native' | 'ipc-wsl-helper' | 'runtime-http';
```

This avoids breaking the current implementation while the WSL runtime matures.

## Testing requirements

Logic tests:

- runtime routes satisfy same note behavior contract as IPC path;
- `CoreNoteService` still enforces path confinement and conflict detection;
- runtime switch clears host-specific state;
- token auth rejects missing/wrong token;
- CORS/origin policy rejects unknown origins;
- WSL bootstrap parser verifies nonce and endpoint shape.

Live Windows/WSL tests:

- start runtime in Ubuntu as selected Linux user;
- open `~/notes`;
- read/write CRLF/BOM files;
- conflict detection with external editor;
- permission denied as selected user;
- no wrong-user execution after switching users;
- runtime restart/reconnect;
- app quit kills only takenotes runtime, not WSL distro;
- no `wsl --shutdown`.

## Risks

### More moving parts

A runtime server adds auth, port, lifecycle, and WebSocket concerns. This is heavier than the current helper.

Mitigation: keep the first runtime API small and loopback-only.

### Existing product promise says no localhost server

Current docs say no localhost server. This proposal changes that. If accepted, update README/security/architecture docs honestly.

### Windows-to-WSL networking quirks

Windows can usually reach WSL services, but behavior varies by WSL version/networking mode.

Mitigation: bootstrap endpoint from runtime, test on real Windows 11 + WSL2, keep helper fallback until proven.

### Auth complexity

HTTP/WebSocket requires careful token handling.

Mitigation: use one short-lived local runtime token initially; add URL-token WebSocket flow only when WebSockets are added.

## Decision points

Before implementing, decide:

1. Should takenotes keep “no localhost server” as a hard product constraint?
2. Is WSL-first productivity important enough to make WSL a first-class runtime?
3. Should the runtime be HTTP/WebSocket, or should it use stdio/named-pipe with the same runtime-client abstraction?
4. Should Windows-local also move to runtime, or only WSL?
5. Should indexing remain renderer-side for now, or move into runtime with file watching?

## Recommendation

Adopt the runtime endpoint seam first, without deleting the current helper. Then prototype a WSL-hosted runtime behind a feature flag.

Short-term target:

```txt
App.tsx -> RuntimeClient interface -> existing preload IPC
```

Medium-term target:

```txt
App.tsx -> RuntimeClient interface -> WSL HTTP runtime
```

Long-term target:

```txt
Desktop shell + host runtimes
Windows runtime for Windows files
WSL runtime for Linux files
future remote runtime if desired
```

This keeps the current secure MVP path intact while creating a structure that fits a WSL-first workflow better than per-operation `wsl.exe` helper RPC.
