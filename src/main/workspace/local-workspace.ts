import { promises as fs } from "node:fs";
import path from "node:path";

/** Native workspace adapters (Windows/macOS/Linux local).
 * Path semantics follow the WORKSPACE kind (§21), never the host OS: `win32`
 * for `windows-local`, POSIX for `macos-local` / `linux-local`. Using win32
 * on Linux turns `join(root, rel)` into backslash paths that miss every
 * file — the classic "exists in the tree, NOT_FOUND on open" failure. */
import type { WorkspaceKind } from "../../shared/platform/types.js";

type PathModule = Pick<typeof path.win32, "join" | "normalize" | "dirname" | "relative" | "isAbsolute" | "sep">;

function pathModuleFor(kind: WorkspaceKind): PathModule {
  return kind === "windows-local" ? path.win32 : path.posix;
}
import { appError, mapFsError, type AppError } from "../../shared/errors.js";
import {
  decodeUtf8,
  detectNewline,
  encodeUtf8,
  revisionOfBytes,
  type FileRevision,
} from "./revisions.js";
import { validatePosixRelativePath, validateWindowsRelativePath } from "./path-security.js";

/** Kind-appropriate validation (§25): Windows reserved-name/character rules
 * apply to `windows-local` only and must never leak into macOS/Linux. */
function validateNativeRel(kind: WorkspaceKind, relativePath: string): { relativePath: string } | { error: AppError } {
  return kind === "windows-local"
    ? validateWindowsRelativePath(relativePath)
    : validatePosixRelativePath(relativePath);
}

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

/** Resolve a validated relative path beneath root; rejects symlink escapes.
 *
 * Junction/reparse-point note (Windows): `lstat` reports junctions as plain
 * directories, so an `isSymbolicLink` check alone misses them. Every existing
 * component is therefore ALSO verified through `realpath` containment against
 * the real root: junctions, symlinks, and mount points that resolve outside
 * the workspace are refused with OUTSIDE_ROOT using only Node-supported APIs.
 * Residual risk (documented, not hidden): a malicious local OS process racing
 * filesystem state between check and open (TOCTOU) cannot be fully defeated
 * from userland Node without `O_NOFOLLOW` dirfd discipline — see
 * `docs/audit/filesystem-audit.md`. Malicious renderer/path INPUT is fully
 * defended; a malicious local process racing the filesystem is not (MVP).
 */
export async function resolveInsideRoot(
  root: string,
  kind: WorkspaceKind,
  relativePath: string,
): Promise<{ absolutePath: string } | { error: AppError }> {
  const pm = pathModuleFor(kind);
  const abs = pm.isAbsolute(relativePath)
    ? relativePath
    : pm.join(root, relativePath);
  const realRoot = await realpathSubtle(root);
  // Walk each existing component: refuse symlinked directories AND any
  // component whose realpath escapes the real root (junction/reparse catch).
  const relParts = pm.normalize(relativePath).split(pm.sep);
  let cursor = root;
  for (const part of relParts.slice(0, -1)) {
    cursor = pm.join(cursor, part);
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
    if (realRoot) {
      const realCursor = await realpathSubtle(cursor);
      if (realCursor) {
        const rel = pm.relative(realRoot, realCursor);
        // `..` or absolute (different drive/mount) means the component —
        // possibly a junction or reparse point `lstat` could not see —
        // resolves outside the workspace.
        if (rel.startsWith("..") || pm.isAbsolute(rel)) {
          return { error: appError("OUTSIDE_ROOT", "Path escapes the workspace.") };
        }
      }
    }
  }
  // Refuse a symlinked final component: the target itself must not be a link
  // (parent directories are checked above; realpath containment below covers
  // links that resolve inside — a direct link is never followed).
  try {
    const st = await fs.lstat(abs);
    if (st.isSymbolicLink()) {
      return { error: appError("OUTSIDE_ROOT", "Symlinked paths are not traversed.") };
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      return { error: mapFsError(err as NodeJS.ErrnoException, "path") };
    }
  }
  const realTarget = await realpathSubtle(pm.dirname(abs));
  if (realRoot && realTarget) {
    const rel = pm.relative(realRoot, realTarget);
    if (rel.startsWith("..") || pm.isAbsolute(rel)) {
      return { error: appError("OUTSIDE_ROOT", "Path escapes the workspace.") };
    }
  }
  return { absolutePath: abs };
}

export async function listDirectory(
  root: string,
  kind: WorkspaceKind,
  relativePath: string,
): Promise<{ entries: import("../../shared/contracts/ipc.js").DirectoryEntry[] } | { error: AppError }> {
  const pm = pathModuleFor(kind);
  let rel = "";
  if (relativePath !== "") {
    const v = validateNativeRel(kind, relativePath);
    if ("error" in v) return v;
    rel = v.relativePath;
  }
  const abs = rel === "" ? root : pm.join(root, rel);
  let dirents;
  try {
    dirents = await fs.readdir(abs, { withFileTypes: true });
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
  }
  const entries = await Promise.all(
    dirents.map(async (d) => {
      const childRel = rel === "" ? d.name : pm.join(rel, d.name);
      let statSize = 0;
      let mtimeMs = 0;
      try {
        const st = await fs.lstat(pm.join(abs, d.name));
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
  kind: WorkspaceKind,
  relativePath: string,
): Promise<{ result: ReadResult } | { error: AppError }> {
  const v = validateNativeRel(kind, relativePath);
  if ("error" in v) return v;
  const r = await resolveInsideRoot(root, kind, v.relativePath);
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
  kind: WorkspaceKind,
  relativePath: string,
  content: string,
  expectedHash: string,
  newlineStyle: "lf" | "crlf",
  hadBom: boolean,
): Promise<{ revision: FileRevision } | { error: AppError }> {
  const v = validateNativeRel(kind, relativePath);
  if ("error" in v) return v;
  const r = await resolveInsideRoot(root, kind, v.relativePath);
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
  // Guarantee (P1-05, honest, no false CAS claim): the expected-hash check
  // and the atomic rename below are two separate steps. A change landing
  // BEFORE the check yields CONFLICT with the file untouched; a change
  // landing BETWEEN the check and the rename wins last-writer-wins — but
  // the replace itself is always an atomic rename, so the file is never
  // torn or truncated. Same guarantee as the helper `file.write`.
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

export async function renamePath(
  root: string,
  kind: WorkspaceKind,
  oldRelativePath: string,
  newRelativePath: string,
): Promise<{ ok: true } | { error: AppError }> {
  const vOld = validateNativeRel(kind, oldRelativePath);
  if ("error" in vOld) return vOld;
  const vNew = validateNativeRel(kind, newRelativePath);
  if ("error" in vNew) return vNew;
  const rOld = await resolveInsideRoot(root, kind, vOld.relativePath);
  if ("error" in rOld) return rOld;
  const rNew = await resolveInsideRoot(root, kind, vNew.relativePath);
  if ("error" in rNew) return rNew;
  try {
    await fs.access(rNew.absolutePath);
    return { error: appError("ALREADY_EXISTS", "A file with that name already exists.") };
  } catch {
    /* target free — proceed */
  }
  try {
    await fs.rename(rOld.absolutePath, rNew.absolutePath);
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "file") };
  }
  return { ok: true };
}

export async function createTextFile(
  root: string,
  kind: WorkspaceKind,
  relativePath: string,
  content = "",
): Promise<{ revision: FileRevision } | { error: AppError }> {
  const pm = pathModuleFor(kind);
  const v = validateNativeRel(kind, relativePath);
  if ("error" in v) return v;
  const r = await resolveInsideRoot(root, kind, v.relativePath);
  if ("error" in r) return r;
  const bytes = encodeUtf8(content, "lf", false, true);
  try {
    await fs.mkdir(pm.dirname(r.absolutePath), { recursive: true });
    await fs.writeFile(r.absolutePath, bytes, { flag: "wx" });
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "file") };
  }
  const stat = await fs.stat(r.absolutePath);
  return { revision: revisionOfBytes(bytes, stat.mtimeMs) };
}

/** Create a directory (parents created recursively). */
export async function createDirectory(
  root: string,
  kind: WorkspaceKind,
  relativePath: string,
): Promise<{ ok: true } | { error: AppError }> {
  const pm = pathModuleFor(kind);
  const v = validateNativeRel(kind, relativePath);
  if ("error" in v) return v;
  const r = await resolveInsideRoot(root, kind, v.relativePath);
  if ("error" in r) return r;
  try {
    await fs.mkdir(r.absolutePath, { recursive: true });
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
  }
  // Confirm we ended up with a directory (a file at this path is a conflict).
  try {
    const st = await fs.stat(r.absolutePath);
    if (!st.isDirectory()) {
      return { error: appError("ALREADY_EXISTS", "A file with that name already exists.") };
    }
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
  }
  // Realpath containment for newly created chains that pass through
  // pre-existing symlinked parents `mkdir -p` would otherwise follow.
  const realRoot = await realpathSubtle(root);
  const realTarget = await realpathSubtle(r.absolutePath);
  if (realRoot && realTarget) {
    const rel = pm.relative(realRoot, realTarget);
    if (rel.startsWith("..") || pm.isAbsolute(rel)) {
      return { error: appError("OUTSIDE_ROOT", "Path escapes the workspace.") };
    }
  }
  return { ok: true };
}

/** Delete a directory. Non-empty without `recursive` → DIRECTORY_NOT_EMPTY. */
export async function deleteDirectory(
  root: string,
  kind: WorkspaceKind,
  relativePath: string,
  recursive: boolean,
): Promise<{ ok: true } | { error: AppError }> {
  const v = validateNativeRel(kind, relativePath);
  if ("error" in v) return v;
  const r = await resolveInsideRoot(root, kind, v.relativePath);
  if ("error" in r) return r;
  let st;
  try {
    st = await fs.stat(r.absolutePath);
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
  }
  if (!st.isDirectory()) {
    return { error: appError("INVALID_REQUEST", "Not a directory.") };
  }
  if (!recursive) {
    let children;
    try {
      children = await fs.readdir(r.absolutePath);
    } catch (err) {
      return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
    }
    if (children.length > 0) {
      return { error: appError("DIRECTORY_NOT_EMPTY", "Directory is not empty. Confirm recursive delete.") };
    }
    try {
      await fs.rmdir(r.absolutePath);
    } catch (err) {
      return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
    }
    return { ok: true };
  }
  try {
    await fs.rm(r.absolutePath, { recursive: true, force: false });
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
  }
  return { ok: true };
}

/** Rename a directory; refuses moves that escape the root. */
export async function renameDirectory(
  root: string,
  kind: WorkspaceKind,
  oldRelativePath: string,
  newRelativePath: string,
): Promise<{ ok: true } | { error: AppError }> {
  const vOld = validateNativeRel(kind, oldRelativePath);
  if ("error" in vOld) return vOld;
  const vNew = validateNativeRel(kind, newRelativePath);
  if ("error" in vNew) return vNew;
  const rOld = await resolveInsideRoot(root, kind, vOld.relativePath);
  if ("error" in rOld) return rOld;
  const rNew = await resolveInsideRoot(root, kind, vNew.relativePath);
  if ("error" in rNew) return rNew;
  try {
    const st = await fs.stat(rOld.absolutePath);
    if (!st.isDirectory()) {
      return { error: appError("INVALID_REQUEST", "Not a directory.") };
    }
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
  }
  try {
    await fs.access(rNew.absolutePath);
    return { error: appError("ALREADY_EXISTS", "A file with that name already exists.") };
  } catch {
    /* target free — proceed */
  }
  try {
    await fs.rename(rOld.absolutePath, rNew.absolutePath);
  } catch (err) {
    return { error: mapFsError(err as NodeJS.ErrnoException, "directory") };
  }
  return { ok: true };
}
