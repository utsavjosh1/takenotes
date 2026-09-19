/**
 * Core NoteService (ADR-0014, Gate A).
 *
 * Canonical `note.read/update` orchestration shared by every transport
 * (IPC today, HTTP tomorrow). Owns workspace resolution, path policy,
 * confinement, BOM/newline handling, and `expectedRevision` CONFLICT.
 * Host IO goes through `HostFilesystem` — never `node:fs` directly.
 *
 * Imports ONLY `node:path` + `shared/*` + `core/*`. Never `src/main/*`,
 * Electron, or transports.
 */
import path from "node:path";
import { appError, mapFsError, type AppError } from "../../shared/errors.js";
import type { WorkspaceKind } from "../../shared/platform/types.js";
import type { FileReadResult, FileRevision } from "../../shared/contracts/ipc.js";
import type { HostFilesystem } from "../ports/host-filesystem.js";
import {
  MAX_FILE_BYTES,
  decodeUtf8,
  detectNewline,
  encodeUtf8,
  isRevisionCurrent,
  revisionOfBytes,
  validateNoteRelativePath,
} from "../policy/note-policy.js";

export type CoreWorkspace = {
  root: string;
  kind: WorkspaceKind;
};

type PathModule = Pick<typeof path.win32, "join" | "normalize" | "dirname" | "relative" | "isAbsolute" | "sep">;

function looksLikeWindowsRoot(root: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(root) || root.startsWith("\\\\");
}

function pathModuleForRoot(kind: WorkspaceKind, root: string): PathModule {
  return kind === "windows-local" || looksLikeWindowsRoot(root) ? path.win32 : path.posix;
}

export class CoreNoteService {
  constructor(private readonly host: HostFilesystem) {}

  private async resolveInsideRoot(
    root: string,
    kind: WorkspaceKind,
    relativePath: string,
  ): Promise<{ absolutePath: string } | { error: AppError }> {
    const pm = pathModuleForRoot(kind, root);
    const abs = pm.join(root, relativePath);
    const realRoot = await this.host.realpath(root);
    const relParts = pm.normalize(relativePath).split(pm.sep);
    let cursor = root;
    for (const part of relParts.slice(0, -1)) {
      cursor = pm.join(cursor, part);
      let st;
      try {
        st = await this.host.lstat(cursor);
      } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "ENOENT") break;
        return { error: mapFsError(e, "path") };
      }
      if (st.isSymlink) {
        return { error: appError("OUTSIDE_ROOT", "Symlinked directories are not traversed.") };
      }
      if (realRoot) {
        const realCursor = await this.host.realpath(cursor);
        if (realCursor) {
          const rel = pm.relative(realRoot, realCursor);
          if (rel.startsWith("..") || pm.isAbsolute(rel)) {
            return { error: appError("OUTSIDE_ROOT", "Path escapes the workspace.") };
          }
        }
      }
    }
    try {
      const st = await this.host.lstat(abs);
      if (st.isSymlink) {
        return { error: appError("OUTSIDE_ROOT", "Symlinked paths are not traversed.") };
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        return { error: mapFsError(err as NodeJS.ErrnoException, "path") };
      }
    }
    const realTarget = await this.host.realpath(pm.dirname(abs));
    if (realRoot && realTarget) {
      const rel = pm.relative(realRoot, realTarget);
      if (rel.startsWith("..") || pm.isAbsolute(rel)) {
        return { error: appError("OUTSIDE_ROOT", "Path escapes the workspace.") };
      }
    }
    return { absolutePath: abs };
  }

  async read(ws: CoreWorkspace, relativePathInput: string): Promise<{ result: FileReadResult } | { error: AppError }> {
    const v = validateNoteRelativePath(ws.kind, relativePathInput);
    if ("error" in v) return v;
    const r = await this.resolveInsideRoot(ws.root, ws.kind, v.relativePath);
    if ("error" in r) return r;
    let bytes: Buffer;
    let st;
    try {
      st = await this.host.stat(r.absolutePath);
      if (st.size > MAX_FILE_BYTES) {
        return { error: appError("TOO_LARGE", "This file is too large to edit safely.") };
      }
      bytes = await this.host.readBytes(r.absolutePath);
    } catch (err) {
      return { error: mapFsError(err as NodeJS.ErrnoException, "file") };
    }
    const decoded = decodeUtf8(bytes);
    if (!decoded) {
      return { error: appError("UNSUPPORTED_ENCODING", "Only UTF-8 text files are supported.") };
    }
    const { newlineStyle } = detectNewline(decoded.text);
    return {
      result: {
        content: decoded.text,
        revision: revisionOfBytes(bytes, st.mtimeMs),
        newlineStyle,
        hadBom: decoded.hadBom,
      },
    };
  }

  async update(
    ws: CoreWorkspace,
    relativePathInput: string,
    content: string,
    expectedHash: string,
    newlineStyle: "lf" | "crlf",
    hadBom: boolean,
  ): Promise<{ revision: FileRevision } | { error: AppError }> {
    const v = validateNoteRelativePath(ws.kind, relativePathInput);
    if ("error" in v) return v;
    const r = await this.resolveInsideRoot(ws.root, ws.kind, v.relativePath);
    if ("error" in r) return r;
    let current: Buffer;
    try {
      current = await this.host.readBytes(r.absolutePath);
    } catch (err) {
      return { error: mapFsError(err as NodeJS.ErrnoException, "file") };
    }
    const currentHash = revisionOfBytes(current, 0).hash;
    if (!isRevisionCurrent(currentHash, expectedHash)) {
      return { error: appError("CONFLICT", "The file changed on disk. Reload before saving.") };
    }
    const bytes = encodeUtf8(content, newlineStyle, hadBom, false);
    if (bytes.length > MAX_FILE_BYTES) {
      return { error: appError("TOO_LARGE", "This file is too large to edit safely.") };
    }
    try {
      await this.host.writeBytesAtomic(r.absolutePath, bytes);
    } catch (err) {
      return { error: mapFsError(err as NodeJS.ErrnoException, "file") };
    }
    const st = await this.host.stat(r.absolutePath);
    const written = await this.host.readBytes(r.absolutePath);
    return { revision: revisionOfBytes(written, st.mtimeMs) };
  }
}
