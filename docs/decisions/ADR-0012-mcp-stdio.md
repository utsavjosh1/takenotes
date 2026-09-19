# ADR-0012 — MCP stdio-only, app-must-be-running

Date: 2026-09-19 · Status: accepted

## Decision

MCP V1 is server-only over stdio via a thin `takenotes-mcp` sidecar that
forwards to the running app over private local IPC (named pipe or equivalent).
No localhost HTTP, no REST, no Streamable HTTP, no TCP port. If the app is
closed, MCP fails fast (`TAKENOTES_APP_NOT_RUNNING`); the sidecar never
touches Markdown, WSL, or the index directly. `workspace_list` reveals only
granted workspaces.

## Rationale / deviation

Only the running app owns workspace identity, WSL user context, grants,
revision state, and task/calendar semantics (ADR-0009). A direct-filesystem
fallback would fork behavior between UI and agents. stdio fits Claude/Codex/
local-agent clients without opening attack surface on a notes app; remote/
headless operation is a separate future decision.

## Consequences

- All parsing, fs, WSL, task, and calendar logic stays in the app/service
  layer; sidecar is protocol + IPC only.
- V1 tools: `workspace_list/get`, `note_list/read/create/update`,
  `search_notes`, `task_list/create/update/complete`,
  `calendar_events/create/update`, `daily_read/append`. Deferred:
  `note_delete`, `command_execute`, properties/backlinks/collections/
  templates/plugins/shell/raw-fs.
- Grants + append-only activity log live in app-data, never in workspaces.
