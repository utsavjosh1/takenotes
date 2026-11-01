# Server deployment (Gate C)

Second host/transport, not a second backend. Desktop IPC and Web HTTP both
run through the same `CoreNoteService` → same policy → `HostFilesystem`.

## Run

```bash
umask 077
read -rsp "takenotes owner password: " TAKENOTES_PASSWORD; echo
install -m 600 /dev/null .env
printf 'TAKENOTES_PASSWORD=%s\n' "$TAKENOTES_PASSWORD" > .env
unset TAKENOTES_PASSWORD
docker compose up --build
# Browser: http://localhost:3000
```

Do not pass the real password inline on the `docker compose` command: shell
history and local process inspection can expose it. The `install -m 600` step
creates or truncates `.env` with restrictive permissions before the password is
written; remove `.env` after first boot if you do not need it for automation.

First boot initializes owner auth and seeds a `Notes` workspace with
`README.md`. Later boots reuse `/data` as-is; `TAKENOTES_PASSWORD` is then
ignored (rotate via the authenticated password endpoint).

## Environment

| Var | Default | Purpose |
| --- | ------- | ------- |
| `TAKENOTES_DATA` | `/data` | All state: `app/` (auth, sessions, registry) + `workspaces/` (notes) |
| `TAKENOTES_PORT` | `3000` | Listen port |
| `TAKENOTES_HOST` | `127.0.0.1` | Listen address (compose sets `0.0.0.0`: container-loopback is unreachable from the host) |
| `TAKENOTES_PASSWORD` | — (required first boot) | Initializes owner password |
| `TAKENOTES_INSECURE_HTTP` | `0` | `1` = plain-local-HTTP cookie relaxation (demo only) |

## Cookie contract

Production: `__Host-takenotes-session` + `Secure` + `HttpOnly` +
`SameSite=Strict` + `Path=/`, no `Domain`, explicit `x-csrf-token`.
Browsers drop `Secure` cookies over plain HTTP, so local demos without TLS
set `TAKENOTES_INSECURE_HTTP=1` (non-`__Host-` name, no `Secure`; everything
else identical). Never enable that except over local HTTP.

## Acceptance (Gate C)

```text
docker compose up → login → remote workspace registry → open README.md →
edit + save (same revision semantics) → external change → stale save →
CONFLICT, external untouched → logout/session expiry → restart container →
same auth, same workspaceId, same contents.
```

Explicitly out of scope: Tasks, Search migration, remote MCP, offline
editing, sync, multi-user, public API docs, WebSocket, Caddy/Tailscale specifics.

## Implementation notes (pre-P1-11 repair pass)

- Password KDF is scrypt (`scrypt-16384-8-1`, `node:crypto`), accepted by
  ADR-0014 for dependency-free server V1. Parameters are stored alongside the
  verifier (`kdf` field) so a future Argon2id migration can re-hash on next
  login.
- Deployment is NOT VERIFIED in this environment (Linux container, no Docker
  daemon run here): the image has never been built, `docker compose up` has
  never executed, and no TLS-terminated production run exists. The compose
  file is a local proof demo only.
- Gate B parity tests (`tests/server/http-note.test.ts`) use the
  `SingleOwnerAuth` harness (`src/server/auth.ts`), which is TRANSPORT
  PARITY PROOF ONLY — not production auth.

## MCP for AI agents (ADR-0017)

The server exposes MCP at `POST /mcp`, authenticated by per-agent tokens. It is loopback-only unless you bind elsewhere.

```bash
# create (the token is printed once; only its hash is stored)
node dist-server/server.cjs token create --label claude-code --workspace <id> [--read-only]
node dist-server/server.cjs token create --label cursor --all
node dist-server/server.cjs token list
node dist-server/server.cjs token revoke <id-prefix>      # takes effect immediately, no restart
```

Stdio-only clients use the bridge: `TAKENOTES_TOKEN=tn_agent_… node takenotes-mcp.cjs --server http://127.0.0.1:3000`.
`read` tokens are refused every mutating tool. Calls are audited in `$TAKENOTES_DATA/app/mcp-activity.jsonl`.
Browser origins, batches, SSE and bodies over 1 MiB are rejected. Limits: 120 requests/min per token and 20 failed attempts/min per client (then `429` + `Retry-After`). Tokens can also be created and revoked in the server web UI under **Agents (MCP)** after logging in.
