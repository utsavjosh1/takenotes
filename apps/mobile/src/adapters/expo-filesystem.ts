/**
 * M0 — ExpoFileAdapter (S1).
 *
 * `HostFilesystem` over an app-sandbox directory via injected ops.
 *
 * codebase-design: "Accept dependencies, don't create them." This file takes
 * a minimal `ExpoFsOps` port instead of statically importing `expo-file-system`,
 * so:
 *  - `tsc` + logic tests run with zero native deps (no lockfile expansion yet),
 *  - the real binding (`expo-binding.ts`) is ~30 lines and the only place
 *    that ever touches the Expo API,
 *  - tests inject a memory/op fake through the same seam callers use.
 *
 * Contract notes (interface caveats callers must know):
 *  - Atomic write = write tmp + rename. No fsync on mobile (OS doesn't expose
 *    it) — crash-safe for V1 note scale, not a durability promise for bulk sync.
 *  - Sandbox has no symlinks: `lstat().isSymlink` is always false (honest
 *    stub, not fake data). Confinement still enforced by `CoreNoteService`.
 *  - Paths are POSIX-only. Windows reserved-name rules never apply here.
 */

import type { HostFilesystem, HostFileStat } from "@takenotes/core/ports/host-filesystem";
import type { DirectoryListing, ListedEntry } from "./listing.js";

/** Minimal surface this adapter needs from the Expo FS API. */
export type ExpoFsOps = {
  readBytes: (absolutePath: string) => Promise<Uint8Array>;
  /** Write full contents (no append). Adapter handles tmp+rename. */
  writeBytes: (absolutePath: string, bytes: Uint8Array) => Promise<void>;
  move: (fromAbsolutePath: string, toAbsolutePath: string) => Promise<void>;
  deleteSilent: (absolutePath: string) => Promise<void>;
  stat: (absolutePath: string) => Promise<{ size: number; mtimeMs: number; isDirectory: boolean }>;
  exists: (absolutePath: string) => Promise<boolean>;
  readDir: (absolutePath: string) => Promise<Array<{ name: string; isDirectory: boolean; mtimeMs: number; size: number }>>;
  /** Recursive mkdir, mirroring `FileSystem.makeDirectoryAsync({ intermediates: true })`. */
  mkdir: (absolutePath: string) => Promise<void>;
};

function toStat(s: { size: number; mtimeMs: number; isDirectory: boolean }): HostFileStat {
  return { size: s.size, mtimeMs: s.mtimeMs, isDirectory: s.isDirectory, isFile: !s.isDirectory, isSymlink: false };
}

export class ExpoFileAdapter implements HostFilesystem, DirectoryListing {
  constructor(private readonly ops: ExpoFsOps) {}

  async readBytes(absolutePath: string): Promise<Buffer> {
    try {
      return Buffer.from(await this.ops.readBytes(absolutePath));
    } catch (err) {
      throw toEnoent(absolutePath, err);
    }
  }

  async writeBytesAtomic(absolutePath: string, bytes: Buffer): Promise<void> {
    // tmp + rename: readers never observe a partial write. No fsync on
    // mobile — see module doc. Tmp name is unique per call, never reused.
    const tmp = `${absolutePath}.tmp-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    try {
      await this.ops.writeBytes(tmp, bytes);
      await this.ops.move(tmp, absolutePath);
    } catch (err) {
      await this.ops.deleteSilent(tmp);
      throw err;
    }
  }

  async stat(absolutePath: string): Promise<HostFileStat> {
    try {
      return toStat(await this.ops.stat(absolutePath));
    } catch (err) {
      throw toEnoent(absolutePath, err);
    }
  }

  async lstat(absolutePath: string): Promise<HostFileStat> {
    // Sandbox: no symlinks. Same stat, isSymlink always false.
    return this.stat(absolutePath);
  }

  async listDirectory(absolutePath: string): Promise<ListedEntry[]> {
    try {
      const rows = await this.ops.readDir(absolutePath);
      return rows.map((r) => ({ name: r.name, isDirectory: r.isDirectory, mtimeMs: r.mtimeMs, size: r.size }));
    } catch (err) {
      throw toEnoent(absolutePath, err);
    }
  }

  async ensureDirectory(absolutePath: string): Promise<void> {
    await this.ops.mkdir(absolutePath);
  }

  async realpath(absolutePath: string): Promise<string | null> {
    return (await this.ops.exists(absolutePath)) ? absolutePath : null;
  }
}

function toEnoent(absolutePath: string, err: unknown): unknown {
  if (err !== null && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "ENOENT") {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/not (found|exist)|ENOENT|no such file/i.test(message)) {
    const e = new Error(`ENOENT: ${absolutePath}`) as NodeJS.ErrnoException;
    e.code = "ENOENT";
    e.cause = err;
    return e;
  }
  return err;
}
