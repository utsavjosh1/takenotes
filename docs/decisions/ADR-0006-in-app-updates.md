# ADR-0006 — In-app software updates (lightweight, Windows-only)

Date: 2026-09-17 · Status: accepted

## Decision

- Lightweight updater, no `electron-updater`: main-process
  `update:check` (GitHub Releases `releases/latest`, stable tags only,
  SemVer compare) → user clicks Download → `update:download` fetches the
  NSIS `.exe` + `SHA256SUMS.txt`, verifies SHA-256, launches the installer,
  quits. Checksum gate is mandatory; a mismatch aborts before execution.
- Channel: stable `vX.Y.Z` only. Prereleases are never offered (GitHub's
  `latest` endpoint already excludes them; the tag guard re-enforces it).
- Triggers: silent auto-check at startup (max once/24h, state in `userData`,
  offline = silent skip) + manual Help → Check for Updates + palette +
  Settings → About row.
- Scope: Windows NSIS only. Per-user install needs no elevation; the
  bundled WSL runtime updates atomically with the app. macOS/Linux return
  precise "not supported in this version" via the shared `updates`
  capability. IPC shape is platform-neutral so parked platforms reuse it.
- `electron-builder` stays `--publish never` with `publish: null`: the
  lightweight flow needs no `latest.yml` metadata. This supersedes the
  "no auto-update in MVP" rule in ADR-0005/`docs/release.md`.

## Alternatives considered

- Full `electron-updater` (background download, restart-to-update,
  differential): rejected for now — needs signing for silent install, a new
  native dep + metadata pipeline, and real risk on unsigned builds.
  Revisit after Authenticode signing lands.
- Own update server: rejected — GitHub Releases already publishes the
  `.exe`, checksums, SBOM, and attestations; no infra to run.

## Consequences

- Unsigned reality is surfaced honestly: the update dialog explains
  SmartScreen will warn and to check the version matches.
- `src/main/update/version.ts` is pure logic with unit tests; network and
  install steps stay in main and are manually verified on a Windows host.
