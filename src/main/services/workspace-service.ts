import type { WorkspaceKind } from "../../shared/platform/types.js";
import { WorkspaceRegistry, type WorkspaceRegistration } from "../workspace/registry.js";

/** Workspace identity seam (ADR-0007, ADR-0009): the single owner of the
 * workspace registry. IPC handlers validate wire shapes and delegate here;
 * no filesystem work happens in this class — roots resolve in NoteService. */
export class WorkspaceService {
  constructor(private readonly registry: WorkspaceRegistry = new WorkspaceRegistry()) {}

  registerLocal(displayName: string, root: string, kind: WorkspaceKind = "windows-local"): WorkspaceRegistration {
    return this.registry.register(kind, displayName, root);
  }

  registerWsl(displayName: string, root: string, distro: string): WorkspaceRegistration {
    return this.registry.register("windows-wsl", displayName, root, distro);
  }

  get(id: string): WorkspaceRegistration | undefined {
    return this.registry.get(id);
  }

  close(id: string): void {
    this.registry.close(id);
  }

  list(): WorkspaceRegistration[] {
    return this.registry.list();
  }
}
