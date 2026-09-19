import type { WorkspaceKind } from "../../shared/platform/types.js";
import { appError, type AppError } from "../../shared/errors.js";
import type { DirectoryEntry } from "../../shared/contracts/ipc.js";
import { isNativeWorkspace } from "../workspace/registry.js";
import type { FileAdapter } from "../workspace/file-adapter.js";
import type { ReadResult } from "../workspace/local-workspace.js";
import type { FileRevision } from "../workspace/revisions.js";
import type { WorkspaceService } from "./workspace-service.js";
import { toHelperError as toWslError } from "../ipc/helper-errors.js";

/** WSL session identity carried on every helper call (P1-04). The
 * main-process transport compares this against the active helper session
 * (`distro + linuxUser`, never distro alone) and fails closed with
 * DISCONNECTED on mismatch — Ubuntu/work mutations must never execute on
 * an Ubuntu/utsav helper, even for the same physical path string. */
export type WslIdentity = {
  distro?: string;
  linuxUser?: string;
};

export type WslRequest = (
  operation: string,
  params: Record<string, unknown>,
  identity: WslIdentity,
) => Promise<unknown>;

export type NoteServiceDeps = {
  native: FileAdapter;
  /** WSL helper round-trip; throws structured helper errors on failure. */
  wslRequest: WslRequest;
  /** True when a helper session is connected (defaults to connected). */
  hasWslSession?: () => boolean;
};

/** Domain seam (ADR-0009): every note/tree mutation flows through here.
 * Dispatches by workspace kind — native kinds to the `FileAdapter`,
 * `windows-wsl` to the helper. IPC handlers validate sender + wire shapes
 * and delegate; they hold no filesystem logic. */
export class NoteService {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly deps: NoteServiceDeps,
  ) {}

  private resolve(id: string):
    | { root: string; kind: "native" | "wsl"; type: WorkspaceKind; distro?: string; linuxUser?: string }
    | { error: AppError } {
    const reg = this.workspaces.get(id);
    if (!reg) return { error: appError("INVALID_REQUEST", "Unknown workspace.") };
    return isNativeWorkspace(reg)
      ? { root: reg.root, kind: "native" as const, type: reg.type }
      : { root: reg.root, kind: "wsl" as const, type: reg.type, distro: reg.distro, linuxUser: reg.linuxUser };
  }

  /** Identity accompanying every WSL helper call: distro + selected Linux
   * user (ADR-0007). The transport refuses to run when the connected helper
   * session belongs to a different identity. */
  private identity(r: { distro?: string; linuxUser?: string }): WslIdentity {
    return { distro: r.distro, linuxUser: r.linuxUser };
  }

  private wslOnline(): boolean {
    return this.deps.hasWslSession?.() ?? true;
  }

  async listTree(workspaceId: string, relativePath: string): Promise<{ entries: DirectoryEntry[] } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.list(r.root, r.type, relativePath);
    if (!this.wslOnline()) return { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    try {
      const entries = (await this.deps.wslRequest("directory.list", { relativePath }, this.identity(r))) as DirectoryEntry[];
      return { entries };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  async readFile(workspaceId: string, relativePath: string): Promise<{ result: ReadResult } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.read(r.root, r.type, relativePath);
    if (!this.wslOnline()) return { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    try {
      const result = (await this.deps.wslRequest("file.read", { relativePath }, this.identity(r))) as ReadResult;
      return { result };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  async writeFile(
    workspaceId: string,
    relativePath: string,
    content: string,
    expectedHash: string,
    newlineStyle: "lf" | "crlf",
    hadBom: boolean,
  ): Promise<{ revision: FileRevision } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") {
      return this.deps.native.write(r.root, r.type, relativePath, content, expectedHash, newlineStyle, hadBom);
    }
    if (!this.wslOnline()) return { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    try {
      const revision = (await this.deps.wslRequest(
        "file.write",
        {
          relativePath,
          content,
          expectedHash,
          newlineStyle,
        },
        this.identity(r),
      )) as FileRevision;
      return { revision };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  async createFile(workspaceId: string, relativePath: string): Promise<{ revision: FileRevision } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.createFile(r.root, r.type, relativePath);
    if (!this.wslOnline()) return { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    try {
      const revision = (await this.deps.wslRequest("file.create", { relativePath }, this.identity(r))) as FileRevision;
      return { revision };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  async renamePath(workspaceId: string, oldPath: string, newPath: string): Promise<{ ok: true } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.rename(r.root, r.type, oldPath, newPath);
    if (!this.wslOnline()) return { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    try {
      await this.deps.wslRequest("file.rename", { oldPath, newPath }, this.identity(r));
      return { ok: true };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  async trashPath(workspaceId: string, relativePath: string): Promise<{ ok: true } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.trash(r.root, r.type, relativePath);
    // P1 permanent-delete (no OS-trash mislabeling): the helper unlinks the
    // file outright. The renderer confirms explicitly ("Delete
    // permanently?") and never calls this the Recycle Bin.
    if (!this.wslOnline()) return { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    try {
      await this.deps.wslRequest("file.delete", { relativePath }, this.identity(r));
      return { ok: true };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  async createDirectory(workspaceId: string, relativePath: string): Promise<{ ok: true } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.createDirectory(r.root, r.type, relativePath);
    if (!this.wslOnline()) return { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    try {
      await this.deps.wslRequest("directory.create", { relativePath }, this.identity(r));
      return { ok: true };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  async deleteDirectory(
    workspaceId: string,
    relativePath: string,
    recursive: boolean,
  ): Promise<{ ok: true } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.deleteDirectory(r.root, r.type, relativePath, recursive);
    // Native parity (P1-01): non-empty + recursive=false refuses with
    // DIRECTORY_NOT_EMPTY inside the helper; only the explicit recursive
    // path (after the UI confirm) removes.
    if (!this.wslOnline()) return { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    try {
      await this.deps.wslRequest("directory.delete", { relativePath, recursive }, this.identity(r));
      return { ok: true };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  async renameDirectory(
    workspaceId: string,
    oldPath: string,
    newPath: string,
  ): Promise<{ ok: true } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.renameDirectory(r.root, r.type, oldPath, newPath);
    if (!this.wslOnline()) return { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    try {
      await this.deps.wslRequest("directory.rename", { oldPath, newPath }, this.identity(r));
      return { ok: true };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }
}


