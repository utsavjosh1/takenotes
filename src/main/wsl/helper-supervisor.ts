import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { app } from "electron";
import { HelperClient } from "./helper-client.js";
import { PROTOCOL_VERSION } from "../../shared/protocol-version.js";
import type { HandshakeResult } from "../../shared/protocol.js";
import { appError } from "../../shared/errors.js";
import { helperEnv, buildWslHelperArgv, resolveWslExe } from "./launch-security.js";

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
  /** Linux user the helper runs as (P1-03). Diagnostics only — the
   * registry's `linuxUser` is the identity source of truth. */
  linuxUser: string;
  client: HelperClient;
  child: ChildProcess;
  handshake: HandshakeResult;
};

/** Ephemeral helper handle: request/response without owning the singleton
 * session (user discovery must never disturb a connected workspace). */
export type EphemeralHelper = {
  sessionId: string;
  request: (operation: string, payload: unknown) => Promise<unknown>;
  dispose: () => void;
};

/** Pure handshake verification shared by tracked and ephemeral spawns:
 * nonce echo + protocol + app-owned runtime path. Returns the rejection
 * reason, or null when the helper is trusted. */
export function checkHandshake(
  handshake: HandshakeResult | null | undefined,
  nonce: string,
  expectedNodePath: string,
): string | null {
  if (!handshake || handshake.protocolVersion !== PROTOCOL_VERSION) {
    return `Helper protocol ${handshake?.protocolVersion} is incompatible with app protocol ${PROTOCOL_VERSION}. Update takenotes.`;
  }
  if (handshake.nonce !== nonce) return "Helper handshake nonce mismatch: refusing to trust this helper.";
  if (handshake.execPath !== expectedNodePath) {
    return `Helper is not running under the app-owned runtime (execPath ${handshake.execPath}). Connection refused.`;
  }
  return null;
}

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

  /** Launch helper through wsl.exe with separate argv (shell: false),
   * running as the selected Linux user (`-u`). No sudo, no escalation:
   * the helper simply runs with that user's own permissions. */
  async connect(distro: string, linuxUser: string, nodePath: string, helperPath: string): Promise<WslSession> {
    this.disposeSession();
    this.setState("starting");
    const child = spawn(resolveWslExe(), buildWslHelperArgv(distro, linuxUser, nodePath, helperPath), {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: helperEnv(),
    });
    return this.handshake(child, distro, linuxUser, nodePath);
  }

  /** Ephemeral helper inside one distro as its default user (no `-u`): for
   * user discovery only. Never touches the singleton session or the
   * renderer-visible state — a connected workspace is undisturbed. The
   * caller must `dispose()` (kills the child). Only the explicitly selected
   * distro is ever entered. */
  async spawnEphemeral(distro: string, nodePath: string, helperPath: string): Promise<EphemeralHelper> {
    const child = spawn(resolveWslExe(), buildWslHelperArgv(distro, null, nodePath, helperPath), {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: helperEnv(),
    });
    const sessionId = randomUUID();
    const nonce = randomBytes(16).toString("hex");
    const client = new HelperClient(child);
    client.on("diagnostic", (line: string) => this.onDiagnostic(line));
    client.on("protocolError", (message: string) => {
      this.onDiagnostic(`protocol violation (${message}); terminating ephemeral helper`);
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    });
    let handshake: HandshakeResult;
    try {
      handshake = (await client.request("hello", { protocolVersion: PROTOCOL_VERSION, nonce }, { sessionId, generation: 1 })) as HandshakeResult;
    } catch (err) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      throw err;
    }
    const rejected = checkHandshake(handshake, nonce, nodePath);
    if (rejected) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      throw new Error(rejected);
    }
    return {
      sessionId,
      request: (operation, payload) => client.request(operation, payload, { sessionId, generation: 1 }),
      dispose: () => {
        try {
          child.kill();
        } catch {
          /* already gone */
        }
      },
    };
  }

  /** Spawn helper directly (Linux dev/tests): no wsl.exe involved. */
  async connectDirect(nodePath: string, helperPath: string): Promise<WslSession> {
    this.disposeSession();
    const child = spawn(nodePath, [helperPath, "--stdio"], { shell: false, stdio: ["pipe", "pipe", "pipe"], env: helperEnv() });
    return this.handshake(child, "direct", "direct", nodePath);
  }

  /** Challenge/response handshake: nonce echo + protocol + runtime-path verification.
   * Detailed handshake metadata stays in main diagnostics; it is never sent to the renderer. */
  private async handshake(child: ChildProcess, distro: string, linuxUser: string, expectedNodePath: string): Promise<WslSession> {
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
    const rejected = checkHandshake(handshake, nonce, expectedNodePath);
    if (rejected) fail(rejected);
    this.onDiagnostic(`helper handshake ok: pid=${handshake.processId} node=${handshake.runtimeVersion} execPath=${handshake.execPath}`);
    const session: WslSession = { sessionId, generation: 1, distro, linuxUser, client, child, handshake };
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
