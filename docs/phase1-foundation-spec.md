# Phase 1 Foundation — Implementation Spec

Scope: Phase 1 only (`docs/roadmap.md`). Sources of truth: `CONTEXT.md`,
`docs/decisions/ADR-0007`…`ADR-0013`, `docs/architecture.md`, `docs/security.md`.
Preserve ADRs; use canonical vocabulary (Workspace, Connection, Collection,
View, Favorite — never Vault/Base/Bookmark).

Non-goals (do not build): Tasks UI, Calendar UI, MCP sidecar/transport,
Collections, Plugins, Graph, Canvas, cloud sync, public REST, localhost/HTTP
server, SQLite-as-truth, slash commands, customizable hotkeys, Compare view.

## 0. Invariants (all Phase 1 work must hold these)

1. Markdown/files authoritative. No required database. In-memory index +
   app-data caches only; deleting them loses no user knowledge (ADR-0008).
2. Renderer stays sandboxed (`nodeIntegration:false`, `contextIsolation:true`,
   `sandbox:true`). Preload exposes one named function per operation; no
   generic invoke, no `fs`/`shell`/`child_process`/`require` in renderer.
3. All UI → internal Service Layer → adapters → filesystem/WSL (ADR-0009).
   No new UI path bypasses services. Core domain/services never import
   Electron UI primitives or spawn `wsl.exe` directly; `wsl.exe` lives behind
   the WSL adapter.
4. Renderer holds `workspaceId + relativePath` (`/` separators) only; main
   resolves roots. Absolute paths, NUL, `..` traversal, illegal components
   rejected at the boundary. Windows-local uses `path.win32` rules
   (incl. reserved names); WSL uses POSIX rules. Symlinked directories never
   traversed; symlinked final components rejected (existing `local-workspace`
   + helper behavior — preserve).
5. WSL runs as the selected Linux user. No sudo, no escalation, no bypass.
   Permission errors surface as `PERMISSION_DENIED`, never retried as another
   user.
6. Every mutation carries `expectedRevision` (SHA-256 hex). Mismatch →
   `CONFLICT`, no silent overwrite, no auto-merge (ADR-0010).
7. Recovery/snapshots/grants/logs live in app-data keyed by `workspaceId`,
   never inside workspaces or `.takenotes/`.

## 1. Preserve as-is (do not rewrite)

- Electron main/preload/renderer scaffold, Vite/esbuild build, sandbox flags.
- Framed stdio protocol (4-byte BE length + UTF-8 JSON, 16 MiB max,
  stdout=frames only, stderr=diagnostics), `PROTOCOL_VERSION` handshake with
  nonce + execPath verification, `HELPER_OPERATIONS` gating.
- Atomic write discipline (tmp + fsync + rename), BOM/newline preservation,
  SHA-256 `revisionOfBytes`, `CONFLICT` on hash mismatch.
- Crash-recovery drafts in `userData` (keep; distinct from §7 snapshots).
- CodeMirror ownership of document/undo/selection; existing tabs save/conflict
  banner behavior as the base for §6.
- `WorkspaceKind` (`windows-local|windows-wsl|macos-local|linux-local`),
  `toCanonicalRel`, `isWslKind`, reserved-name rules.
- `COMMANDS` accelerator table as the keystroke source (extend, don't fork).

## 2. Work items

### 2.1 Workspace identity + Connection (ADR-0007)

Extend `WorkspaceRegistration` (main-only) to:

```ts
{ id: workspaceId(opaque, randomUUID — keep),
  kind: "windows-local" | "windows-wsl",
  distro?: string, linuxUser?: string,   // NEW: wsl only, both required
  root: string,                           // native root or absolute POSIX root
  displayName: string, generation: number }
```

- New `Connection` record in main: `{ distro, linuxUser, status:
  connected|stopped|failed }`. One connection → many workspaces.
- Renderer-safe `WorkspaceInfo` gains `distro?: string; linuxUser?: string;
  connectionState` — never absolute roots.
- `connectWsl` signature becomes `(distro, linuxUser, linuxPath)`. Old
  2-arg form removed; update preload, IPC, renderer dialog together.
- `workspaceKeyFor` (drafts) and any future keys include
  `type + root + distro + linuxUser`.

Accept: opening `Ubuntu/utsav/~/Notes` and `Ubuntu/work/~/x` yields two
distinct `workspaceId`s; closing one leaves the other usable; renderer never
sees raw roots.

### 2.2 WSL discovery: distro → user → path (no guessing)

- Distros: parse `wsl.exe -l -v` (name, state Running/Stopped, version WSL2).
  Keep `--list --quiet` fallback for parse failures. Listing never starts a
  distro. Non-Windows → `INVALID_REQUEST` (existing `requireWslCapable`).
- Users: helper op `users.list` (new) reading `/etc/passwd`; return
  `{ name, uid, home }` filtered to interactive candidates (uid ≥ 1000 plus
  current/default user always included; keep threshold overridable, not
  hardwired). Invalid/unparseable lines skipped, never fatal.
- `~` expands in the helper under the selected user only (never on Windows).
- Spawn runs `wsl.exe -d <distro> -u <linuxUser> …` (existing
  `launch-security.ts`: add `-u`, keep `shell:false`, separate argv).
- Path errors (both adapters, same codes): `PATH_NOT_FOUND`,
  `PERMISSION_DENIED`, `NOT_A_DIRECTORY`, `CONNECTION_FAILED`,
  `DISTRO_NOT_RUNNING`, `HELPER_FAILED`. Picker shows friendly text +
  expandable detail. Selecting Connect/Open on a stopped distro is the
  explicit intent to start it (no extra confirm).
- Verify `700`-home separation manually: user A cannot list user B's home
  (gets `PERMISSION_DENIED`).

Helper changes: add `users.list`, `directory.create`, `directory.rename`,
`directory.delete`, `file.rename`, `file.delete` (delete = permanent delete
for WSL in P1; OS trash only where native — document the asymmetry).
Gate new ops in `HELPER_OPERATIONS` + `capabilities`. Main validates wire
shape only; traversal/symlink policy stays in helper (as today).

### 2.3 Filesystem adapters + Service Layer seam (ADR-0009)

Introduce the seam with the fewest pieces (all in main, no new processes):

```ts
WorkspaceService: listDistributions(), listUsers(distro),
  openLocal(), openWsl(distro,user,path), close(id), list(), get(id)
NoteService: listTree(ws,rel), read(ws,rel), create(ws,rel),
  write(ws,rel,content,expectedHash,newline,hadBom),
  rename(ws,oldRel,newRel), deleteFile(ws,rel),   // trash on Windows-local, delete on WSL — label honestly
  createDir(ws,rel), renameDir, deleteDir
SearchService: query(ws, input) -> SearchMatch[]   // over §2.5 index
CommandService: list(), execute(id)                // §2.7
RecoveryService: snapshots(ws,rel), restore(ws,rel,snapId), copyFrom(ws,rel,snapId)  // §2.6
```

- `FileAdapter` interface (Windows-local impl = existing
  `local-workspace.ts`; WSL impl = `HelperClient` calls). IPC handlers
  (`src/main/ipc/register.ts`) become thin: validate sender + args →
  service → `{ok,result|error}`. No fs logic in handlers after the cutover.
- Move/rename across directories = rename op; refuse moves that escape the
  root or cross workspaces. `deleteDir` requires empty unless UI confirms
  recursive (default: refuse non-empty with `DIRECTORY_NOT_EMPTY`).
- Wire `relativePath` canonicalization (`toCanonicalRel`) at every entry;
  kind-appropriate validator (`validateWindowsRelativePath` for
  windows-local, POSIX for WSL).

### 2.4 Editor: tabs, splits, save (preserve + complete)

- Keep: multi-tab open/close/reopen, dirty tracking, debounced autosave,
  atomic save with `expectedRevision`, `conflict` banner (keep both versions
  safe; explicit Reload-keeps-disk / Retry-save affordances), draft-retained
  flow when the file vanished.
- Add: horizontal/vertical split of the editor area (same tab model in each
  pane; no new file semantics). Split state is window-local, not persisted
  in P1.
- Save pipeline per write: `write(..., expectedHash)` → `CONFLICT` on
  mismatch → UI keeps dirty buffer, offers reload; no auto-merge.
- Status bar (extend existing): `Workspace name · Windows|WSL
  [distro · user] · saved/dirty/conflict · connection · index (n files)`.

### 2.5 Parse-once index + Search V1 (ADR-0008, ADR-0010 excerpts)

New main module `document-index.ts` (per-workspace, in-memory, rebuildable):

```ts
DocumentIndexEntry {
  workspaceId, relativePath, revisionHash,
  frontmatter: Record<string, unknown>,   // parsed YAML; tolerant: bad YAML -> {} + file still indexed
  title?: string, aliases: string[],
  normalized: { tags: string[]; type?: string; status?: string;
                date?: string; due?: string; created?: string; modified?: string },
  headings: { text: string; level: 1|2|3|4|5|6; line: number; anchor: string }[],
  tags: { value: string; line: number }[],          // inline #tag + frontmatter tags, normalized
  links: { target: string; alias?: string; heading?: string;
           blockAnchor?: string; embed: boolean;
           resolved: boolean; line: number; column: number }[],
  tasks: { description: string; completed: boolean; line: number;
           stableAnchor?: string; tags: string[];
           due?: string; scheduled?: string; priority?: string }[],
  text: string                                        // bounded (skip files > 1 MiB for content)
}
```

- Parse rules (V1, freeze): `#tag` + `#a/b` inline; `[[t]]`, `[[t|a]]`,
  `[[t#h]]`, `[[t#h|a]]`, `![[…]]` embeds, `![[image.png]]`; block anchor
  captured if present, no transclusion semantics. Tasks: `- [ ]`/`- [x]`
  (also `*`/`+` markers); inline `@due(...)`/`@scheduled(...)`/
  `@priority(...)` captured opportunistically, never required; no recurrence/
  deps/NLP dates. Headings ATX only in V1. Title = first `# ` or filename.
- Needs a YAML dependency for frontmatter (none vendored today) — add one
  pinned dependency (preferred) rather than hand-rolling; tolerant fallback
  above.
- Updates: full parse on open; re-parse on write/rename/restore; drop on
  delete; bulk build on workspace open (bounded concurrency, cap file size,
  skip binary/NUL). No watcher in P1 — refresh on list/tree-expand + after
  every mutation; note the limitation in `mvp-status`.
- `SearchService.query` over the index only (never per-keystroke fs walk;
  delete the old `searchWorkspace` scan path once cut over):
  `plain substring` (filename+content, case-insensitive),
  `"exact phrase"`, `file:<name-substr>`, `path:<rel-substr>`,
  `tag:<norm>`, `type:<frontmatter-type>`, `is:task <text>`.
  AND-combine space-separated clauses; anything else (OR/NOT/regex,
  comparators, `link:`, saved searches) → `INVALID_REQUEST` naming the
  unsupported operator. Debounce UI ≥150 ms; `maxResults` cap; one match per
  file for content queries (preserve current bounded shape).
- WSL search uses the same index (fed by helper `file.read` during indexing),
  not a separate traversal implementation.

### 2.6 Recovery snapshots (ADR-0013; drafts stay separate)

New `RecoveryService` in main + `recovery:*` preload fns (named, not generic):

- Store: `userData/recovery/<workspaceId>/<rel-path>/…`, key includes
  `linuxUser` via `workspaceId` (no collisions between users).
- Policy: ≤1 snapshot per changed file per 5 min during editing + snapshot
  on explicit save/close/clean-shutdown when content differs; skip identical
  content; 7-day retention withjanitor on access; state "recovery is not
  backup" in UI.
- Actions V1: list snapshots, Restore (snapshots current bytes first),
  Copy contents. No Compare in P1.
- Drafts (`drafts.ts`) unchanged: crash-recovery only, never rendered as
  `Saved`.

### 2.7 Command Registry + palette + fixed hotkeys

- Single `CommandService` (main) as the registry:
  `{ id, title, category, scope, run, when?, defaultHotkey? }`.
  Renderer palette/menus/hotkeys derive from it; remove the second ad-hoc
  table in `App.tsx` (merge into the registry; keep `keymap.ts` as the
  accelerator source).
- P1 IDs (minimum): `note.new/open`, `workspace.open/switch/close`,
  `editor.save`, `search.open`, `quickOpen.open`, `palette.open`,
  `view.toggleSidebar`, `settings.open`. Fixed defaults: `Ctrl+P` quick
  open/palette, `Ctrl+Shift+P` or `>` commands mode, `Ctrl+N` new,
  `Ctrl+S` save, `Ctrl+Shift+F` search. Custom hotkeys + `hotkeys.json` +
  Quick Capture + slash deferred (P2).
- Palette UX: `>` prefix = commands; bare text = Quick Open over indexed
  filenames (keep existing fuzzy). No `command_execute` over MCP (P3).

## 3. IPC / preload delta (narrow functions only)

Add: `workspace.listUsers(distro)`, change `connectWsl` to
`(distro, linuxUser, linuxPath)`, add `directory.create/delete/rename`,
`file.delete` (WSL) — keep `file.trash` naming for OS-trash path and label
WSL delete honestly in UI; add `recovery.list/restore/copyContent`;
add `search.query(ws, input)` (structured V1 operators) alongside or
replacing `search.files/content` (remove the direct-scan pair when the index
lands — do not keep both). Extend `WorkspaceInfo` per §2.1 + WSL state
events. Everything returns `IpcResult`; preserve structured helper error
codes across the boundary (`toHelperError`).

## 4. Tests (Linux-runnable logic + Windows-gated reality)

- Unit (run anywhere): frontmatter/headings/tags/links/tasks parser vectors
  (incl. malformed YAML, CRLF/BOM, `[[a#h|alias]]`, embeds, `@due/@scheduled`
  tokens, no-NLP-dates); search-operator parsing + AND-combine + unsupported
  operator errors; `workspaceId` key separation (two users, same rel);
  revision/CONFLICT transitions; recovery throttle/retention/restore-
  snapshots-current logic with fake clock.
- Integration (Linux): helper round-trip extended to new ops
  (`users.list`, dir ops, rename/delete) via direct-spawn test (existing
  `helper-roundtrip.test.ts` pattern).
- Windows-gated (`runIf(win32)`): NTFS create/rename/move/delete,
  reserved-name rejection, symlink-escape rejection, atomic-write + CONFLICT
  against real `C:\` temp, staged-runtime + `wsl.exe` round-trip (existing
  Stage 5/6 commands).

## 5. Phase 1 exit gate (record in `docs/mvp-status.md`)

On a real Windows 11 host, demonstrate and record each with commands +
evidence: WSL2 present; Ubuntu with users A+B (+ second distro, e.g. Debian);
distro list shows Running/Stopped without starting anything; open workspace
as A and as B; `~` resolves per-user; `PERMISSION_DENIED` shown browsing
B's `700` home as A; file create/rename/move/delete + folder create/rename/
delete (both Windows-local and WSL); two-actor `expectedRevision` CONFLICT
(read rev A → external modify → write rev A → `CONFLICT`, no overwrite,
both versions safe); recovery snapshot list → restore (current snapshotted
first) → Copy; search V1 operators over the WSL workspace after
modify/rename/delete; Quick Open + palette + fixed hotkeys; status bar shows
workspace/kind/distro/user/save/connection/index. Any failure keeps Phase 1
open — no P2–P5 work starts.
