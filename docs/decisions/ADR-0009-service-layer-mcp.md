# ADR-0009 — Single internal Service Layer, MCP as automation boundary

Date: 2026-09-19 · Status: accepted

## Decision

All surfaces (UI, Commands, Tasks, Calendar, Plugins, future CLI, MCP) go
through one internal Service Layer (`Workspace/Note/Search/Task/Calendar`
services) down to the filesystem/WSL. There is no public REST API. The
supported automation interface is an MCP **server** (external clients connect
to takenotes); takenotes-as-MCP-client is deferred.

## Rationale / deviation

Four parallel filesystem implementations (UI + plugins + CLI + MCP) would
diverge on permissions, revisions, and WSL identity. A single seam enforces
`workspaceId` scoping, `expectedRevision` conflicts, and permission checks
once. MCP-over-stdio fits the desktop model with no listening port; REST
would add attack surface for no product gain at this stage.

## Consequences

- No new UI code bypasses services to touch fs/IPC directly.
- MCP V1: server only, small allowlist, no `note_delete`/`command_execute`/
  shell/raw-fs; per-client × per-workspace grants + approval screen.
- Grants and append-only activity log live in app-data, outside workspaces.
