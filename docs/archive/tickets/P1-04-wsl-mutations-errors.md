# P1-04 — WSL mutation parity + precise errors

Phase: 1 Foundation. Blocked by: P1-01 (service seam), P1-03 (user identity).

## Observable result

In a WSL workspace the user can create/rename/delete files and folders from
the tree, running as the selected Linux user. Failures speak precisely:
`PATH_NOT_FOUND`, `PERMISSION_DENIED`, `NOT_A_DIRECTORY`,
`CONNECTION_FAILED`, `DISTRO_NOT_RUNNING`, `HELPER_FAILED` — friendly text in
UI, detail expandable. Browsing a `700` home as the wrong user yields
`PERMISSION_DENIED`, never a generic failure.

## Constraints

- ADR-0007/ADR-0009; helper keeps traversal/symlink policy; main validates
  wire shape only. WSL delete is permanent-delete in P1 — label honestly vs
  Windows-local OS trash. New helper ops gated in `HELPER_OPERATIONS`.

## Acceptance (must fail on starting commit)

1. Helper round-trip tests for `directory.create/rename/delete`,
   `file.rename/delete` incl. permission-denied fixture (mode 700 dir,
   wrong uid) and symlink-escape refusal.
2. IPC tests: structured error codes survive the boundary (`toHelperError`).
3. Renderer shows `PERMISSION_DENIED` distinctly from `PATH_NOT_FOUND`.
