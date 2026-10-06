# P1-01 — Service seam + Windows directory operations

Phase: 1 Foundation. Blocked by: nothing (first).

## Observable result

From the running app on a Windows-local workspace, the user can create,
rename, and delete folders and files from the tree; every operation routes
UI → preload named fn → Service Layer (`WorkspaceService`/`NoteService` in
main) → `FileAdapter` → fs. IPC handlers in `src/main/ipc/register.ts`
contain no filesystem logic after this ticket (validation + delegate only).

## Constraints

- ADR-0009 (single Service Layer), ADR-0008 (no DB), `docs/security.md`
  path confinement + symlink policy unchanged. Canonical vocab only.

## Acceptance (must fail on starting commit)

1. `directory.create`, `directory.rename`, `directory.delete` work against a
   Windows-local workspace; non-empty delete without confirm →
   `DIRECTORY_NOT_EMPTY`; traversal/`..`/NUL/absolute rejected as today.
2. Existing file create/read/write/rename/trash keep working (no regressions).
3. New unit tests: adapter dispatch by kind, outside-root + symlink-escape
   rejection for the new dir ops, recursive-create parents.
4. `npm run typecheck && npm run lint && npm test` green on Linux
   (win32-gated parts run in Windows CI).
