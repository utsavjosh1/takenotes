/** WSL helper entry: framed stdio protocol over stdout; diagnostics to stderr.
 * Never `console.log` to stdout — stdout carries ONLY length-prefixed frames. */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PROTOCOL_VERSION } from "../../src/shared/protocol-version.js";

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
      return null;
    }
  }
  // Refuse a symlinked final component outright — never follow it.
  try {
    const targetStat = await fs.lstat(abs);
    if (targetStat.isSymbolicLink()) return null;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") return null;
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
      capabilities: ["workspace.open", "directory.list", "file.read", "file.write", "file.create"],
      processId: process.pid,
      nonce: typeof nonce === "string" ? nonce : "",
      execPath: process.execPath,
      uid: typeof process.getuid === "function" ? process.getuid() : -1,
      home: process.env["HOME"] ?? "",
    };
  }
  if (operation === "workspace.open") {
    const root = p["root"];
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
    const abs = rel === "" ? root : path.posix.join(root, rel);
    const dirents = await fs.readdir(abs, { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
      throw e.code === "ENOENT" ? err("NOT_FOUND", "Directory not found.") : err("INTERNAL_ERROR", "Cannot list directory.");
    });
    const entries = [];
    for (const d of dirents as import("node:fs").Dirent[]) {
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
    const stat = await fs.stat(abs).catch((e: NodeJS.ErrnoException) => {
      log("error", "file.read", "stat failed → NOT_FOUND", { sessionId, root, rel, abs, errno: e?.code });
      return null;
    });
    if (!stat) throw err("NOT_FOUND", "File not found.");
    if (stat.size > 10 * 1024 * 1024) throw err("TOO_LARGE", "This file is too large to edit safely.");
    const bytes = await fs.readFile(abs);
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
    const content = p["content"];
    const expectedHash = p["expectedHash"];
    if (rel === null || typeof content !== "string" || typeof expectedHash !== "string") {
      throw err("INVALID_REQUEST", "Invalid file write request.");
    }
    const abs = await resolveInside(root, rel);
    if (!abs) throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
    const current = await fs.readFile(abs).catch(() => null);
    if (!current) throw err("NOT_FOUND", "File not found.");
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
    } catch (e) {
      await fs.rm(tmp, { force: true });
      throw e;
    }
    const stat = await fs.stat(abs);
    const written = await fs.readFile(abs);
    return { hash: createHash("sha256").update(written).digest("hex"), size: written.length, mtimeMs: stat.mtimeMs };
  }
  if (operation === "file.create") {
    const rel = validatePosixRel(p["relativePath"]);
    if (rel === null) throw err("INVALID_REQUEST", "Invalid file create request.");
    const abs = await resolveInside(root, rel);
    if (!abs) throw err("OUTSIDE_ROOT", "Path escapes the workspace.");
    await fs.mkdir(path.posix.dirname(abs), { recursive: true });
    try {
      await fs.writeFile(abs, "", { flag: "wx" });
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      throw code === "EEXIST" ? err("ALREADY_EXISTS", "File already exists.") : err("INTERNAL_ERROR", "Cannot create file.");
    }
    const stat = await fs.stat(abs);
    return { hash: createHash("sha256").update("").digest("hex"), size: 0, mtimeMs: stat.mtimeMs };
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
