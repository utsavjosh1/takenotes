# ADR-0014 — Dual-host Service Layer (supersedes ADR-0009 for transport)

Date: 2026-09-19 · Status: accepted · Supersedes: ADR-0009 (transport/host constraints only)

## Decision

takenotes supports two application hosts over one internal Service Layer.

- The desktop host uses validated Electron IPC (`senderIsOurs`, `workspaceId` scoping, path confinement, `expectedRevision`).
- A self-hosted `takenotes-server` may expose authenticated HTTP (later WebSocket) solely as a first-party transport for official takenotes clients.
- The HTTP/WS surface is not a supported public developer API and carries no V1 stability, SDK, or compatibility promise.
- MCP remains the supported external automation boundary. ADR-0012 (desktop MCP stdio sidecar, app-must-be-running) stays valid until a later ADR changes remote MCP.
- Self-hosting adds a second host/transport, never a second backend implementation or implicit local↔remote synchronization.

## Consequences

- One `NoteService` semantic for `note.read/update` (later search/tasks/calendar) across IPC and HTTP: same args, same `FileReadResult`, same `AppError` codes, same `CONFLICT`.
- `/api/rpc/*` is a private unstable encoding, not `/api/v1/*`.
- HTTP is authenticated even on Tailscale/LAN; no reverse-proxy identity-header trust in V1.
- WebSocket deferred until after the HTTP note slice proves.
- Single-owner server V1 (`TAKENOTES_PASSWORD` bootstrap → Argon2id, opaque persistent sessions, `__Host-` cookie, explicit CSRF, `authGeneration` invalidation).
- Remote workspaces have one authoritative server-side copy (`$TAKENOTES_DATA/workspaces/*`); server-local state lives under `$TAKENOTES_DATA/app/*` (auth, sessions, workspace registry, drafts, recovery, grants, logs, indexes). No automatic local↔server sync in V1.
- Server filesystem is ordinary `linux-local` behavior on that host; opaque `workspaceId` persists in a registry and is never recycled (delete → `missing`/tombstone). Empty `/data/workspaces/` is a valid empty state.
- ADR-0009's Service Layer and MCP intent remain; only its `no listening port / no REST` absolute is scoped to the desktop-only host.
