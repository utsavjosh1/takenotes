import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { app } from "electron";
import { HelperClient } from "./helper-client.js";
import { PROTOCOL_VERSION } from "../../shared/protocol-version.js";
import type { HandshakeResult } from "../../shared/protocol.js";
import { appError } from "../../shared/errors.js";
import { helperEnv, resolveWslExe } from "./launch-security.js";

export type HelperState =
  | "starting"
  | "handshake"
  | "connected"
  | "disconnected"
  | "incompatible";

export type WslSession = {
  sessionId: string;
  generation: number;
  distro: string;
  client: HelperClient;
  child: ChildProcess;
  handshake: HandshakeResult;
};

const BACKOFF_MS = [500, 1000, 2000, 5000];

/** Owns exactly one helper child process. Never runs `wsl --shutdown`. */
export class HelperSupervisor {
  private session: WslSession | null = null;
  private reconnectAttempts = 0;
  state: HelperState = "disconnected";

  constructor(
    private readonly onStateChange: (state: HelperState) => void,
    private readonly onDiagnostic: (line: string) => void,
  ) {}

  private setState(state: HelperState): void {
    this.state = state;
    this.onStateChange(state);
  }

  /** Launch helper through wsl.exe with separate argv (shell: false). */
  async connect(distro: string, nodePath: string, helperPath: string): Promise<WslSession> {
    this.disposeSession();
    this.setState("starting");
    const child = spawn(
      resolveWslExe(),
      ["-d", distro, "--exec", nodePath, helperPath, "--stdio"],
      { shell: false, stdio: ["pipe", "pipe", "pipe"], env: helperEnv() },
    );
    return this.handshake(child, distro, nodePath);
  }

  /** Spawn helper directly (Linux dev/tests): no wsl.exe involved. */
  async connectDirect(nodePath: string, helperPath: string): Promise<WslSession> {
    this.disposeSession();
    const child = spawn(nodePath, [helperPath, "--stdio"], { shell: false, stdio: ["pipe", "pipe", "pipe"], env: helperEnv() });
    return this.handshake(child, "direct", nodePath);
  }

  /** Challenge/response handshake: nonce echo + protocol + runtime-path verification.
   * Detailed handshake metadata stays in main diagnostics; it is never sent to the renderer. */
  private async handshake(child: ChildProcess, distro: string, expectedNodePath: string): Promise<WslSession> {
    const sessionId = randomUUID();
    const nonce = randomBytes(16).toString("hex");
    const client = new HelperClient(child);
    client.on("diagnostic", (line: string) => this.onDiagnostic(line));
    client.on("exit", () => {
      this.session = null;
      this.setState("disconnected");
    });
    // Stdout garbage = untrusted helper: kill immediately, never continue the session.
    client.on("protocolError", (message: string) => {
      this.onDiagnostic(`protocol violation (${message}); terminating helper`);
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    });

    this.setState("handshake");
    let handshake: HandshakeResult;
    try {
      handshake = (await client.request("hello", { protocolVersion: PROTOCOL_VERSION, nonce }, { sessionId, generation: 1 })) as HandshakeResult;
    } catch (err) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      this.setState("disconnected");
      throw err;
    }
    const fail = (reason: string): never => {
      this.setState("incompatible");
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      throw new Error(reason);
    };
    if (!handshake || handshake.protocolVersion !== PROTOCOL_VERSION) {
      fail(`Helper protocol ${handshake?.protocolVersion} is incompatible with app protocol ${PROTOCOL_VERSION}. Update takenotes.`);
    }
    if (handshake.nonce !== nonce) fail("Helper handshake nonce mismatch: refusing to trust this helper.");
    if (handshake.execPath !== expectedNodePath) {
      fail(`Helper is not running under the app-owned runtime (execPath ${handshake.execPath}). Connection refused.`);
    }
    this.onDiagnostic(`helper handshake ok: pid=${handshake.processId} node=${handshake.runtimeVersion} execPath=${handshake.execPath}`);
    const session: WslSession = { sessionId, generation: 1, distro, client, child, handshake };
    this.session = session;
    this.reconnectAttempts = 0;
    this.setState("connected");
    return session;
  }

  /** Active helper session, if the hello handshake completed. */
  getSession(): WslSession | null {
    return this.session;
  }

  /** Send an operation to the active helper session.
   * Throws a DISCONNECTED AppError when no session is connected. */
  async request(operation: string, payload: unknown): Promise<unknown> {
    const active = this.session;
    if (!active || this.state !== "connected") {
      this.onDiagnostic(`[wsl-request] no session for ${operation} (state=${this.state})`);
      throw appError("DISCONNECTED", "WSL helper is not connected.");
    }
    // Trace every helper round-trip: paths/roots only, never file contents.
    this.onDiagnostic(
      `[wsl-request] ${operation} session=${active.sessionId} generation=${active.generation} distro=${active.distro} payload=${JSON.stringify(payload)}`,
    );
    try {
      const result = await active.client.request(operation, payload, {
        sessionId: active.sessionId,
        generation: active.generation,
      });
      this.onDiagnostic(`[wsl-response] ${operation} ok session=${active.sessionId}`);
      return result;
    } catch (err) {
      this.onDiagnostic(`[wsl-response] ${operation} error session=${active.sessionId} error=${JSON.stringify(err)}`);
      throw err;
    }
  }

  private disposeSession(): void {
    // Replacing the session (reconnect): kill the previous child without
    // emitting a transient "disconnected" state; handshake sets the next state.
    if (this.session) {
      try {
        this.session.child.kill();
      } catch {
        /* already gone */
      }
      this.session = null;
    }
  }

  nextBackoffMs(): number | null {
    if (this.reconnectAttempts >= BACKOFF_MS.length) return null;
    const ms = BACKOFF_MS[this.reconnectAttempts]!;
    this.reconnectAttempts += 1;
    return ms;
  }

  disconnect(): void {
    this.session?.child.kill();
    this.session = null;
    this.setState("disconnected");
  }

  resourceBase(): string {
    // extraResources land next to the app: <resources>/wsl/linux-x64 in prod.
    if (app.isPackaged) return path.join(process.resourcesPath, "wsl", "linux-x64");
    return path.join(app.getAppPath(), "resources", "wsl", "linux-x64");
  }
}
