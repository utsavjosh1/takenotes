import type { WorkspaceInfo } from "@takenotes/contracts/ipc";

/** Minimal domain surface the workspace lifecycle choreography needs.
 * Implemented by the renderer hooks in production (`App.tsx` passes its
 * hook APIs straight through — structural typing, no adapters) and by
 * recording fakes in `tests/renderer/workspace-flows.test.ts`. Pure logic:
 * no React, no DOM, no bridge. Every load takes the workspace explicitly
 * (review C1) so open-time work never depends on hook state captured
 * before `setWorkspace` lands. */

export type LifecycleDocs = {
  reset(): void;
};

export type LifecycleTree = {
  resetTree(): void;
  refresh(ws: WorkspaceInfo): Promise<void>;
  rebuild(ws: WorkspaceInfo): Promise<void>;
};

export type LifecycleSearch = {
  resetSearch(): void;
  refreshIndex(ws: WorkspaceInfo): Promise<void>;
};

export type WorkspaceFlowDeps = {
  docs: LifecycleDocs;
  tree: LifecycleTree;
  search: LifecycleSearch;
  recordWorkspace: (displayName: string, type: string) => void;
};

/** Open choreography (C1+H5, I-WS-3): teardown first so no previous
 * workspace state can survive, then load using the EXPLICIT workspace.
 * The search index builds unawaited — open stays fast on big workspaces. */
export async function openWorkspaceFlow(deps: WorkspaceFlowDeps, ws: WorkspaceInfo): Promise<void> {
  deps.docs.reset();
  deps.tree.resetTree();
  deps.search.resetSearch();
  deps.recordWorkspace(ws.displayName, ws.type);
  await deps.tree.refresh(ws);
  await deps.tree.rebuild(ws);
  // Index builds in the background: open stays fast on big workspaces.
  void deps.search.refreshIndex(ws);
}

/** Close choreography (H5, I-WS-3): deterministic empty workspace state. */
export function closeWorkspaceFlow(deps: WorkspaceFlowDeps): void {
  deps.docs.reset();
  deps.tree.resetTree();
  deps.search.resetSearch();
}

/** One logical "refresh workspace" operation (M4): tree root, file
 * enumeration, and search index refresh together — never a subset. Every
 * user-facing refresh entry point (menu, palette, reconnect) funnels here.
 * The three loads run concurrently, as before; the returned promise simply
 * makes the operation awaitable (tests, future sequencing). */
export async function refreshWorkspaceFlow(
  deps: Pick<WorkspaceFlowDeps, "tree" | "search">,
  ws: WorkspaceInfo | null,
): Promise<void> {
  if (!ws) return;
  await Promise.all([deps.tree.refresh(ws), deps.tree.rebuild(ws), deps.search.refreshIndex(ws)]);
}

const NOTE_EXT = /\.(md|markdown|txt)$/i;

/** Resolve a `[[wikilink]]` target to a workspace note path (Step 1 reading
 * view follow-links). Fragment (`#heading`/`#^block`) is stripped for
 * resolution — the file opens, scroll-to-anchor is deferred. Rules mirror
 * the link-rename ambiguity policy: a bare name shared by several notes
 * resolves to nothing (never guess); path-qualified targets match by
 * suffix and must also be unique. Extension is optional (`Note` =
 * `Note.md`); matching is case-insensitive with exact-case preferred. */
export function resolveWikilinkTarget(target: string, files: string[]): string | null {
  const raw = target.split("#")[0] ?? "";
  const base = raw.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!base) return null;
  const notes = files.filter((f) => NOTE_EXT.test(f));
  if (notes.length === 0) return null;
  if (!base.includes("/")) {
    const stem = base.replace(NOTE_EXT, "").toLowerCase();
    const exact = notes.filter((f) => f.split("/").pop()!.replace(NOTE_EXT, "") === base.replace(NOTE_EXT, ""));
    if (exact.length === 1) return exact[0]!;
    const folded = notes.filter((f) => f.split("/").pop()!.replace(NOTE_EXT, "").toLowerCase() === stem);
    return folded.length === 1 ? folded[0]! : null;
  }
  const withExt = NOTE_EXT.test(base) ? base : `${base}.md`;
  const norm = withExt.toLowerCase();
  const hits = notes.filter((f) => {
    const l = f.toLowerCase();
    return l === norm || l.endsWith(`/${norm}`);
  });
  const uniq = [...new Set(hits)];
  return uniq.length === 1 ? uniq[0]! : null;
}
