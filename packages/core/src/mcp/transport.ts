/** Step 8 MCP transport shapes (Phase 5d): shared main ↔ sidecar.
 *
 * Pure path computation + wire types only — no sockets here. The main
 * pipe server (`apps/desktop/src/main/services/mcp-pipe.ts`) and the
 * `takenotes-mcp` sidecar (`tools/mcp-sidecar/`) both build from this
 * module so the rendezvous path can never drift between the two ends.
 *
 * The path is IPC-only by construction: a Windows named pipe or a
 * POSIX socket path. There is deliberately no host/port form — TCP
 * must never appear on this boundary (ADR-0012, no HTTP).
 */
import { tmpdir } from "node:os";
import { join } from "node:path";

export const MCP_PIPE_NAME = "takenotes-mcp";

/** Private socket path: named pipe on Windows, XDG runtime dir (or
 * tmp, per-uid) elsewhere. Inputs are injectable so tests pin them. */
export function mcpSocketPath(
  platform: NodeJS.Platform = process.platform,
  envRuntimeDir: string | undefined = process.env.XDG_RUNTIME_DIR,
  tmp: string = tmpdir(),
  uid: string = typeof process.getuid === "function" ? String(process.getuid()) : "app",
): string {
  if (platform === "win32") return `\\\\.\\pipe\\${MCP_PIPE_NAME}`;
  const runtime = envRuntimeDir?.trim() ?? "";
  const dir = runtime.startsWith("/") ? runtime : tmp;
  return join(dir, `${MCP_PIPE_NAME}-${uid}.sock`);
}

/** One sidecar → app call. `clientId` is the MCP client's self-reported
 * name (`initialize.clientInfo.name`); the app grant-checks it like any
 * other caller — it is an audit label, not authentication. */
export type McpPipeRequest = {
  requestId: string;
  clientId: string;
  tool: string;
  params?: unknown;
};

/** App → sidecar reply. Mirrors `HelperResponse` minus the WSL envelope:
 * `{requestId, ok, result|error}`. */
export type McpPipeResponse =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: { code: string; message: string; detail?: string } };

/** The sidecar fails fast with this code when no listener answers
 * (app closed). It is a sidecar exit/JSON-RPC signal, never an
 * `AppError` — the app itself never emits it. */
export const MCP_APP_NOT_RUNNING = "TAKENOTES_APP_NOT_RUNNING";
