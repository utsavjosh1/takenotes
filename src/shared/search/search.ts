import type { SearchMatch } from "../contracts/ipc";
import type { DocumentIndexEntry } from "../index/document";
import { WorkspaceIndex } from "../index/store";
import type { SearchQuery } from "./query";

/** Search V1 over the P1-07 in-memory index (P1-08).
 *
 * Reads entry fields only — never the filesystem, never a re-parse. Two
 * entry points mirror the established UI split (filenames vs contents),
 * preserving the `SearchMatch` shape, the 200/1000 result bounds, and
 * one-match-per-file per side. Everything supplied is AND-combined;
 * ranking is deterministic (tier, then path) — no fuzzy engine, no BM25.
 *
 * Snippet lines are honest file lines: body matches map through
 * `bodyStartLine`, task/heading matches use their recorded positions, and
 * metadata-only matches report line 0 with the matched text as preview.
 * `column` is 1-based within the preview (exact file column for body
 * lines, which searchableText preserves verbatim).
 */

const PREVIEW_LEN = 200;

function basename(rel: string): string {
  return rel.slice(rel.lastIndexOf("/") + 1);
}

function basenameNoExt(rel: string): string {
  const base = basename(rel);
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
}

/** Every filter must pass (AND). Text criteria are handled per side. */
function passesFilters(entry: DocumentIndexEntry, q: SearchQuery): boolean {
  const rel = entry.relativePath.toLowerCase();
  const base = basename(entry.relativePath).toLowerCase();
  for (const f of q.fileFilters) {
    if (!base.includes(f)) return false;
  }
  for (const f of q.pathFilters) {
    if (!rel.includes(f)) return false;
  }
  for (const t of q.tags) {
    if (!entry.tags.includes(t)) return false;
  }
  for (const t of q.types) {
    if (entry.docType?.toLowerCase() !== t) return false;
  }
  if (q.taskOnly && entry.tasks.length === 0) return false;
  return true;
}

function hasText(q: SearchQuery): boolean {
  return q.textTerms.length + q.phrases.length > 0;
}

/** Browse selectors (`tag:`/`type:`/`is:task`) list documents on their own;
 * `file:`/`path:` only restrict. */
function hasBrowseSelector(q: SearchQuery): boolean {
  return q.tags.length + q.types.length > 0 || q.taskOnly;
}

function allTerms(q: SearchQuery): string[] {
  return [...q.textTerms, ...q.phrases];
}

type Candidate = { line: number; field: 0 | 1 | 2; column: number; preview: string };

/** Earliest-in-file match wins; ties prefer body over task over heading. */
function pickSnippet(entry: DocumentIndexEntry, terms: string[], preferTask: boolean): Candidate {
  const hay = entry.searchableText.toLowerCase();
  const lines = entry.searchableText.split("\n");
  const prefix = (entry.title === undefined ? 0 : 1) + entry.aliases.length + entry.headings.length + entry.tags.length;
  let best: Candidate | null = null;
  const consider = (c: Candidate): void => {
    if (!best || c.line < best.line || (c.line === best.line && c.field < best.field)) best = c;
  };
  for (const term of terms) {
    if (!term || !hay.includes(term)) continue;
    for (let i = prefix; i < lines.length; i++) {
      const col = lines[i]!.toLowerCase().indexOf(term);
      if (col >= 0) {
        consider({ line: entry.bodyStartLine + (i - prefix), field: 0, column: col + 1, preview: lines[i]!.slice(0, PREVIEW_LEN) });
        break;
      }
    }
    for (const t of entry.tasks) {
      const col = t.description.toLowerCase().indexOf(term);
      if (col >= 0) consider({ line: t.line, field: 1, column: col + 1, preview: t.description.slice(0, PREVIEW_LEN) });
    }
    for (const h of entry.headings) {
      const col = h.text.toLowerCase().indexOf(term);
      if (col >= 0) consider({ line: h.line, field: 2, column: col + 1, preview: h.text.slice(0, PREVIEW_LEN) });
    }
  }
  if (best) return best;
  // Metadata-only match (title/alias/tag): no file line to point at.
  if (preferTask && entry.tasks.length > 0) {
    const t = entry.tasks[0]!;
    return { line: t.line, field: 1, column: 1, preview: t.description.slice(0, PREVIEW_LEN) };
  }
  return { line: 0, field: 2, column: 0, preview: (entry.title ?? basename(entry.relativePath)).slice(0, PREVIEW_LEN) };
}

/** Content relevance tier (lower is better); ties break alphabetically. */
function contentTier(entry: DocumentIndexEntry, q: SearchQuery): number {
  const title = entry.title?.toLowerCase();
  if (title && q.textTerms.some((t) => t === title)) return 0;
  const named = [title ?? "", ...entry.aliases.map((a) => a.toLowerCase())];
  if (q.textTerms.some((t) => named.some((n) => n.includes(t)))) return 1;
  if (q.phrases.length > 0) return 2;
  return 3;
}

/** Filename side: which indexed files match by name. `file:` filters and
 * plain terms against basename/title/path; `path:`/`tag:`/`type:` only
 * restrict. One match per file, exact names first. */
export function searchFilenames(store: WorkspaceIndex, workspaceId: string, q: SearchQuery, maxResults = 200): SearchMatch[] {
  const terms = allTerms(q);
  const out: Array<{ rel: string; exact: boolean }> = [];
  for (const entry of store.list(workspaceId)) {
    if (!passesFilters(entry, q)) continue;
    const base = basename(entry.relativePath).toLowerCase();
    const title = entry.title?.toLowerCase() ?? "";
    const rel = entry.relativePath.toLowerCase();
    // `file:` names files: satisfying it earns a filename hit (the strict
    // AND still governs content matching and all filtering). Otherwise a
    // text term must touch basename/title/path.
    let hit = false;
    let exact = false;
    if (q.fileFilters.length > 0) {
      hit = true;
      exact = q.fileFilters.some((f) => f === base || f === basenameNoExt(entry.relativePath));
    } else {
      for (const t of terms) {
        if (base.includes(t) || title.includes(t) || rel.includes(t)) hit = true;
        if (t === base || t === basenameNoExt(entry.relativePath) || (title !== "" && t === title)) exact = true;
      }
    }
    if (hit) out.push({ rel: entry.relativePath, exact });
  }
  out.sort((a, b) => Number(b.exact) - Number(a.exact) || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return out.slice(0, maxResults).map((m) => ({ relativePath: m.rel, line: 0, column: 0, preview: m.rel }));
}

/** Content side: one match per file with an honest snippet. Text criteria
 * match `searchableText`; bare browse selectors list their documents. */
export function searchContent(store: WorkspaceIndex, workspaceId: string, q: SearchQuery, maxResults = 1000): SearchMatch[] {
  const terms = allTerms(q);
  const text = hasText(q);
  const out: Array<{ entry: DocumentIndexEntry; tier: number }> = [];
  for (const entry of store.list(workspaceId)) {
    if (!passesFilters(entry, q)) continue;
    if (text) {
      const hay = entry.searchableText.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) continue;
    } else if (!hasBrowseSelector(q)) {
      continue;
    }
    out.push({ entry, tier: text ? contentTier(entry, q) : 3 });
  }
  out.sort(
    (a, b) => a.tier - b.tier || (a.entry.relativePath < b.entry.relativePath ? -1 : a.entry.relativePath > b.entry.relativePath ? 1 : 0),
  );
  return out.slice(0, maxResults).map(({ entry }) => {
    const s = pickSnippet(entry, terms, q.taskOnly);
    return { relativePath: entry.relativePath, line: s.line, column: s.column, preview: s.preview };
  });
}
