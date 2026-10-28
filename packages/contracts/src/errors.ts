export type ErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "PERMISSION_DENIED"
  | "OUTSIDE_ROOT"
  | "INVALID_PATH"
  | "INVALID_REQUEST"
  | "CONFLICT"
  | "DIRECTORY_NOT_EMPTY"
  | "TOO_LARGE"
  | "UNSUPPORTED_ENCODING"
  | "UNSUPPORTED_ARCHITECTURE"
  | "DISCONNECTED"
  | "OFFLINE"
  | "VERIFY_FAILED"
  | "PROTOCOL_MISMATCH"
  | "CANCELLED"
  | "INTERNAL_ERROR";

/** One plain-word description per code, shared by every app so a failure reads
 * the same in the desktop app, the browser page and on mobile. `title` is the
 * short headline (toasts, banner lead); `cause` is one sentence with what to
 * do. Technical text never goes here: it belongs in a collapsed "Details". */
export const ERROR_WORDS: Record<ErrorCode, { title: string; cause: string }> = {
  NOT_FOUND: { title: "Not found", cause: "It may have been moved or deleted." },
  ALREADY_EXISTS: { title: "Already exists", cause: "Choose a different name." },
  PERMISSION_DENIED: { title: "Permission denied", cause: "This account or folder does not allow that." },
  OUTSIDE_ROOT: { title: "Invalid path", cause: "It points outside the workspace folder." },
  INVALID_PATH: { title: "Invalid path", cause: "Check the note path for typos." },
  INVALID_REQUEST: { title: "Invalid request", cause: "Check what you entered and try again." },
  CONFLICT: { title: "Changed on disk", cause: "Your edits are still here. Reload the latest version, then save again." },
  DIRECTORY_NOT_EMPTY: { title: "Folder is not empty", cause: "Move or delete what is inside it first." },
  TOO_LARGE: { title: "Can't open file", cause: "It is too large. Split it into smaller notes." },
  UNSUPPORTED_ENCODING: { title: "Can't open file", cause: "It is not saved as plain text." },
  UNSUPPORTED_ARCHITECTURE: { title: "Not supported here", cause: "The server does not run on this type of processor." },
  DISCONNECTED: { title: "Workspace unavailable", cause: "The workspace stopped responding." },
  OFFLINE: { title: "Workspace unavailable", cause: "Check that it is running and try again." },
  VERIFY_FAILED: { title: "Could not verify the download", cause: "The file did not match what was expected." },
  PROTOCOL_MISMATCH: { title: "Versions do not match", cause: "Update the app and the server to the same version." },
  CANCELLED: { title: "Cancelled", cause: "Nothing was changed." },
  INTERNAL_ERROR: { title: "Something went wrong", cause: "Nothing was lost. Try again." },
};

export type AppError = {
  code: ErrorCode;
  message: string;
  /** Optional machine-readable detail; never raw secrets. */
  detail?: string;
};

export function appError(code: ErrorCode, message: string, detail?: string): AppError {
  return detail === undefined ? { code, message } : { code, message, detail };
}

/** Map Node fs errors to structured codes without leaking raw messages to UI. */
export function mapFsError(err: NodeJS.ErrnoException, what: string): AppError {
  switch (err.code) {
    case "ENOENT":
      return appError("NOT_FOUND", `${what} not found.`);
    case "EEXIST":
      return appError("ALREADY_EXISTS", `${what} already exists.`);
    case "EACCES":
    case "EPERM":
    case "EROFS":
      return appError("PERMISSION_DENIED", `Permission denied: ${what}.`);
    case "ENAMETOOLONG":
      return appError("INVALID_PATH", `Path is too long: ${what}.`);
    case "ENOTEMPTY":
      return appError("DIRECTORY_NOT_EMPTY", `Directory is not empty: ${what}.`);
    default:
      return appError("INTERNAL_ERROR", `Could not complete operation on ${what}.`, err.code);
  }
}
