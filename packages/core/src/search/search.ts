import type { SearchMatch } from "@takenotes/contracts/ipc";
import type { DocumentIndexEntry } from "../index/document";
import { WorkspaceIndex } from "../index/store";
import {
  collectPositiveTerms,
  hasPositiveNameTerm,
  hasPositiveTaskSelector,
  isEmptyQuery,
  type SearchQuery,
} from "./query";

/** Search V2 over the parse-once in-memory index (`docs/specs/search-grammar.md`).
 *
 * Reads entry fields only — never the filesystem, never a re-parse. Two
 * entry points mirror the established UI split (filenames vs contents),
 * preserving the `SearchMatch` shape and one-match-per-file per side.
 * Matching is boolean over the query AST (V2 precedence already encoded
 * by the parser); ranking is deterministic — no fuzzy engine, no BM25.
 *
 * Safety caps: per-file haystacks truncate at `MAX_CONTENT_SCAN_CHARS`
 * and each search scans at most `MAX_FILES_SCANNED` entries in path
 * order, so a hostile workspace degrades to bounded work, never to a
 * hang. Regexes arrive pre-validated from the parser (length, nested
 * quantifiers, compilability); matching still resets `lastIndex` and
 * never uses the `g` flag.
 *
 * Snippet lines are honest file lines: body matches map through
 * `bodyStartLine`, task/heading matches use their recorded positions, and
 * metadata-only matches report line 0 with the matched text as preview.
 * `column` is 1-based within the preview.
 */

export const MAX_CONTENT_SCAN_CHARS = 20000;
export const MAX_FILES_SCANNED = 5000;

export type SearchSortKey = "relevance" | "name" | "modified" | "created" | "path";
export type SearchSort = { key: SearchSortKey; dir: "asc" | "desc" };

const PREVIEW_LEN = 200;

function basename(rel: string): string {
  return rel.slice(rel.lastIndexOf("/") + 1);
}

function basenameNoExt(rel: string): string {
  const base = basename(rel);
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase();
}

/** Honest file line count: frontmatter lines + body lines (conventional:
 * trailing-newline files don't gain a phantom line). */
function fileLineCount(entry: DocumentIndexEntry): number {
  const prefix = (entry.title === undefined ? 0 : 1) + entry.aliases.length + entry.headings.length + entry.tags.length;
  const raw = entry.searchableText.split("\n");
  if (raw.length > 1 && entry.searchableText.endsWith("\n")) raw.pop();
  const body = Math.max(0, raw.length - prefix);
  return entry.bodyStartLine - 1 + body;
}

function propKeys(frontmatter: Record<string, unknown>): string[] {
  return Object.keys(frontmatter);
}

function findPropKey(entry: DocumentIndexEntry, name: string): string | null {
  const folded = name.toLowerCase();
  for (const k of propKeys(entry.frontmatter)) {
    if (k.toLowerCase() === folded) return k;
  }
  return null;
}

function propValues(raw: unknown): string[] {
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return [String(raw)];
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const v of raw) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out.push(String(v));
      else if (v !== null && typeof v === "object") out.push(JSON.stringify(v));
    }
    return out;
  }
  if (raw !== null && typeof raw === "object") return [JSON.stringify(raw)];
  return [];
}

function compareScalar(actual: string, op: "<" | "<=" | ">" | ">=" | "=" | "!=", expected: string): boolean {
  const aNum = Number(actual);
  const eNum = Number(expected);
  if (actual.trim() !== "" && expected.trim() !== "" && Number.isFinite(aNum) && Number.isFinite(eNum)) {
    switch (op) {
      case "<":
        return aNum < eNum;
      case "<=":
        return aNum <= eNum;
      case ">":
        return aNum > eNum;
      case ">=":
        return aNum >= eNum;
      case "=":
        return aNum === eNum;
      case "!=":
        return aNum !== eNum;
    }
  }
  const a = actual.toLowerCase();
  const e = expected.toLowerCase();
  switch (op) {
    case "<":
      return a < e;
    case "<=":
      return a <= e;
    case ">":
      return a > e;
    case ">=":
      return a >= e;
    case "=":
      return a === e;
    case "!=":
      return a !== e;
  }
}

type EvalScope = "content" | "name";

type EntryCtx = {
  entry: DocumentIndexEntry;
  hayLower: string;
  hay: string;
  nameHayLower: string;
  nameHay: string;
  relLower: string;
  baseLower: string;
  titleLower: string;
};

function ctxFor(entry: DocumentIndexEntry): EntryCtx {
  const hay = entry.searchableText.slice(0, MAX_CONTENT_SCAN_CHARS);
  const title = entry.title ?? "";
  const base = basename(entry.relativePath);
  const nameHay = `${entry.relativePath}\n${title}\n${base}`;
  return {
    entry,
    hay,
    hayLower: hay.toLowerCase(),
    nameHay,
    nameHayLower: nameHay.toLowerCase(),
    relLower: entry.relativePath.toLowerCase(),
    baseLower: base.toLowerCase(),
    titleLower: title.toLowerCase(),
  };
}

function testRegex(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  const out = re.test(text);
  re.lastIndex = 0;
  return out;
}

function evalNode(q: SearchQuery, c: EntryCtx, scope: EvalScope): boolean {
  const e = c.entry;
  switch (q.kind) {
    case "true":
      return true;
    case "and":
      return q.children.every((k) => evalNode(k, c, scope));
    case "or":
      return q.children.some((k) => evalNode(k, c, scope));
    case "not":
      return !evalNode(q.child, c, scope);
    case "text":
    case "phrase":
    case "ignoreCase":
      return (scope === "content" ? c.hayLower : c.nameHayLower).includes(q.value);
    case "matchCase":
      return (scope === "content" ? c.hay : c.nameHay).includes(q.value);
    case "regex":
      return testRegex(q.regex, scope === "content" ? c.hay : c.nameHay);
    case "content":
      return c.hayLower.includes(q.value);
    case "file":
      return c.baseLower.includes(q.value);
    case "path":
      return c.relLower.includes(q.value);
    case "tag":
      return e.tags.includes(q.value);
    case "type":
      return (e.docType?.toLowerCase() ?? "") === q.value;
    case "isTask":
      return e.tasks.length > 0;
    case "section":
      if (c.titleLower.includes(q.value)) return true;
      return e.headings.some((h) => h.text.toLowerCase().includes(q.value));
    case "task":
      return e.tasks.some((t) => t.description.toLowerCase().includes(q.value));
    case "taskTodo":
      if (q.value === undefined) return e.tasks.some((t) => !t.completed);
      return e.tasks.some((t) => !t.completed && t.description.toLowerCase().includes(q.value!));
    case "taskDone":
      if (q.value === undefined) return e.tasks.some((t) => t.completed);
      return e.tasks.some((t) => t.completed && t.description.toLowerCase().includes(q.value!));
    case "line":
      return fileLineCount(e) >= q.n;
    case "block": {
      if (e.blocks.some((b) => b.id.toLowerCase().includes(q.value))) return true;
      return e.tasks.some((t) => t.anchor?.toLowerCase().includes(q.value));
    }
    case "propExists":
      return findPropKey(e, q.name) !== null;
    case "propMissing": {
      const k = findPropKey(e, q.name);
      if (k === null) return true;
      const raw = (e.frontmatter as Record<string, unknown>)[k];
      return raw === null || raw === undefined;
    }
    case "prop": {
      const k = findPropKey(e, q.name);
      if (k === null) return false;
      const vals = propValues((e.frontmatter as Record<string, unknown>)[k]);
      return vals.some((s) => s.toLowerCase().includes(q.value.toLowerCase()));
    }
    case "propCompare": {
      const k = findPropKey(e, q.name);
      if (k === null) return false;
      const vals = propValues((e.frontmatter as Record<string, unknown>)[k]);
      return vals.some((s) => compareScalar(s, q.op, q.value));
    }
  }
}

type Candidate = { line: number; field: 0 | 1 | 2; column: number; preview: string };

/** Earliest-in-file match wins; ties prefer body over task over heading. */
function pickSnippet(
  entry: DocumentIndexEntry,
  hayLower: string,
  hay: string,
  texts: string[],
  regexes: RegExp[],
  preferTask: boolean,
): Candidate {
  const lines = hay.split("\n");
  const prefix = (entry.title === undefined ? 0 : 1) + entry.aliases.length + entry.headings.length + entry.tags.length;
  let best: Candidate | null = null;
  const consider = (c: Candidate): void => {
    if (!best || c.line < best.line || (c.line === best.line && c.field < best.field)) best = c;
  };
  const bodyHit = (term: string): void => {
    if (!term || !hayLower.includes(term)) return;
    for (let i = prefix; i < lines.length; i++) {
      const col = lines[i]!.toLowerCase().indexOf(term);
      if (col >= 0) {
        consider({ line: entry.bodyStartLine + (i - prefix), field: 0, column: col + 1, preview: lines[i]!.slice(0, PREVIEW_LEN) });
        break;
      }
    }
  };
  const regexHit = (re: RegExp): void => {
    re.lastIndex = 0;
    if (!re.test(hay)) {
      re.lastIndex = 0;
      return;
    }
    re.lastIndex = 0;
    for (let i = prefix; i < lines.length; i++) {
      re.lastIndex = 0;
      const m = re.exec(lines[i]!);
      re.lastIndex = 0;
      if (m && m.index >= 0) {
        consider({ line: entry.bodyStartLine + (i - prefix), field: 0, column: m.index + 1, preview: lines[i]!.slice(0, PREVIEW_LEN) });
        break;
      }
    }
  };
  for (const t of texts) {
    bodyHit(t);
    for (const task of entry.tasks) {
      const col = task.description.toLowerCase().indexOf(t);
      if (t && col >= 0) consider({ line: task.line, field: 1, column: col + 1, preview: task.description.slice(0, PREVIEW_LEN) });
    }
    for (const h of entry.headings) {
      const col = h.text.toLowerCase().indexOf(t);
      if (t && col >= 0) consider({ line: h.line, field: 2, column: col + 1, preview: h.text.slice(0, PREVIEW_LEN) });
    }
  }
  for (const re of regexes) regexHit(re);
  if (best) return best;
  if (preferTask && entry.tasks.length > 0) {
    const t = entry.tasks[0]!;
    return { line: t.line, field: 1, column: 1, preview: t.description.slice(0, PREVIEW_LEN) };
  }
  return { line: 0, field: 2, column: 0, preview: (entry.title ?? basename(entry.relativePath)).slice(0, PREVIEW_LEN) };
}

/** Content relevance tier (lower is better); ties break by path. */
function contentTier(texts: string[], entry: DocumentIndexEntry): number {
  const title = entry.title?.toLowerCase();
  if (title && texts.some((t) => t === title)) return 0;
  const named = [title ?? "", ...entry.aliases.map((a) => a.toLowerCase())];
  if (texts.some((t) => named.some((n) => n.includes(t)))) return 1;
  return texts.length > 0 ? 2 : 3;
}

function orderedEntries(store: WorkspaceIndex, workspaceId: string): DocumentIndexEntry[] {
  return store
    .list(workspaceId)
    .slice()
    .sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0))
    .slice(0, MAX_FILES_SCANNED);
}

function sortMatches<T>(
  items: Array<{ entry: DocumentIndexEntry; tier: number; value: T }>,
  sort: SearchSort,
): Array<{ entry: DocumentIndexEntry; tier: number; value: T }> {
  const dir = sort.dir === "desc" ? -1 : 1;
  const by = (a: { entry: DocumentIndexEntry; tier: number }, b: { entry: DocumentIndexEntry; tier: number }): number => {
    switch (sort.key) {
      case "name":
        return dir * basename(a.entry.relativePath).localeCompare(basename(b.entry.relativePath)) || (a.entry.relativePath < b.entry.relativePath ? -1 : 1);
      case "modified":
      case "created":
        // No birthtime on the wire yet: created falls back to mtimeMs.
        return dir * (a.entry.revision.mtimeMs - b.entry.revision.mtimeMs) || (a.entry.relativePath < b.entry.relativePath ? -1 : 1);
      case "path":
        return dir * (a.entry.relativePath < b.entry.relativePath ? -1 : a.entry.relativePath > b.entry.relativePath ? 1 : 0);
      case "relevance":
      default:
        return a.tier - b.tier || (a.entry.relativePath < b.entry.relativePath ? -1 : a.entry.relativePath > b.entry.relativePath ? 1 : 0);
    }
  };
  return items.slice().sort(by);
}

/** Single-entry predicate over the content scope (Phase 3 Collections:
 * filter index entries by a parsed query without building a store). */
export function matchesContentEntry(entry: DocumentIndexEntry, q: SearchQuery): boolean {
  return evalNode(q, ctxFor(entry), "content");
}

/** Filename side: the same query scoped to names. Lists nothing unless the
 * query positively names files (`word`/`"phrase"`/`/re/`/`file:` outside
 * negation) — pure filters (`path:`, `tag:`, `content:`, …) select no
 * filenames. One match per file, exact names first. */
export function searchFilenames(
  store: WorkspaceIndex,
  workspaceId: string,
  q: SearchQuery,
  maxResults = 200,
  sort: SearchSort = { key: "relevance", dir: "asc" },
): SearchMatch[] {
  if (isEmptyQuery(q) || !hasPositiveNameTerm(q)) return [];
  const { texts } = collectPositiveTerms(q);
  const out: Array<{ entry: DocumentIndexEntry; tier: number; value: { exact: boolean } }> = [];
  for (const entry of orderedEntries(store, workspaceId)) {
    const c = ctxFor(entry);
    if (!evalNode(q, c, "name")) continue;
    const base = basename(entry.relativePath).toLowerCase();
    const stem = basenameNoExt(entry.relativePath);
    const title = entry.title?.toLowerCase() ?? "";
    const exact = texts.some((t) => t === base || t === stem || (title !== "" && t === title));
    out.push({ entry, tier: exact ? 0 : 1, value: { exact } });
  }
  if (sort.key === "relevance") {
    out.sort(
      (a, b) => a.tier - b.tier || (a.entry.relativePath < b.entry.relativePath ? -1 : a.entry.relativePath > b.entry.relativePath ? 1 : 0),
    );
  } else {
    sortMatches(out, sort);
  }
  return out.slice(0, maxResults).map((m) => ({ relativePath: m.entry.relativePath, line: 0, column: 0, preview: m.entry.relativePath }));
}

/** Content side: one match per file with an honest snippet. An empty query
 * matches nothing (recents own the empty state in the UI). */
export function searchContent(
  store: WorkspaceIndex,
  workspaceId: string,
  q: SearchQuery,
  maxResults = 1000,
  sort: SearchSort = { key: "relevance", dir: "asc" },
): SearchMatch[] {
  if (isEmptyQuery(q)) return [];
  const { texts, regexes } = collectPositiveTerms(q);
  const preferTask = hasPositiveTaskSelector(q);
  const out: Array<{ entry: DocumentIndexEntry; tier: number; value: null }> = [];
  for (const entry of orderedEntries(store, workspaceId)) {
    const c = ctxFor(entry);
    if (!evalNode(q, c, "content")) continue;
    out.push({ entry, tier: contentTier(texts, entry), value: null });
  }
  const sorted = sortMatches(out, sort.key === "relevance" ? { key: "relevance", dir: "asc" } : sort);
  return sorted.slice(0, maxResults).map(({ entry }) => {
    const c = ctxFor(entry);
    const s = pickSnippet(entry, c.hayLower, c.hay, texts, regexes, preferTask);
    return { relativePath: entry.relativePath, line: s.line, column: s.column, preview: s.preview };
  });
}
