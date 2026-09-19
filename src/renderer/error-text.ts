import type { ErrorCode } from "../shared/errors.js";

/** Distinct one-line headlines per error code (P1-04). A permission lockout
 * must never read as "not found": the headline carries the code's meaning
 * while the helper message keeps the precise detail. Pure function —
 * unit-tested in tests/renderer/error-text.test.ts. */
export function errorHeadline(code: ErrorCode | string): string {
  switch (code) {
    case "PERMISSION_DENIED":
      return "Permission denied";
    case "NOT_FOUND":
      return "Not found";
    case "ALREADY_EXISTS":
      return "Already exists";
    case "DIRECTORY_NOT_EMPTY":
      return "Folder is not empty";
    case "CONFLICT":
      return "Changed on disk";
    case "DISCONNECTED":
      return "Workspace unavailable";
    case "INVALID_PATH":
    case "OUTSIDE_ROOT":
    case "INVALID_REQUEST":
      return "Invalid path";
    case "TOO_LARGE":
    case "UNSUPPORTED_ENCODING":
      return "Can't open file";
    default:
      return "Something went wrong";
  }
}

/** `Headline — detail`, e.g. `Permission denied — Permission denied: file.` */
export function friendlyError(code: ErrorCode | string, message: string): string {
  return `${errorHeadline(code)} — ${message}`;
}
