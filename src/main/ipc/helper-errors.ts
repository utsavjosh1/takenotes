import type { AppError } from "../../shared/errors.js";

/** Preserve structured helper errors (NOT_FOUND, PERMISSION_DENIED,
 * DIRECTORY_NOT_EMPTY, …) across the IPC boundary; unexpected failures
 * become INTERNAL_ERROR. Single chokepoint for every WSL IPC handler —
 * unit-tested in tests/ipc/helper-errors.test.ts (P1-04). */
export function toHelperError(err: unknown): AppError {
  if (err && typeof err === "object" && typeof (err as { code?: unknown }).code === "string") {
    const e = err as AppError;
    return e.detail === undefined ? { code: e.code, message: e.message } : { code: e.code, message: e.message, detail: e.detail };
  }
  return { code: "INTERNAL_ERROR", message: "WSL operation failed.", detail: String(err) };
}
