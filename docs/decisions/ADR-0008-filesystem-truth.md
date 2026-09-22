# ADR-0008 — Filesystem/Markdown is source of truth

Date: 2026-09-19 · Status: accepted

## Decision

User Markdown and files remain authoritative. No database is required for
knowledge data. Memory caches and rebuildable app-data indexes are allowed as
performance optimizations; deleting them must never destroy notes, tasks, or
knowledge. Any future account/subscription/cloud database is a separate
concern, not a second copy of the vault.

## Rationale / deviation

Obsidian-style durability plus WSL trust: users must be able to `rm -rf` our
indexes and lose nothing. A mandatory SQLite knowledge store would create a
second source of truth, complicate WSL conflict semantics, and undermine the
"ordinary files" promise. Revisit a rebuildable SQLite/search cache only when
measured performance demands it.

## Consequences

- One canonical parse per file feeding search/links/tasks/calendar/MCP.
- Indexes keyed by `workspaceId`, stored outside the workspace.
- Collections travel with the workspace (`.takenotes/` YAML); grants/logs
  stay in app-data and never enter Git/sync.
