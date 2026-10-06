import { parseDocument, type DocumentIndexEntry } from "./document";
import { buildEdges, type Edge } from "./edges";
import type { FileRevision } from "@takenotes/contracts/ipc";

/** In-memory per-workspace document index (P1-07).
 *
 * Derived, rebuildable, discardable (ADR-0008): dropping the whole store
 * loses no knowledge — `rebuild` from filesystem bytes restores it. Indexes
 * are keyed `workspaceId:relativePath` — never by bare `relativePath` — so
 * `A/README.md` and `B/README.md` are distinct entries.
 *
 * Revision guard: `upsert` with an unchanged hash returns the stored entry
 * without re-parsing, so a stale parse result can never overwrite a newer
 * entry (parsing is synchronous today; the invariant holds regardless).
 * The internal maps are never handed out — `get`/`list` return entries
 * (fresh array for lists), never the live `Map`.
 */
export const MAX_INDEX_FILE_BYTES = 1024 * 1024;

export type IndexInput = {
  workspaceId: string;
  relativePath: string;
  content: string;
  revision: FileRevision;
};

export class WorkspaceIndex {
  private readonly docs = new Map<string, DocumentIndexEntry>();
  /** Typed edge table per workspace, built once per rebuild (see `edges`). */
  private readonly edgeTables = new Map<string, Edge[]>();

  private static key(workspaceId: string, relativePath: string): string {
    return `${workspaceId}:${relativePath}`;
  }

  get(workspaceId: string, relativePath: string): DocumentIndexEntry | undefined {
    return this.docs.get(WorkspaceIndex.key(workspaceId, relativePath));
  }

  list(workspaceId: string): DocumentIndexEntry[] {
    const prefix = `${workspaceId}:`;
    const out: DocumentIndexEntry[] = [];
    for (const [k, e] of this.docs) {
      if (k.startsWith(prefix)) out.push(e);
    }
    return out;
  }

  /** Parse-and-store one file. Same-hash → stored entry back, no re-parse.
   * Oversized content (>1 MiB) is skipped → `null`. Any mutation drops
   * the workspace edge table; it rebuilds lazily on the next `edges`. */
  upsert(workspaceId: string, relativePath: string, content: string, revision: FileRevision): DocumentIndexEntry | null {
    if (content.length > MAX_INDEX_FILE_BYTES) return null;
    const key = WorkspaceIndex.key(workspaceId, relativePath);
    const existing = this.docs.get(key);
    if (existing && existing.revision.hash === revision.hash) return existing;
    const entry = parseDocument(workspaceId, relativePath, content, revision);
    this.docs.set(key, entry);
    this.edgeTables.delete(workspaceId);
    return entry;
  }

  /** Rename: move/re-key without re-parsing (bytes unchanged). */
  move(workspaceId: string, oldRel: string, newRel: string): boolean {
    const oldKey = WorkspaceIndex.key(workspaceId, oldRel);
    const entry = this.docs.get(oldKey);
    if (!entry) return false;
    this.docs.delete(oldKey);
    this.docs.set(WorkspaceIndex.key(workspaceId, newRel), { ...entry, relativePath: newRel });
    this.edgeTables.delete(workspaceId);
    return true;
  }

  /** Folder rename: re-key the whole prefix. Returns moved count. */
  movePrefix(workspaceId: string, oldDir: string, newDir: string): number {
    const oldPrefix = `${workspaceId}:${oldDir}/`;
    let moved = 0;
    for (const [k, e] of [...this.docs]) {
      if (k.startsWith(oldPrefix)) {
        this.docs.delete(k);
        const rel = `${newDir}/${k.slice(oldPrefix.length)}`;
        this.docs.set(WorkspaceIndex.key(workspaceId, rel), { ...e, relativePath: rel });
        moved += 1;
        this.edgeTables.delete(workspaceId);
      }
    }
    return moved;
  }

  remove(workspaceId: string, relativePath: string): boolean {
    const dropped = this.docs.delete(WorkspaceIndex.key(workspaceId, relativePath));
    if (dropped) this.edgeTables.delete(workspaceId);
    return dropped;
  }

  /** Folder delete/trash: drop the file plus everything under it. */
  removePrefix(workspaceId: string, entryRel: string): number {
    const exact = WorkspaceIndex.key(workspaceId, entryRel);
    const prefix = `${exact}/`;
    let dropped = 0;
    for (const k of [...this.docs.keys()]) {
      if (k === exact || k.startsWith(prefix)) {
        this.docs.delete(k);
        dropped += 1;
      }
    }
    if (dropped > 0) this.edgeTables.delete(workspaceId);
    return dropped;
  }

  /** Full (re)build from fresh bytes — e.g. workspace open, or rebuild
   * after `clear`. Atomic per workspace: stale entries (files deleted
   * outside the app) drop; other workspaces untouched. */
  rebuild(workspaceId: string, inputs: IndexInput[]): void {
    this.clear(workspaceId);
    for (const in_ of inputs) {
      if (in_.workspaceId !== workspaceId) continue;
      this.upsert(in_.workspaceId, in_.relativePath, in_.content, in_.revision);
    }
    // One edge build per rebuild: entries are settled, so the table is
    // computed eagerly and served from cache until the next mutation.
    this.edgeTables.set(workspaceId, buildEdges(this.list(workspaceId)));
  }

  /** Discard one workspace's index. Lossless by construction — bytes live
   * on disk, entries re-derive via `rebuild`. */
  clear(workspaceId: string): void {
    const prefix = `${workspaceId}:`;
    for (const k of [...this.docs.keys()]) {
      if (k.startsWith(prefix)) this.docs.delete(k);
    }
    this.edgeTables.delete(workspaceId);
  }

  /** Typed edge table for one workspace (`buildEdges` over its entries).
   * Built once per rebuild and cached; incremental mutations invalidate
   * the cache and it rebuilds lazily here. Returns a fresh array — never
   * the live cache. Other workspaces never leak in (entries are keyed
   * `workspaceId:relativePath`). */
  edges(workspaceId: string): Edge[] {
    const hit = this.edgeTables.get(workspaceId);
    if (hit) return hit.slice();
    const built = buildEdges(this.list(workspaceId));
    this.edgeTables.set(workspaceId, built);
    return built.slice();
  }
}
