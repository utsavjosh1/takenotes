import { randomUUID } from "node:crypto";
import type { WorkspaceKind } from "../../shared/platform/types.js";
import { isWslKind } from "../../shared/platform/filesystem.js";

export type WorkspaceType = WorkspaceKind;

export type WorkspaceRegistration = {
  id: string;
  type: WorkspaceType;
  generation: number;
  displayName: string;
  /** Trusted main-process-only root (native path or WSL Linux path). */
  root: string;
  distro?: string;
};

/** Renderer-safe projection (no absolute roots). */
export function toWorkspaceInfo(reg: WorkspaceRegistration): {
  workspaceId: string;
  displayName: string;
  type: WorkspaceType;
} {
  return { workspaceId: reg.id, displayName: reg.displayName, type: reg.type };
}

/** Native (direct-Node-filesystem) workspaces vs the WSL helper path. */
export function isNativeWorkspace(reg: WorkspaceRegistration): boolean {
  return !isWslKind(reg.type);
}

export class WorkspaceRegistry {
  private readonly workspaces = new Map<string, WorkspaceRegistration>();

  register(type: WorkspaceType, displayName: string, root: string, distro?: string): WorkspaceRegistration {
    const reg: WorkspaceRegistration = {
      id: randomUUID(),
      type,
      generation: 1,
      displayName,
      root,
      distro,
    };
    this.workspaces.set(reg.id, reg);
    return reg;
  }

  get(id: string): WorkspaceRegistration | undefined {
    return this.workspaces.get(id);
  }

  close(id: string): void {
    const reg = this.workspaces.get(id);
    if (reg) {
      reg.generation += 1;
      this.workspaces.delete(id);
    }
  }

  list(): WorkspaceRegistration[] {
    return [...this.workspaces.values()];
  }
}
