# ADR-0016 — WSL via per-user `takenotes-server` (supersedes ADR-0003 for new work)

Date: 2026-10-27 · Status: proposed · Builds on: ADR-0014 · Supersedes: ADR-0003 (WSL helper), after parity

## Decision

WSL workspaces are served by one `takenotes-server` per Linux user, bound to `127.0.0.1`. The desktop is a thin HTTP client (`RemoteWorkspace`) over the existing `/api/rpc/*` transport. The per-operation `wsl.exe` → pinned Node → `helper.cjs` bridge is retired only after the server path ships for one full release.

- WSL2 forwards `localhost`; the server runs as whoever launched it, so no `wsl -u`, no sudo, no Linux user discovery.
- Install is one command (or one desktop button running a single `wsl.exe -d <distro> -- sh -c …`), placing the bundle under `~/.local/share/takenotes/` with an optional `systemd --user` unit; fallback is on-demand start.
- Pairing: the installer prints `takenotes://pair?url=…&token=…`; the existing URI handler stores `{name,url,token}` in the OS keychain.
- Invariants unchanged: server owns files, `expectedRevision` → `CONFLICT`, no automatic local↔remote sync (ADR-0014).

## Migration (reversible)

1. `RemoteWorkspace` in desktop over `/api/rpc/*`.
2. Pairing + per-user lifecycle.
3. Flag `wslBackend: "server" | "helper"`, default `helper`; flip after a soak release.
4. Delete the helper only after a full release on `server`. Rollback = flip the flag; files are authoritative so no data migration exists.

## Consequences

- Removes user discovery, runtime install and framed-stdio supervision from the critical path.
- Needs a version handshake (`PROTOCOL_VERSION`) and clear "server not running / port busy / version skew" UX.
- Agents inside WSL reach the same server (ADR-0017).
