import type { WorkspaceKind } from "../../shared/platform/types.js";
import { appError, type AppError } from "../../shared/errors.js";
import type { DirectoryEntry } from "../../shared/contracts/ipc.js";
import { isNativeWorkspace } from "../workspace/registry.js";
import type { FileAdapter } from "../workspace/file-adapter.js";
import type { ReadResult } from "../workspace/local-workspace.js";
import type { FileRevision } from "../workspace/revisions.js";
import type { WorkspaceService } from "./workspace-service.js";

export type WslRequest = (operation: string, params: Record<string, unknown>) => Promise<unknown>;

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
    | { root: string; kind: "native" | "wsl"; type: WorkspaceKind; distro?: string }
    | { error: AppError } {
    const reg = this.workspaces.get(id);
    if (!reg) return { error: appError("INVALID_REQUEST", "Unknown workspace.") };
    return isNativeWorkspace(reg)
      ? { root: reg.root, kind: "native" as const, type: reg.type }
      : { root: reg.root, kind: "wsl" as const, type: reg.type, distro: reg.distro };
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
      const entries = (await this.deps.wslRequest("directory.list", { relativePath })) as DirectoryEntry[];
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
      const result = (await this.deps.wslRequest("file.read", { relativePath })) as ReadResult;
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
      const revision = (await this.deps.wslRequest("file.write", {
        relativePath,
        content,
        expectedHash,
        newlineStyle,
      })) as FileRevision;
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
      const revision = (await this.deps.wslRequest("file.create", { relativePath })) as FileRevision;
      return { revision };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  async renamePath(workspaceId: string, oldPath: string, newPath: string): Promise<{ ok: true } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.rename(r.root, r.type, oldPath, newPath);
    return { error: appError("INVALID_REQUEST", "Rename is not supported in WSL workspaces in this version.") };
  }

  async trashPath(workspaceId: string, relativePath: string): Promise<{ ok: true } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.trash(r.root, r.type, relativePath);
    return { error: appError("INVALID_REQUEST", "Trash is not supported in WSL workspaces in this version.") };
  }

  async createDirectory(workspaceId: string, relativePath: string): Promise<{ ok: true } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.createDirectory(r.root, r.type, relativePath);
    // WSL directory mutations land with P1-04; precise error, never generic.
    return { error: appError("INVALID_REQUEST", "Directory operations are not supported in WSL workspaces in this version.") };
  }

  async deleteDirectory(
    workspaceId: string,
    relativePath: string,
    recursive: boolean,
  ): Promise<{ ok: true } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.deleteDirectory(r.root, r.type, relativePath, recursive);
    return { error: appError("INVALID_REQUEST", "Directory operations are not supported in WSL workspaces in this version.") };
  }

  async renameDirectory(
    workspaceId: string,
    oldPath: string,
    newPath: string,
  ): Promise<{ ok: true } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.renameDirectory(r.root, r.type, oldPath, newPath);
    return { error: appError("INVALID_REQUEST", "Directory operations are not supported in WSL workspaces in this version.") };
  }
}

/** Preserve structured helper errors (NOT_FOUND, CONFLICT, INVALID_PATH, …)
 * across the seam; unexpected failures become INTERNAL_ERROR. */
function toWslError(err: unknown): AppError {
  if (err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string") {
    const e = err as AppError;
    return e.detail === undefined
      ? { code: e.code, message: e.message }
      : { code: e.code, message: e.message, detail: e.detail };
  }
  return { code: "INTERNAL_ERROR", message: "WSL operation failed.", detail: String(err) };
}
