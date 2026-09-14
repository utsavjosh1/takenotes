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

## [0.1.0] - 2026-09-14

Initial foundation. Pre-release: real-WSL round-trip not yet verified.
