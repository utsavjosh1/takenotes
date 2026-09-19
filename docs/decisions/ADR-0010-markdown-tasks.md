# ADR-0010 — Task/Calendar data remains Markdown-backed

Date: 2026-09-19 · Status: accepted

## Decision

Any `- [ ]` checkbox is a valid task. Task/Calendar UI mutates source
Markdown; Markdown stays authoritative. `due` (deadline) and `scheduled`
(calendar block) are distinct and never rewritten into each other.
Task-specific metadata lives on the task line (`@due/@scheduled/@priority`);
document frontmatter describes the document, not its tasks. Stable task IDs
(`^task-xxxx`) are assigned lazily only when persistent cross-view identity
is needed. All mutations carry `expectedRevision`; V1 never auto-merges.

## Rationale / deviation

Forcing IDs or rich syntax on every checkbox would punish casual capture;
file+line identity alone breaks the moment Tasks, Calendar, and MCP edit the
same line. Lazy IDs give reliability without noise. Keeping `due` separate
from `scheduled` preserves "deadline Sept 25, work-block Sept 24 14:00" and
makes calendar drag a single-token rewrite. Toggling only flips the checkbox
in V1 so assistants and users never inject surprising metadata.

## Consequences

- Parser emits tasks with description/completed/line/stableAnchor/tags/
  explicit tokens; no recurrence/deps/NLP dates in V1.
- Calendar drag rewrites `@scheduled` in place; `@due` untouched.
- UI preserves dirty state on CONFLICT; MCP receives fresh revision to retry.
