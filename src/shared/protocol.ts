import type { AppError } from "./errors.js";

export type HelperRequest = {
  requestId: string;
  sessionId: string;
  generation: number;
  operation: string;
  payload: unknown;
};

export type HelperResponse =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: AppError };

export type HandshakeResult = {
  protocolVersion: number;
  helperVersion: string;
  runtimeVersion: string;
  platform: string;
  architecture: string;
  capabilities: string[];
  processId: number;
  /** Echo of the main-generated challenge (anti-substitution). */
  nonce: string;
  /** Actual runtime binary path — main verifies it is the app-owned Node. */
  execPath: string;
  uid: number;
  home: string;
};

/** Operations the helper actually implements today (P1-04 adds the WSL
 * mutation set). Planned (not yet implemented, must NOT be sent):
 * file.trash (WSL delete is permanent-delete in P1 — see `file.delete`),
 * file.restore, search.start, search.cancel, watch.subscribe,
 * watch.unsubscribe. */
export const HELPER_OPERATIONS = [
  "hello",
  "workspace.open",
  "workspace.close",
  "directory.list",
  "directory.create",
  "directory.rename",
  "directory.delete",
  "file.read",
  "file.write",
  "file.create",
  "file.rename",
  "file.delete",
  "users.list",
] as const;

export type HelperOperation = (typeof HELPER_OPERATIONS)[number];

/** Encode one frame: 4-byte big-endian length + UTF-8 JSON. */
export function encodeFrame(payload: unknown): Buffer {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json, "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

export type FrameDecodeResult =
  | { frames: unknown[]; rest: Buffer }
  | { error: string; rest: Buffer };

/** Incremental frame decoder shared by main and tests. */
export class FrameDecoder {
  private buffer = Buffer.alloc(0);
  constructor(private readonly maxFrameBytes: number) {}

  push(chunk: Buffer): { frames: unknown[]; error?: string } {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames: unknown[] = [];
    for (;;) {
      if (this.buffer.length < 4) return { frames };
      const length = this.buffer.readUInt32BE(0);
      if (length === 0) {
        return { frames, error: "zero-length frame" };
      }
      if (length > this.maxFrameBytes) {
        return { frames, error: `frame too large: ${length}` };
      }
      if (this.buffer.length < 4 + length) return { frames };
      const body = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      try {
        frames.push(JSON.parse(body.toString("utf8")));
      } catch {
        return { frames, error: "invalid JSON in frame" };
      }
    }
  }
}
