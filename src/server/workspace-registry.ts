import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WorkspaceKind } from "../shared/platform/types.js";

export type ServerWorkspace = {
  workspaceId: string;
  displayName: string;
  kind: Extract<WorkspaceKind, "linux-local">;
  root: string;
  createdAt: number;
};

type RegistryFile = {
  version: 1;
  workspaces: ServerWorkspace[];
};

function isRegistryFile(value: unknown): value is RegistryFile {
  const v = value as { version?: unknown; workspaces?: unknown };
  return v?.version === 1 && Array.isArray(v.workspaces);
}

/**
 * Persistent server-side workspace registry (Gate B).
 *
 * The HTTP transport receives only opaque `workspaceId` values. Absolute roots
 * remain server-owned and survive process restarts in this JSON registry.
 */
export class PersistentServerWorkspaceRegistry {
  private readonly workspaces = new Map<string, ServerWorkspace>();

  constructor(private readonly filePath: string) {
    this.loadSyncBestEffort();
  }

  private loadSyncBestEffort(): void {
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
      if (!isRegistryFile(raw)) return;
      for (const ws of raw.workspaces) {
        if (
          typeof ws.workspaceId === "string" &&
          typeof ws.displayName === "string" &&
          ws.kind === "linux-local" &&
          typeof ws.root === "string" &&
          typeof ws.createdAt === "number"
        ) {
          this.workspaces.set(ws.workspaceId, ws);
        }
      }
    } catch {
      // Empty/missing registry is a valid empty server state.
    }
  }

  async reload(): Promise<void> {
    this.workspaces.clear();
    try {
      const raw = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      if (!isRegistryFile(raw)) return;
      for (const ws of raw.workspaces) {
        if (ws.kind === "linux-local") this.workspaces.set(ws.workspaceId, ws);
      }
    } catch {
      // Empty/missing registry is a valid empty server state.
    }
  }

  get(workspaceId: string): ServerWorkspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  list(): ServerWorkspace[] {
    return [...this.workspaces.values()];
  }

  async registerLinuxWorkspace(displayName: string, root: string): Promise<ServerWorkspace> {
    const ws: ServerWorkspace = {
      workspaceId: randomUUID(),
      displayName,
      kind: "linux-local",
      root,
      createdAt: Date.now(),
    };
    this.workspaces.set(ws.workspaceId, ws);
    await this.persist();
    return ws;
  }

  /**
   * Server-managed workspace (Gate C): the root MUST live under
   * `workspacesDir` (`$TAKENOTES_DATA/workspaces`). Absolute roots outside
   * that directory are refused — server workspaces are never pointers at
   * arbitrary host paths.
   */
  async registerManagedWorkspace(
    displayName: string,
    workspacesDir: string,
    dirName?: string,
  ): Promise<ServerWorkspace> {
    const slug = (dirName ?? displayName).toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "notes";
    const root = path.join(workspacesDir, slug);
    const rel = path.relative(workspacesDir, root);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error("Managed workspace root escapes the workspaces directory.");
    }
    await mkdir(root, { recursive: true });
    return this.registerLinuxWorkspace(displayName, root);
  }

  async persist(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const body: RegistryFile = { version: 1, workspaces: this.list() };
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    await rename(tmp, this.filePath);
  }
}
