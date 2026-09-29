import type { AppError } from "@takenotes/contracts/errors";
import type { DirectoryEntry, WorkspaceChangeEvent } from "@takenotes/contracts/ipc";
import type { WorkspaceKind } from "@takenotes/platform/types";
import type { FileAdapter } from "./file-adapter.js";

export type WatchWorkspace = {
  workspaceId: string;
  root: string;
  kind: WorkspaceKind;
};

type Snapshot = Map<string, string>;

function sig(e: DirectoryEntry): string {
  return `${e.kind}:${e.size}:${Math.floor(e.mtimeMs)}`;
}

/** Native workspace watcher.
 *
 * A small polling reconciler is intentionally used instead of exposing raw
 * fs events: Node's recursive fs.watch support differs across Windows,
 * macOS, and Linux, while Step 0 needs one native contract. The watcher only
 * emits workspaceId + relativePath; renderer reconciliation still goes back
 * through NoteService/FileAdapter for authoritative bytes and revisions.
 */
export class NativeWorkspaceWatcher {
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly snapshots = new Map<string, Snapshot>();
  /** Bumps on every start/stop so a stale in-flight scan can't arm a timer. */
  private readonly generations = new Map<string, number>();

  constructor(
    private readonly adapter: FileAdapter,
    private readonly emit: (event: WorkspaceChangeEvent) => void,
    private readonly intervalMs = 1000,
  ) {}

  start(ws: WatchWorkspace): void {
    this.stop(ws.workspaceId);
    const gen = (this.generations.get(ws.workspaceId) ?? 0) + 1;
    this.generations.set(ws.workspaceId, gen);
    void this.scan(ws).then((out) => {
      if (this.generations.get(ws.workspaceId) !== gen) return;
      if ("error" in out) return;
      this.snapshots.set(ws.workspaceId, out.snapshot);
      const timer = setInterval(() => void this.tick(ws), this.intervalMs);
      this.timers.set(ws.workspaceId, timer);
    });
  }

  stop(workspaceId: string): void {
    this.generations.set(workspaceId, (this.generations.get(workspaceId) ?? 0) + 1);
    const timer = this.timers.get(workspaceId);
    if (timer) clearInterval(timer);
    this.timers.delete(workspaceId);
    this.snapshots.delete(workspaceId);
  }

  private async tick(ws: WatchWorkspace): Promise<void> {
    const before = this.snapshots.get(ws.workspaceId);
    const out = await this.scan(ws);
    if ("error" in out) return;
    this.snapshots.set(ws.workspaceId, out.snapshot);
    if (!before) return;
    for (const [rel, nextSig] of out.snapshot) {
      if (before.get(rel) !== nextSig) {
        this.emit({ workspaceId: ws.workspaceId, relativePath: rel, kind: "changed" });
        return;
      }
    }
    for (const rel of before.keys()) {
      if (!out.snapshot.has(rel)) {
        this.emit({ workspaceId: ws.workspaceId, relativePath: rel, kind: "deleted" });
        return;
      }
    }
  }

  private async scan(ws: WatchWorkspace): Promise<{ snapshot: Snapshot } | { error: AppError }> {
    const snapshot: Snapshot = new Map();
    const queue = [""];
    for (let i = 0; i < queue.length; i++) {
      const listed = await this.adapter.list(ws.root, ws.kind, queue[i]!);
      if ("error" in listed) return listed;
      for (const e of listed.entries) {
        const rel = e.relativePath.replace(/\\/g, "/");
        snapshot.set(rel, sig(e));
        if (e.kind === "directory") queue.push(rel);
      }
    }
    return { snapshot };
  }
}
