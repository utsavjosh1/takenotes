import type { DocumentIndexEntry } from "../index/document";
import { matchesContentEntry } from "../search/search";
import { isEmptyQuery, parseSearchQuery, type SearchQuery } from "../search/query";
import type { CollectionDoc, CollectionSort, CollectionView } from "./store";

/** Step 6 Collections evaluation — query + project + sort over entries.
 *
 * The collection `query` is the Phase-2 search grammar (same operators,
 * same `INVALID_REQUEST` semantics): a collection is a saved search with
 * named presentations. Rows project frontmatter columns as display
 * strings; sorting mirrors search (`name/modified/created/path`) plus
 * `property` (numeric-or-lexicographic, missing sorts last). Bounded and
 * total: at most `MAX_COLLECTION_ROWS` rows, invalid queries match nothing
 * with the parse error surfaced for the UI to show.
 */

export const MAX_COLLECTION_ROWS = 2000;
export const MAX_CELL_LEN = 120;

export type CollectionRow = {
  relativePath: string;
  title: string;
  /** Column name → display string (`""` when absent). */
  cells: Record<string, string>;
};

export type CollectionResult =
  | { ok: true; rows: CollectionRow[]; truncated: boolean }
  | { ok: false; error: string };

export function cellDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (typeof value === "string") s = value;
  else if (typeof value === "number" || typeof value === "boolean") s = String(value);
  else if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const v of value) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") parts.push(String(v));
    }
    s = parts.join(", ");
  } else {
    try {
      s = JSON.stringify(value) ?? "";
    } catch {
      return "";
    }
  }
  s = s.trim();
  return s.length > MAX_CELL_LEN ? `${s.slice(0, MAX_CELL_LEN - 1)}…` : s;
}

function entryTitle(entry: DocumentIndexEntry): string {
  if (entry.title?.trim()) return entry.title.trim();
  const base = entry.relativePath.slice(entry.relativePath.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function columnNames(view: CollectionView, rows: { entry: DocumentIndexEntry }[]): string[] {
  if (view.columns) return view.columns;
  // Default table: union of frontmatter keys across matched rows (sorted).
  const union = new Set<string>();
  for (const { entry } of rows) {
    if (entry.frontmatter && typeof entry.frontmatter === "object") {
      for (const k of Object.keys(entry.frontmatter)) union.add(k);
    }
  }
  return [...union].sort();
}

function compareCells(a: string, b: string): number {
  const aNum = Number(a);
  const bNum = Number(b);
  if (a.trim() !== "" && b.trim() !== "" && Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return aNum - bNum;
  }
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  return al < bl ? -1 : al > bl ? 1 : 0;
}

function sortRows(
  rows: Array<{ entry: DocumentIndexEntry; row: CollectionRow }>,
  sort: CollectionSort | undefined,
): Array<{ entry: DocumentIndexEntry; row: CollectionRow }> {
  if (!sort) {
    return rows.sort((a, b) => (a.row.relativePath < b.row.relativePath ? -1 : 1));
  }
  const dir = sort.dir === "desc" ? -1 : 1;
  const pathTie = (
    a: { entry: DocumentIndexEntry; row: CollectionRow },
    b: { entry: DocumentIndexEntry; row: CollectionRow },
  ): number => (a.row.relativePath < b.row.relativePath ? -1 : 1);
  return rows.sort((a, b) => {
    switch (sort.key) {
      case "name": {
        const an = a.row.relativePath.slice(a.row.relativePath.lastIndexOf("/") + 1).toLowerCase();
        const bn = b.row.relativePath.slice(b.row.relativePath.lastIndexOf("/") + 1).toLowerCase();
        return (an < bn ? -1 : an > bn ? 1 : 0) * dir || pathTie(a, b);
      }
      case "path":
        return (a.row.relativePath < b.row.relativePath ? -1 : a.row.relativePath > b.row.relativePath ? 1 : 0) * dir;
      case "modified":
      case "created":
        return (a.entry.revision.mtimeMs - b.entry.revision.mtimeMs) * dir || pathTie(a, b);
      case "property": {
        const prop = sort.property!;
        const av = a.row.cells[prop] ?? "";
        const bv = b.row.cells[prop] ?? "";
        // Missing sorts last regardless of direction.
        if (!av && !bv) return pathTie(a, b);
        if (!av) return 1;
        if (!bv) return -1;
        return compareCells(av, bv) * dir || pathTie(a, b);
      }
    }
  });
}

/** Evaluate one named view. Empty queries match nothing (same rule as
 * search — the empty state belongs to recents, not to a full listing). */
export function evaluateCollectionView(
  entries: DocumentIndexEntry[],
  doc: CollectionDoc,
  viewName?: string,
): CollectionResult {
  const view = viewName === undefined ? doc.views[0]! : doc.views.find((v) => v.name === viewName);
  if (!view) return { ok: false, error: `Unknown view "${viewName}".` };
  const parsed = parseSearchQuery(doc.query);
  if (!parsed.ok) {
    const op = (parsed.error as { operator?: string }).operator ?? doc.query;
    return { ok: false, error: `Invalid collection query: ${op}.` };
  }
  const query: SearchQuery = parsed.query;
  if (isEmptyQuery(query)) return { ok: true, rows: [], truncated: false };

  const matched: DocumentIndexEntry[] = [];
  for (const entry of entries ?? []) {
    if (!entry || typeof entry.relativePath !== "string") continue;
    try {
      if (matchesContentEntry(entry, query)) matched.push(entry);
    } catch {
      continue;
    }
  }

  const withRows = matched.map((entry) => ({ entry, row: null as unknown as CollectionRow }));
  const cols = columnNames(view, withRows);
  const projected = withRows.map(({ entry }) => {
    const cells: Record<string, string> = {};
    for (const c of cols) {
      const raw =
        entry.frontmatter && typeof entry.frontmatter === "object"
          ? (entry.frontmatter as Record<string, unknown>)[c]
          : undefined;
      cells[c] = cellDisplay(raw);
    }
    return { entry, row: { relativePath: entry.relativePath, title: entryTitle(entry), cells } };
  });
  const sorted = sortRows(projected, view.sort);
  const truncated = sorted.length > MAX_COLLECTION_ROWS;
  return { ok: true, rows: sorted.slice(0, MAX_COLLECTION_ROWS).map((s) => s.row), truncated };
}
