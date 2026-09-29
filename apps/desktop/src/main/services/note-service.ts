import type { WorkspaceKind } from "@takenotes/platform/types";
import { appError, type AppError } from "@takenotes/contracts/errors";
import { updateFrontmatter, type PropertyRegistry } from "@takenotes/core/index/properties";
import type { DirectoryEntry } from "@takenotes/contracts/ipc";
import { isNativeWorkspace } from "../workspace/registry.js";
import type { FileAdapter } from "../workspace/file-adapter.js";
import type { ReadResult } from "../workspace/local-workspace.js";
import type { FileRevision } from "../workspace/revisions.js";
import type { WorkspaceService } from "./workspace-service.js";
import { toHelperError as toWslError } from "../ipc/helper-errors.js";
import { hasDuplicateBareName, rewriteWikilinksForMove } from "../workspace/link-rewrite.js";

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

  private async collectNativeMarkdown(root: string, type: WorkspaceKind): Promise<{ paths: string[] } | { error: AppError }> {
    const paths: string[] = [];
    const queue = [""];
    for (let i = 0; i < queue.length; i++) {
      const listed = await this.deps.native.list(root, type, queue[i]!);
      if ("error" in listed) return listed;
      for (const entry of listed.entries) {
        const rel = entry.relativePath.replace(/\\/g, "/");
        if (entry.kind === "directory") queue.push(rel);
        else if (entry.fileClass === "markdown") paths.push(rel);
      }
    }
    return { paths };
  }

  private async rewriteNativeLinksAfterMove(input: {
    root: string;
    type: WorkspaceKind;
    beforePaths: string[];
    oldPath: string;
    newPath: string;
    kind: "file" | "directory";
  }): Promise<{ ok: true; linksFailed: string[] } | { error: AppError }> {
    const after = await this.collectNativeMarkdown(input.root, input.type);
    // Everything below runs after the rename already succeeded: a failure
    // here must never masquerade as a failed rename (the caller would retry
    // the old path and report another error while links already moved).
    // Report partial success so the caller refreshes instead of retrying.
    if ("error" in after) return { ok: true, linksFailed: [`<scan>: ${after.error.message}`] };
    const failed: string[] = [];
    const allowBareFileName = input.kind === "file" && !hasDuplicateBareName(input.beforePaths, input.oldPath);
    for (const rel of after.paths) {
      const read = await this.deps.native.read(input.root, input.type, rel);
      if ("error" in read) { failed.push(rel); continue; }
      const next = rewriteWikilinksForMove(read.result.content, input.oldPath, input.newPath, {
        kind: input.kind,
        allowBareFileName,
      });
      if (next === read.result.content) continue;
      const written = await this.deps.native.write(
        input.root,
        input.type,
        rel,
        next,
        read.result.revision.hash,
        read.result.newlineStyle,
        read.result.hadBom,
      );
      if ("error" in written) failed.push(rel);
    }
    return { ok: true, linksFailed: failed };
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
          // P1-05: BOM must reach the helper or WSL writes silently drop
          // it while native writes preserve it (parity).
          hadBom,
        },
        this.identity(r),
      )) as FileRevision;
      return { revision };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  /** Step 3b — property patch through the service seam.
   *
   * Read → `updateFrontmatter` → atomic write, reusing the existing
   * revision machinery: stale `expectedHash` fails `CONFLICT` with bytes
   * untouched, and unparseable frontmatter fails `INVALID_REQUEST` before
   * any write is attempted. Newline style and BOM ride along from the read
   * so the patch never re-encodes the file. */
  async updateProperties(
    workspaceId: string,
    relativePath: string,
    patch: Record<string, unknown>,
    expectedHash: string,
    registry?: PropertyRegistry,
  ): Promise<{ revision: FileRevision } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    const read =
      r.kind === "native"
        ? await this.deps.native.read(r.root, r.type, relativePath)
        : this.wslOnline()
          ? await this.wslRead(r, relativePath)
          : { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    if ("error" in read) return read;
    const cur = read.result;
    if (cur.revision.hash !== expectedHash) {
      return { error: appError("CONFLICT", "The file changed on disk. Reload before saving.") };
    }
    const patched = updateFrontmatter(cur.content, patch, registry);
    if ("error" in patched) return patched;
    if (patched.content === cur.content) return { revision: cur.revision };
    if (r.kind === "native") {
      return this.deps.native.write(r.root, r.type, relativePath, patched.content, expectedHash, cur.newlineStyle, cur.hadBom);
    }
    try {
      const revision = (await this.deps.wslRequest(
        "file.write",
        {
          relativePath,
          content: patched.content,
          expectedHash,
          newlineStyle: cur.newlineStyle,
          hadBom: cur.hadBom,
        },
        this.identity(r),
      )) as FileRevision;
      return { revision };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  private async wslRead(
    r: { root: string; distro?: string; linuxUser?: string },
    relativePath: string,
  ): Promise<{ result: ReadResult } | { error: AppError }> {
    try {
      const result = (await this.deps.wslRequest("file.read", { relativePath }, this.identity(r))) as ReadResult;
      return { result };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  async createFile(workspaceId: string, relativePath: string, content = ""): Promise<{ revision: FileRevision } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") return this.deps.native.createFile(r.root, r.type, relativePath, content);
    if (!this.wslOnline()) return { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    try {
      const revision = (await this.deps.wslRequest("file.create", { relativePath, content }, this.identity(r))) as FileRevision;
      return { revision };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }

  async renamePath(workspaceId: string, oldPath: string, newPath: string): Promise<{ ok: true; linksFailed?: string[] } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") {
      const before = await this.collectNativeMarkdown(r.root, r.type);
      if ("error" in before) return before;
      const renamed = await this.deps.native.rename(r.root, r.type, oldPath, newPath);
      if ("error" in renamed) return renamed;
      const out = await this.rewriteNativeLinksAfterMove({ root: r.root, type: r.type, beforePaths: before.paths, oldPath, newPath, kind: "file" });
      if ("error" in out) return out;
      if (out.linksFailed.length > 0) console.warn(`[note-service] rename succeeded but ${out.linksFailed.length} link(s) failed to rewrite: ${out.linksFailed.join(", ")}`);
      return out.linksFailed.length > 0 ? { ok: true, linksFailed: out.linksFailed } : { ok: true };
    }
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
  ): Promise<{ ok: true; linksFailed?: string[] } | { error: AppError }> {
    const r = this.resolve(workspaceId);
    if ("error" in r) return r;
    if (r.kind === "native") {
      const before = await this.collectNativeMarkdown(r.root, r.type);
      if ("error" in before) return before;
      const renamed = await this.deps.native.renameDirectory(r.root, r.type, oldPath, newPath);
      if ("error" in renamed) return renamed;
      const out = await this.rewriteNativeLinksAfterMove({ root: r.root, type: r.type, beforePaths: before.paths, oldPath, newPath, kind: "directory" });
      if ("error" in out) return out;
      if (out.linksFailed.length > 0) console.warn(`[note-service] directory rename succeeded but ${out.linksFailed.length} link(s) failed to rewrite: ${out.linksFailed.join(", ")}`);
      return out.linksFailed.length > 0 ? { ok: true, linksFailed: out.linksFailed } : { ok: true };
    }
    if (!this.wslOnline()) return { error: appError("DISCONNECTED", "WSL helper is not connected.") };
    try {
      await this.deps.wslRequest("directory.rename", { oldPath, newPath }, this.identity(r));
      return { ok: true };
    } catch (err) {
      return { error: toWslError(err) };
    }
  }
}


