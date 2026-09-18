# Changelog

All notable changes to takenotes.

## [Unreleased]

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
