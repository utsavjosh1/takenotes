/**
 * M1 — Search (thin module over core Search V2).
 *
 * Grammar, boolean eval, ranking, and snippet rules live in
 * `core/search/*` — shared verbatim with desktop (locality: fix once,
 * fixed everywhere). Unknown operators surface as `INVALID_REQUEST`
 * naming the operator, never silent reinterpretation. Empty query matches
 * nothing; recents own the empty state in the UI.
 */

import type { SearchMatch } from "@takenotes/contracts/ipc";
import type { AppError } from "@takenotes/contracts/errors";
import type { WorkspaceIndex } from "@takenotes/core/index/store";
import { parseSearchQuery } from "@takenotes/core/search/query";
import { searchContent, searchFilenames, type SearchSort } from "@takenotes/core/search/search";

export type MobileSearchResult = {
  filenames: SearchMatch[];
  content: SearchMatch[];
};

export function searchWorkspace(
  index: WorkspaceIndex,
  workspaceId: string,
  rawQuery: string,
  sort: SearchSort = { key: "relevance", dir: "asc" },
): { result: MobileSearchResult } | { error: AppError } {
  const parsed = parseSearchQuery(rawQuery);
  if (!parsed.ok) return { error: parsed.error };
  return {
    result: {
      filenames: searchFilenames(index, workspaceId, parsed.query, 200, sort),
      content: searchContent(index, workspaceId, parsed.query, 1000, sort),
    },
  };
}
