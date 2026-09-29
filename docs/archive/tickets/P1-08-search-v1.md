# P1-08 — Search V1 over the index (replaces fs scan)

Phase: 1 Foundation. Blocked by: P1-07 (index is the only data source).

## Observable result

Search queries the in-memory index (never per-keystroke fs walk; the old
`searchWorkspace` scan path is removed, not kept in parallel): plain
substring, `"exact phrase"`, `file:`, `path:`, `tag:`, `type:`, `is:task`,
AND-combined; anything else (`OR/NOT`/regex/comparators/`link:`/saved)
→ `INVALID_REQUEST` naming the operator. UI debounces ≥150 ms.

## Constraints

- Same `SearchMatch` shape + `maxResults` bound + one-match-per-file for
  content (preserve current contract). Works identically on WSL via index.

## Acceptance (must fail on starting commit)

1. Operator tests over fixture index: each V1 operator + AND-combine +
   unsupported-operator errors; modify/rename/delete → results follow
   without rescan calls (assert no fs walk on query).
2. WSL parity: same queries against a WSL-fed index return same shapes.
3. Old scan module deleted; no lingering import.
