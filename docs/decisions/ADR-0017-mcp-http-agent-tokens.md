# ADR-0017 — MCP over loopback HTTP with scoped agent tokens (amends ADR-0012)

Date: 2026-10-27 · Status: accepted · Amends: ADR-0012 · Builds on: ADR-0009, ADR-0014

## Decision

`takenotes-server` exposes MCP at `POST /mcp` (JSON-RPC 2.0, stateless Streamable-HTTP subset: single JSON response, no SSE, no session ids). It reuses the existing session, tool catalog, dispatcher, grants and activity log — one semantic across stdio, IPC and HTTP.

- **Auth:** per-agent bearer tokens (`tn_agent_…`, ≥256-bit), stored as SHA-256 hashes in `$TAKENOTES_DATA/app/agent-tokens.json`, shown once, revocable. Each token carries a label, a workspace list and a `read` or `write` scope.
- **Grants:** a token's workspace list is its grant set; the dispatcher's grant check is the authorization boundary. `read` tokens are refused every mutating tool.
- **Network:** loopback bind by default (ADR-0014). Requests carrying an `Origin` header are rejected (browsers are not MCP clients). Body capped at 1 MiB.
- **Rate limits:** fixed-window, in-memory: 120 requests/min per token; 20 failed auths/min per client address locks that client out (`429` + `Retry-After`).
- **Management:** CLI (`token create|list|revoke`) and owner-session + CSRF endpoints `/api/rpc/agents.list|create|revoke` backing an **Agents** panel in the server web UI.
- **Bridge:** `takenotes-mcp --server URL --token T` (or `TAKENOTES_SERVER`/`TAKENOTES_TOKEN`) proxies stdio JSON-RPC to `/mcp`, so stdio-only clients work. Without flags it keeps the ADR-0012 pipe behaviour.
- "App must be running" becomes "server must be running" for server-hosted workspaces; desktop-local workspaces keep the pipe.

## Out of scope (still deferred)

OAuth, remote exposure, SSE streaming, delete/command tools, hosted MCP (`docs/later/`).

## Consequences

- Agents inside WSL can use the same notes with no desktop running.
- A desktop Settings → Agents screen for remote servers waits on `RemoteWorkspace` (ADR-0016); desktop-local workspaces keep pipe grants.
- Limits are per process and reset on restart; behind a reverse proxy all clients share one address, so the lockout is per proxy.
