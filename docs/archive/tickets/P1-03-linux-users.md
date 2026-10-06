# P1-03 — Linux-user discovery, run-as-user, per-user `~`

Phase: 1 Foundation. Blocked by: P1-02 (needs distro selection flow).

## Observable result

After picking a distro, the picker lists interactive Linux users (from the
helper, `/etc/passwd`-backed: uid ≥ 1000 plus current/default user, threshold
overridable, excluding non-current `/usr/sbin/nologin` and `/bin/false`
shells). Picking `Ubuntu → work` runs all subsequent helper work as
`work`; `~` resolves to that user's home (never on Windows). Registry and
`WorkspaceInfo` carry `linuxUser`; `connectWsl(distro, linuxUser, linuxPath)`
replaces the 2-arg form end to end (preload, IPC, dialog).

## Constraints

- ADR-0007 (no guessing, no sudo/escalation/bypass). Old 2-arg form removed
  together with its callers — no dual API left behind.

## Acceptance (must fail on starting commit)

1. Helper `users.list` unit/round-trip tests: fixture passwd (system
   accounts, two humans, odd UID scheme) → correct filtered list.
2. Direct-spawn test asserts `hello` uid/home match the selected user and
   `~/Notes` resolves per-user.
3. Registry test: same distro+path under two users → two `workspaceId`s;
   `workspaceKeyFor` differs.
