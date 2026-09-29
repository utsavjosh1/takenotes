# P1-05 — Atomic save + two-actor CONFLICT loop

Phase: 1 Foundation. Blocked by: P1-01 (write path lives in `NoteService`).

## Observable result

Editing → dirty → debounced autosave → atomic write (tmp+fsync+rename,
BOM/newline preserved) → Saved; externally-modified file → next save gets
`CONFLICT` with both versions safe and explicit Reload/Revert/Retry
affordances. Draft-retained-when-file-vanished flow keeps working.

## Constraints

- ADR-0010 (all mutations carry `expectedRevision`; no auto-merge),
  ADR-0008. Preserve existing banner/draft behavior; close gaps only.

## Acceptance (must fail on starting commit)

1. Reproduces today? Harden into tests: read rev A → external modify →
   write rev A → `CONFLICT`, bytes unchanged on disk, dirty buffer intact.
2. CRLF/BOM round-trip tests preserved and green.
3. Manual Windows script (for P1-11): exact steps + expected banner text.
