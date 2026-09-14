import path from "node:path";
import { appError, type AppError } from "../../shared/errors.js";

const MAX_PATH_CHARS = 1024;

/** Validate a renderer-supplied relative path for Windows semantics. */
export function validateWindowsRelativePath(input: unknown): { relativePath: string } | { error: AppError } {
  if (typeof input !== "string") return { error: appError("INVALID_PATH", "Path must be a string.") };
  if (input.length === 0 || input.length > MAX_PATH_CHARS) {
    return { error: appError("INVALID_PATH", "Path has an invalid length.") };
  }
  if (input.includes("\0")) return { error: appError("INVALID_PATH", "Path contains NUL.") };
  // Reject absolute paths (drive, UNC, rooted) and forward-absolute.
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
  // Reject characters illegal on Windows filenames per component.
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

/** Validate a renderer-supplied relative path for POSIX (WSL) semantics. */
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
