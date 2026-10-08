import type { FileReadResult, FileRevision, IpcResult, WorkspaceInfo } from "@takenotes/contracts/ipc";
import { resolveLinkTarget } from "@takenotes/core/index/edges";
import { linkMentionEdit } from "@takenotes/core/links/backlinks";
import { resolveCreationPath, type LinkFormat } from "@takenotes/core/links/completion";

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

/** Resolve a `[[wikilink]]` target to a workspace note path (Step 1 reading
 * view follow-links). Thin adapter over the core edge-table rule
 * (`resolveLinkTarget`): fragment (`#heading`/`#^block`) is stripped for
 * resolution — the file opens, scroll-to-anchor is deferred. A bare name
 * shared by several notes resolves to nothing (never guess);
 * path-qualified targets match by suffix and must also be unique.
 * Extension is optional (`Note` = `Note.md`); matching is case-insensitive
 * with exact-case preferred. */
export function resolveWikilinkTarget(target: string, files: string[]): string | null {
  return resolveLinkTarget(target, files);
}

/** ArrayBuffer → base64 without blowing the call stack (chunked
 * `String.fromCharCode`, then `btoa`). Renderer-side encoding for the
 * `file:importBinary` IPC op, which takes base64. */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export type FollowLinkDeps = {
  /** Current enumeration for the pre-create existence re-check. */
  listFiles: () => string[];
  createFile: (rel: string) => Promise<IpcResult<FileRevision>>;
  writeFile: (rel: string, content: string, expectedHash: string) => Promise<IpcResult<FileRevision>>;
  /** Immediate index upsert so backlinks/outgoing converge without a rebuild. */
  upsertIndex: (rel: string, content: string, revision: FileRevision) => void;
  openFile: (rel: string) => Promise<void>;
  reveal: (rel: string) => void | Promise<void>;
  /** Tree + index convergence after the mutation (bump + refresh). */
  refresh: () => Promise<void>;
};

export type FollowLinkResult =
  | { status: "invalid" }
  | { status: "created"; rel: string }
  | { status: "opened-existing"; rel: string }
  | { status: "failed"; rel: string };

/** Follow a link to a nonexistent note (Step 4 follow-to-create): resolve
 * the creation path from the link text → create → open → reveal, with the
 * tree/index converging after. New notes start empty — template wiring for
 * link-created notes is Step 6 territory. Two races are handled, never by
 * guessing: a note that appeared since the panes rendered opens instead of
 * duplicating (`opened-existing`), and `ALREADY_EXISTS` re-resolves before
 * reporting failure. Unresolvable leftovers (ambiguous duplicates) also
 * report `failed` rather than creating a second note. */
export async function followUnresolvedLinkFlow(
  deps: FollowLinkDeps,
  rawTarget: string,
  fromPath: string,
): Promise<FollowLinkResult> {
  const rel = resolveCreationPath(rawTarget, fromPath);
  if (!rel) return { status: "invalid" };
  const openExisting = async (found: string): Promise<FollowLinkResult> => {
    await deps.openFile(found);
    await deps.reveal(found);
    return { status: "opened-existing", rel: found };
  };
  const raced = resolveWikilinkTarget(rawTarget, deps.listFiles());
  if (raced) return openExisting(raced);
  const created = await deps.createFile(rel);
  if (!created.ok) {
    if (created.error.code === "ALREADY_EXISTS") {
      const again = resolveWikilinkTarget(rawTarget, deps.listFiles());
      if (again) return openExisting(again);
    }
    return { status: "failed", rel };
  }
  // New link-created notes start empty; the write pins the revision the
  // index upsert and any later mutation guard on.
  const content = "";
  const written = await deps.writeFile(rel, content, created.result.hash);
  if (!written.ok) return { status: "failed", rel };
  deps.upsertIndex(rel, content, written.result);
  // Refresh before open+reveal so the tree knows the node being revealed.
  await deps.refresh();
  await deps.openFile(rel);
  await deps.reveal(rel);
  return { status: "created", rel };
}

export type LinkMentionDeps = {
  readFile: (rel: string) => Promise<IpcResult<FileReadResult>>;
  writeFile: (args: {
    rel: string;
    content: string;
    expectedHash: string;
    newlineStyle: "lf" | "crlf";
    hadBom: boolean;
  }) => Promise<IpcResult<FileRevision>>;
  /** Immediate index upsert so backlinks converge without a rebuild. */
  upsertIndex: (rel: string, content: string, revision: FileRevision) => void;
  /** Open-tab convergence: clean tabs reload, dirty tabs take the Step 0
   * CONFLICT banner (edits kept, never overwritten). */
  reconcile: (rel: string) => Promise<void>;
  /** Tree + index convergence after the mutation (bump + refresh). */
  refresh: () => Promise<void>;
  linkFormat: () => LinkFormat;
  useWikilinks: () => boolean;
};

export type LinkMentionResult =
  | { status: "linked"; rel: string; line: number }
  | { status: "not-found"; rel: string }
  | { status: "conflict"; rel: string }
  | { status: "failed"; rel: string };

/** Convert an unlinked mention into a real link (Step 4 alias action):
 * read the source note → convert its first convertible body occurrence
 * (`[[Canon|Alias]]`, Markdown form when wikilinks are off) → guarded
 * write → converge. Failures stay honest: a vanished mention reports
 * `not-found` (index raced the disk), a concurrent external edit reports
 * `conflict` with both versions safe, and nothing is ever retried blindly.
 * Only one occurrence converts per call — repeats re-verify against the
 * rebuilt index. */
export async function linkMentionFlow(
  deps: LinkMentionDeps,
  from: string,
  matchedText: string,
  target: string,
): Promise<LinkMentionResult> {
  const read = await deps.readFile(from);
  if (!read.ok) return { status: "failed", rel: from };
  const edit = linkMentionEdit(read.result.content, matchedText, target, from, deps.linkFormat(), deps.useWikilinks());
  if (!edit) return { status: "not-found", rel: from };
  const written = await deps.writeFile({
    rel: from,
    content: edit.content,
    expectedHash: read.result.revision.hash,
    newlineStyle: read.result.newlineStyle,
    hadBom: read.result.hadBom,
  });
  if (!written.ok) {
    if (written.error.code === "CONFLICT") return { status: "conflict", rel: from };
    return { status: "failed", rel: from };
  }
  deps.upsertIndex(from, edit.content, written.result);
  await deps.reconcile(from);
  await deps.refresh();
  return { status: "linked", rel: from, line: edit.line };
}
