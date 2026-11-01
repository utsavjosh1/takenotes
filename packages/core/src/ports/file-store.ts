/**
 * FileStore: the single seam through which note files are read and written.
 *
 * Disk implementation: `apps/desktop/src/main/services/file-store.ts` (wraps
 * NoteService, so WSL, trash vs permanent delete and atomic writes stay in one
 * place). `MemoryFileStore` below is the in-memory twin used by tests.
 *
 * `rev` is a content hash. `write` fails with CONFLICT when `expectedRev`
 * differs from what is currently stored; callers surface that as a conflict
 * and never overwrite.
 */
import { createHash } from "node:crypto";

export type FileStoreErrorCode = "CONFLICT" | "OFFLINE" | "EACCES" | "ENOENT" | "EEXIST";

export class FileStoreError extends Error {
  constructor(
    readonly code: FileStoreErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "FileStoreError";
  }
}

export type FileRead = { body: string; rev: string; mtime: number; created: number };

export type FileChange = { workspace: string; path: string; kind: "changed" | "added" | "removed" };

export interface FileStore {
  list(workspace: string): Promise<string[]>;
  read(workspace: string, path: string): Promise<FileRead>;
  /** `expectedRev` is required for existing files; omit it only to create. */
  write(workspace: string, path: string, body: string, opts?: { expectedRev?: string }): Promise<{ rev: string }>;
  remove(workspace: string, path: string, mode: "trash" | "permanent"): Promise<void>;
  rename(workspace: string, from: string, to: string): Promise<void>;
  /** Reports changes made outside this store. Returns an unsubscribe function. */
  watch(workspace: string, listener: (change: FileChange) => void): () => void;
}

export function contentRev(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

type Entry = { body: string; mtime: number; created: number };

export class MemoryFileStore implements FileStore {
  private readonly files = new Map<string, Map<string, Entry>>();
  private readonly listeners = new Map<string, Set<(change: FileChange) => void>>();
  /** Test knobs. */
  offline = false;
  readOnlyPrefixes: string[] = [];
  readonly trashed: Array<{ workspace: string; path: string; body: string }> = [];

  constructor(private readonly now: () => number = Date.now) {}

  seed(workspace: string, files: Record<string, string>): void {
    for (const [path, body] of Object.entries(files)) this.ws(workspace).set(path, { body, mtime: this.now(), created: this.now() });
  }

  /** Simulates another program editing the file; notifies watchers. */
  externalWrite(workspace: string, path: string, body: string): void {
    const ws = this.ws(workspace);
    const prev = ws.get(path);
    ws.set(path, { body, mtime: this.now(), created: prev?.created ?? this.now() });
    this.emit({ workspace, path, kind: prev ? "changed" : "added" });
  }

  externalRemove(workspace: string, path: string): void {
    this.ws(workspace).delete(path);
    this.emit({ workspace, path, kind: "removed" });
  }

  async list(workspace: string): Promise<string[]> {
    this.assertOnline();
    return [...this.ws(workspace).keys()].sort();
  }

  async read(workspace: string, path: string): Promise<FileRead> {
    this.assertOnline();
    const e = this.ws(workspace).get(path);
    if (!e) throw new FileStoreError("ENOENT", `No such file: ${path}`);
    return { body: e.body, rev: contentRev(e.body), mtime: e.mtime, created: e.created };
  }

  async write(workspace: string, path: string, body: string, opts: { expectedRev?: string } = {}): Promise<{ rev: string }> {
    this.assertOnline();
    if (this.readOnlyPrefixes.some((p) => path.startsWith(p))) throw new FileStoreError("EACCES", `Read-only: ${path}`);
    const ws = this.ws(workspace);
    const prev = ws.get(path);
    if (prev) {
      if (opts.expectedRev === undefined || opts.expectedRev !== contentRev(prev.body)) {
        throw new FileStoreError("CONFLICT", `${path} changed since it was read.`);
      }
    } else if (opts.expectedRev !== undefined) {
      throw new FileStoreError("ENOENT", `No such file: ${path}`);
    }
    ws.set(path, { body, mtime: this.now(), created: prev?.created ?? this.now() });
    return { rev: contentRev(body) };
  }

  async remove(workspace: string, path: string, mode: "trash" | "permanent"): Promise<void> {
    this.assertOnline();
    const ws = this.ws(workspace);
    const e = ws.get(path);
    if (!e) throw new FileStoreError("ENOENT", `No such file: ${path}`);
    if (this.readOnlyPrefixes.some((p) => path.startsWith(p))) throw new FileStoreError("EACCES", `Read-only: ${path}`);
    if (mode === "trash") this.trashed.push({ workspace, path, body: e.body });
    ws.delete(path);
  }

  async rename(workspace: string, from: string, to: string): Promise<void> {
    this.assertOnline();
    const ws = this.ws(workspace);
    const e = ws.get(from);
    if (!e) throw new FileStoreError("ENOENT", `No such file: ${from}`);
    if (ws.has(to)) throw new FileStoreError("EEXIST", `${to} already exists.`);
    ws.delete(from);
    ws.set(to, e);
  }

  watch(workspace: string, listener: (change: FileChange) => void): () => void {
    const set = this.listeners.get(workspace) ?? new Set();
    set.add(listener);
    this.listeners.set(workspace, set);
    return () => set.delete(listener);
  }

  private emit(change: FileChange): void {
    for (const l of this.listeners.get(change.workspace) ?? []) l(change);
  }

  private ws(workspace: string): Map<string, Entry> {
    let m = this.files.get(workspace);
    if (!m) this.files.set(workspace, (m = new Map()));
    return m;
  }

  private assertOnline(): void {
    if (this.offline) throw new FileStoreError("OFFLINE", "The connection to this workspace is down.");
  }
}
