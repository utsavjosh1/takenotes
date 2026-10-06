import { useEffect, useState } from "react";
import type { SearchMatch, WorkspaceInfo } from "@takenotes/contracts/ipc";
import { isWslKind } from "@takenotes/platform/filesystem";
import { buildWorkspaceIndex, indexStatusMessage, workspaceIndex } from "../index/workspace-index";
import { parseSearchQuery } from "@takenotes/core/search/query";
import { searchContent, searchFilenames } from "@takenotes/core/search/search";
import { getBridge } from "../bridge";
import { useDebouncedValue } from "../components/search";
import { useIndexMeta } from "../stores/index-meta";
import type { Notify } from "./use-notify";
import type { PaneLayout } from "../panes";

export type SearchApi = {
  query: string;
  setQuery: (q: string) => void;
  filenameHits: SearchMatch[];
  contentHits: SearchMatch[];
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
  const [filenameHits, setFilenameHits] = useState<SearchMatch[]>([]);
  const [contentHits, setContentHits] = useState<SearchMatch[]>([]);
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
    setFilenameHits([]);
    setContentHits([]);
    setSearching(false);
    setSearchError(null);
    setNotice(null);
  };

  const debouncedQuery = useDebouncedValue(searchQuery, 250);
  useEffect(() => {
    if (!workspace || !debouncedQuery.trim()) {
      setFilenameHits([]); setContentHits([]); setSearchError(null); setSearching(false);
      return;
    }
    // Queries read the live P1-07 index only — never IPC, never the
    // filesystem. `layout` in deps re-runs the query after saves, renames,
    // and deletes, so results follow mutations with no rescan.
    const parsed = parseSearchQuery(debouncedQuery.trim());
    if (!parsed.ok) {
      setFilenameHits([]); setContentHits([]);
      setSearchError(parsed.error.message);
      setSearching(false);
      return;
    }
    setSearchError(null);
    setSearching(false);
    setFilenameHits(searchFilenames(workspaceIndex, workspace.workspaceId, parsed.query).slice(0, 20));
    setContentHits(searchContent(workspaceIndex, workspace.workspaceId, parsed.query).slice(0, 60));
  }, [debouncedQuery, workspace, layout]);

  return {
    query: searchQuery, setQuery: setSearchQuery,
    filenameHits, contentHits, searching, searchError, refreshIndex, resetSearch,
  };
}
