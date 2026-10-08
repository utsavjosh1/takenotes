import type { ErrorCode } from "@takenotes/contracts/errors";

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

/** Context for WSL path-error hints (7c): which operation failed and as
 * whom/where. Everything is optional — hints degrade to generic wording
 * when context is absent, never to a wrong specific. */
export type WslErrorContext = {
  operation?: "open" | "connect" | "list" | "request";
  distro?: string;
  linuxUser?: string;
  path?: string;
};

/** Friendly next-step hint for a WSL failure, or null when there is nothing
 * specific to say. Pure — unit-tested in tests/renderer/wsl-error-hint.test.ts.
 *
 * Naming decision (7c, roadmap Post-MVP gate): the wire codes stay canonical
 * (native parity, contract-stable) — the roadmap's `PATH_NOT_FOUND`,
 * `NOT_A_DIRECTORY`, `CONNECTION_FAILED`, `DISTRO_NOT_RUNNING`, and
 * `HELPER_FAILED` are UI-facing synonyms documented per branch below, not
 * second wire codes. No silent rename, no contract churn. */
export function wslErrorHint(code: ErrorCode | string, ctx: WslErrorContext = {}): string | null {
  const who = ctx.linuxUser ? ` as ${ctx.linuxUser}` : "";
  const where = ctx.distro ? ` on ${ctx.distro}` : "";
  switch (code) {
    // Roadmap PATH_NOT_FOUND: the folder itself is missing.
    case "NOT_FOUND":
      if (ctx.operation === "open") {
        return `Check the folder path${where} — Linux paths are case-sensitive. Create the folder first, then connect.`;
      }
      return "It may have been moved, renamed, or deleted outside the app.";
    // Roadmap NOT_A_DIRECTORY: a file was picked where a folder belongs.
    case "INVALID_REQUEST":
      if (ctx.operation === "open") {
        return `That path${where} isn't a folder. Pick a directory, not a file.`;
      }
      return null;
    case "PERMISSION_DENIED":
      // 700-home separation rides on OS enforcement (the helper runs as the
      // selected user, never escalates) — say so, and point at the fix.
      return `takenotes works${who} with that user's own permissions and never escalates. If the folder belongs to another Linux user (for example a private 700 home directory), connect${where} as that user instead.`;
    // Roadmap CONNECTION_FAILED / HELPER_FAILED / DISTRO_NOT_RUNNING:
    // one DISCONNECTED code, phased by when it failed.
    case "DISCONNECTED":
      if (ctx.operation === "connect" || ctx.operation === "open") {
        return `The helper didn't start${where}. A stopped distribution starts on connect — that prompt is expected. Otherwise check WSL is installed and the distribution still exists.`;
      }
      return "The connection dropped. Reconnect the workspace and retry.";
    case "OUTSIDE_ROOT":
      return "That path escapes the workspace. Stay inside the opened folder.";
    default:
      return null;
  }
}

/** `Headline — detail. Hint.` for WSL failures; identical to `friendlyError`
 * when no hint applies. The dialog/status surfaces render this string
 * directly — code stays machine-readable at the call site. */
export function describeWslError(code: ErrorCode | string, message: string, ctx: WslErrorContext = {}): string {
  const hint = wslErrorHint(code, ctx);
  return hint ? `${friendlyError(code, message)} ${hint}` : friendlyError(code, message);
}
