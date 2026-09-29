import { randomUUID } from "node:crypto";
import type { WorkspaceKind } from "@takenotes/platform/types";

export type RuntimeWorkspace = {
  workspaceId: string;
  displayName: string;
  kind: Extract<WorkspaceKind, "linux-local">;
  root: string;
  createdAt: number;
};

/** In-memory registry for an app-launched host runtime. The desktop owns
 * runtime lifecycle, so workspace ids are intentionally process-local. */
export class InMemoryRuntimeWorkspaceRegistry {
  private readonly workspaces = new Map<string, RuntimeWorkspace>();

  get(workspaceId: string): RuntimeWorkspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  list(): RuntimeWorkspace[] {
    return [...this.workspaces.values()];
  }

  registerLinuxWorkspace(displayName: string, root: string): RuntimeWorkspace {
    const ws: RuntimeWorkspace = {
      workspaceId: randomUUID(),
      displayName,
      kind: "linux-local",
      root,
      createdAt: Date.now(),
    };
    this.workspaces.set(ws.workspaceId, ws);
    return ws;
  }

  close(workspaceId: string): void {
    this.workspaces.delete(workspaceId);
  }
}
