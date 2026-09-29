/**
 * Host filesystem port (ADR-0014, Gate A).
 *
 * Deliberately boring IO. No policy, no validation, no revision logic.
 * Confinement, encoding, and CONFLICT live in `core/policy` + `core/services`.
 * Implementations (Windows/Linux/WSL) differ only in how they touch the OS.
 *
 * Electron-free: `node:fs` lives in implementations under `src/main/*`,
 * never in this interface.
 */

export type HostFileStat = {
  size: number;
  mtimeMs: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
};

/** Minimal IO contract for the `note.read/update` slice. Extend only when a
 *  proven slice needs more — do not design the future filesystem API here. */
export interface HostFilesystem {
  readBytes(absolutePath: string): Promise<Buffer>;
  /** Atomic write: temp + fsync + rename. Must not partially overwrite. */
  writeBytesAtomic(absolutePath: string, bytes: Buffer): Promise<void>;
  stat(absolutePath: string): Promise<HostFileStat>;
  lstat(absolutePath: string): Promise<HostFileStat>;
  /** Null when the path does not exist (used for confinement walks). */
  realpath(absolutePath: string): Promise<string | null>;
}
