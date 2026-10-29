/** Multi-hit search for the Search panel: every matching line per note, with context and match case. */
import { bodyLinePreview, type DocumentIndexEntry } from "../index/document.js";
import {
  collectPositiveTerms, hasPositiveTaskSelector, parseSearchQuery,
  type SearchParseError, type SearchQuery,
} from "./query.js";
import { matchesContentEntry } from "./search.js";

export type SearchHit = {
  /** 1-based line in the file. */
  line: number;
  text: string;
  before: string[];
  after: string[];
};
export type NoteHits = { relativePath: string; title: string; hits: SearchHit[]; total: number };

export const HITS_PER_PAGE = 50;

/** Filters offered as chips, in the order shown. */
export const SEARCH_FILTERS = ["file:", "path:", "tag:", "task:open", "task:done", "[status:active]", "-", "\"phrase\""] as const;

/** Plain-words problem for a bad query. */
export function plainSearchError(err: SearchParseError): string {
  if (/unsupported search operator/.test(err.message)) {
    return `Unknown filter '${err.operator.split(":")[0]}:'. Try file:, path:, tag: or task:.`;
  }
  if (/"line:"/.test(err.message)) return "line: needs a number, like line:12.";
  if (/"is:"/.test(err.message)) return "is: only works as is:task.";
  return "That search can’t be read. Check the quotes and brackets.";
}

/** Words and phrases typed by the person, with their original case (operators, negations and brackets dropped). */
export function plainTerms(raw: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m[1] !== undefined) { if (m[1] && raw[m.index - 1] !== "-") out.push(m[1]); continue; }
    const tok = m[2]!;
    if (tok.startsWith("-") || tok.includes(":") || /^[()[\]]/.test(tok) || tok === "OR" || tok === "AND") continue;
    out.push(tok);
  }
  return out;
}

/** The note body as numbered file lines (the index keeps title, aliases, headings and tags in front of it). */
export function bodyLines(entry: DocumentIndexEntry): Array<{ line: number; text: string }> {
  const head = entry.title === undefined ? [] : [entry.title];
  const prefix = [...head, ...entry.aliases, ...entry.headings.map((h) => h.text), ...entry.tags].join("\n");
  const prefixLines = prefix.split("\n").length;
  return entry.searchableText.split("\n").slice(prefixLines).map((text, k) => ({ line: entry.bodyStartLine + k, text }));
}

export type HitOptions = { matchCase: boolean; context: number; isCancelled?: () => boolean };

const yieldToUi = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Terms to highlight in a result line. */
export function highlightTerms(q: SearchQuery, raw: string, matchCase: boolean): { texts: string[]; regexes: RegExp[] } {
  const { texts, regexes } = collectPositiveTerms(q);
  return { texts: matchCase ? plainTerms(raw) : texts, regexes };
}

/** Matching notes with all their matching lines. Works in small slices and yields between them, so typing never waits on a search. */
export async function searchNotes(entries: readonly DocumentIndexEntry[], raw: string, opts: HitOptions): Promise<{ notes: NoteHits[]; error: string | null; cancelled: boolean }> {
  const parsed = parseSearchQuery(raw.trim());
  if (!parsed.ok) return { notes: [], error: plainSearchError(parsed.error), cancelled: false };
  const q = parsed.query;
  const { texts, regexes } = collectPositiveTerms(q);
  const caseTerms = opts.matchCase ? plainTerms(raw) : [];
  const taskLines = hasPositiveTaskSelector(q);
  const lineMatches = (line: string): boolean => {
    if (opts.matchCase && caseTerms.length > 0) return caseTerms.some((t) => line.includes(t));
    const low = line.toLowerCase();
    return texts.some((t) => low.includes(t)) || regexes.some((r) => r.test(line));
  };
  const notes: NoteHits[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (i % 100 === 99) {
      await yieldToUi();
      if (opts.isCancelled?.()) return { notes, error: null, cancelled: true };
    }
    const entry = entries[i]!;
    if (!matchesContentEntry(entry, q)) continue;
    const lines = bodyLines(entry);
    const byLine = new Map(lines.map((l, k) => [l.line, k] as const));
    let hits: SearchHit[] = [];
    if (texts.length > 0 || regexes.length > 0) {
      hits = lines.filter((l) => l.text.trim() !== "" && lineMatches(l.text)).map((l) => ({ line: l.line, text: l.text, before: [], after: [] }));
      // A case-sensitive search only keeps notes that really contain the exact text.
      if (opts.matchCase && caseTerms.length > 0 && hits.length === 0) continue;
    } else if (taskLines) {
      hits = entry.tasks.map((t) => ({ line: t.line, text: bodyLinePreview(entry, t.line, 200) ?? t.description, before: [], after: [] }));
    }
    if (opts.context > 0) {
      for (const h of hits) {
        const k = byLine.get(h.line);
        if (k === undefined) continue;
        h.before = lines.slice(Math.max(0, k - opts.context), k).map((l) => l.text);
        h.after = lines.slice(k + 1, k + 1 + opts.context).map((l) => l.text);
      }
    }
    notes.push({ relativePath: entry.relativePath, title: entry.title ?? entry.relativePath.replace(/^.*\//, "").replace(/\.md$/i, ""), hits, total: hits.length });
  }
  return { notes, error: null, cancelled: false };
}
