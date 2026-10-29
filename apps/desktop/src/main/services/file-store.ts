import { FileStoreError, type FileChange, type FileRead, type FileStore, type FileStoreErrorCode } from "@takenotes/core/ports/file-store";
import type { AppError } from "@takenotes/contracts/errors";
import type { NoteService } from "./note-service.js";

const CODE_MAP: Partial<Record<AppError["code"], FileStoreErrorCode>> = {
  CONFLICT: "CONFLICT",
  OFFLINE: "OFFLINE",
  DISCONNECTED: "OFFLINE",
  PERMISSION_DENIED: "EACCES",
  NOT_FOUND: "ENOENT",
  ALREADY_EXISTS: "EEXIST",
};

function fail(e: AppError): never {
  throw new FileStoreError(CODE_MAP[e.code] ?? "EACCES", e.message, e.detail ?? e.code);
}

/** Disk-backed FileStore over NoteService (native folders and WSL). `workspace` is the workspace id. */
export class NoteServiceFileStore implements FileStore {
  private readonly styles = new Map<string, { newlineStyle: "lf" | "crlf"; hadBom: boolean }>();
  private readonly subscribers = new Map<string, Set<(c: FileChange) => void>>();

  constructor(private readonly notes: NoteService) {}

  async list(workspace: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      const r = await this.notes.listTree(workspace, dir);
      if ("error" in r) fail(r.error);
      for (const e of r.entries) {
        if (e.kind === "directory") await walk(e.relativePath);
        else out.push(e.relativePath);
      }
    };
    await walk("");
    return out.sort();
  }

  async read(workspace: string, path: string): Promise<FileRead> {
    const r = await this.notes.readFile(workspace, path);
    if ("error" in r) fail(r.error);
    const { content, revision, newlineStyle, hadBom } = r.result;
    this.styles.set(`${workspace}\0${path}`, { newlineStyle, hadBom });
    // The platform exposes no birth time; mtime stands in for `created`.
    return { body: content, rev: revision.hash, mtime: revision.mtimeMs, created: revision.mtimeMs };
  }

  async write(workspace: string, path: string, body: string, opts: { expectedRev?: string } = {}): Promise<{ rev: string }> {
    if (opts.expectedRev === undefined) {
      const r = await this.notes.createFile(workspace, path, body);
      if ("error" in r) fail(r.error);
      return { rev: r.revision.hash };
    }
    const style = this.styles.get(`${workspace}\0${path}`) ?? { newlineStyle: "lf" as const, hadBom: false };
    const r = await this.notes.writeFile(workspace, path, body, opts.expectedRev, style.newlineStyle, style.hadBom);
    if ("error" in r) fail(r.error);
    return { rev: r.revision.hash };
  }

  async remove(workspace: string, path: string, _mode: "trash" | "permanent"): Promise<void> {
    // NoteService decides by workspace kind: system trash for local folders,
    // permanent for WSL. The UI confirms permanence before calling.
    const r = await this.notes.trashPath(workspace, path);
    if ("error" in r) fail(r.error);
  }

  async rename(workspace: string, from: string, to: string): Promise<void> {
    const r = await this.notes.renamePath(workspace, from, to);
    if ("error" in r) fail(r.error);
  }

  watch(workspace: string, listener: (c: FileChange) => void): () => void {
    const set = this.subscribers.get(workspace) ?? new Set();
    set.add(listener);
    this.subscribers.set(workspace, set);
    return () => set.delete(listener);
  }

  /** Called by the existing native watcher (workspace/native-watch.ts) to fan out changes. */
  notify(change: FileChange): void {
    for (const l of this.subscribers.get(change.workspace) ?? []) l(change);
  }
}

