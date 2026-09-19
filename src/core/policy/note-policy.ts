/**
 * Core note policy (ADR-0014, Gate A).
 *
 * Electron-free, host-free, pure policy shared by every transport
 * (IPC today, HTTP tomorrow) and every host filesystem (Windows/WSL/Linux).
 *
 * Dependency rule: `shared` <- `core` <- `main`/`server`.
 * This file imports ONLY `node:*` + `shared/*`. It must NEVER import
 * from `src/main/*`, `src/server/*`, `src/renderer/*`, or Electron.
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { appError, type AppError } from "../../shared/errors.js";
import type { WorkspaceKind } from "../../shared/platform/types.js";

export const MAX_PATH_CHARS = 1024;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type FileRevision = { hash: string; size: number; mtimeMs: number };

/** Validate a renderer/client-supplied relative path for Windows semantics. */
export function validateWindowsRelativePath(input: unknown): { relativePath: string } | { error: AppError } {
  if (typeof input !== "string") return { error: appError("INVALID_PATH", "Path must be a string.") };
  if (input.length === 0 || input.length > MAX_PATH_CHARS) {
    return { error: appError("INVALID_PATH", "Path has an invalid length.") };
  }
  if (input.includes("\0")) return { error: appError("INVALID_PATH", "Path contains NUL.") };
  if (/^[a-zA-Z]:/.test(input) || input.startsWith("\\\\") || input.startsWith("/") || input.startsWith("\\")) {
    return { error: appError("INVALID_PATH", "Absolute paths are not allowed.") };
  }
  const normalized = path.win32.normalize(input);
  if (normalized === "." || normalized === "") {
    return { error: appError("INVALID_PATH", "Empty path.") };
  }
  if (normalized.startsWith("..") || normalized.split(path.win32.sep).includes("..")) {
    return { error: appError("OUTSIDE_ROOT", "Path escapes the workspace.") };
  }
  // eslint-disable-next-line no-control-regex
  const bad = /[<>:"|?*\u0000-\u001f]/;
  for (const part of normalized.split(path.win32.sep)) {
    if (part === "" || part === "." || part === ".." || bad.test(part)) {
      return { error: appError("INVALID_PATH", `Invalid path component: ${part}`) };
    }
    if (part.endsWith(" ") || part.endsWith(".")) {
      return { error: appError("INVALID_PATH", `Invalid path component: ${part}`) };
    }
  }
  return { relativePath: normalized };
}

/** Validate a renderer/client-supplied relative path for POSIX semantics. */
export function validatePosixRelativePath(input: unknown): { relativePath: string } | { error: AppError } {
  if (typeof input !== "string") return { error: appError("INVALID_PATH", "Path must be a string.") };
  if (input.length === 0 || input.length > MAX_PATH_CHARS) {
    return { error: appError("INVALID_PATH", "Path has an invalid length.") };
  }
  if (input.includes("\0")) return { error: appError("INVALID_PATH", "Path contains NUL.") };
  if (input.startsWith("/") || input.includes("\\")) {
    return { error: appError("INVALID_PATH", "Absolute paths and backslashes are not allowed.") };
  }
  const normalized = path.posix.normalize(input);
  if (normalized === "." || normalized === "") {
    return { error: appError("INVALID_PATH", "Empty path.") };
  }
  if (normalized === ".." || normalized.startsWith("../") || normalized.split("/").includes("..")) {
    return { error: appError("OUTSIDE_ROOT", "Path escapes the workspace.") };
  }
  for (const part of normalized.split("/")) {
    if (part === "" || part === "." || part === "..") {
      return { error: appError("INVALID_PATH", "Invalid path component.") };
    }
  }
  return { relativePath: normalized };
}

export function validateWorkspaceId(input: unknown): { workspaceId: string } | { error: AppError } {
  if (typeof input !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(input)) {
    return { error: appError("INVALID_REQUEST", "Invalid workspace id.") };
  }
  return { workspaceId: input };
}

/** Kind-appropriate validation: Windows rules for `windows-local` only. */
export function validateNoteRelativePath(
  kind: WorkspaceKind,
  input: unknown,
): { relativePath: string } | { error: AppError } {
  return kind === "windows-local" ? validateWindowsRelativePath(input) : validatePosixRelativePath(input);
}

export function revisionOfBytes(bytes: Buffer, mtimeMs: number): FileRevision {
  return {
    hash: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
    mtimeMs,
  };
}

/** Detect newline style; returns counts too for future heuristics. */
export function detectNewline(content: string): { newlineStyle: "lf" | "crlf"; crlf: number; lf: number } {
  const crlf = (content.match(/\r\n/g) ?? []).length;
  const totalLf = (content.match(/\n/g) ?? []).length;
  const lf = totalLf - crlf;
  return { newlineStyle: crlf > lf ? "crlf" : "lf", crlf, lf };
}

/** Split UTF-8 bytes with BOM handling. Null when bytes are not supported UTF-8. */
export function decodeUtf8(bytes: Buffer): { text: string; hadBom: boolean } | null {
  let hadBom = false;
  let slice = bytes;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    hadBom = true;
    slice = bytes.subarray(3);
  }
  if (slice.includes(0)) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(slice);
    return { text, hadBom };
  } catch {
    return null;
  }
}

/** Encode text back to bytes, preserving BOM + newline style. */
export function encodeUtf8(text: string, newlineStyle: "lf" | "crlf", hadBom: boolean, newFile: boolean): Buffer {
  let out = text;
  if (newlineStyle === "crlf") {
    out = out.replace(/\r\n|\n/g, "\r\n");
  } else if (!newFile) {
    out = out.replace(/\r\n/g, "\n");
  }
  const body = Buffer.from(out, "utf8");
  if (hadBom) return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]);
  return body;
}

/** `expectedRevision` comparison — the single CONFLICT decision point. */
export function isRevisionCurrent(currentHash: string, expectedHash: string): boolean {
  return currentHash === expectedHash;
}
