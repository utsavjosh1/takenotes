# ADR-0011 — Daily / Today / Event-note contract

Date: 2026-09-19 · Status: accepted

## Decision

Daily Notes live at `Daily/YYYY/MM/YYYY-MM-DD.md` with `type: daily,
date: YYYY-MM-DD` (local calendar date, configurable path deferred). V1
template variables are `date`, `time`, `title`, `workspace.name` only — no
shell, JS, conditionals, loops, network, or MCP invocation. `Today` is an
aggregated view (scheduled items + overdue/due-today tasks + Daily Note
embed + recent notes + quick actions), not the Daily Note itself; a missing
Daily Note shows `[ Create Today's Note ]`, never silent auto-create.
Calendar V1 has exactly two native sources: event-notes (`type: event`,
`start` required, `end` optional, ISO-8601 with offset) and tasks with
`@scheduled(...)`. `due` is a deadline, never a time block.

## Rationale / deviation

Daily path regularity makes Today, Templates, Tasks, Calendar, and MCP share
one resolver instead of five guesses. A tiny variable set keeps templates
auditable before any plugin-powered advanced engine. Keeping `Today` separate
from the Daily file preserves Markdown truth (aggregation is a view, not a
file). Requiring `start` while defaulting `end` to a 30-minute visual-only
duration avoids persisting guesses into user files.

## Consequences

- Daily creation resolves path → applies template → fills vars → writes file
  → updates index, via Note/Daily services.
- Tasks inside event-notes are independent tasks; they block Calendar time
  only with their own `@scheduled(...)`.
- Document frontmatter `due:` is a project deadline, not an event.
- External calendars (Google/CalDAV/ICS/Microsoft) deferred to Phase 5;
  provider support kept in mind, not implemented.
