# Server deployment (Gate C)

Second host/transport, not a second backend. Desktop IPC and Web HTTP both
run through the same `CoreNoteService` → same policy → `HostFilesystem`.

## Run

```bash
TAKENOTES_PASSWORD=<min-12-chars> docker compose up --build
# Browser: http://localhost:3000
```

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

- Password KDF is scrypt (`scrypt-16384-8-1`, `node:crypto`), NOT Argon2id:
  ADR-0014 names Argon2id, but that needs a native addon and the Docker
  runtime stage ships dependency-free. Parameters are stored alongside the
  verifier (`kdf` field) so a future Argon2id migration can re-hash on next
  login. Recorded here instead of silently diverging from the ADR.
- Deployment is NOT VERIFIED in this environment (Linux container, no Docker
  daemon run here): the image has never been built, `docker compose up` has
  never executed, and no TLS-terminated production run exists. The compose
  file is a local proof demo only.
- Gate B parity tests (`tests/server/http-note.test.ts`) use the
  `SingleOwnerAuth` harness (`src/server/auth.ts`), which is TRANSPORT
  PARITY PROOF ONLY — not production auth.
