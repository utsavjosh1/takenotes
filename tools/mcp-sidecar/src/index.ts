#!/usr/bin/env node
/** takenotes-mcp sidecar entrypoint: stdio ↔ private pipe relay.
 *
 * ADR-0012: thin by design. MCP JSON-RPC on stdin/stdout (stdout is
 * JSON-RPC frames ONLY — one object per line), framed pipe calls to
 * the running app, diagnostics on stderr. Connect refusal means the
 * app is closed → every call fails `TAKENOTES_APP_NOT_RUNNING`.
 *
 * Run: `node takenotes-mcp.cjs` (system node; packaged installs ship
 * the bundle under `<resources>/mcp/` — the exact command is shown in
 * Settings → Automation).
 *
 * Bridge mode (ADR-0017): `--server http://127.0.0.1:3000` plus
 * `TAKENOTES_TOKEN` (or `--token`) proxies stdio JSON-RPC to the
 * server's `POST /mcp` instead of the desktop pipe. No other flags.
 */
import { connect, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { encodeFrame, FrameDecoder } from "@takenotes/contracts/protocol";
import { MAX_FRAME_BYTES } from "@takenotes/contracts/protocol-version";
import {
  MCP_APP_NOT_RUNNING,
  mcpSocketPath,
  type McpPipeResponse,
} from "@takenotes/core/mcp/transport";
import { createLineSplitter, createMcpSession } from "./session.js";

const socketPath = mcpSocketPath();

function dial(tool: string, params: unknown, clientId: string): Promise<McpPipeResponse> {
  return new Promise((resolve, reject) => {
    const decoder = new FrameDecoder(MAX_FRAME_BYTES);
    const requestId = randomUUID();
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    let socket: Socket;
    try {
      socket = connect(socketPath);
    } catch (err) {
      fail(err as Error);
      return;
    }
    const timer = setTimeout(() => {
      fail(new Error(MCP_APP_NOT_RUNNING));
      socket.destroy();
    }, 5000);
    timer.unref?.();
    socket.once("connect", () => {
      socket.write(encodeFrame({ requestId, clientId, tool, params }));
    });
    socket.on("data", (chunk: Buffer) => {
      const { frames, error } = decoder.push(chunk);
      if (error) {
        clearTimeout(timer);
        fail(new Error(error));
        socket.destroy();
        return;
      }
      for (const frame of frames) {
        const response = frame as McpPipeResponse;
        if (typeof response !== "object" || response === null || response.requestId !== requestId) {
          continue;
        }
        if (settled) continue;
        settled = true;
        clearTimeout(timer);
        socket.end();
        resolve(response);
        return;
      }
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      fail(err);
    });
    socket.once("close", () => {
      clearTimeout(timer);
      fail(new Error(MCP_APP_NOT_RUNNING));
    });
  });
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const serverUrl = flag("--server") ?? process.env.TAKENOTES_SERVER;
const serverToken = flag("--token") ?? process.env.TAKENOTES_TOKEN;

/** Bridge mode: forward one JSON-RPC message to the server, return its reply. */
async function forward(message: unknown): Promise<unknown | null> {
  const id = (message as { id?: unknown } | null)?.id;
  try {
    const res = await fetch(new URL("/mcp", serverUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${serverToken ?? ""}` },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 202) return null;
    return await res.json();
  } catch {
    if (id === undefined) return null;
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: `takenotes server unreachable at ${serverUrl}: start it first.` },
    };
  }
}

if (serverUrl && !serverToken) {
  process.stderr.write("takenotes-mcp: --server needs a token (TAKENOTES_TOKEN or --token).\n");
  process.exit(2);
}

const session = createMcpSession(dial);
const inflight = new Set<Promise<void>>();
const splitter = createLineSplitter(
  (line) => {
    const task = (async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return;
      }
      const reply = serverUrl ? await forward(parsed) : await session.handle(parsed);
      if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
    })();
    inflight.add(task);
    void task.finally(() => inflight.delete(task));
  },
  () => {
    process.stdout.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } })}\n`,
    );
  },
);

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => splitter.push(chunk));
// Let in-flight replies flush before exiting (one-shot piped use).
process.stdin.on("end", () => void Promise.allSettled([...inflight]).then(() => process.exit(0)));
process.stdin.resume();
