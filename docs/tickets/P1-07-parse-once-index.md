# P1-07 — Parse-once document index (needs YAML dep)

Phase: 1 Foundation. Blocked by: P1-01 (index updates hook into mutations).

## Observable result

Opening a workspace builds an in-memory per-workspace index; any
create/write/rename/delete/restore re-parses exactly that file (bulk build
bounded, >1 MiB content skipped, binary/NUL-safe). Deleting the index loses
nothing (rebuild on open). One `DocumentIndexEntry` per file carries:
frontmatter map + normalized title/aliases/tags/type/status/dates,
headings (ATX, anchor), inline+frontmatter tags, `[[t|a#h]]` links with
embed/resolved/position, `- [ ]`/`- [x]` tasks with inline
`@due/@scheduled/@priority` tokens (opportunistic; no recurrence/deps/NLP).

## Constraints

- ADR-0008/ADR-0010. Bad YAML → `{}` + file still indexed. No SQLite. No
  watcher in P1 — refresh on tree-expand + after mutations (documented).

## Acceptance (must fail on starting commit)

1. Parser vector tests: frontmatter (good/bad/CRLF/BOM), headings, `#tag`
   + `#a/b`, `[[MCP#Server|label]]`, `![[embed]]`, `![[img.png]]`, tasks,
   `@due/@scheduled` tokens, `tomorrow` NOT parsed as a date.
2. Index tests: write → re-parse; rename → entry moves; delete → entry
   drops; rebuild-after-drop is lossless vs filesystem.
3. Requires adding one pinned YAML dependency (none vendored today).
