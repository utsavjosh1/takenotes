import type { WorkspaceKind } from "../../shared/platform/types.js";
import { CoreNoteService } from "../../core/services/note-service.js";
import { appError, type AppError } from "../../shared/errors.js";
import type { DirectoryEntry } from "../../shared/contracts/ipc.js";
import type { FileRevision } from "./revisions.js";
import {
  createDirectory,
  createTextFile,
  deleteDirectory,
  listDirectory,
  renameDirectory,
  renamePath,
  resolveInsideRoot,
} from "./local-workspace.js";
import type { ReadResult } from "./local-workspace.js";
import { LocalHostFilesystem } from "./local-host-filesystem.js";
import { validatePosixRelativePath, validateWindowsRelativePath } from "./path-security.js";

/** Storage seam (ADR-0009): services dispatch by workspace kind to either
 * the native Node filesystem or the WSL helper. Platform filesystem
 * behavior stays behind this adapter — never in IPC handlers or UI. */
export type AdapterKind = "native" | "wsl";

export function adapterKindFor(kind: WorkspaceKind): AdapterKind {
  return kind === "windows-wsl" ? "wsl" : "native";
}

export interface FileAdapter {
  list(root: string, kind: WorkspaceKind, relativePath: string): Promise<{ entries: DirectoryEntry[] } | { error: AppError }>;
  read(root: string, kind: WorkspaceKind, relativePath: string): Promise<{ result: ReadResult } | { error: AppError }>;
  write(
    root: string,
    kind: WorkspaceKind,
    relativePath: string,
    content: string,
    expectedHash: string,
    newlineStyle: "lf" | "crlf",
    hadBom: boolean,
  ): Promise<{ revision: FileRevision } | { error: AppError }>;
  createFile(root: string, kind: WorkspaceKind, relativePath: string): Promise<{ revision: FileRevision } | { error: AppError }>;
  rename(root: string, kind: WorkspaceKind, oldPath: string, newPath: string): Promise<{ ok: true } | { error: AppError }>;
  createDirectory(root: string, kind: WorkspaceKind, relativePath: string): Promise<{ ok: true } | { error: AppError }>;
  deleteDirectory(
    root: string,
    kind: WorkspaceKind,
    relativePath: string,
    recursive: boolean,
  ): Promise<{ ok: true } | { error: AppError }>;
  renameDirectory(
    root: string,
    kind: WorkspaceKind,
    oldPath: string,
    newPath: string,
  ): Promise<{ ok: true } | { error: AppError }>;
  trash(root: string, kind: WorkspaceKind, relativePath: string): Promise<{ ok: true } | { error: AppError }>;
}

/** Windows/macOS/Linux local workspaces. Gate B routes note read/write
 * through CoreNoteService; the remaining tree/mutation operations stay on the
 * existing local-workspace helpers until their own slices migrate. Trash goes
 * through the injected OS-trash function (Electron `shell.trashItem` in
 * production) so the adapter stays testable. */
export class NativeFileAdapter implements FileAdapter {
  private readonly coreNotes = new CoreNoteService(new LocalHostFilesystem());

  constructor(private readonly trashItem: (absolutePath: string) => Promise<void>) {}

  list(root: string, kind: WorkspaceKind, relativePath: string): Promise<{ entries: DirectoryEntry[] } | { error: AppError }> {
    return listDirectory(root, kind, relativePath);
  }

  read(root: string, kind: WorkspaceKind, relativePath: string): Promise<{ result: ReadResult } | { error: AppError }> {
    return this.coreNotes.read({ root, kind }, relativePath);
  }

  write(
    root: string,
    kind: WorkspaceKind,
    relativePath: string,
    content: string,
    expectedHash: string,
    newlineStyle: "lf" | "crlf",
    hadBom: boolean,
  ): Promise<{ revision: FileRevision } | { error: AppError }> {
    return this.coreNotes.update({ root, kind }, relativePath, content, expectedHash, newlineStyle, hadBom);
  }

  createFile(root: string, kind: WorkspaceKind, relativePath: string): Promise<{ revision: FileRevision } | { error: AppError }> {
    return createTextFile(root, kind, relativePath);
  }

  rename(root: string, kind: WorkspaceKind, oldPath: string, newPath: string): Promise<{ ok: true } | { error: AppError }> {
    return renamePath(root, kind, oldPath, newPath);
  }

  createDirectory(root: string, kind: WorkspaceKind, relativePath: string): Promise<{ ok: true } | { error: AppError }> {
    return createDirectory(root, kind, relativePath);
  }

  deleteDirectory(
    root: string,
    kind: WorkspaceKind,
    relativePath: string,
    recursive: boolean,
  ): Promise<{ ok: true } | { error: AppError }> {
    return deleteDirectory(root, kind, relativePath, recursive);
  }

  renameDirectory(
    root: string,
    kind: WorkspaceKind,
    oldPath: string,
    newPath: string,
  ): Promise<{ ok: true } | { error: AppError }> {
    return renameDirectory(root, kind, oldPath, newPath);
  }

  async trash(root: string, kind: WorkspaceKind, relativePath: string): Promise<{ ok: true } | { error: AppError }> {
    const v = kind === "windows-local" ? validateWindowsRelativePath(relativePath) : validatePosixRelativePath(relativePath);
    if ("error" in v) return v;
    const r = await resolveInsideRoot(root, kind, v.relativePath);
    if ("error" in r) return r;
    try {
      // OS trash semantics (Recycle Bin / Trash) via Electron (§30).
      await this.trashItem(r.absolutePath);
    } catch (err) {
      return { error: appError("INTERNAL_ERROR", "Could not move to trash.", String(err)) };
    }
    return { ok: true };
  }
}
