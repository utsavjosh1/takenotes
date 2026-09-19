import type { WorkspaceKind } from "../../shared/platform/types.js";
import type { WslDistribution, WslLinuxUser } from "../../shared/contracts/ipc.js";
import { appError } from "../../shared/errors.js";
import { WorkspaceRegistry, type WorkspaceRegistration } from "../workspace/registry.js";
import { listDistributions } from "../wsl/distributions.js";

/** Workspace identity seam (ADR-0007, ADR-0009): the single owner of the
 * workspace registry. IPC handlers validate wire shapes and delegate here;
 * no filesystem work happens in this class — roots resolve in NoteService. */
export class WorkspaceService {
  constructor(
    private readonly registry: WorkspaceRegistry = new WorkspaceRegistry(),
    private readonly distroSource: () => Promise<WslDistribution[]> = () => listDistributions(),
    private readonly userSource?: (distro: string) => Promise<WslLinuxUser[]>,
  ) {}

  registerLocal(displayName: string, root: string, kind: WorkspaceKind = "windows-local"): WorkspaceRegistration {
    return this.registry.register(kind, displayName, root);
  }

  registerWsl(displayName: string, root: string, distro: string, linuxUser?: string): WorkspaceRegistration {
    return this.registry.register("windows-wsl", displayName, root, distro, linuxUser);
  }

  get(id: string): WorkspaceRegistration | undefined {
    return this.registry.get(id);
  }

  /** Installed WSL distributions with state (P1-02). Read-only: listing
   * never starts a distro (ADR-0007). A distro alone is not yet a
   * Connection — Linux-user selection belongs to P1-03. */
  listDistributions(): Promise<WslDistribution[]> {
    return this.distroSource();
  }

  /** Interactive Linux users for one explicitly selected distro (P1-03).
   * Discovery enters only that distro, as its default user; unrelated
   * distros are never woken. The source is wired in main (ephemeral helper
   * session) and injected in tests. */
  listUsers(distro: string): Promise<WslLinuxUser[]> {
    if (!this.userSource) {
      throw appError("INTERNAL_ERROR", "Linux user discovery is not available.");
    }
    return this.userSource(distro);
  }

  close(id: string): void {
    this.registry.close(id);
  }

  list(): WorkspaceRegistration[] {
    return this.registry.list();
  }
}
