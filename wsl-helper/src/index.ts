/** WSL helper entry: framed stdio protocol over stdout; diagnostics to stderr.
 * Never `console.log` to stdout — stdout carries ONLY length-prefixed frames. */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PROTOCOL_VERSION } from "../../src/shared/protocol-version.js";
import { filterCandidateUsers, parsePasswd } from "./users.js";

const MAX_FRAME = 16 * 1024 * 1024;

function log(level: string, component: string, message: string, metadata?: unknown): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, component, message, metadata });
  process.stderr.write(line + "\n");
}

function encodeFrame(payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

function respond(requestId: string, ok: boolean, resultOrError: unknown): void {
  const payload = ok
    ? { requestId, ok: true as const, result: resultOrError }
    : { requestId, ok: false as const, error: resultOrError };
  process.stdout.write(encodeFrame(payload));
}

type Session = { sessionId: string; root: string | null; generation: number };
const sessions = new Map<string, Session>();

function err(code: string, message: string): { code: string; message: string } {
  return { code, message };
}

/** Map Linux fs errno to the shared application error model (P1-04).
 * Mirrors main's `mapFsError` so WSL workspaces carry the same error
 * semantics as native workspaces. There is deliberately no privilege
 * escalation here: EACCES/EPERM surface as PERMISSION_DENIED and stay
 * that way — the helper never retries as another user. ENOTDIR/EISDIR
 * map to INVALID_REQUEST (native parity: "Not a directory."); the repo
 * has no NOT_A_DIRECTORY code and P1-04 adds none. */
function mapErrno(e: NodeJS.ErrnoException, what: string): { code: string; message: string } {
  switch (e?.code) {
    case "ENOENT":
      return err("NOT_FOUND", `${what} not found.`);
    case "EEXIST":
      return err("ALREADY_EXISTS", `${what} already exists.`);
    case "EACCES":
    case "EPERM":
    case "EROFS":
      return err("PERMISSION_DENIED", `Permission denied: ${what}.`);
    case "ENAMETOOLONG":
      return err("INVALID_PATH", `Path is too long: ${what}.`);
    case "ENOTEMPTY":
      return err("DIRECTORY_NOT_EMPTY", `Directory is not empty: ${what}.`);
    case "ENOTDIR":
    case "EISDIR":
      return err("INVALID_REQUEST", `Incompatible file type: ${what}.`);
    default:
      return err("INTERNAL_ERROR", `Could not complete operation on ${what}.`);
  }
}

/** Refuse a rename target that already exists (ALREADY_EXISTS); a missing
 * target (ENOENT) proceeds. Other fs failures map precisely. */
async function refuseOccupied(abs: string, what: string): Promise<void> {
  try {
    await fs.access(abs);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw mapErrno(e as NodeJS.ErrnoException, what);
  }
  throw err("ALREADY_EXISTS", "A file with that name already exists.");
}

function validatePosixRel(input: unknown): string | null {
  if (typeof input !== "string" || input.length === 0 || input.length > 1024) return null;
  if (input.includes("\0") || input.startsWith("/") || input.includes("\\")) return null;
  const n = path.posix.normalize(input);
  if (n === "." || n === "" || n === ".." || n.startsWith("../") || n.split("/").includes("..")) return null;
  return n;
}

async function resolveInside(root: string, rel: string): Promise<string | null> {
  const abs = path.posix.join(root, rel);
  // Refuse symlinked directory components via lstat walk.
  const parts = rel.split("/");
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    cursor = path.posix.join(cursor, part);
    try {
      const st = await fs.lstat(cursor);
      if (st.isSymbolicLink()) return null;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") break;
      // A component we cannot stat for permission reasons is a permission
      // failure, not an escape — stay precise instead of crying OUTSIDE_ROOT.
      throw mapErrno(e as NodeJS.ErrnoException, "path");
    }
  }
  // Refuse a symlinked final component outright — never follow it.
  try {
    const targetStat = await fs.lstat(abs);
    if (targetStat.isSymbolicLink()) return null;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw mapErrno(e as NodeJS.ErrnoException, "path");
  }
  // eslint-disable-next-line no-useless-assignment
  let realRoot: string | null = null;
  // eslint-disable-next-line no-useless-assignment
  let realParent: string | null = null;
  try {
    realRoot = await fs.realpath(root);
    realParent = await fs.realpath(path.posix.dirname(abs));
  } catch {
    return abs;
  }
  if (realRoot && realParent) {
    const relCheck = path.posix.relative(realRoot, realParent);
    if (relCheck.startsWith("..")) return null;
  }
  return abs;
}

function classify(name: string): string {
  const l = name.toLowerCase();
  if (l.endsWith(".md") || l.endsWith(".markdown")) return "markdown";
  if (l.endsWith(".txt")) return "text";
  if (/\.(png|jpe?g|webp|gif)$/.test(l)) return "image";
  return "other";
}

async function handle(operation: string, payload: unknown, sessionId: string): Promise<unknown> {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (operation === "hello") {
    const nonce = p["nonce"];
    return {
      protocolVersion: PROTOCOL_VERSION,
      helperVersion: process.env["HELPER_VERSION"] ?? "0.0.1",
      runtimeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      capabilities: [
        "workspace.open",
        "directory.list",
        "directory.create",
        "directory.rename",
        "directory.delete",
        "file.read",
        "file.write",
        "file.create",
        "file.rename",
        "file.delete",
        "users.list",
      ],
      processId: process.pid,
      nonce: typeof nonce === "string" ? nonce : "",
      execPath: process.execPath,
      uid: typeof process.getuid === "function" ? process.getuid() : -1,
      home: process.env["HOME"] ?? "",
    };
  }
  if (operation === "users.list") {
    // Interactive candidates from the account database (never /home/*).
    // Session-independent: runs before any workspace.open, as the user the
    // helper was spawned as (distro default without -u, selected user with -u).
    const minUidRaw = p["minUid"];
    const minUid = typeof minUidRaw === "number" && Number.isSafeInteger(minUidRaw) && minUidRaw >= 0 ? minUidRaw : 1000;
    const currentUid = typeof process.getuid === "function" ? process.getuid() : -1;
    let text: string;
    try {
      text = await fs.readFile("/etc/passwd", "utf8");
    } catch (e: unknown) {
      log("error", "users.list", "cannot read /etc/passwd", { sessionId, errno: (e as NodeJS.ErrnoException)?.code });
      throw err("INTERNAL_ERROR", "Could not read user accounts.");
    }
    return { users: filterCandidateUsers(parsePasswd(text), { minUid, currentUid }) };
  }
  if (operation === "workspace.open") {
    let root = p["root"];
    // `~` expands under the selected user only (the helper runs as that
    // user via `wsl -u`), never on Windows — main forwards it verbatim.
    if (typeof root === "string" && (root === "~" || root.startsWith("~/"))) {
      const home = process.env["HOME"];
      if (!home) {
        log("error", "workspace", "open rejected: no HOME for ~ expansion", { sessionId, root });
        throw err("INVALID_REQUEST", "Cannot resolve home directory.");
      }
      root = root === "~" ? home : path.posix.join(home, root.slice(2));
      log("info", "workspace", "expanded ~ to home", { sessionId, home });
    }
    log("info", "workspace", "open request", { sessionId, root });
    if (typeof root !== "string" || !root.startsWith("/")) {
      log("error", "workspace", "open rejected: root must be absolute POSIX", { sessionId, root });
      throw err("INVALID_REQUEST", "Invalid workspace root.");
    }
    const st = await fs.stat(root).catch((e: NodeJS.ErrnoException) => {
      log("error", "workspace", "open stat failed", { sessionId, root, errno: e?.code });
      return null;
    });
    if (!st || !st.isDirectory()) {
      log("error", "workspace", "open rejected: not a directory", { sessionId, root });
      throw err("NOT_FOUND", "Workspace directory not found.");
    }
    sessions.set(sessionId, { sessionId, root, generation: 1 });
    log("info", "workspace", "open ok", { sessionId, root });
    return { root };
  }
  const session = sessions.get(sessionId);
  if (!session?.root) {
    log("error", "workspace", "no root for session", { sessionId, operation, knownSessions: [...sessions.keys()] });
    throw err("INVALID_REQUEST", "No workspace open for this session.");
  }
  const root = session.root;

  if (operation === "workspace.close") {
    sessions.delete(sessionId);
    return null;
  }
  if (operation === "directory.list") {
    const rel = p["relativePath"] === "" || p["relativePath"] === undefined ? "" : validatePosixRel(p["relativePath"]);
    if (rel === null) throw err("INVALID_PATH", "Invalid directory path.");
    // Confined resolution first: listing through a linked directory is
    // refused exactly like reads (the helper keeps the symlink policy).
    const abs = rel === "" ? root : await resolveInside(root, rel);
    if (!abs) throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
    let listStat: import("node:fs").Stats;
    try {
      listStat = await fs.stat(abs);
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "directory");
    }
    if (!listStat.isDirectory()) throw err("INVALID_REQUEST", "Not a directory.");
    let dirents: import("node:fs").Dirent[];
    try {
      dirents = await fs.readdir(abs, { withFileTypes: true });
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "directory");
    }
    const entries = [];
    for (const d of dirents) {
      let size = 0;
      let mtimeMs = 0;
      try {
        const st = await fs.lstat(path.posix.join(abs, d.name));
        size = st.size;
        mtimeMs = st.mtimeMs;
      } catch { /* best effort */ }
      entries.push({
        name: d.name,
        relativePath: rel === "" ? d.name : `${rel}/${d.name}`,
        kind: d.isDirectory() ? "directory" : "file",
        fileClass: d.isDirectory() ? "other" : classify(d.name),
        size,
        mtimeMs,
      });
    }
    entries.sort((a, b) => (a.kind !== b.kind ? (a.kind === "directory" ? -1 : 1) : a.name.localeCompare(b.name)));
    return entries;
  }
    if (operation === "file.read") {
    const rawRel = p["relativePath"];
    const rel = validatePosixRel(rawRel);
    if (rel === null) {
      log("error", "file.read", "invalid relativePath", { sessionId, root, rawRel });
      throw err("INVALID_PATH", "Invalid file path.");
    }
    const abs = await resolveInside(root, rel);
    if (!abs) {
      log("error", "file.read", "resolveInside refused (symlink/escape)", { sessionId, root, rel });
      throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
    }
    log("info", "file.read", "request", { sessionId, root, rel, abs });
    let stat: import("node:fs").Stats;
    try {
      stat = await fs.stat(abs);
    } catch (e: unknown) {
      const ex = e as NodeJS.ErrnoException;
      log("error", "file.read", "stat failed", { sessionId, root, rel, abs, errno: ex?.code });
      throw mapErrno(ex, "file");
    }
    if (stat.isDirectory()) throw err("INVALID_REQUEST", "Not a file. Use folder operations for directories.");
    if (stat.size > 10 * 1024 * 1024) throw err("TOO_LARGE", "This file is too large to edit safely.");
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(abs);
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "file");
    }
    if (bytes.includes(0)) throw err("UNSUPPORTED_ENCODING", "Only UTF-8 text files are supported.");
    let hadBom = false;
    let slice = bytes;
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      hadBom = true;
      slice = bytes.subarray(3);
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(slice);
    } catch {
      throw err("UNSUPPORTED_ENCODING", "Only UTF-8 text files are supported.");
    }
    const crlf = (text.match(/\r\n/g) ?? []).length;
    const lf = (text.match(/\n/g) ?? []).length - crlf;
    return {
      content: text,
      revision: { hash: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, mtimeMs: stat.mtimeMs },
      newlineStyle: crlf > lf ? "crlf" : "lf",
      hadBom,
    };
  }
  if (operation === "file.write") {
    const rel = validatePosixRel(p["relativePath"]);
    if (rel === null) throw err("INVALID_PATH", "Invalid file path.");
    const content = p["content"];
    const expectedHash = p["expectedHash"];
    if (typeof content !== "string" || typeof expectedHash !== "string") {
      throw err("INVALID_REQUEST", "Invalid file write request.");
    }
    const abs = await resolveInside(root, rel);
    if (!abs) throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
    let current: Buffer;
    try {
      current = await fs.readFile(abs);
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "file");
    }
    if (createHash("sha256").update(current).digest("hex") !== expectedHash) {
      throw err("CONFLICT", "The file changed on disk. Reload before saving.");
    }
    const bytes = Buffer.from((content as string).replace(/\r\n|\n/g, p["newlineStyle"] === "crlf" ? "\r\n" : "\n"), "utf8");
    const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
    try {
      await fs.writeFile(tmp, bytes, { flag: "wx" });
      // Durability parity with the Windows path: flush before the atomic replace.
      const fh = await fs.open(tmp, "r+");
      try {
        await fh.sync();
      } finally {
        await fh.close();
      }
      await fs.rename(tmp, abs);
    } catch (e: unknown) {
      await fs.rm(tmp, { force: true });
      throw mapErrno(e as NodeJS.ErrnoException, "file");
    }
    const stat = await fs.stat(abs);
    const written = await fs.readFile(abs);
    return { hash: createHash("sha256").update(written).digest("hex"), size: written.length, mtimeMs: stat.mtimeMs };
  }
  if (operation === "file.create") {
    const rel = validatePosixRel(p["relativePath"]);
    if (rel === null) throw err("INVALID_PATH", "Invalid file path.");
    const abs = await resolveInside(root, rel);
    if (!abs) throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
    try {
      await fs.mkdir(path.posix.dirname(abs), { recursive: true });
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "directory");
    }
    try {
      await fs.writeFile(abs, "", { flag: "wx" });
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "file");
    }
    const stat = await fs.stat(abs);
    return { hash: createHash("sha256").update("").digest("hex"), size: 0, mtimeMs: stat.mtimeMs };
  }
  if (operation === "directory.create") {
    const rel = validatePosixRel(p["relativePath"]);
    if (rel === null) throw err("INVALID_PATH", "Invalid directory path.");
    const abs = await resolveInside(root, rel);
    if (!abs) throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
    try {
      await fs.mkdir(abs, { recursive: true });
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "directory");
    }
    let st: import("node:fs").Stats;
    try {
      st = await fs.stat(abs);
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "directory");
    }
    if (!st.isDirectory()) throw err("ALREADY_EXISTS", "A file with that name already exists.");
    // Realpath containment for chains passing through pre-existing links
    // that `mkdir -p` would otherwise follow (native parity).
    try {
      const realRoot = await fs.realpath(root);
      const realTarget = await fs.realpath(abs);
      if (path.posix.relative(realRoot, realTarget).startsWith("..")) {
        throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
      }
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "OUTSIDE_ROOT") throw e;
      /* realpath best effort — the lstat walk above already refused links */
    }
    return null;
  }
  if (operation === "directory.rename") {
    const oldRel = validatePosixRel(p["oldPath"]);
    const newRel = validatePosixRel(p["newPath"]);
    if (oldRel === null || newRel === null) throw err("INVALID_PATH", "Invalid directory path.");
    const oldAbs = await resolveInside(root, oldRel);
    const newAbs = await resolveInside(root, newRel);
    if (!oldAbs || !newAbs) throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
    let st: import("node:fs").Stats;
    try {
      st = await fs.stat(oldAbs);
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "directory");
    }
    if (!st.isDirectory()) throw err("INVALID_REQUEST", "Not a directory. Use file rename for files.");
    await refuseOccupied(newAbs, "directory");
    try {
      await fs.rename(oldAbs, newAbs);
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "directory");
    }
    return null;
  }
  if (operation === "directory.delete") {
    const rel = validatePosixRel(p["relativePath"]);
    if (rel === null) throw err("INVALID_PATH", "Invalid directory path.");
    const recursive = p["recursive"];
    if (recursive !== true && recursive !== false && recursive !== undefined) {
      throw err("INVALID_REQUEST", "Invalid directory delete request.");
    }
    const abs = await resolveInside(root, rel);
    if (!abs) throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
    let st: import("node:fs").Stats;
    try {
      st = await fs.stat(abs);
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "directory");
    }
    if (!st.isDirectory()) throw err("INVALID_REQUEST", "Not a directory. Use file delete for files.");
    if (recursive !== true) {
      // Native parity (P1-01): non-empty + recursive=false refuses — only
      // an explicit recursive delete (after the UI confirm path) removes.
      let children: string[];
      try {
        children = await fs.readdir(abs);
      } catch (e: unknown) {
        throw mapErrno(e as NodeJS.ErrnoException, "directory");
      }
      if (children.length > 0) {
        throw err("DIRECTORY_NOT_EMPTY", "Directory is not empty. Confirm recursive delete.");
      }
      try {
        await fs.rmdir(abs);
      } catch (e: unknown) {
        throw mapErrno(e as NodeJS.ErrnoException, "directory");
      }
      return null;
    }
    try {
      await fs.rm(abs, { recursive: true, force: false });
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "directory");
    }
    return null;
  }
  if (operation === "file.rename") {
    const oldRel = validatePosixRel(p["oldPath"]);
    const newRel = validatePosixRel(p["newPath"]);
    if (oldRel === null || newRel === null) throw err("INVALID_PATH", "Invalid file path.");
    const oldAbs = await resolveInside(root, oldRel);
    const newAbs = await resolveInside(root, newRel);
    if (!oldAbs || !newAbs) throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
    let st: import("node:fs").Stats;
    try {
      st = await fs.stat(oldAbs);
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "file");
    }
    if (st.isDirectory()) throw err("INVALID_REQUEST", "Not a file. Use folder rename for directories.");
    await refuseOccupied(newAbs, "file");
    try {
      await fs.rename(oldAbs, newAbs);
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "file");
    }
    return null;
  }
  if (operation === "file.delete") {
    // Permanent delete in P1: Linux offers no Recycle Bin equivalent here
    // and the ticket forbids mislabeling this as OS trash. The renderer
    // confirms explicitly ("Delete permanently?") before sending this op.
    const rel = validatePosixRel(p["relativePath"]);
    if (rel === null) throw err("INVALID_PATH", "Invalid file path.");
    const abs = await resolveInside(root, rel);
    if (!abs) throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
    let st: import("node:fs").Stats;
    try {
      st = await fs.stat(abs);
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "file");
    }
    if (st.isDirectory()) throw err("INVALID_REQUEST", "Not a file. Use folder delete for directories.");
    // unlink (never rm -r): directories can never pass through this op.
    try {
      await fs.unlink(abs);
    } catch (e: unknown) {
      throw mapErrno(e as NodeJS.ErrnoException, "file");
    }
    return null;
  }
  throw err("INVALID_REQUEST", `Unknown operation: ${operation}`);
}

// --- framed stdin loop ---
let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  void pump();
});

async function pump(): Promise<void> {
  for (;;) {
    if (buffer.length < 4) return;
    const length = buffer.readUInt32BE(0);
    if (length === 0 || length > MAX_FRAME) {
      log("error", "protocol", `invalid frame length ${length}`);
      process.exit(1);
    }
    if (buffer.length < 4 + length) return;
    const body = buffer.subarray(4, 4 + length);
    buffer = buffer.subarray(4 + length);
    // eslint-disable-next-line no-useless-assignment
    let msg: { requestId: string; sessionId: string; operation: string; payload: unknown } | null = null;
    try {
      msg = JSON.parse(body.toString("utf8"));
    } catch {
      log("error", "protocol", "invalid JSON frame");
      continue;
    }
    if (!msg || typeof msg.requestId !== "string" || typeof msg.operation !== "string") {
      log("error", "protocol", "malformed request");
      continue;
    }
    try {
      const result = await handle(msg.operation, msg.payload, msg.sessionId ?? "");
      respond(msg.requestId, true, result);
    } catch (e) {
      const error = e as { code?: string; message?: string };
      respond(msg.requestId, false, {
        code: typeof error.code === "string" ? error.code : "INTERNAL_ERROR",
        message: typeof error.message === "string" ? error.message : "Internal error.",
      });
    }
  }
}

log("info", "helper", `helper starting (protocol ${PROTOCOL_VERSION})`);
