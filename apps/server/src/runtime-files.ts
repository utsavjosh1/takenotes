import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { appError, mapFsError, type AppError } from "@takenotes/contracts/errors";
import type { DirectoryEntry, FileRevision } from "@takenotes/contracts/ipc";
import { encodeUtf8, revisionOfBytes, validatePosixRelativePath } from "@takenotes/core/policy/note-policy";

function classifyFile(name: string): DirectoryEntry["fileClass"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".txt")) return "text";
  if (/\.(png|jpe?g|webp|gif)$/.test(lower)) return "image";
  return "other";
}

export function resolveRuntimeRoot(input: unknown): { root: string } | { error: AppError } {
  if (typeof input !== "string" || input.length < 1 || input.length > 1024 || input.includes("\0")) {
    return { error: appError("INVALID_REQUEST", "Invalid workspace root.") };
  }
  let root = input;
  if (root === "~" || root.startsWith("~/")) {
    root = root === "~" ? os.homedir() : path.posix.join(os.homedir(), root.slice(2));
  }
  if (!root.startsWith("/")) return { error: appError("INVALID_REQUEST", "Workspace root must be an absolute POSIX path.") };
  return { root: path.posix.normalize(root) };
}

async function realpathOrNull(p: string): Promise<string | null> {
  return fs.realpath(p).catch(() => null);
}

async function resolveInside(root: string, relativePath: string): Promise<{ absolutePath: string } | { error: AppError }> {
  const v = validatePosixRelativePath(relativePath);
  if ("error" in v) return v;
  const abs = path.posix.join(root, v.relativePath);
  const realRoot = await realpathOrNull(root);
  const parts = path.posix.normalize(v.relativePath).split("/");
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    cursor = path.posix.join(cursor, part);
    try {
      const st = await fs.lstat(cursor);
      if (st.isSymbolicLink()) return { error: appError("OUTSIDE_ROOT", "Symlinked directories are not traversed.") };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") return { error: mapFsError(err as NodeJS.ErrnoException, "path") };
      break;
    }
    if (realRoot) {
      const realCursor = await realpathOrNull(cursor);
      if (realCursor) {
        const rel = path.posix.relative(realRoot, realCursor);
        if (rel.startsWith("..") || path.posix.isAbsolute(rel)) {
          return { error: appError("OUTSIDE_ROOT", "Path escapes the workspace.") };
        }
      }
    }
  }
  try {
    const st = await fs.lstat(abs);
    if (st.isSymbolicLink()) return { error: appError("OUTSIDE_ROOT", "Symlinked paths are not traversed.") };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") return { error: mapFsError(err as NodeJS.ErrnoException, "path") };
  }
  const realParent = await realpathOrNull(path.posix.dirname(abs));
  if (realRoot && realParent) {
    const rel = path.posix.relative(realRoot, realParent);
    if (rel.startsWith("..") || path.posix.isAbsolute(rel)) return { error: appError("OUTSIDE_ROOT", "Path escapes the workspace.") };
  }
  return { absolutePath: abs };
}

export async function assertDirectoryRoot(root: string): Promise<{ root: string } | { error: AppError }> {
  try {
    const st = await fs.stat(root);
    if (!st.isDirectory()) return { error: appError("NOT_FOUND", "Workspace directory not found.") };
    return { root };
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "workspace") };
  }
}

export async function listDirectory(root: string, relativePath: unknown): Promise<{ entries: DirectoryEntry[] } | { error: AppError }> {
  let abs = root;
  let rel = "";
  if (relativePath !== "" && relativePath !== undefined) {
    if (typeof relativePath !== "string") return { error: appError("INVALID_REQUEST", "Invalid directory request.") };
    const r = await resolveInside(root, relativePath);
    if ("error" in r) return r;
    abs = r.absolutePath;
    rel = path.posix.normalize(relativePath);
  }
  try {
    const st = await fs.stat(abs);
    if (!st.isDirectory()) return { error: appError("INVALID_REQUEST", "Not a directory.") };
    const dirents = await fs.readdir(abs, { withFileTypes: true });
    const entries = await Promise.all(dirents.map(async (d): Promise<DirectoryEntry> => {
      const childRel = rel === "" ? d.name : `${rel}/${d.name}`;
      let size = 0;
      let mtimeMs = 0;
      try {
        const childSt = await fs.lstat(path.posix.join(abs, d.name));
        size = childSt.size;
        mtimeMs = childSt.mtimeMs;
      } catch { /* best effort */ }
      const kind = d.isDirectory() ? "directory" : "file";
      return { name: d.name, relativePath: childRel, kind, fileClass: kind === "directory" ? "other" : classifyFile(d.name), size, mtimeMs };
    }));
    entries.sort((a, b) => (a.kind !== b.kind ? (a.kind === "directory" ? -1 : 1) : a.name.localeCompare(b.name)));
    return { entries };
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
  }
}

export async function createFile(root: string, relativePath: unknown, content: unknown = ""): Promise<{ revision: FileRevision } | { error: AppError }> {
  if (typeof relativePath !== "string" || typeof content !== "string") return { error: appError("INVALID_REQUEST", "Invalid file create request.") };
  const r = await resolveInside(root, relativePath);
  if ("error" in r) return r;
  const bytes = encodeUtf8(content, "lf", false, true);
  try {
    await fs.mkdir(path.posix.dirname(r.absolutePath), { recursive: true });
    await fs.writeFile(r.absolutePath, bytes, { flag: "wx" });
    const st = await fs.stat(r.absolutePath);
    return { revision: revisionOfBytes(bytes, st.mtimeMs) };
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "file") };
  }
}

export async function renamePath(root: string, oldPath: unknown, newPath: unknown, expected: "file" | "directory"): Promise<{ ok: true } | { error: AppError }> {
  if (typeof oldPath !== "string" || typeof newPath !== "string") return { error: appError("INVALID_REQUEST", "Invalid rename request.") };
  const oldResolved = await resolveInside(root, oldPath);
  if ("error" in oldResolved) return oldResolved;
  const newResolved = await resolveInside(root, newPath);
  if ("error" in newResolved) return newResolved;
  try {
    const st = await fs.stat(oldResolved.absolutePath);
    if (expected === "file" && st.isDirectory()) return { error: appError("INVALID_REQUEST", "Not a file. Use folder rename for directories.") };
    if (expected === "directory" && !st.isDirectory()) return { error: appError("INVALID_REQUEST", "Not a directory. Use file rename for files.") };
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, expected) };
  }
  try {
    await fs.access(newResolved.absolutePath);
    return { error: appError("ALREADY_EXISTS", "A file with that name already exists.") };
  } catch { /* target free */ }
  try {
    await fs.rename(oldResolved.absolutePath, newResolved.absolutePath);
    return { ok: true };
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, expected) };
  }
}

export async function deleteFile(root: string, relativePath: unknown): Promise<{ ok: true } | { error: AppError }> {
  if (typeof relativePath !== "string") return { error: appError("INVALID_REQUEST", "Invalid file delete request.") };
  const r = await resolveInside(root, relativePath);
  if ("error" in r) return r;
  try {
    const st = await fs.stat(r.absolutePath);
    if (st.isDirectory()) return { error: appError("INVALID_REQUEST", "Not a file. Use folder delete for directories.") };
    await fs.unlink(r.absolutePath);
    return { ok: true };
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "file") };
  }
}

export async function createDirectory(root: string, relativePath: unknown): Promise<{ ok: true } | { error: AppError }> {
  if (typeof relativePath !== "string") return { error: appError("INVALID_REQUEST", "Invalid directory request.") };
  const r = await resolveInside(root, relativePath);
  if ("error" in r) return r;
  try {
    await fs.mkdir(r.absolutePath, { recursive: true });
    const st = await fs.stat(r.absolutePath);
    if (!st.isDirectory()) return { error: appError("ALREADY_EXISTS", "A file with that name already exists.") };
    const realRoot = await realpathOrNull(root);
    const realTarget = await realpathOrNull(r.absolutePath);
    if (realRoot && realTarget) {
      const rel = path.posix.relative(realRoot, realTarget);
      if (rel.startsWith("..") || path.posix.isAbsolute(rel)) return { error: appError("OUTSIDE_ROOT", "Path escapes the workspace.") };
    }
    return { ok: true };
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
  }
}

export async function deleteDirectory(root: string, relativePath: unknown, recursive: unknown): Promise<{ ok: true } | { error: AppError }> {
  if (typeof relativePath !== "string" || (recursive !== undefined && typeof recursive !== "boolean")) {
    return { error: appError("INVALID_REQUEST", "Invalid directory request.") };
  }
  const r = await resolveInside(root, relativePath);
  if ("error" in r) return r;
  try {
    const st = await fs.stat(r.absolutePath);
    if (!st.isDirectory()) return { error: appError("INVALID_REQUEST", "Not a directory.") };
    if (recursive !== true) {
      const children = await fs.readdir(r.absolutePath);
      if (children.length > 0) return { error: appError("DIRECTORY_NOT_EMPTY", "Directory is not empty. Confirm recursive delete.") };
      await fs.rmdir(r.absolutePath);
    } else {
      await fs.rm(r.absolutePath, { recursive: true, force: false });
    }
    return { ok: true };
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
  }
}
