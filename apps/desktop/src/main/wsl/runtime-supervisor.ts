import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { app } from "electron";
import { appError } from "@takenotes/contracts/errors";
import type { IpcResult } from "@takenotes/contracts/ipc";
import { buildWslRuntimeArgv, helperEnv, resolveWslExe } from "./launch-security.js";
import { stagedManifestRequired, verifyStagedRuntime } from "./runtime-installer.js";

export type RuntimeState = "starting" | "connected" | "disconnected" | "failed";

export type WslRuntimeSession = {
  runtimeId: string;
  distro: string;
  linuxUser: string;
  endpoint: string;
  token: string;
  child: ChildProcess;
  activeWorkspaceId: string | null;
};

type BootstrapFrame = {
  nonce: string;
  runtimeId: string;
  endpoint: string;
  token: string;
  processId?: number;
  version?: string;
};

function isBootstrapFrame(value: unknown, nonce: string): value is BootstrapFrame {
  const v = value as Partial<BootstrapFrame>;
  if (!v || typeof v !== "object") return false;
  if (v.nonce !== nonce || typeof v.runtimeId !== "string" || typeof v.endpoint !== "string" || typeof v.token !== "string") return false;
  try {
    const url = new URL(v.endpoint);
    return url.protocol === "http:" && url.hostname === "127.0.0.1" && v.token.length >= 32;
  } catch {
    return false;
  }
}

async function parseRuntimeResult<T>(res: Response): Promise<T> {
  const body = (await res.json()) as IpcResult<T>;
  if (!body.ok) throw body.error;
  return body.result;
}

/** Owns one app-launched HTTP runtime inside WSL. `wsl.exe` is used only for
 * lifecycle/bootstrap; file operations go through the runtime endpoint. */
export class WslRuntimeSupervisor {
  private session: WslRuntimeSession | null = null;
  state: RuntimeState = "disconnected";

  constructor(
    private readonly onStateChange: (state: RuntimeState) => void,
    private readonly onDiagnostic: (line: string) => void,
  ) {}

  private setState(state: RuntimeState): void {
    this.state = state;
    this.onStateChange(state);
  }

  async connect(distro: string, linuxUser: string, nodePath: string, runtimePath: string): Promise<WslRuntimeSession> {
    this.disconnect(false);
    // Same staged provenance gate as the helper transport (7e).
    const staged = await verifyStagedRuntime(path.dirname(nodePath), { requireManifest: stagedManifestRequired() });
    if ("error" in staged) {
      this.onDiagnostic(`staged runtime refused: ${staged.error.message}`);
      this.setState("failed");
      throw new Error(staged.error.message);
    }
    this.onDiagnostic(staged.verified ? "staged runtime verified" : "staged manifest absent (dev): proceeding unverified");
    this.setState("starting");
    const nonce = randomBytes(16).toString("hex");
    const child = spawn(resolveWslExe(), buildWslRuntimeArgv(distro, linuxUser, nodePath, runtimePath, nonce), {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: helperEnv(),
    });
    child.stderr.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (line.trim()) this.onDiagnostic(`[wsl-runtime] ${line}`);
      }
    });
    // Lifetime listener: bootstrap cleanup removes its own handler, but a
    // later `child.kill()` failure emits async `error` with no listener ->
    // uncaught exception in main. Keep this diagnostic listener for life.
    child.on("error", (err: Error) => {
      this.onDiagnostic(`[wsl-runtime] process error: ${err.message}`);
    });
    child.on("exit", () => {
      if (this.session?.child === child) {
        this.session = null;
        this.setState("disconnected");
      }
    });

    const bootstrap = await this.waitForBootstrap(child, nonce).catch((err) => {
      try { child.kill(); } catch { /* already gone */ }
      this.setState("failed");
      throw err;
    });
    const session: WslRuntimeSession = {
      runtimeId: bootstrap.runtimeId,
      distro,
      linuxUser,
      endpoint: bootstrap.endpoint,
      token: bootstrap.token,
      child,
      activeWorkspaceId: null,
    };
    this.session = session;
    this.setState("connected");
    this.onDiagnostic(`runtime bootstrap ok: runtimeId=${bootstrap.runtimeId} endpoint=${bootstrap.endpoint} pid=${bootstrap.processId ?? "?"}`);
    return session;
  }

  private waitForBootstrap(child: ChildProcess, nonce: string): Promise<BootstrapFrame> {
    return new Promise((resolve, reject) => {
      let buffer = "";
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for WSL runtime bootstrap.")), 15_000);
      const cleanup = () => {
        clearTimeout(timeout);
        child.stdout?.off("data", onData);
        child.off("error", onError);
        child.off("exit", onExit);
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onExit = (code: number | null) => {
        cleanup();
        reject(new Error(`WSL runtime exited before bootstrap (code ${code ?? "unknown"}).`));
      };
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        for (;;) {
          const idx = buffer.indexOf("\n");
          if (idx < 0) return;
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          if (!line.startsWith("TAKENOTES_RUNTIME_BOOTSTRAP ")) {
            this.onDiagnostic(`[wsl-runtime stdout] ${line}`);
            continue;
          }
          try {
            const parsed = JSON.parse(line.slice("TAKENOTES_RUNTIME_BOOTSTRAP ".length)) as unknown;
            if (!isBootstrapFrame(parsed, nonce)) throw new Error("Invalid runtime bootstrap frame.");
            cleanup();
            resolve(parsed);
          } catch (err) {
            cleanup();
            reject(err);
          }
        }
      };
      child.stdout?.on("data", onData);
      child.on("error", onError);
      child.on("exit", onExit);
    });
  }

  getSession(): WslRuntimeSession | null {
    return this.session;
  }

  async request(operation: string, payload: Record<string, unknown>): Promise<unknown> {
    const active = this.session;
    if (!active || this.state !== "connected") throw appError("DISCONNECTED", "WSL runtime is not connected.");
    const body = { ...payload };
    if (operation !== "workspace.open" && operation !== "workspace.close") {
      if (!active.activeWorkspaceId) throw appError("INVALID_REQUEST", "No WSL runtime workspace is open.");
      body["workspaceId"] = active.activeWorkspaceId;
    } else if (operation === "workspace.close") {
      body["workspaceId"] = active.activeWorkspaceId;
    }
    this.onDiagnostic(`[wsl-runtime-request] ${operation} runtimeId=${active.runtimeId}`);
    // A hung runtime keeps its process alive: bound every request so a
    // stall surfaces as DISCONNECTED instead of hanging forever.
    const res = await fetch(new URL(`/api/runtime/rpc/${operation}`, active.endpoint), {
      method: "POST",
      headers: { authorization: `Bearer ${active.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw appError("DISCONNECTED", "WSL runtime request timed out.");
      }
      throw err;
    });
    const result = await parseRuntimeResult<unknown>(res);
    if (operation === "workspace.open") {
      const opened = result as { workspaceId?: unknown };
      if (typeof opened.workspaceId !== "string") throw appError("INTERNAL_ERROR", "Runtime did not return a workspace id.");
      active.activeWorkspaceId = opened.workspaceId;
    } else if (operation === "workspace.close") {
      active.activeWorkspaceId = null;
    }
    return result;
  }

  disconnect(emit = true): void {
    if (this.session) {
      try { this.session.child.kill(); } catch { /* already gone */ }
      this.session = null;
    }
    if (emit) this.setState("disconnected");
  }

  resourceBase(): string {
    if (app.isPackaged) return path.join(process.resourcesPath, "wsl", "linux-x64");
    return path.join(app.getAppPath(), "resources", "wsl", "linux-x64");
  }
}
