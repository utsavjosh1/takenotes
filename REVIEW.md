# Takenotes: Repository Review

Reviewed 2026-10-27 on branch `skill/takenote-meaningful-design`, version 0.1.10, on Linux (WSL2), Node v24.19.0. No source code was changed. Build output and `node_modules` were created by the commands listed at the end.

**Read this first: what this review did not do.** I ran the checks and read the files named below. I did not launch the app, click through the UI, test with a screen reader, or test IME input by hand. The editor, accessibility and performance scores are therefore based on code and test results, and I mark them low-confidence. Where I am unsure, the text says how to check.

## Overall: 6.9 / 10

This is a careful, well-tested local notes app with a clear rule (Markdown files on disk are the truth, the index is rebuildable) and a save path built the right way: temp file, fsync, rename, hash check. The weak points are not in the idea. They are: the typecheck command **fails today**; the dependency audit shows 13 known vulnerabilities, including Electron itself; the index silently stops at 2,000 files while the stated goal is 5,000; the docs and the CI have drifted from the code (README still says v0.0.8, CI runs only on Windows and never audits); and two giant files (`App.tsx`, `register.ts`) hold too much. No path I found loses a note in normal use. Data safety has three small gaps, listed below.

Two things in your brief do not match the repo:
- **The repo roadmap has Steps 0-9, not 0-6** (`docs/roadmap.md:11`).
- **There is no Google Calendar or OAuth code at all.** The calendar is native only: event notes and `@scheduled` tasks (`docs/roadmap.md:74`, `docs/decisions/ADR-0011-daily-today-events.md`). External calendars are deferred by design. So there are no OAuth tokens to store, and I did not score that. The mobile app does list `expo-secure-store`, which is the right tool when that day comes.

The "492 pass, 6 skipped" figure is out of date. The real numbers are below.

## Scores

| # | Area | Score | Confidence |
|---|------|-------|-----------|
| 1 | Security | 7.5 | Medium |
| 2 | Data safety and reliability | 7.5 | Medium |
| 3 | Licensing | 8 | Medium (direct deps only) |
| 4 | Code quality | 7 | Medium |
| 5 | Architecture | 7.5 | Medium |
| 6 | Editor live-preview | 6.5 | Low (not run by hand) |
| 7 | Performance (5,000 notes) | 6 | Medium |
| 8 | Testing | 7.5 | High |
| 9 | Accessibility and UX | 5.5 | Low (not run by hand) |
| 10 | Maintainability and docs | 6 | High |

### 1. Security: 7.5
Strong where it matters most. Electron runs with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` (`apps/desktop/src/main/window.ts:378-380`), denies all permission requests (`:389-392`), and blocks navigation and new windows (`:397-406`). The page has a tight CSP (`apps/desktop/src/renderer/index.html:11`: `script-src 'self'`, `object-src 'none'`, `frame-src 'none'`). File paths are checked by `resolveInsideRoot`, which walks each path part with `lstat`, refuses symlinked folders and compares real paths to the root (`apps/desktop/src/main/workspace/local-workspace.ts:74-100`). Path attack tests exist (`tests/core/confinement-vectors.test.ts`). IPC calls check the sender (`apps/desktop/src/main/ipc/guard.ts`). No secrets turned up in a grep of source; I did not scan git history.
Points lost for the audit result and the hand-written HTML renderer.
Top 3 issues:
1. `npm audit` reports 13 issues (10 high). In production dependencies: 7 (6 high, 1 moderate). Electron 44.0.0-44.9.0 has two advisories (pointer lock frame attribution, a certificate mitigation); the fix is `electron@44.10.0`. Also `vite` 8.3.0-8.3.2 (dev server issues), `undici`, `zod` (via Expo), `node-forge`, `brace-expansion`, `fast-uri`, `source-map-js`. Command output is under "Checks".
2. The note renderer is hand-written (`packages/core/src/markdown/render.ts`, 542 lines) and its URL filter only blocks `javascript:`, `vbscript:` and `data:` (`render.ts:25`). Its output goes into the page with `dangerouslySetInnerHTML` (`apps/desktop/src/renderer/components/outline.tsx:62`, the hover preview). The CSP and sandbox make a script run unlikely, so I rate this low risk. **Not verified:** whether a link like `[x](  javascript:...)` or one with control characters gets past the regex. Check by adding a test with such inputs.
3. `render.ts:70` and `:187` allow `<embed src=...>` for PDFs from note content. Blocked today by `frame-src 'none'`/`object-src 'none'`, but that is one CSP edit away from becoming a hole.

Odd file names: the Windows reserved-name and illegal-character rules are tested (`tests/filesystem/paths.test.ts`). I did not run odd names through the live app.

### 2. Data safety and reliability: 7.5
Saves are done right: write a temp file with exclusive create, fsync, then rename (`local-workspace.ts:258-267`). The file is never torn or truncated. Every write carries the hash the editor loaded, and a mismatch returns `CONFLICT` instead of overwriting (`:244-247`). The renderer stops autosave for that note and shows a conflict state (`apps/desktop/src/renderer/hooks/use-documents.ts:246-248`, `:283`). Keystrokes typed during a save stay dirty (`:255-261`). A recovery snapshot is taken before each save (`:233`). Drafts are kept for crashes (`:449-470`). The code comment at `local-workspace.ts:248-253` admits the check-then-rename window honestly.
Top 3 issues:
1. **Last-writer-wins window.** Between the hash check (`local-workspace.ts:244`) and the rename (`:267`), another program's edit is overwritten without a conflict. Small window, honestly documented, but it is a real way to lose an outside edit.
2. **Rename can overwrite.** `renamePath` checks the target is free with `fs.access` and then renames (`local-workspace.ts:292-298`). On Linux and macOS `fs.rename` replaces an existing file, so a file created between the two calls is destroyed. Narrow, but it is a data-loss path.
3. **Background tabs and quit.** The draft timer saves only the active tab (`use-documents.ts:455`). Other dirty tabs rely on the 1.5 s autosave (`:285-288`). The quit handler fires drafts and recovery without waiting for them (`:472-495`; they are async calls inside `beforeunload`). A crash within about 1.5 s of typing in a background tab can lose those edits. **Not verified:** how Electron handles pending IPC at window close; test it by killing the process mid-edit.
Smaller: a crash leaves `name.md.tmp-<pid>-<time>` files in the user's folder (`local-workspace.ts:258`). I did not check whether the explorer hides them. State files (recents, frame style, update state, MCP activity log) are written directly, not by temp-and-rename (`apps/desktop/src/main/ipc/register.ts:271`, `:930`; `apps/desktop/src/main/update/updater.ts:78`; `apps/desktop/src/main/services/mcp-store.ts:116`). A crash there can truncate a JSON file, but none of them is a note.

### 3. Licensing: 8
`LICENSE` is MIT (copyright 2026 Utsav Joshi) and matches `"license": "MIT"` in `package.json`. I read the license field of every direct dependency in the root and all workspaces: MIT for nearly all (CodeMirror, React, Electron, Vite, Hono, Expo, zustand and others), ISC for `yaml`, Apache-2.0 for `typescript` and `class-variance-authority`. No GPL or AGPL, and none missing a license field.
Top 3 issues:
1. I checked **direct** dependencies only. Transitive licenses are not checked. Run `npx license-checker --production --summary` to cover them.
2. Electron builds ship Chromium and its notices. I did not check that the installer includes them (`LICENSES.chromium.html`). Check the packaged output.
3. No third-party notice file or automated license check in CI.

### 4. Code quality: 7
Production code is clean on types: the only `any` uses are 3 in tests (`tests/renderer/complete.test.ts:13`, `:21`, `:39`). Only 1 TODO exists (`apps/mobile/components/rows.tsx:31`); no FIXME or HACK. ESLint passes.
Top 3 issues:
1. **Typecheck fails** (see "Checks"). Three type errors: `apps/desktop/src/main/wsl/helper-client.ts:79`, `apps/desktop/src/main/wsl/launch-security.ts:118`, `tools/mcp-sidecar/src/index.ts:47`. They look like a `setTimeout` type clash (`number` vs `Timeout`) and a missing `NODE_ENV` in an env type. **Not verified** whether they come from the uncommitted changes in the working tree. Check by running the typecheck on a clean checkout of `main`.
2. Giant files: `App.tsx` 1,643 lines, `ipc/register.ts` 1,168, `wysiwyg.ts` 930, `components/canvas.tsx` 771, `packages/core/src/canvas/model.ts` 713.
3. Debug logging left in normal paths: `use-documents.ts:301` logs every reload as `console.error("[file-read] reload request"...)`. There are 45 `console.*` calls in app and package source. The 26 `console.log` calls are all in `tools/scripts/*.mjs`, which is fine. About 7 empty `catch` blocks exist by regex count (`catch {}`); I did not read each one, so I cannot say how many hide real errors. One I did read, `local-workspace.ts:294-296`, is intentional and commented.

### 5. Architecture: 7.5
The layers are separated well: a shared core (`packages/core`) with ports (`packages/core/src/ports/host-filesystem.ts`), a main process that owns the disk (`apps/desktop/src/main/workspace/`), a renderer that holds only `workspaceId + relativePath`, and ADR-0008 stating that files are the truth. The index is in memory and rebuilt from files (`apps/desktop/src/renderer/index/workspace-index.ts:95`), so it cannot become a second source of truth that survives a restart. Recovery data and drafts live in app data, not the workspace.
Top 3 issues:
1. `IndexLink.resolved` is typed as the literal `false` (`packages/core/src/index/document.ts:36`) and set to `false` at `:380`. A grep for `.resolved` finds no reader. So it is a dead field with a misleading comment, not a working-feature gap: resolution lives in `packages/core/src/index/edges.ts` and `packages/core/src/links/backlinks.ts`. Either remove the field or fill it in.
2. `App.tsx` and `register.ts` are where layers blur; both are too big to reason about (see Code quality).
3. Circular dependencies: **not checked.** Run `npx madge --circular --extensions ts,tsx apps packages`.

### 6. Editor live-preview: 6.5 (low confidence)
What I saw: one CodeMirror surface (ADR-0015). Copy and cut are customized to put plain text on the clipboard (`apps/desktop/src/renderer/editor/wysiwyg.ts:749-760`). The decoration rebuild skips while the user is composing text (`wysiwyg.ts:916-917`), which is the correct way to protect IME input. Paste of large text is bounded (`:878`).
Top 3 issues (all need hands-on checking, none confirmed as bugs):
1. I did not read all 930 lines of `wysiwyg.ts`. The active-block raw reveal, checkbox and table widgets, and caret mapping across hidden markers are unverified. Test: type Japanese or Chinese via IME inside a heading, list item and table cell, and click-drag across hidden `**` markers.
2. Hidden syntax (backticks, pipes, link URLs) means the caret can sit on characters the user cannot see. Verify arrow-key and Backspace behavior at those edges.
3. No test I found drives a real browser editor for IME or paste. The renderer tests are logic-only (`tests/renderer/conformance.test.ts`).

### 7. Performance (5,000 notes): 6
Good: no reindex per keystroke. After a save, only that file is upserted (`use-documents.ts:264`). Search is debounced 250 ms (`apps/desktop/src/renderer/hooks/use-search.ts:76`). Note reads are async. Files over 1 MiB are skipped from the index with a notice.
Top 3 issues:
1. **The index caps at 2,000 files** (`apps/desktop/src/renderer/index/workspace-index.ts:65`, `:111`). With 5,000 notes, 3,000 are not searched and the status bar says "Partial index... Search may be incomplete" (`:82-85`). It is not silent, but it fails your 5,000-note case.
2. **The scale tests fail under load.** `tests/index/scale.test.ts`: "2000 rich files rebuild" took 10,178 ms against a 10,000 ms limit. `tests/renderer/conformance.test.ts`: the 5,000-line viewport build hit p95 10.65 ms against 8 ms. Both passed on a quiet run and failed when the machine was busy. Either the limits are too tight or the code is near its edge, and a 2,000-file rebuild taking ~10 s is slow in itself.
3. Many synchronous file calls in the main process (`existsSync`/`statSync` on workspace open at `register.ts:423`, plus `register.ts:255`, `:270`, `:512`, `:929`; also `window.ts` and `updater.ts`). Each blocks the app's main thread briefly; on a slow or network disk this can freeze windows.

### 8. Testing: 7.5
Real numbers from `npm test`: **121 test files, 118 passed and 3 skipped; 1,284 tests, 1,276 passed and 8 skipped** (13.35 s, quiet run). A second and third run each had 2 failures (the two perf tests above), so the suite is not stable on a busy machine. The 8 skipped tests are platform-conditional, not hidden gaps: 2 in `tests/filesystem/directories.test.ts` (windows-local only), and 6 live-WSL tests in `tests/wsl/distro-list.windows.test.ts` (1), `mutations.windows.test.ts` (4) and `users-list.windows.test.ts` (1), which need Windows plus real WSL. No `.skip` or `.todo` exists. That means the WSL feature and Windows path rules are untested on this machine.
Top 3 issues:
1. Data-loss tests exist for CONFLICT, recovery and atomic writes (`tests/filesystem/save-conflict.test.ts`, `tests/workspace/recovery.test.ts`, `tests/workspace/recovery-reopen.test.ts`), which is good. But I found no test that kills the process mid-write, fills the disk, or races two writers between the hash check and the rename.
2. No renderer-in-browser or end-to-end test of the editor (IME, paste, caret).
3. CI runs only on Windows (`.github/workflows/ci.yml`), so the Linux-only integration tests never run there, and `audit:deps` is not run in CI.

### 9. Accessibility and UX: 5.5 (low confidence)
There are 190 `aria-` or `role=` attributes across `apps/desktop/src/renderer/components`, and ADR/roadmap Step 9 sets a keyboard-first baseline. Hotkeys are user-editable with collision warnings (`docs/roadmap.md:40`).
Top 3 issues:
1. I did not test keyboard-only use, focus order or focus return after dialogs. The roadmap itself says "No WCAG-cert claim" (`docs/roadmap.md:97`).
2. I did not find an automated accessibility check (no axe or similar) in `tests/`.
3. Default hotkeys not checked against OS shortcuts. `Ctrl+Shift+T` (reopen tab) and `Ctrl+P` are fine in Electron, but any `Alt`-based or `F`-key bindings would need a manual pass on Windows, macOS and Linux.

### 10. Maintainability and docs: 6
A new developer can run `npm ci`, `npm test`, `npm run build` and all work (build passed in my run). The roadmap, ADRs and CONTEXT are detailed.
Top 3 issues:
1. **README is stale.** It says "foundation / pre-release (v0.0.8)" (`README.md:7`) while `package.json` is 0.1.10; it says macOS and Linux are "NOT claimed" (`README.md:14`) while the roadmap says native Windows, macOS and Linux are the MVP target (`docs/roadmap.md:7`); it never says that `npm run dev` is Windows-oriented (`README.md:35`), so a Linux contributor cannot tell how to start the app.
2. The roadmap's own text is out of step with the code in places: Step 3 says `resolved` is part of the link record (`docs/roadmap.md:50`) but it is a never-read constant (see Architecture).
3. The committed bundle `dist-mcp/takenotes-mcp.cjs` is tracked in git (1 file) and `npm run build` rewrites it, so builds dirty the tree. Not confirmed whether that is intended.

## Roadmap status (Steps 0-6 as asked; the repo has 0-9)

"Done" below means the code exists and is covered by passing tests. I did not use the features by hand.

| Step | Status | Evidence |
|------|--------|----------|
| 0 Filesystem foundation | **Done**, with the small race noted | Atomic save `local-workspace.ts:258-267`; CONFLICT `:244-247`; root confinement `:74-100`; link rewrite on rename `apps/desktop/src/main/workspace/link-rewrite.ts:41`; recovery `workspace/recovery.ts`; tests `tests/filesystem/`, `tests/workspace/` |
| 1 Editor | **Done** (tabs, autosave, conflict); Live Preview widgets deferred by the roadmap itself (`docs/roadmap.md:33`) | `editor/wysiwyg.ts`, `editor/create-editor.ts`, `use-documents.ts:228-295` |
| 2 Organization | **Done** (files exist; not used by hand) | Palette `components/palette.tsx`, `packages/core/src/commands/registry.ts`; hotkeys `packages/core/src/commands/hotkeys.ts`; explorer `components/tree.tsx`; outline `components/outline.tsx`. Favorites not opened by me |
| 3 Metadata index | **Partial** | Index exists (`packages/core/src/index/document.ts`, `store.ts`), but capped at 2,000 files (`workspace-index.ts:65`); `resolved` is a dead constant (`document.ts:36`, `:380`) |
| 4 Knowledge links | **Done** for backlinks, outgoing links, autocomplete, rename rewrite, embeds | Backlinks `packages/core/src/links/backlinks.ts:74` + UI `components/backlinks.tsx`; autocomplete `packages/core/src/links/completion.ts` wired at `editor/create-editor.ts:176`; embeds `links/embed-params.ts:33`; rewrite `link-rewrite.ts:41`. The known-gap list you gave is not a gap in code, except the `resolved` field. Link settings UI not verified |
| 5 Search | **Done** for V1 grammar, **not checked operator by operator** | `packages/core/src/search/query.ts`, `search.ts:346`, `:377`; spec `docs/specs/search-grammar.md`. Partial results beyond 2,000 files |
| 6 Productivity | **Done**, except Google Calendar, which is **Missing by design** | Daily `packages/core/src/productivity/daily.ts:42`; tasks `productivity/tasks.ts`; templates `productivity/templates.ts`; calendar `productivity/calendar.ts` (native only); UI `components/today-pane.tsx`, `calendar-pane.tsx`, `template-picker.tsx`. No Google/OAuth code anywhere |

Nothing is "Stubbed" that the docs call done, apart from the `resolved` field.

## Top 10 problems, worst for users first

1. **Index stops at 2,000 files; goal is 5,000.** `apps/desktop/src/renderer/index/workspace-index.ts:65,111`. Users with large workspaces get incomplete search and backlinks, with only a status-bar notice.
2. **Rename can overwrite an existing file** that appears between the check and the rename. `local-workspace.ts:292-298`. Fix: make the move fail if the target exists (hard link plus unlink, or an exclusive-create approach).
3. **A background tab's edits can be lost on a crash** within ~1.5 s, because only the active tab gets a draft. `use-documents.ts:455`, `:472-495`.
4. **Outside edits can be overwritten** between hash check and rename. `local-workspace.ts:244-267`. Honestly documented; consider rechecking just before the rename.
5. **Typecheck fails.** `helper-client.ts:79`, `launch-security.ts:118`, `tools/mcp-sidecar/src/index.ts:47`. A release gate that is red means type safety is no longer enforced.
6. **13 known vulnerabilities, including Electron.** Update Electron to 44.10.0 or later and run `npm audit fix`; Expo-related `zod` needs a major bump.
7. **CI runs on Windows only and skips the audit** (`.github/workflows/ci.yml`), which is why items 5 and 6 can go unseen.
8. **Perf tests fail under load**, so the suite gives false alarms and hides real regressions. `tests/index/scale.test.ts`, `tests/renderer/conformance.test.ts`. Use a wider limit or run perf tests alone.
9. **Hand-written HTML renderer** with a three-scheme URL block list. `packages/core/src/markdown/render.ts:25`. Add hostile-input tests, or sanitize the output with a maintained library.
10. **README is wrong** about the version, platforms and how to run the app (`README.md:7,14,35`), and `App.tsx`/`register.ts` are too large to review safely.

## Quick wins (under an hour each)

- Fix the 3 type errors, or find out which uncommitted change caused them.
- Run `npm audit fix` and bump Electron to 44.10.0; re-run `npm run audit:deps`.
- Add `npm run audit:deps` and an Ubuntu job to `.github/workflows/ci.yml`.
- Update `README.md` (version, supported platforms, Linux/macOS dev command, link to `docs/guides/development.md`).
- Remove or populate `IndexLink.resolved` (`document.ts:36`, `:380`) and update `docs/roadmap.md:50`.
- Change the `console.error("[file-read] reload request"...)` call at `use-documents.ts:301` to a debug-only log.
- Add a test with hostile links (`[x]( javascript:...)`, control characters, mixed case) against `render.ts:25`.
- Move the two perf tests behind a separate script or loosen their limits.
- Raise `MAX_LISTED_FILES` or make it a setting, after measuring (see milestone 1).

## Done well

- Atomic write with fsync and rename, hash-checked saves, and a code comment that does not overstate the guarantee (`local-workspace.ts:248-253`).
- Real path confinement with symlink refusal and tests for attack inputs.
- Hardened Electron setup: sandbox, context isolation, strict CSP, sender checks, permission denial.
- Files-are-truth rule (ADR-0008) and a rebuildable in-memory index.
- Recovery snapshots plus crash drafts, with tests including reopen.
- Large, fast test suite (1,284 tests in about 13 s) and a clean lint run.
- Almost no `any` in production code, and a strong ADR habit.
- Truncated indexes tell the user instead of failing silently.

## Recommended next 3 milestones

1. **Make the checks trustworthy (about 1-2 days).** Fix the typecheck, clear the audit, add the audit and a Linux job to CI, stabilize the two perf tests. Reason: every later change depends on a green, honest gate, and right now it is red.
2. **Close the data-loss gaps and scale limit.** Make rename refuse to overwrite, draft every dirty tab (and await it on quit), re-check the hash just before the rename, add kill-mid-write and two-writer race tests; then measure indexing at 5,000 notes and lift or stream the 2,000 cap. Reason: losing a note is the worst bug, and the 5,000-note goal is currently unmet.
3. **Break up `App.tsx` and `register.ts`, then refresh the docs, and finish the manual checks I could not do.** Split by feature behind the existing service layer, fix README and roadmap drift, and run a hands-on pass on IME, paste, keyboard-only use and odd file names on Windows, macOS and Linux. Reason: the two largest files are where bugs will hide next, and the low-confidence scores above (editor, accessibility) need real evidence.

## Checks and commands

Every command was run in `/home/utsav/Projects/takenote`.

| Command | Result |
|---------|--------|
| `node -v` | `v24.19.0` |
| `npm ci` | **Passed.** 925 packages added; reported 13 vulnerabilities (3 moderate, 10 high) |
| `npm run typecheck` | **Failed.** 3 errors: `helper-client.ts(79,87)` TS2322 (`number` not assignable to `Timeout`); `launch-security.ts(118,9)` TS2741 (`NODE_ENV` missing in env type); `tools/mcp-sidecar/src/index.ts(47,11)` TS2339 (`unref` does not exist on `number`) |
| `npm run lint` | **Passed.** No output, exit 0 |
| `npm test` (first run) | **Passed.** 118 files passed, 3 skipped; 1,276 tests passed, 8 skipped; 13.35 s |
| `npm run build` | **Passed.** Built renderer, Electron, server (`dist-server/server.cjs` 175.4 kB), helper (22.9 kB) and MCP sidecar (13.8 kB) |
| `npm run audit:deps` | **Failed.** Stopped at the production audit: `brace-expansion`, `fast-uri`, `node-forge`, `source-map-js`, `zod` (via `expo`). Run on its own, `npm audit --omit=dev` also exits non-zero |
| `npm audit` (full) | **Failed.** 13 vulnerabilities (3 moderate, 10 high), adding `electron`, `vite`, `undici`, `http-cache-semantics`, `@vitest/mocker` |
| `npx vitest run --reporter=verbose` and a later `npx vitest run` | **Failed both times.** The same 2 tests: `tests/index/scale.test.ts` (10,178 ms vs 10,000 ms limit) and `tests/renderer/conformance.test.ts` (p95 10.65 ms vs 8 ms). The machine was busier than on the first run |
| `git ls-files ... \| xargs wc -l \| sort -rn` | Largest source files: `App.tsx` 1,643; `ipc/register.ts` 1,168; `wysiwyg.ts` 930; `canvas.tsx` 771; `core/canvas/model.ts` 713 (a research doc, `docs/research/OBSIDIAN_FEATURES_CURRENT.md`, at 1,815 lines is not code) |
| `grep` for TODO/FIXME/HACK, `any`, `console.*`, empty catches | 1 TODO; 3 `any` (all tests); 45 `console.*` in app and package source; ~7 empty catch blocks by regex |
| `node` script reading `license` fields of direct deps in root and all workspaces | MIT, ISC (`yaml`), Apache-2.0 (`typescript`, `class-variance-authority`); no copyleft, none missing |
| Read-only file reads and greps | `docs/roadmap.md`, `README.md`, `local-workspace.ts`, `use-documents.ts`, `render.ts`, `outline.tsx`, `document.ts`, `workspace-index.ts`, plus two read-only exploration passes over the whole repo |

Not run: `npm run version:check`, `npm run ui:tokens:check`, any packaging command, a circular-dependency check, a transitive license scan, a git-history secret scan, and the app itself.
