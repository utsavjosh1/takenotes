import type { AppError } from "../../shared/errors";
import type { DirectoryEntry, FileReadResult, IpcResult, WorkspaceInfo } from "../../shared/contracts/ipc";
import { MAX_INDEX_FILE_BYTES, WorkspaceIndex, type IndexInput } from "../../shared/index/store";

/** Renderer-side workspace index wiring (P1-07).
 *
 * The index lives in the renderer, fed through the established file
 * boundary (`directory.list` + `file.read` — the same ops every host
 * serves, so `windows-local` and `windows-wsl` parse identically). No new
 * IPC, no preload change, no main change: mutations already flow through
 * App, which upserts/removes exactly the affected file after each
 * successful mutation (P1-01 hook). No watcher in P1 — refresh happens on
 * workspace open, manual Refresh/Reconnect, and after mutations. Files
 * changed outside the app while open (another editor, sync) appear in the
 * index at the next refresh/rebuild; tree-expand needs no hook because the
 * open-build is eager and covers unexpanded directories.
 *
 * Error isolation: one unreadable file never kills the build (counted as
 * skipped), but a workspace-level failure (DISCONNECTED, root list
 * failure) aborts honestly instead of presenting a partial index as
 * complete. Parse errors are impossible by construction (the parser is
 * total); bad YAML degrades to `{}` inside the entry.
 */

/** One shared store; entries are namespaced per `workspaceId` inside. */
export const workspaceIndex = new WorkspaceIndex();

/** Structural slice of the preload API the build consumes (injectable for tests). */
export type IndexApi = {
  directory: {
    list(workspaceId: string, relativePath: string): Promise<IpcResult<DirectoryEntry[]>>;
  };
  file: {
    read(workspaceId: string, relativePath: string): Promise<IpcResult<FileReadResult>>;
  };
};

export type IndexBuildResult =
  | { ok: true; indexed: number; skipped: number }
  | { ok: false; error: AppError };

/** Bulk build cap mirrors the Quick-open listing cap: bounded either way. */
const MAX_LISTED_FILES = 2000;

/** Full (re)build from filesystem bytes. Returns counts; workspace-level
 * failures come back as `{ ok: false }` for the caller to surface. */
export async function buildWorkspaceIndex(
  api: IndexApi,
  store: WorkspaceIndex,
  workspace: WorkspaceInfo,
): Promise<IndexBuildResult> {
  const wid = workspace.workspaceId;
  const out: DirectoryEntry[] = [];
  const queue = [""];
  for (let i = 0; i < queue.length && out.length < MAX_LISTED_FILES; i++) {
    const res = await api.directory.list(wid, queue[i]!);
    if (!res.ok) return { ok: false, error: res.error };
    for (const e of res.result) {
      if (e.kind === "directory") queue.push(e.relativePath);
      else if (e.fileClass === "markdown" || e.fileClass === "text") out.push(e);
    }
  }

  // Collect-then-rebuild: the swap is atomic per workspace, so files
  // deleted outside the app drop instead of lingering as stale entries.
  const inputs: IndexInput[] = [];
  let skipped = 0;
  for (const e of out) {
    // >1 MiB skipped without reading (size is known from the listing).
    if (e.size > MAX_INDEX_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    const read = await api.file.read(wid, e.relativePath);
    if (!read.ok) {
      // The file vanished mid-build (NOT_FOUND) or is unreadable: skip it,
      // but a dead connection aborts — a partial index must never pose as
      // complete when the workspace itself is unavailable.
      if (read.error.code === "DISCONNECTED") return { ok: false, error: read.error };
      skipped += 1;
      continue;
    }
    if (read.result.content.length > MAX_INDEX_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    inputs.push({ workspaceId: wid, relativePath: e.relativePath, content: read.result.content, revision: read.result.revision });
  }
  store.rebuild(wid, inputs);
  return { ok: true, indexed: inputs.length, skipped };
}
