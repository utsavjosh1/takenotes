import { parse as parseYaml } from "yaml";
import type { FileRevision } from "../contracts/ipc";

/** Parse-once document index entries (P1-07, ADR-0008/ADR-0010).
 *
 * One `parseDocument` call per file feeds every Phase-1 consumer (search,
 * links, tasks, calendar, …) — there is intentionally no second parser per
 * feature. Markdown on disk stays authoritative; entries are derived,
 * rebuildable, discardable. The parser is total: malformed frontmatter or
 * hostile bytes degrade to `{}`/skips, never to a thrown error or a dead
 * workspace index. Host-independent (no fs, no platform): identical bytes
 * parse identically for `windows-local` and `windows-wsl`.
 */

export type IndexHeading = {
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  /** 1-based file line (frontmatter lines count — stable for navigation). */
  line: number;
  /** GitHub-style slug, deduplicated per file (`repeat`, `repeat-1`). */
  anchor: string;
};

export type IndexLink = {
  /** Raw target text (`MCP` in `[[MCP#Server|label]]`). */
  target: string;
  alias?: string;
  heading?: string;
  /** `[[Note#^blk]]` keeps the block anchor syntactic. */
  blockAnchor?: string;
  embed: boolean;
  /** 1-based file line. */
  line: number;
  /** P1-07 does not resolve: backlinks/graph own resolution later. */
  resolved: false;
};

export type IndexTask = {
  description: string;
  completed: boolean;
  /** 1-based file line. */
  line: number;
  /** Existing trailing `^anchor` only — indexing never assigns IDs (ADR-0010). */
  anchor?: string;
  tags: string[];
  /** Explicit `@due(...)` — validated explicit date, never NLP. */
  due?: string;
  scheduled?: string;
  priority?: string;
};

export type DocumentIndexEntry = {
  workspaceId: string;
  relativePath: string;
  /** Revision the entry was parsed from; a new hash replaces the entry. */
  revision: FileRevision;
  /** Raw frontmatter map (general properties preserved); `{}` when absent
   * or malformed. The file is still indexed either way. */
  frontmatter: Record<string, unknown>;
  title?: string;
  aliases: string[];
  /** Frontmatter + inline tags merged, normalized, deduplicated. */
  tags: string[];
  docType?: string;
  status?: string;
  /** Explicit dates only (`YYYY-MM-DD` or full ISO); `tomorrow` never lands here. */
  dates: {
    date?: string;
    due?: string;
    scheduled?: string;
    created?: string;
    modified?: string;
  };
  headings: IndexHeading[];
  links: IndexLink[];
  tasks: IndexTask[];
  /** Title + aliases + headings + tags + body (frontmatter excluded). */
  searchableText: string;
  /** 1-based file line where the body begins (after frontmatter; 1 when
   * absent). Lets consumers map body matches to honest file lines. */
  bodyStartLine: number;
};

const MAX_FRONTMATTER_SCAN_LINES = 500;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/ +/g, "-");
}

function normalizeTag(raw: string): string | null {
  const t = raw.replace(/^#+/, "").trim().toLowerCase();
  if (!t || !/[a-z_/]/.test(t)) return null;
  return t;
}

/** `YYYY-MM-DD` with an optional `THH:MM[:SS]`; range-checked (incl. leap
 * years) so `2026-13-40` is ignored, never indexed. No `Date` construction
 * (no timezone reinterpretation) and no natural language — deterministic. */
export function isExplicitDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] === undefined ? 0 : Number(m[4]);
  const minute = m[5] === undefined ? 0 : Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
  return day >= 1 && day <= days;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t ? t : undefined;
}

/** Scalar or list of scalars → trimmed non-empty strings (one level). */
function asStringList(value: unknown): string[] {
  const items = Array.isArray(value) ? value.flatMap((v) => (Array.isArray(v) ? v : [v])) : [value];
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      const t = String(item).trim();
      if (t) out.push(t);
    }
  }
  return out;
}

type Span = { start: number; end: number };

/** `[[…]]` spans on a line (for embed detection + tag exclusion). */
function linkSpans(line: string): Array<Span & { embed: boolean; inner: string }> {
  const out: Array<Span & { embed: boolean; inner: string }> = [];
  const re = /(!?)\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    out.push({ start: m.index, end: m.index + m[0]!.length, embed: m[1] === "!", inner: m[2]! });
  }
  return out;
}

function insideSpans(spans: Span[], index: number): boolean {
  return spans.some((s) => index >= s.start && index < s.end);
}

const TAG_RE = /(?:^|[\s([{>"'])#([A-Za-z0-9_][A-Za-z0-9_\-/]*)/g;

function inlineTags(line: string, spans: Span[]): string[] {
  const out: string[] = [];
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(line)) !== null) {
    if (insideSpans(spans, m.index)) continue;
    // Strip trailing punctuation the boundary class admits (`#tag.` → `tag`).
    const cleaned = m[1]!.replace(/[.,;:!?)"'\]]+$/, "");
    const t = normalizeTag(cleaned);
    if (t) out.push(t);
  }
  return out;
}

const TOKEN_RE = /@(due|scheduled|priority)\(([^)]*)\)/g;
const ANCHOR_RE = /\s\^([A-Za-z0-9_-]+)\s*$/;

function parseTaskLine(line: string, lineNo: number): IndexTask | null {
  const m = /^(?:\s*(?:>\s*)*)([-*+]|\d+[.)])\s+\[([ xX])\]\s+(.*)$/.exec(line);
  if (!m) return null;
  let rest = m[3] ?? "";
  let anchor: string | undefined;
  const am = ANCHOR_RE.exec(rest);
  if (am) {
    anchor = am[1];
    rest = rest.slice(0, am.index);
  }
  let due: string | undefined;
  let scheduled: string | undefined;
  let priority: string | undefined;
  TOKEN_RE.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = TOKEN_RE.exec(rest)) !== null) {
    const value = tm[2]!.trim();
    if (tm[1] === "due" && isExplicitDate(value)) due = value;
    else if (tm[1] === "scheduled" && isExplicitDate(value)) scheduled = value;
    else if (tm[1] === "priority" && value) priority = value.toLowerCase();
  }
  TOKEN_RE.lastIndex = 0;
  const description = rest
    .replace(TOKEN_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    description,
    completed: m[2] === "x" || m[2] === "X",
    line: lineNo,
    ...(anchor === undefined ? {} : { anchor }),
    tags: inlineTags(description, []),
    ...(due === undefined ? {} : { due }),
    ...(scheduled === undefined ? {} : { scheduled }),
    ...(priority === undefined ? {} : { priority }),
  };
}

/** Parse one file's bytes into its index entry. Total: never throws. */
export function parseDocument(
  workspaceId: string,
  relativePath: string,
  content: string,
  revision: FileRevision,
): DocumentIndexEntry {
  // BOM-tolerant, CRLF-tolerant; NUL bytes ride along harmlessly (JS
  // strings are length-prefixed — binary-ish `.md` never crashes us).
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  // --- frontmatter (opening `---` must be the first line) ---
  let frontmatter: Record<string, unknown> = {};
  let bodyStart = 0;
  if (/^---\s*$/.test(lines[0] ?? "")) {
    let close = -1;
    const limit = Math.min(lines.length, MAX_FRONTMATTER_SCAN_LINES);
    for (let i = 1; i < limit; i++) {
      if (/^---\s*$/.test(lines[i]!) || /^\.\.\.\s*$/.test(lines[i]!)) {
        close = i;
        break;
      }
    }
    if (close > 0) {
      // Bad YAML degrades to `{}` — the file is still indexed.
      try {
        const parsed: unknown = parseYaml(lines.slice(1, close).join("\n"));
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          frontmatter = parsed as Record<string, unknown>;
        }
      } catch {
        frontmatter = {};
      }
      bodyStart = close + 1;
    }
    // No closing fence: not frontmatter at all — the whole file stays body.
  }

  const title = asTrimmedString(frontmatter["title"]);
  const aliases = asStringList(frontmatter["aliases"] ?? frontmatter["alias"]);
  const docType = asTrimmedString(frontmatter["type"]);
  const status = asTrimmedString(frontmatter["status"]);

  const dates: DocumentIndexEntry["dates"] = {};
  for (const key of ["date", "due", "scheduled", "created", "modified"] as const) {
    const raw = frontmatter[key];
    if (typeof raw === "string" && isExplicitDate(raw)) dates[key] = raw.trim();
  }

  const tagSet = new Set<string>();
  const tags: string[] = [];
  const pushTag = (raw: string): void => {
    const t = normalizeTag(raw);
    if (t && !tagSet.has(t)) {
      tagSet.add(t);
      tags.push(t);
    }
  };
  for (const raw of asStringList(frontmatter["tags"])) {
    for (const piece of raw.split(/[\s,]+/)) pushTag(piece);
  }

  const headings: IndexHeading[] = [];
  const links: IndexLink[] = [];
  const tasks: IndexTask[] = [];
  const anchorCounts = new Map<string, number>();
  let inFence = false;

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;
    if (/^(```+|~~~+)/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const hm = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (hm) {
      const text = hm[2]!.trim();
      if (text) {
        const base = slugify(text) || "section";
        const n = anchorCounts.get(base) ?? 0;
        anchorCounts.set(base, n + 1);
        headings.push({ text, level: hm[1]!.length as IndexHeading["level"], line: lineNo, anchor: n === 0 ? base : `${base}-${n}` });
      }
    }

    const spans = linkSpans(line);
    for (const s of spans) {
      const bar = s.inner.indexOf("|");
      const targetPart = (bar < 0 ? s.inner : s.inner.slice(0, bar)).trim();
      const alias = bar < 0 ? undefined : s.inner.slice(bar + 1).trim() || undefined;
      const hash = targetPart.indexOf("#");
      const target = (hash < 0 ? targetPart : targetPart.slice(0, hash)).trim();
      const afterHash = hash < 0 ? undefined : targetPart.slice(hash + 1).trim();
      if (!target) continue;
      const blockAnchor = afterHash?.startsWith("^") ? afterHash.slice(1).trim() || undefined : undefined;
      const heading = blockAnchor !== undefined || afterHash === undefined || afterHash === "" ? undefined : afterHash;
      links.push({
        target,
        ...(alias === undefined ? {} : { alias }),
        ...(heading === undefined ? {} : { heading }),
        ...(blockAnchor === undefined ? {} : { blockAnchor }),
        embed: s.embed,
        line: lineNo,
        resolved: false,
      });
    }

    for (const t of inlineTags(line, spans)) pushTag(t);

    const task = parseTaskLine(line, lineNo);
    if (task) {
      tasks.push(task);
      for (const t of task.tags) pushTag(t);
    }
  }

  const bodyText = lines.slice(bodyStart).join("\n");
  const searchableText = [
    ...(title === undefined ? [] : [title]),
    ...aliases,
    ...headings.map((h) => h.text),
    ...tags,
    bodyText,
  ].join("\n");

  return {
    workspaceId,
    relativePath,
    revision,
    bodyStartLine: bodyStart + 1,
    frontmatter,
    ...(title === undefined ? {} : { title }),
    aliases,
    tags,
    ...(docType === undefined ? {} : { docType }),
    ...(status === undefined ? {} : { status }),
    dates,
    headings,
    links,
    tasks,
    searchableText,
  };
}
