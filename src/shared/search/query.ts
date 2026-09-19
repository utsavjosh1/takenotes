import type { AppError } from "../errors";

/** Search V1 query language (P1-08). Deterministic, pure, total —
 * filesystem- and renderer-independent. Grammar:
 *
 *   plain terms (case-insensitive substring)
 *   "exact phrases" (quotes keep one term; unterminated → rest is a phrase)
 *   file: / path: / tag: / type: (repeatable, quoted values allowed)
 *   is:task
 *
 * Everything supplied is AND-combined. Deferred operators (`link:`,
 * `due:`, `scheduled:`, `is:<other>`, …) are INVALID_REQUEST naming the
 * operator — never silently reinterpreted. Non-operator `a:b` text and
 * bare AND/OR/NOT stay plain text (implicit composition is AND anyway).
 */
export type SearchQuery = {
  textTerms: string[];
  phrases: string[];
  fileFilters: string[];
  pathFilters: string[];
  /** Normalized like P1-07 entry tags (lowercase, no leading `#`). */
  tags: string[];
  types: string[];
  taskOnly: boolean;
};

export type SearchParseError = AppError & { operator: string };

export type SearchParseResult = { ok: true; query: SearchQuery } | { ok: false; error: SearchParseError };

/** Deferred Phase-1-out operators: using one is an error naming it, so a
 * later Collections/advanced-search syntax can never be mistaken for V1. */
const DEFERRED_OPERATORS = new Set([
  "link",
  "links",
  "backlink",
  "backlinks",
  "due",
  "scheduled",
  "before",
  "after",
  "created",
  "modified",
  "saved",
  "regex",
  "regexp",
  "fuzzy",
  "has",
  "no",
  "prop",
  "property",
  "field",
]);

function emptyQuery(): SearchQuery {
  return { textTerms: [], phrases: [], fileFilters: [], pathFilters: [], tags: [], types: [], taskOnly: false };
}

function normalizeTagValue(raw: string): string {
  return raw.replace(/^#+/, "").trim().toLowerCase();
}

/** Split on whitespace, except inside double quotes. An operator prefix
 * before the opening quote stays outside (`file:"a b"` → one token), so
 * values may contain spaces. An unterminated quote runs to the end. */
function tokenize(raw: string): string[] {
  const out: string[] = [];
  let cur = "";
  let prefix = "";
  let inQuotes = false;
  for (const ch of raw) {
    if (ch === '"') {
      if (!inQuotes) {
        prefix = cur;
        cur = "";
        inQuotes = true;
      } else {
        out.push(`${prefix}"${cur}"`);
        prefix = "";
        cur = "";
        inQuotes = false;
      }
      continue;
    }
    if (!inQuotes && (ch === " " || ch === "\t" || ch === "\n")) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (inQuotes) out.push(`${prefix}"${cur}"`);
  else if (cur) out.push(cur);
  return out;
}

/** Strip one layer of surrounding quotes (tolerates the unterminated side). */
function unquote(value: string): string {
  let v = value;
  if (v.startsWith('"')) v = v.slice(1);
  if (v.endsWith('"') && v.length > 0) v = v.slice(0, -1);
  return v.trim();
}

function invalid(operator: string): SearchParseResult {
  return {
    ok: false,
    error: {
      code: "INVALID_REQUEST",
      message: `Unsupported search operator "${operator}". Search V1 supports plain text, "phrases", file:, path:, tag:, type:, is:task.`,
      operator,
    },
  };
}

export function parseSearchQuery(raw: string): SearchParseResult {
  const query = emptyQuery();
  for (const token of tokenize(raw)) {
    // Quoted token → exact phrase (operator prefixes never enter quotes).
    if (token.startsWith('"')) {
      const phrase = unquote(token).toLowerCase();
      if (phrase) query.phrases.push(phrase);
      continue;
    }
    // First colon splits operator from value; colons inside quoted values
    // were protected by the tokenizer.
    const colon = token.indexOf(":");
    if (colon > 0) {
      const name = token.slice(0, colon).toLowerCase();
      const v = unquote(token.slice(colon + 1)).toLowerCase();
      if (name === "file" || name === "path" || name === "tag" || name === "type") {
        // `file:` with an empty value is ignored, not an error.
        if (!v) continue;
        if (name === "file") query.fileFilters.push(v);
        else if (name === "path") query.pathFilters.push(v);
        else if (name === "type") query.types.push(v);
        else {
          const t = normalizeTagValue(v);
          if (t) query.tags.push(t);
        }
        continue;
      }
      if (name === "is") {
        if (v === "task") {
          query.taskOnly = true;
          continue;
        }
        return invalid(token);
      }
      if (DEFERRED_OPERATORS.has(name)) return invalid(token);
      // Non-operator `a:b` (URLs, times, prose) stays plain text.
      query.textTerms.push(token.toLowerCase());
      continue;
    }
    const term = token.toLowerCase();
    if (term) query.textTerms.push(term);
  }
  return { ok: true, query };
}
