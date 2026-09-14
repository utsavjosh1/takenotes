export type ErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "PERMISSION_DENIED"
  | "OUTSIDE_ROOT"
  | "INVALID_PATH"
  | "INVALID_REQUEST"
  | "CONFLICT"
  | "TOO_LARGE"
  | "UNSUPPORTED_ENCODING"
  | "UNSUPPORTED_ARCHITECTURE"
  | "DISCONNECTED"
  | "PROTOCOL_MISMATCH"
  | "CANCELLED"
  | "INTERNAL_ERROR";

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
    default:
      return appError("INTERNAL_ERROR", `Could not complete operation on ${what}.`, err.code);
  }
}
