# Protocol (main ↔ WSL helper)

Framing: `4-byte unsigned big-endian length` + `UTF-8 JSON payload`.
Max frame: 16 MiB (`MAX_FRAME_BYTES`, mirrored in `build-config.json`).

- Helper stdout: ONLY protocol frames.
- Helper stderr: JSON-line diagnostics (`timestamp`, `level`, `component`, `message`).
- Never `console.log` to stdout inside the helper.

Request:

```ts
type HelperRequest = {
  requestId: string;
  sessionId: string;
  generation: number;
  operation: string;
  payload: unknown;
};
```

Response:

```ts
type HelperResponse =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: AppError };
```

Operations (MVP): `hello`, `workspace.open`, `workspace.close`,
`directory.list`, `file.read`, `file.write`, `file.create`, `file.rename`,
`file.trash`, `file.restore`, `search.start`, `search.cancel`,
`watch.subscribe`, `watch.unsubscribe`.

Handshake (`hello`) returns `protocolVersion`, `helperVersion`,
`runtimeVersion`, `platform`, `architecture`, `capabilities`, `processId`.
Main rejects mismatched `protocolVersion` with an actionable error.

`PROTOCOL_VERSION` lives in `src/shared/protocol-version.ts` and is shared at
build time between main, helper, and tests. UI changes do not bump it.
