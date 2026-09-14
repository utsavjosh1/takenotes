# ADR-0005 — Versioning and releases

Date: 2026-09-14 · Status: accepted

## Decision

- `package.json` is the single version source (start `0.1.0`, SemVer).
- `scripts/set-version.mjs` updates `package.json` + `package-lock.json`
  together (no tag/commit/publish); `scripts/check-version.mjs` gates CI and
  release (tag `vX.Y.Z` must equal `package.json`).
- Helper version = app version at build time; `manifest.json` generated with
  real checksums, never hardcoded.
- Tag-driven GitHub Releases: WSL runtime job (Ubuntu) → Windows installer
  job → publish job. electron-builder always `--publish never`; publication is
  an explicit workflow step. No auto-update in MVP.

## Consequences

- `CHANGELOG.md` (Keep-a-Changelog style) must contain the release section or
  `release:verify` fails.
- Prerelease tags (`v0.2.0-beta.1`) are supported and marked prerelease.
