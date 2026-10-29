import { useEffect, useRef, useState } from "react";
import type { WorkspaceInfo } from "@takenotes/contracts/ipc";
import { isWslKind } from "@takenotes/platform/filesystem";
import { buildWorkspaceIndex, indexStatusMessage, workspaceIndex } from "../index/workspace-index";
import { searchNotes, type NoteHits } from "@takenotes/core/search/hits";
import { getBridge } from "../bridge";
import { useDebouncedValue } from "../components/search";
import { useIndexMeta } from "../stores/index-meta";
import type { Notify } from "./use-notify";
import type { PaneLayout } from "../panes";

export type SearchApi = {
  query: string;
  setQuery: (q: string) => void;
  /** Matching notes with every matching line. */
  notes: NoteHits[];
  matchCase: boolean;
  setMatchCase: (v: boolean) => void;
  /** Lines of context shown around each hit (0-3). */
  context: number;
  setContext: (n: number) => void;
  searching: boolean;
  searchError: string | null;
  /** Rebuild the parse-once index (async; editor stays snappy). Takes the
   * workspace explicitly (C1) — never the possibly pre-open closure. */
  refreshIndex: (ws: WorkspaceInfo) => Promise<void>;
  /** Clear workspace-scoped search state (H5 teardown). */
  resetSearch: () => void;
};

/** Search over the in-memory index (P1-08: zero filesystem reads).
 * Queries re-run when the debounced text, workspace, or layout change, so
 * results follow saves/renames/deletes with no rescan. */
export function useSearch(
  workspace: WorkspaceInfo | null,
  layout: PaneLayout,
  notify: Notify,
  reportHealth: (message: string | null) => void,
): SearchApi {
  const { errToast } = notify;
  const bumpIndex = useIndexMeta((s) => s.bump);
  const setNotice = useIndexMeta((s) => s.setNotice);
  const [searchQuery, setSearchQuery] = useState("");
  const [notes, setNotes] = useState<NoteHits[]>([]);
  const [matchCase, setMatchCase] = useState(false);
  const [context, setContext] = useState(1);
  const runId = useRef(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Parse-once index refresh (P1-07): runs async after open so the editor
  // stays snappy; workspace-level failures surface like tree failures.
  // C1: explicit workspace — open-time choreography must not depend on the
  // hook's captured (possibly pre-open) workspace.
  const refreshIndex = async (ws: WorkspaceInfo) => {
    setNotice(null);
    const bridge = getBridge();
    if (!bridge) { errToast({ code: "INTERNAL_ERROR", message: "Desktop bridge unavailable." }, "Couldn't build the search index"); return; }
    const res = await buildWorkspaceIndex(bridge, workspaceIndex, ws);
    if (!res.ok) {
      setNotice(null);
      if (isWslKind(ws.type)) reportHealth(res.error.message);
      else errToast(res.error, "Couldn't build the search index");
      return;
    }
    setNotice(indexStatusMessage(res));
    bumpIndex();
  };

  /** Clear workspace-scoped search state (H5 teardown). Query included:
   * results are workspace-derived, so a carried-over query would show the
   * old workspace's hits until the next keystroke. */
  const resetSearch = () => {
    setSearchQuery("");
    runId.current++;
    setNotes([]);
    setSearching(false);
    setSearchError(null);
    setNotice(null);
  };

  const debouncedQuery = useDebouncedValue(searchQuery, 150);
  useEffect(() => {
    const id = ++runId.current;
    if (!workspace || !debouncedQuery.trim()) {
      setNotes([]); setSearchError(null); setSearching(false);
      return;
    }
    // Reads the live index only (no disk). The search works in slices and
    // yields between them, so typing stays smooth; a newer query cancels it.
    setSearching(true);
    void searchNotes(workspaceIndex.list(workspace.workspaceId), debouncedQuery, {
      matchCase, context, isCancelled: () => runId.current !== id,
    }).then((r) => {
      if (runId.current !== id || r.cancelled) return;
      setSearching(false);
      setSearchError(r.error);
      setNotes(r.error ? [] : r.notes);
    });
  }, [debouncedQuery, workspace, layout, matchCase, context]);

  return {
    query: searchQuery, setQuery: setSearchQuery,
    notes, matchCase, setMatchCase, context, setContext, searching, searchError, refreshIndex, resetSearch,
  };
}
