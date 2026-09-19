# Roadmap — takenotes

Source of truth: `CONTEXT.md` + `docs/decisions/` + this file. No further
design expansion; implement against these decisions.

## Phase 1 — Foundation

Windows 11 host → WSL discovery (distro → user → path) → Connection →
Workspace (opaque `workspaceId`) → Service Layer → filesystem operations →
editor/tabs/splits → revision + CONFLICT handling → recovery → parse-once
index (frontmatter, headings, tags, links, checkbox tasks) → search V1
(text, `"phrase"`, `file:`, `path:`, `tag:`, `type:`, `is:task`) → Quick
Open → Command Registry (fixed defaults).

Gate: verified on real Windows 11 + WSL2, Ubuntu with two Linux users plus
one additional distro — including a repeatable CONFLICT demo recorded in
`docs/mvp-status.md`. See ADR-0007, ADR-0008, ADR-0010, ADR-0013.

## Phase 2 — Productivity

Daily Notes (`Daily/YYYY/MM/YYYY-MM-DD.md`, V1 vars only) → Templates →
Tasks (any `- [ ]` valid, lazy IDs, `due` ≠ `scheduled`) → Calendar
(event-notes + `@scheduled` tasks) → Today (schedule + overdue/due-today +
daily embed + recent + quick actions, no silent create) → Quick Capture
(Daily/Inbox/Task/New Note via services, default `Inbox.md`) → customizable
hotkeys (app-data). See ADR-0010, ADR-0011.

## Phase 3 — Assistant / MCP

MCP permissions (per-client × per-workspace, approval screen) → stdio
sidecar (`takenotes-mcp`, private IPC, app-must-be-running, no HTTP) →
notes/search tools → task tools → calendar tools → daily-note tools →
activity log. Unlocks: plan in notes → assistant via MCP → tasks →
scheduled work → calendar → Today → daily execution. See ADR-0009, ADR-0012.

## Phase 4 — Structured knowledge + extensibility

Collections (`.takenotes/collections/*.yaml`, query + named views) →
properties/query improvements → saved views → advanced search operators →
Plugin SDK → permissioned sandbox → Plugin Manager → themes.

## Phase 5 — Visual + integrations

Graph + Local Graph → Canvas (JSON Canvas) → mind-map workflows →
Google Calendar / CalDAV / ICS / Outlook → other integrations → remote or
headless MCP only if justified.
