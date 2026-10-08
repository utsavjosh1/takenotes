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
 * Settings → Automation). No HTTP, no flags, no config files.
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

const session = createMcpSession(dial);
const splitter = createLineSplitter(
  (line) => {
    void (async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return;
      }
      const reply = await session.handle(parsed);
      if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
    })();
  },
  () => {
    process.stdout.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } })}\n`,
    );
  },
);

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => splitter.push(chunk));
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
