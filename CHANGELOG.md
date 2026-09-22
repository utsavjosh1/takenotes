# Changelog

All notable changes to takenotes.

## [Unreleased]

## [0.0.9] - 2026-09-22

### Added

- Self-hosted server foundation with owner setup, login sessions, CSRF protection, workspace persistence, and browser note read/update flows.
- Shared CoreNoteService parity seam for native and HTTP note operations, with expanded behavioral contract coverage.
- User-visible partial-index warnings for capped workspace listings and oversized skipped notes.
- Phase 1 architecture, ADR, roadmap, ticket, and blocked Windows/WSL evidence documentation updates.

### Fixed

- Recovery snapshots now use stable workspace identity, survive reopen, and deny cross-workspace reads.
- Native Windows root confinement and shared path safety vectors were tightened.
- App platform/version IPC handlers now enforce sender validation.
- WSL non-interactive user filtering was improved.

## [0.0.8] - 2026-09-19

### Added

- Phase 1 foundation stack through Recovery: service-layer filesystem operations, WSL distro/user discovery, WSL mutation parity, atomic save/conflict handling, split panes/status, parse-once index, Search V1, command registry/Quick Open, and app-data recovery snapshots.
- Recovery History UI with Restore and Copy actions. Recovery snapshots are local app-data state keyed by `workspaceId + relativePath`, throttled during editing, retained for 7 days, and never stored inside workspaces.

### Fixed

- Windows CI fixtures now avoid assuming live WSL distros on generic runners and normalize rebuilt index paths across Windows/POSIX separators.

## [0.0.7] - 2026-09-18

### Fixed

- Packaged launch failures where Chromium's asar file handling reports
  `ERR_FILE_NOT_FOUND` for `dist/renderer/index.html` while Node fs reads
  the same bundle fine (observed v0.0.6: exists=true + full readdir listing
  + on-disk asar intact): ordered renderer fallbacks in `src/main/window.ts`
  — `loadFile` → `loadURL(file:)` → `takenotes://bundle/` served from the
  asar via Node fs — before any error dialog, so one broken Chromium code
  path no longer bricks the app. Normal launches still use `file://` only.
- Missing-bundle report now uses `original-fs` for the on-disk asar size
  (patched `fs.statSync` can report the virtual archive root, 0 bytes) and
  records entry kind (file/directory/missing).

### Added

- `takenotes://` custom-protocol fallback: root-confined to `dist/renderer`,
  GET-only, 404s everything else; scheme privileges (`standard`, `secure`,
  `supportFetchAPI`) declared pre-ready in `src/main/index.ts`. Pure,
  unit-tested confinement (`resolveFileForAppRequest`), MIME map, and URL
  builder in `tests/packaging/renderer-failure-report.test.ts`.

## [0.0.6] - 2026-09-18

### Fixed

- Packaged launch `ERR_FILE_NOT_FOUND` for `dist/renderer/index.html` on
  some Windows installs despite a byte-perfect `app.asar` (12997621 bytes,
  all boot files present): the renderer dir was resolved via fragile
  `__dirname/../../` traversal that breaks silently if the main-bundle
  depth ever changes. It now resolves from the stable `app.getAppPath()`
  anchor (`.../resources/app.asar` → `dist/renderer`) with the legacy
  traversal as fallback (`resolveRendererDir` in `src/main/window.ts`,
  wired in `createWindowIpc`).
- Missing-bundle dialog/log now carry asar size, renderer listing, and
  `mainDir`, so the next screenshot alone distinguishes a truncated asar
  from a misresolved path — no PowerShell/`asar list` needed.

### Added

- `tests/packaging/renderer-failure-report.test.ts`: report contents plus
  `resolveRendererDir` anchor-preferred vs legacy-fallback behavior.

## [0.0.5] - 2026-09-18

### Fixed

- Windows exe still showed the stock Electron icon: `signAndEditExecutable:
  false` skips resedit entirely (icon + metadata). Switched to
  `signExecutable: false` so the icon/metadata are applied while code
  signing stays off until a cert lands.
- `theme-init.js` never shipped (vite drops a non-module `<script src>`
  without emitting it): moved to `public/theme-init.js` so it is copied to
  `dist/renderer/` and covered by the new package gate.
- Missing-bundle dialog now reports the app version, so a mixed install
  (new exe + old `app.asar`) is identifiable from the report alone.
- Release gate `verify-packaged` compared asar paths verbatim and
  false-positived on Windows runners (`path.join` yields `\`
  separators there): now normalizes separators before comparing, and
  prints sample asar entries on failure.

### Added

- `scripts/verify-packaged.mjs` (`npm run verify:packaged`, wired into
  `release.yml` after `package:win`): fails the release if
  `win-unpacked/resources/app.asar` lacks any boot file
  (`dist/renderer/index.html`, `theme-init.js`, main/preload bundles).

### Changed

- CI/release pipelines are Windows-only: dropped the Ubuntu/macOS jobs
  (same logic suite, doubled queue time).

## [0.0.4] - 2026-09-18

### Fixed

- Packaged white screen (`ERR_FILE_NOT_FOUND` for
  `dist/renderer/index.html`): `package:win` now runs `npm run build`
  first so the renderer bundle can never be silently omitted from
  `app.asar`. A missing bundle now shows an error box with the path
  instead of an empty window (`src/main/window.ts`).
- Packaged window/taskbar icon fell back to Electron default:
  `build/icon.png` is now shipped via `extraResources` so
  `resolveWindowIcon()` resolves in the installed app.

## [0.0.3] - 2026-09-18

### Fixed

- Windows launch crash `FATAL:gin/v8_initializer.cc Error loading V8 startup
  snapshot file`: `LoadBrowserProcessSpecificV8Snapshot` fuse back to
  `false` (stock Electron ships no `browser_*` snapshots). Locked by
  `tests/packaging/fuses.test.ts`.

### Added

- App branding: `build/icon.{png,ico,icns}`, NSIS + window icons, titlebar
  mark, theme-aware welcome/About artwork.

## [0.0.2] - 2026-09-17

Windows-first hardening + in-app updates + Windows-only release.

### Fixed

- Windows launch no longer quits silently: menu failure can't block the
  window, startup crashes show an error box with the cause.
- WSL runtime (`node` + `helper.cjs` + `manifest.json`) is now bundled into
  the Windows installer via `extraResources` (was downloaded in CI but never
  shipped); staged `node` keeps its exec bit.

### Added

- In-app software updates (Windows-only, ADR-0006): silent startup check
  (24h cadence, offline-silent) + Help → Check for Updates + palette +
  Settings → About. Download is SHA-256-verified against the release's
  `SHA256SUMS.txt` before the installer launches. Stable channel only.

### Changed

- Release is Windows-only: NSIS installer + portable ZIP
  (`takenotes-<v>-win-x64.exe` / `.zip`). macOS/Linux release jobs,
  builder targets, and `package:mac*`/`package:linux` scripts removed
  (adapters stay parked in `src/`).
- Tests are logic-only: framing, handshake, path validation, helper direct
  round-trip, search, drafts, update-version compare. Removed
  keymap/platform/decoder/NTFS/symlink suites and `audit:*` /
  `test:platform` scripts.

## [0.0.1] - 2026-09-16

First baseline release. Foundation scaffold as below; real-WSL round-trip not yet verified.

### Added

- Foundation scaffold: Electron main/preload/renderer boundaries, Vite +
  esbuild + electron-builder build chain, CodeMirror 6 editor module.
- Windows workspace: folder open, directory list, revisioned read, atomic safe
  write with conflict detection, file create, symlink-escape rejection.
- WSL helper: framed stdio protocol, handshake, workspace open, directory
  list, file read/write/create; bundled-Node staging with verified checksums.
- Version scripts, CI (Ubuntu + Windows), tag-driven release pipeline with
  checksums, ADRs, architecture/security/protocol documentation.
