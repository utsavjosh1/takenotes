# ADR-0013 — Recovery in app-data, 7-day retention, snapshot-before-restore

Date: 2026-09-19 · Status: accepted

## Decision

Recovery snapshots live in app-data (`%APPDATA%/takenotes/recovery/`) keyed
by the stable workspace namespace (`kind + canonical root + distro +
linuxUser`) plus `relativePath`, never inside the workspace or `.takenotes/`.
`workspaceId` is only the per-open request-scoping handle used to resolve that
namespace at the IPC boundary.
At most one snapshot per changed file per 5 minutes during editing, plus a
snapshot of changed content on explicit save/close/clean shutdown (no
duplicate-content snapshots). Retention is 7 days (configurable later);
recovery is not backup. V1 actions are Restore + Copy (Compare deferred);
every restore snapshots the current version first.

## Rationale / deviation

Workspace-embedded history would leak private content into Git/sync and
collide across Linux users sharing a path string; stable namespace keying keeps
`utsav` and `work` histories separate even when runtime `workspaceId`s change.
Throttling avoids snapshot-per-keystroke
cost over WSL while save/close capture intent points. Snapshot-before-restore
makes a wrong restore reversible, which a plain overwrite cannot offer.

## Consequences

- Distinct workspaces never share history even for identical relative paths.
- Snapshots inherit app-local protection; never auto-committed, synced, or
  exposed to MCP clients.
- UI states recovery-is-not-backup; retention configurability deferred.
