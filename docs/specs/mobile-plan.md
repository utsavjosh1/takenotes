# Mobile Plan — takenotes (Expo)

> Skill applied: `codebase-design` (Module / Interface / Seam / Adapter / Depth / Leverage / Locality).
> Source of truth remains `CONTEXT.md` + `docs/roadmap.md` + `docs/architecture.md` + ADRs.
> Mobile is Post-MVP (`roadmap.md`: "mobile + Quick Capture queue" deferred). This plan does not move MVP gates.

## 0. Product decision (locks scope before code)

### What mobile V1 is / is not

**V1 = companion reader + capture + edit, local-first, offline-first:**

1. Open a `mobile-local` workspace (on-device folder, app sandbox).
2. Browse Explorer, read notes, Quick Open, Search (core index), Favorites.
3. Edit single note (source-mode + preview, NOT full CodeMirror WYSIWYG yet).
4. Daily Note + Today (read) + Tasks toggle + Quick Capture to `Inbox.md`.
5. Conflict-safe save (`expectedRevision` → `CONFLICT`, same as desktop).

**Explicitly NOT in V1:**

- Full desktop WYSIWYG (callouts/table widgets/footnotes) — deferred to V2.
- Graph / Canvas editing (read-only graph or deferred entirely).
- Collections board/cards/calendar, Bases formulas, MCP, URI callbacks, Sync/Publish, plugins, themes marketplace.
- WSL / desktop `windows-local` direct access. Mobile never mounts a desktop disk.
- Background sync, push, widgets, share-sheet (V1.1+).

**Why:** gives leverage immediately (core reuse) without forking note policy. Anything that would force a mobile-only markdown dialect is rejected per ADR-0008.

### The one hard seam: where do mobile files live?

Desktop truth: "user Markdown files are authoritative, ordinary files."

On iOS/Android there is no user-visible filesystem. Decision:

| Option | Verdict |
|--------|---------|
| A. `mobile-local` sandbox only + manual import/export (Files app / SAF / share) | **V1. Do this.** Zero server, zero account, shippable. |
| B. LAN pair to desktop `apps/server` (same Wi-Fi, `SingleOwnerAuth`, pull/push with revision guard) | **V2. Design seam now, implement later.** `apps/server` + `auth.ts` already a transport-parity harness — reuse it. |
| C. Cloud sync (Cloudflare R2/Tunnel/Workers, paid Sync territory) | **Post-V2. Do not design now.** Roadmap says Sync/Publish is paid-service territory. |

V1 ships A. V2 seam is reserved so V1 code doesn't block it.

---

## 1. Architecture — deep modules, clean seams

Applied `codebase-design`: small interfaces, deep implementations, tests cross the same seam as callers.

```
┌─────────────────────────────────────────┐
│ Expo App (apps/mobile)                  │
│ React Native + Expo Router              │
│ holds workspaceId + relativePath only   │
└──────────────┬──────────────────────────┘
               │  CoreNoteService / SearchService /
               │  Index / Tasks / Daily / Favorites
               ▼
┌─────────────────────────────────────────┐
│ @takenotes/core (reuse, NO fork)        │
│ policy/note-policy, services/*,         │
│ index/*, search/*, productivity/*       │
└──────────────┬──────────────────────────┘
               │  Seam: HostFilesystem (already exists)
               ▼
┌─────────────────────────────────────────┐
│ Adapters (vary per platform)            │
│ desktop: NativeFileAdapter (node:fs)    │
│ mobile:  ExpoFileAdapter (expo-filesystem) │
│ server:  (future) HttpWorkspaceAdapter  │
└─────────────────────────────────────────┘
```

### 1.1 Seams (where interfaces live)

| # | Seam | Interface (small) | Adapters (vary) | Depth rationale |
|---|------|-------------------|-----------------|-----------------|
| S1 | File IO | `HostFilesystem` (`readBytes`, `writeBytesAtomic`, `stat`, `lstat`, `realpath`) — **frozen, do not widen in V1** | `NativeFileAdapter`, `ExpoFileAdapter` (new), `MemoryAdapter` (tests) | One new adapter unlocks all of `CoreNoteService` on mobile. Highest leverage. |
| S2 | Workspace identity | `CoreWorkspace { root, kind }` + `WorkspaceKind` | add `mobile-local` kind; `localWorkspaceKind()` + `isLocalKind()` updated | 2-line change, everything downstream (recovery keys, path policy) follows. |
| S3 | Capabilities | `PlatformCapabilities` | add `mobile: { haptics, shareSheet, offlineOnly, noSystemTrash, noMenuBar }` — callers branch on capabilities, never `Platform.OS` directly | Prevents `if (ios)` sprawl in UI. |
| S4 | UI tokens/behavior | `@takenotes/ui/native` (today: only theme+behavior) | deepen with `ListRow`, `EditorChrome`, `Notice`, `SearchRow` contracts (props only, no RN import inside package) | Keeps `@takenotes/ui` platform-neutral; RN mapping lives in `apps/mobile`. |
| S5 | Sync (future) | `WorkspaceSync { pull(), push(), status() }` — **declare interface in V1, ship only `LocalOnlySync` no-op adapter** | V2: `LanSyncAdapter` over `apps/server` HTTP | "One adapter = hypothetical seam" — we declare it now so V1 doesn't hard-code local-only assumptions, but don't build the network side. |

### 1.2 Deletion test (per module)

- Delete `ExpoFileAdapter` → all mobile file access breaks, desktop untouched → seam is real, module earns its keep.
- Delete mobile editor screen → core index/search/tasks still fully tested → editor is shallow by design in V1 (thin over `CoreNoteService`), correctly so.
- Delete a proposed "mobile note policy" → nothing breaks because it must never exist (ADR-0008). Any plan that creates one fails review.

### 1.3 What mobile must NOT do

- No `node:fs`, no Electron IPC, no `window.takenotes` bridge. Imports allowed in `apps/mobile`: `expo-*`, `react-native`, `@takenotes/core`, `@takenotes/contracts`, `@takenotes/platform`, `@takenotes/ui/native`. `tsc` + eslint import-guard enforces it.
- No fork of `note-policy`, `search`, `tasks`, `daily`. If mobile needs behavior change, change core + cover with logic test so desktop benefits (locality).

---

## 2. Tech stack (pinned before scaffold)

- **Expo SDK 52+ (managed), TypeScript strict, Expo Router** (file-based nav), `expo-file-system` (next/File API), `expo-secure-store` (workspace registry secrets), `expo-sharing` + `expo-document-picker` (import/export), `@react-native-async-storage/async-storage` (app-data: recents, hotkeys-equivalent, drafts keys).
- **State:** Zustand or Jotai (one store: `workspaceId`, open tabs, index status). No Redux. Renderer holds `workspaceId + relativePath` only — same contract as desktop.
- **Markdown:** V1 `renderMarkdown()` from core for preview (reuse) + plain `TextInput` source editor with task-checkbox overlay. V2 evaluate `@expensify/react-native-live-markdown` or native CodeMirror via `react-native-webview` — decision deferred, seam reserved.
- **Testing:** `vitest` logic tests (reuse `packages/test-support`) + `jest-expo` / Maestro for 5 critical E2E flows. No Detox in V1.
- **CI:** `npm --workspace @takenotes/mobile run typecheck/lint/test`; EAS Build profiles `development/preview/production`. Lockfile expansion is now justified (was deferred in scaffold README).

New deps (only these in step 1): `expo`, `expo-router`, `expo-file-system`, `expo-secure-store`, `expo-sharing`, `expo-document-picker`, `@react-native-async-storage/async-storage`, `zustand`, `react-native` (+ dev: `jest-expo`, `maestro`).

---

## 3. Phased build (in order, each gated)

### Phase M0 — Scaffold + seam proof (landed 2026-10-08)

- [x] Add `WorkspaceKind "mobile-local"` in `packages/platform/src/types.ts` + `isMobileKind()` + `getMobileCapabilities()` (no `DesktopPlatform` widening — desktop switches stay exhaustive).
- [x] `ExpoFileAdapter implements HostFilesystem` in `apps/mobile/src/adapters/expo-filesystem.ts` (injected `ExpoFsOps` port — no static expo import, no lockfile expansion yet) + `expo-binding.ts` (sole Expo touchpoint).
- [x] `MobileWorkspace` 2-method deep module over `CoreNoteService` + `WorkspaceSync` seam with `LocalOnlySync` no-op.
- [x] Gate: `tests/mobile/m0-seam.test.ts` — 12 tests green on Linux (read/update/CONFLICT/NOT_FOUND/traversal/POSIX-reserved/BOM/tmp+rename-cleanup/identity/caps/sync) + `tsc` clean.
- [ ] Device smoke (needs Expo deps install — one command in `apps/mobile/README.md`): open sandbox folder, read seed note.
- [ ] `app.json` + Expo Router tabs stub (deferred until deps land so `tsc` stays green).

### Phase M1 — Read + navigate (landed 2026-10-08)

- [x] Explorer (`browse/explorer.ts`, RN-safe no-`node:path`): `DirectoryListing` seam added (S1 stays frozen — byte IO never widened); `MemoryHostFilesystem` + `ExpoFileAdapter` satisfy it; ordering from `core/explorer/sort`.
- [x] Quick Open (`browse/quick-open.ts` over `searchQuickOpen` + `resolveCreateTarget`): fuzzy tiers, empty = recents, Enter-to-create.
- [x] Search (`browse/search.ts` over `parseSearchQuery` + `searchFilenames`/`searchContent`): desktop-identical grammar, `INVALID_REQUEST` names operator+position, empty = no matches.
- [x] Favorites read (`browse/favorites.ts`): missing → empty doc, invalid YAML → errors + file untouched.
- [x] Outline + preview (`browse/outline.ts`, no index dependency): ATX incl. CRLF/BOM, fences excluded, excerpt + full-rel footer.
- [x] Index (`index/mobile-index.ts` mirrors desktop `workspace-index.ts`): same 2000/1MiB bounds, `.git`+non-md+canvas exclusions, root-failure aborts honestly, `syncMobileFileIndex` canvas-drop, `mobileIndexStatusMessage` copy pinned (hoist-to-core follow-up noted).
- [x] S4 UI contracts (`ListRow`/`SearchRow`/`Notice`/`EmptyState` props, zero RN imports; `targetSize.touch` 48 ≥ 44).
- [x] Gate: `tests/mobile/m1-browse.test.ts` — 18 tests green (30 total with M0) + `tsc` + `eslint` clean. On-device manual check waits on Expo deps.

### Phase M2 — Edit + save pipeline (landed 2026-10-08)

- [x] Core `+create` (`CoreNoteService.create`: validate → confine → `ALREADY_EXISTS` → atomic write; core change with mobile-first tests, desktop untouched — full suite 1209 pass, 1 unrelated perf-flake that passes solo).
- [x] `MobileWorkspace.create` (ensures `Daily/YYYY/MM` parents via `DirectoryListing.ensureDirectory`, then core create).
- [x] `EditorSession` (pure state machine: clean/dirty/saving/conflict/missing, debounce via injected clock, Reload-keeps-disk/Retry-save, draft retained on missing; real two-writer CONFLICT vector).
- [x] Preview (`renderMarkdown` reuse) + task toggle (revision-guarded, `INVALID_REQUEST` off-task).
- [x] Quick Capture (Inbox create-on-first-use, 1 CONFLICT retry incl. racer test) + Daily explicit-create (frontmatter via core) + Today read (never auto-creates).
- [x] Recovery (`MobileRecovery` over injected KV: desktop-identical throttle/save-bypass/identical-skip/7d-janitor, constants pinned by test; FNV fingerprint documented as dedup-only; namespace `mobile-local.<encoded-root>`; AsyncStorage binding structural).
- [x] Gate: `tests/mobile/m2-edit.test.ts` — 19 tests green (49 total) + `tsc` + `eslint` clean. Airplane-mode device test waits on Expo deps.

### Phase M3 — Import/export + polish (landed 2026-10-08, device half pending)

- [x] Import (`share/import-export.ts`): md/markdown/txt only, strict UTF-8, `uniqueCopyName` copy-in (never move/overwrite), traversal neutralized to basename, `ALREADY_EXISTS` single retry; binary/images honestly skipped (attachments = later phase).
- [x] Export (`readForShare` + `expo-share-binding.ts` structural): filename/mime/content; sheet + cache write device-only.
- [x] Appearance (`settings/appearance.ts`): theme pref, fontScale clamp [0.85, 1.3], touch floor never scaled, corrupt JSON → defaults.
- [x] `app.json` (scheme `takenotes://`, router plugin, empty android permissions, no location/camera keys) + `eas.json` (development/preview/production) + `assets/README.md` (PNG specs, generation cmd; no binaries committed).
- [x] Nav shells (`app/(tabs)` × 4 + layouts) + `components/rows.tsx` (4 ui/native contracts → RN); excluded from root tsc until Expo install (documented, removable).
- [x] Gate: `code-review` pass done (findings fixed — see M3 report); `tests/mobile/m3-polish.test.ts` 12 tests green (61 total) + `tsc` + `eslint` clean.
- [ ] Device half (needs installer machine): Expo install → remove tsc exclude → `npx expo start` → EAS preview on iPhone + Android → icon/splash PNGs.

### Phase M4 (V1.1, after V1 ships) — Capture queue + share

- Quick Capture queue (offline intents flushed on open), Share-sheet receive (`receive-sharing-intent`), home-screen widgets, haptics.
### Phase M5 (V2) — LAN pair to desktop

- Implement `LanSyncAdapter` against `apps/server` (+ `SingleOwnerAuth` hardened): QR pair → pull/push with `expectedRevision` guard → per-file CONFLICT (never auto-merge). No cloud.

---

## 4. File map (where code goes)

```
apps/mobile/
  app.json  app/_layout.tsx  app/(tabs)/{index,search,capture,settings}.tsx
  components/rows.tsx             # RN mapping of ui/native contracts (excluded from root tsc pre-install)
  src/
    adapters/expo-filesystem.ts   # IO adapter + expo-binding.ts (only place touching expo-file-system)
    adapters/listing.ts           # DirectoryListing seam (M1)
    workspace/mobile-workspace.ts # deep module over CoreNoteService (read/update/create + id)
    sync/sync.ts                  # WorkspaceSync seam + LocalOnlySync no-op (M0)
    index/mobile-index.ts         # eager indexed build, bounded (M1)
    browse/{explorer,quick-open,search,favorites,outline}.ts  # thin over core (M1)
    editor/{session,tasks}.ts     # save-pipeline state machine + task toggle (M2)
    capture/{quick-capture,recovery}.ts  # Inbox/Daily/Today + snapshots (M2)
    share/import-export.ts + settings/appearance.ts  # V1 text import/export + theme (M3)
packages/platform/src/
  types.ts (add mobile-local)  capabilities.ts (add mobile caps)
packages/ui/src/native/
  index.ts (add ListRow/Notice/SearchRow/EmptyState prop contracts — no RN imports)
```

Eslint guard: `apps/mobile` may not import `node:fs`, `electron`, `src/main/*`, `@takenotes/ui/dom`.

---

## 5. Risks + mitigations

| Risk | Mitigation |
|------|------------|
| Atomic-write has no fsync on mobile | Document in interface; tmp+rename still crash-safe for V1 scale; V2 verifies with kill-test |
| CodeMirror WYSIWYG envy → fork | Forbid. V1 editor is intentionally shallow; rich editing waits for V2 behind same `MobileWorkspace` seam |
| Sync scope creep (cloud) | S5 seam declared but not built; any network code in V1 fails review |
| Desktop drift (core change breaks mobile) | Mobile CI runs core logic vectors; core changes must keep `MemoryAdapter` tests green on both |

---

## 6. Immediate next actions

1. Approve V1 scope (§0) + A-then-B sync decision.
2. Run `M0`: pin Expo deps, land `mobile-local` kind + `ExpoFileAdapter` + `MobileWorkspace` + gate test.
3. Then M1→M2→M3 in order; no phase skipping (each phase's gate mirrors the MVP gate style: logic tests + on-device manual).

*Generated with `codebase-design` vocabulary. Re-check with `code-review` skill at each phase gate.*
