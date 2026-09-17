# Changelog

All notable changes to takenotes.

## [Unreleased]

### Added

- Foundation scaffold: Electron main/preload/renderer boundaries, Vite +
  esbuild + electron-builder build chain, CodeMirror 6 editor module.
- Windows workspace: folder open, directory list, revisioned read, atomic safe
  write with conflict detection, file create, symlink-escape rejection.
- WSL helper: framed stdio protocol, handshake, workspace open, directory
  list, file read/write/create; bundled-Node staging with verified checksums.
- Version scripts, CI (Ubuntu + Windows), tag-driven release pipeline with
  checksums, ADRs, architecture/security/protocol documentation.

### Fixed (Windows-first)

- Windows launch no longer quits silently: menu failure can't block the
  window, startup crashes show an error box with the cause.
- WSL runtime (`node` + `helper.cjs` + `manifest.json`) is now bundled into
  the Windows NSIS installer via `extraResources` (was downloaded in CI but
  never shipped); staged `node` keeps its exec bit.

### Changed (Windows-first)

- Release `publish` is gated on the Windows installer only; macOS/Linux are
  parked (kept in repo, best-effort, never block a Windows release).
- Tests are logic-only: framing, handshake, path validation, helper direct
  round-trip, search, drafts. Removed keymap/platform/decoder/NTFS/symlink
  suites and `audit:*` / `test:platform` scripts.

## [0.0.1] - 2026-09-16

First baseline release. Foundation scaffold as below; real-WSL round-trip not yet verified.
