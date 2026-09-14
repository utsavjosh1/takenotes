import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { app } from "electron";
import { HelperClient } from "./helper-client.js";
import { PROTOCOL_VERSION } from "../../shared/protocol-version.js";
import type { HandshakeResult } from "../../shared/protocol.js";

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
    this.setState("starting");
    const child = spawn(
      "wsl.exe",
      ["-d", distro, "--exec", nodePath, helperPath, "--stdio"],
      { shell: false, stdio: ["pipe", "pipe", "pipe"] },
    );
    const sessionId = randomUUID();
    const client = new HelperClient(child);
    client.on("diagnostic", (line: string) => this.onDiagnostic(line));
    client.on("exit", () => {
      this.session = null;
      this.setState("disconnected");
    });

    this.setState("handshake");
    const handshake = (await client.request("hello", { protocolVersion: PROTOCOL_VERSION }, { sessionId, generation: 1 })) as HandshakeResult;
    if (handshake.protocolVersion !== PROTOCOL_VERSION) {
      this.setState("incompatible");
      child.kill();
      throw new Error(
        `Helper protocol ${handshake.protocolVersion} is incompatible with app protocol ${PROTOCOL_VERSION}. Update Desktop Notes.`,
      );
    }
    const session: WslSession = { sessionId, generation: 1, distro, client, child, handshake };
    this.session = session;
    this.reconnectAttempts = 0;
    this.setState("connected");
    return session;
  }

  /** Spawn helper directly (Linux dev/tests): no wsl.exe involved. */
  async connectDirect(nodePath: string, helperPath: string): Promise<WslSession> {
    const child = spawn(nodePath, [helperPath, "--stdio"], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const sessionId = randomUUID();
    const client = new HelperClient(child);
    client.on("diagnostic", (line: string) => this.onDiagnostic(line));
    client.on("exit", () => {
      this.session = null;
      this.setState("disconnected");
    });
    const handshake = (await client.request("hello", { protocolVersion: PROTOCOL_VERSION }, { sessionId, generation: 1 })) as HandshakeResult;
    if (handshake.protocolVersion !== PROTOCOL_VERSION) {
      this.setState("incompatible");
      child.kill();
      throw new Error("Protocol mismatch.");
    }
    const session: WslSession = { sessionId, generation: 1, distro: "direct", client, child, handshake };
    this.session = session;
    this.setState("connected");
    return session;
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
