/** Step 8 MCP pipe transport (Phase 5c): private local IPC for the sidecar.
 *
 * ADR-0012: the `takenotes-mcp` sidecar (next slice) forwards stdio
 * frames here over private local IPC — a named pipe on Windows, a
 * mode-`0600` unix socket elsewhere. No TCP, no HTTP. "App must be
 * running" is structural: no listener, no MCP — the sidecar fails
 * fast with `TAKENOTES_APP_NOT_RUNNING` when connect refuses.
 *
 * Wire: framed 4-byte BE length + UTF-8 JSON reusing
 * `@takenotes/contracts/protocol` (`encodeFrame`/`FrameDecoder`,
 * 16 MiB cap). One frame = one `{requestId, clientId, tool, params}`
 * call; one frame back = `{requestId, ok, result|error}`. Oversized
 * or unparseable frames destroy the connection (best-effort error
 * frame first when a `requestId` is known — never raw secrets).
 *
 * Grants are a live store object: the approval screen mutates the
 * same instance and persists via `mcp-store`. Activity rows appended
 * by dispatch flush to disk after each call (best-effort).
 */
import { chmod, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { appError } from "@takenotes/contracts/errors";
import { encodeFrame, FrameDecoder } from "@takenotes/contracts/protocol";
import { MAX_FRAME_BYTES } from "@takenotes/contracts/protocol-version";
import { mcpSocketPath, type McpPipeRequest } from "@takenotes/core/mcp/transport";
import {
  dispatchMcpTool,
  type McpDispatchContext,
  type McpPorts,
} from "@takenotes/core/mcp/dispatch";
import type { McpActivityLog } from "@takenotes/core/mcp/activity";
import type { McpGrantStore } from "@takenotes/core/mcp/grants";
import { appendMcpActivity } from "./mcp-store.js";

export type McpPipeDeps = {
  socketPath?: string;
  ports: McpPorts;
  grants: McpGrantStore;
  log?: McpActivityLog;
  /** App-data dir for activity persistence (skipped when omitted). */
  activityDir?: string;
  now?: () => number;
};

export type McpPipeServer = {
  socketPath: string;
  stop(): Promise<void>;
};

function isPipeRequest(value: unknown): value is McpPipeRequest {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.requestId === "string" &&
    r.requestId.trim().length > 0 &&
    typeof r.clientId === "string" &&
    typeof r.tool === "string"
  );
}

export async function startMcpPipeServer(deps: McpPipeDeps): Promise<McpPipeServer> {
  const socketPath = deps.socketPath ?? mcpSocketPath();
  const ctx: McpDispatchContext = {
    ports: deps.ports,
    grants: deps.grants,
    ...(deps.log ? { log: deps.log } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  };
  let persistedSeq = deps.log ? deps.log.nextSeq : 0;

  const server: Server = createServer((socket: Socket) => {
    const decoder = new FrameDecoder(MAX_FRAME_BYTES);
    let dead = false;
    const kill = () => {
      if (!dead) {
        dead = true;
        socket.destroy();
      }
    };
    socket.on("data", (chunk: Buffer) => {
      if (dead) return;
      const { frames, error } = decoder.push(chunk);
      if (error) {
        socket.write(encodeFrame({ requestId: "", ok: false, error: appError("INVALID_REQUEST", error) }));
        kill();
        return;
      }
      void (async () => {
        for (const frame of frames) {
          if (dead) return;
          if (!isPipeRequest(frame)) {
            socket.write(
              encodeFrame({ requestId: "", ok: false, error: appError("INVALID_REQUEST", "Malformed MCP request.") }),
            );
            continue;
          }
          const outcome = await dispatchMcpTool(ctx, frame.clientId, frame.tool, frame.params ?? {});
          socket.write(encodeFrame({ requestId: frame.requestId, ...outcome }));
          if (deps.log && deps.activityDir && deps.log.nextSeq > persistedSeq) {
            const fresh = deps.log.entries.filter((e) => e.seq >= persistedSeq);
            persistedSeq = deps.log.nextSeq;
            await appendMcpActivity(deps.activityDir, fresh);
          }
        }
      })().catch(kill);
    });
    socket.on("error", kill);
  });

  if (process.platform !== "win32") {
    await rm(socketPath, { force: true });
  }
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  if (process.platform !== "win32") {
    try {
      await chmod(socketPath, 0o600);
    } catch {
      // Best-effort: tmp/XDG dirs already isolate by user.
    }
  }
  return {
    socketPath,
    async stop() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (process.platform !== "win32") await rm(socketPath, { force: true });
    },
  };
}
