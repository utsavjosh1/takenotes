# P1-06 — Split panes + status identity strip

Phase: 1 Foundation. Blocked by: P1-05 (save/dirty/conflict states),
  P1-03 (distro/user identity to display).

## Observable result

The editor supports horizontal/vertical splits sharing the existing tab
model (open/close/dirty/conflict per pane, no new file semantics; split
layout is window-local, not persisted). The status bar always shows:
`Workspace name · Windows|WSL [distro · user] · Saved|Dirty|Conflict ·
connection · index (n files)`.

## Constraints

- No behavior change to save/conflict semantics; splits are panes over tabs.

## Acceptance (must fail on starting commit)

1. Open two panes on the same file: edit in one → other reflects dirty;
   save in either → both clean with new revision.
2. Status assertions: switching workspaces (local vs `Ubuntu/work`)
   updates every segment; disconnected WSL shows honestly.
3. Existing tab tests unbroken.
