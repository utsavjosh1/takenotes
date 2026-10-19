/**
 * M0 — MemoryHostFilesystem.
 *
 * In-memory `HostFilesystem` adapter. Test seam + dev fallback.
 * Proves `CoreNoteService` on the `mobile-local` kind with zero native deps.
 */
import type { HostFilesystem, HostFileStat } from "@takenotes/core/ports/host-filesystem";
import type { DirectoryListing, ListedEntry } from "./listing.js";

export class MemoryHostFilesystem implements HostFilesystem, DirectoryListing {
  private readonly files = new Map<string, { bytes: Buffer; mtimeMs: number }>();
  private readonly dirs = new Set<string>();

  /** Seed helper for tests/dev (bypasses policy — policy lives in core). */
  seed(absolutePath: string, content: string | Buffer): void {
    const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    this.files.set(absolutePath, { bytes, mtimeMs: Date.now() });
    // Ancestor dirs exist implicitly (sandbox walk never meets a symlink).
    let cursor = absolutePath.slice(0, absolutePath.lastIndexOf("/"));
    while (cursor) {
      this.dirs.add(cursor);
      const parent = cursor.slice(0, cursor.lastIndexOf("/"));
      if (parent === cursor) break;
      cursor = parent;
    }
  }

  /** Explicit empty dir (seed covers non-empty ones). */
  mkdir(absolutePath: string): void {
    this.dirs.add(absolutePath);
  }

  async ensureDirectory(absolutePath: string): Promise<void> {
    let cursor = absolutePath;
    while (cursor) {
      this.dirs.add(cursor);
      const parent = cursor.slice(0, cursor.lastIndexOf("/"));
      if (!parent || parent === cursor) break;
      cursor = parent;
    }
  }

  async listDirectory(absolutePath: string): Promise<ListedEntry[]> {
    const prefix = absolutePath === "/" ? "/" : `${absolutePath}/`;
    const kids = new Map<string, ListedEntry>();
    const take = (abs: string, isDirectory: boolean, mtimeMs: number, size: number) => {
      if (!abs.startsWith(prefix)) return;
      const rest = abs.slice(prefix.length);
      if (!rest || rest.includes("/")) return;
      const existing = kids.get(rest);
      // A dir entry wins over nothing; a file never overwrites a dir.
      if (!existing || (isDirectory && !existing.isDirectory)) {
        kids.set(rest, { name: rest, isDirectory, mtimeMs, size });
      }
    };
    for (const [abs, f] of this.files) take(abs, false, f.mtimeMs, f.bytes.length);
    for (const abs of this.dirs) {
      if (abs === absolutePath) continue;
      take(abs, true, Date.now(), 0);
    }
    return [...kids.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async readBytes(absolutePath: string): Promise<Buffer> {
    const f = this.files.get(absolutePath);
    if (!f) {
      const err = new Error(`ENOENT: ${absolutePath}`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    return Buffer.from(f.bytes);
  }

  async writeBytesAtomic(absolutePath: string, bytes: Buffer): Promise<void> {
    // In-memory: single assignment is already atomic. On device the Expo
    // adapter does tmp-file + rename (no fsync — documented caveat there).
    this.files.set(absolutePath, { bytes: Buffer.from(bytes), mtimeMs: Date.now() });
  }

  async stat(absolutePath: string): Promise<HostFileStat> {
    const f = this.files.get(absolutePath);
    if (f) {
      return { size: f.bytes.length, mtimeMs: f.mtimeMs, isDirectory: false, isFile: true, isSymlink: false };
    }
    if (this.dirs.has(absolutePath)) {
      return { size: 0, mtimeMs: Date.now(), isDirectory: true, isFile: false, isSymlink: false };
    }
    const prefix = `${absolutePath}/`;
    for (const abs of this.files.keys()) {
      if (abs.startsWith(prefix)) {
        return { size: 0, mtimeMs: Date.now(), isDirectory: true, isFile: false, isSymlink: false };
      }
    }
    const err = new Error(`ENOENT: ${absolutePath}`) as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  }

  async lstat(absolutePath: string): Promise<HostFileStat> {
    return this.stat(absolutePath);
  }

  async realpath(absolutePath: string): Promise<string | null> {
    if (this.files.has(absolutePath) || this.dirs.has(absolutePath)) return absolutePath;
    return null;
  }
}
