# P1-10 — Recovery snapshots per ADR-0013

Phase: 1 Foundation. Blocked by: P1-01 (hooks into `NoteService` writes).

## Observable result

Version snapshots (distinct from crash drafts, which stay untouched) list
per file with Restore + Copy-contents. Store:
`userData/recovery/<workspaceId>/<rel>/…` (two users, same rel → separate
histories). Policy: ≤1 snapshot per changed file per 5 min + on
save/close/shutdown when changed; identical content skipped; 7-day janitor;
"recovery is not backup" note in UI. Every restore snapshots current bytes
first. New narrow `recovery:*` preload fns.

## Constraints

- ADR-0013 exactly. Never inside workspaces/`.takenotes/`; never synced or
  exposed to MCP; no Compare view in P1.

## Acceptance (must fail on starting commit)

1. Fake-clock tests: throttle (5-min), save/close capture, identical-skip,
   7-day expiry, workspaceId separation.
2. Restore test: current content snapshotted before restore; Copy returns
   snapshot bytes without touching disk.
3. Drafts tests still green (no conflation of drafts vs snapshots).
