import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { FrameDecoder, encodeFrame, type HelperResponse } from "../../shared/protocol.js";
import { MAX_FRAME_BYTES } from "../../shared/protocol-version.js";
import { appError, type AppError } from "../../shared/errors.js";

export type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (err: AppError) => void;
  timer: NodeJS.Timeout;
};

/** Framed stdio client over an owned helper child process. Transport-agnostic:
 * constructed with any process exposing stdout/stderr/stdin (wsl.exe spawn or a
 * directly-spawned node helper in tests). */
export class HelperClient extends EventEmitter {
  private readonly decoder = new FrameDecoder(MAX_FRAME_BYTES);
  private readonly pending = new Map<string, PendingRequest>();
  private closed = false;

  constructor(private readonly child: ChildProcess, private readonly requestTimeoutMs = 30000) {
    super();
    child.stdout?.on("data", (chunk: Buffer) => this.onData(chunk));
    child.stderr?.on("data", (chunk: Buffer) => this.emit("diagnostic", chunk.toString("utf8")));
    // Spawn failures (missing binary, EACCES) surface as 'error', not 'exit'.
    // Without this listener the process throws an unhandled exception.
    child.on("error", (err: Error) => {
      if (this.closed) return;
      this.closed = true;
      const appErr = appError("DISCONNECTED", `Helper process failed to start: ${err.message}`);
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(appErr);
      }
      this.pending.clear();
      this.emit("exit", err);
    });
    child.on("exit", (code) => {
      if (this.closed) return;
      this.closed = true;
      const err = appError("DISCONNECTED", `Helper exited with code ${code ?? "unknown"}.`);
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      this.pending.clear();
      this.emit("exit", code);
    });
  }

  private onData(chunk: Buffer): void {
    const { frames, error } = this.decoder.push(chunk);
    if (error) {
      this.emit("protocolError", error);
      return;
    }
    for (const frame of frames) this.onFrame(frame as HelperResponse);
  }

  private onFrame(response: HelperResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return; // stale request
    this.pending.delete(response.requestId);
    clearTimeout(pending.timer);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(response.error);
  }

  request(operation: string, payload: unknown, session: { sessionId: string; generation: number }): Promise<unknown> {
    if (this.closed) return Promise.reject(appError("DISCONNECTED", "Helper is disconnected."));
    const requestId = randomUUID();
    const frame = encodeFrame({ requestId, sessionId: session.sessionId, generation: session.generation, operation, payload });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(appError("CANCELLED", `Request ${operation} timed out.`));
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.child.stdin?.write(frame, (err) => {
        if (err) {
          this.pending.delete(requestId);
          clearTimeout(timer);
          reject(appError("DISCONNECTED", "Failed to write to helper."));
        }
      });
    });
  }

  pendingCount(): number {
    return this.pending.size;
  }
}
