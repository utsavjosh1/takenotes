import { promises as fs } from "node:fs";
import path from "node:path";

/** Windows workspace: always use win32 semantics, even when unit-tested on Linux. */
const win = path.win32;
import { appError, mapFsError, type AppError } from "../../shared/errors.js";
import {
  decodeUtf8,
  detectNewline,
  encodeUtf8,
  revisionOfBytes,
  type FileRevision,
} from "./revisions.js";
import { validateWindowsRelativePath } from "./path-security.js";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ReadResult = {
  content: string;
  revision: FileRevision;
  newlineStyle: "lf" | "crlf";
  hadBom: boolean;
};

function classifyFile(name: string): "markdown" | "text" | "image" | "other" {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".txt")) return "text";
  if (/\.(png|jpe?g|webp|gif)$/.test(lower)) return "image";
  return "other";
}

function realpathSubtle(p: string): Promise<string | null> {
  return fs.realpath(p).catch(() => null);
}

/** Resolve a validated relative path beneath root; rejects symlink escapes. */
export async function resolveInsideRoot(
  root: string,
  relativePath: string,
): Promise<{ absolutePath: string } | { error: AppError }> {
  const abs = path.win32.isAbsolute(relativePath)
    ? relativePath
    : win.join(root, relativePath);
  // Walk each existing component with lstat: refuse symlinked directories.
  const relParts = path.win32.normalize(relativePath).split(path.win32.sep);
  let cursor = root;
  for (const part of relParts.slice(0, -1)) {
    cursor = win.join(cursor, part);
    let st: import("node:fs").Stats | undefined;
    try {
      st = await fs.lstat(cursor);
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") break; // parent chain doesn't fully exist yet
      return { error: mapFsError(e, "path") };
    }
    if (st && st.isSymbolicLink()) {
      return { error: appError("OUTSIDE_ROOT", "Symlinked directories are not traversed.") };
    }
  }
  const realRoot = await realpathSubtle(root);
  const realTarget = await realpathSubtle(win.dirname(abs));
  if (realRoot && realTarget) {
    const rel = win.relative(realRoot, realTarget);
    if (rel.startsWith("..") || win.isAbsolute(rel)) {
      return { error: appError("OUTSIDE_ROOT", "Path escapes the workspace.") };
    }
  }
  return { absolutePath: abs };
}

export async function listDirectory(
  root: string,
  relativePath: string,
): Promise<{ entries: import("../../shared/contracts/ipc.js").DirectoryEntry[] } | { error: AppError }> {
  const v = validateWindowsRelativePath(relativePath === "" ? "." : relativePath);
  void v;
  const rel = relativePath === "" ? "" : relativePath;
  const abs = rel === "" ? root : win.join(root, rel);
  let dirents;
  try {
    dirents = await fs.readdir(abs, { withFileTypes: true });
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
  }
  const entries = await Promise.all(
    dirents.map(async (d) => {
      const childRel = rel === "" ? d.name : `${rel}\\${d.name}`;
      let statSize = 0;
      let mtimeMs = 0;
      try {
        const st = await fs.lstat(win.join(abs, d.name));
        statSize = st.size;
        mtimeMs = st.mtimeMs;
      } catch {
        /* best effort */
      }
      return {
        name: d.name,
        relativePath: childRel,
        kind: d.isDirectory() ? ("directory" as const) : ("file" as const),
        fileClass: d.isDirectory() ? ("other" as const) : classifyFile(d.name),
        size: statSize,
        mtimeMs,
      };
    }),
  );
  entries.sort((a, b) =>
    a.kind !== b.kind ? (a.kind === "directory" ? -1 : 1) : a.name.localeCompare(b.name),
  );
  return { entries };
}

export async function readTextFile(
  root: string,
  relativePath: string,
): Promise<{ result: ReadResult } | { error: AppError }> {
  const v = validateWindowsRelativePath(relativePath);
  if ("error" in v) return v;
  const r = await resolveInsideRoot(root, v.relativePath);
  if ("error" in r) return r;
  let bytes: Buffer;
  let stat;
  try {
    stat = await fs.stat(r.absolutePath);
    if (stat.size > MAX_FILE_BYTES) {
      return { error: appError("TOO_LARGE", "This file is too large to edit safely.") };
    }
    bytes = await fs.readFile(r.absolutePath);
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
      revision: revisionOfBytes(bytes, stat.mtimeMs),
      newlineStyle,
      hadBom: decoded.hadBom,
    },
  };
}

export async function writeTextFile(
  root: string,
  relativePath: string,
  content: string,
  expectedHash: string,
  newlineStyle: "lf" | "crlf",
  hadBom: boolean,
): Promise<{ revision: FileRevision } | { error: AppError }> {
  const v = validateWindowsRelativePath(relativePath);
  if ("error" in v) return v;
  const r = await resolveInsideRoot(root, v.relativePath);
  if ("error" in r) return r;
  let current: Buffer;
  try {
    current = await fs.readFile(r.absolutePath);
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "file") };
  }
  const currentHash = revisionOfBytes(current, 0).hash;
  if (currentHash !== expectedHash) {
    return { error: appError("CONFLICT", "The file changed on disk. Reload before saving.") };
  }
  const bytes = encodeUtf8(content, newlineStyle, hadBom, false);
  if (bytes.length > MAX_FILE_BYTES) {
    return { error: appError("TOO_LARGE", "This file is too large to edit safely.") };
  }
  const tmp = `${r.absolutePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(tmp, bytes, { flag: "wx" });
    const fh = await fs.open(tmp, "r+");
    try {
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fs.rename(tmp, r.absolutePath);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    return { error: mapFsError(err as NodeJS.ErrnoException, "file") };
  }
  const stat = await fs.stat(r.absolutePath);
  const written = await fs.readFile(r.absolutePath);
  return { revision: revisionOfBytes(written, stat.mtimeMs) };
}

export async function createTextFile(
  root: string,
  relativePath: string,
  content = "",
): Promise<{ revision: FileRevision } | { error: AppError }> {
  const v = validateWindowsRelativePath(relativePath);
  if ("error" in v) return v;
  const r = await resolveInsideRoot(root, v.relativePath);
  if ("error" in r) return r;
  const bytes = encodeUtf8(content, "lf", false, true);
  try {
    await fs.mkdir(win.dirname(r.absolutePath), { recursive: true });
    await fs.writeFile(r.absolutePath, bytes, { flag: "wx" });
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "file") };
  }
  const stat = await fs.stat(r.absolutePath);
  return { revision: revisionOfBytes(bytes, stat.mtimeMs) };
}
