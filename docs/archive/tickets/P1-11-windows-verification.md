# P1-11 — Real-Windows verification + mvp-status record

Phase: 1 Foundation. Blocked by: P1-01…P1-10 (runs only when all land).

## Observable result

`docs/mvp-status.md` gains a dated Phase 1 gate section with commands run
and evidence for each item below — all on a real Windows 11 host. No code
unless a check fails (then file a fix ticket; do not widen scope).

## Constraints

- Phase 1 gate from the spec §5. Host: Windows 11 + WSL2, Ubuntu with two
  Linux users + one extra distro (e.g. Debian).

## Acceptance (checklist — every box evidenced or Phase 1 stays open)

1. Distro list shows Running/Stopped without starting anything.
2. Open workspace as user A and as user B; `~` resolves per-user.
3. `PERMISSION_DENIED` browsing a `700` home as the wrong user.
4. File create/rename/move/delete + folder create/rename/delete, local and WSL.
5. Two-actor `expectedRevision` CONFLICT demo (rev A → external edit →
   write rev A → `CONFLICT`, bytes safe).
6. Recovery: snapshot list → restore (current snapshotted first) → Copy.
   Then close + reopen the workspace (new runtime `workspaceId`) and confirm
   the same history is listed (stable recovery identity, H-01).
7. Search V1 operators over the WSL workspace after modify/rename/delete.
8. Quick Open + palette + fixed hotkeys; status strip correct in all states.
9. WSL singleton honesty: with a workspace open as user A, connect as user B
   (or a second distro) and confirm the first session reports DISCONNECTED —
   and that no operation ever executes as the wrong Linux user (M-02).
10. Partial index honesty: open a workspace exceeding the index bounds and
    confirm the status strip + Search panel show the partial-index notice (H-04).
