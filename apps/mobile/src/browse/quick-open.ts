/**
 * M1 — Quick Open (thin module over core fuzzy).
 *
 * Scoring, exact-match tiers, recents, and create-target rules all live in
 * core (`commands/palette`, `explorer/sort`). This module only maps index
 * entries to `QuickOpenItem`s. Empty query = recents (never a full dump).
 */

import {
  indexedEntryToQuickOpenItem,
  searchQuickOpen,
  type QuickOpenResult,
} from "@takenotes/core/commands/palette";
import { resolveCreateTarget } from "@takenotes/core/explorer/sort";
import type { WorkspaceIndex } from "@takenotes/core/index/store";

export type { QuickOpenResult };

export function quickOpen(
  index: WorkspaceIndex,
  workspaceId: string,
  query: string,
  recentPaths: readonly string[] = [],
  maxResults = 30,
): QuickOpenResult[] {
  const files = index.list(workspaceId).map(indexedEntryToQuickOpenItem);
  return searchQuickOpen(files, query, recentPaths, maxResults);
}

/** Enter-on-no-match target (mirror of desktop Quick Open create). */
export function quickOpenCreateTarget(
  query: string,
  dir: string,
): { ok: true; rel: string } | { ok: false; error: string } {
  return resolveCreateTarget(query, dir);
}
