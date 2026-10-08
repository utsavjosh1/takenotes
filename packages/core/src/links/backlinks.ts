import { bodyLinePreview, type DocumentIndexEntry } from "../index/document";
import type { Edge } from "../index/edges";
import { formatMarkdownLink, formatWikilink, type LinkFormat } from "./completion";

/** Backlinks + outgoing panes over the typed edge table (Step 4).
 *
 * Read-only derivation: edges (and entries, for unlinked detection) in,
 * pane rows out. No filesystem, no React, no second resolution rule.
 *
 * Unlinked mentions are name matches — the target's title + aliases,
 * case-insensitive, minimum 2 characters — in another entry's
 * `searchableText`, where no link/embed edge to the target exists.
 * Alias-aware: a text mention of an alias counts, and reports the alias
 * as the matched text. Code-block caveat: `searchableText` keeps fenced
 * code, so a name inside a code block still counts as a mention (the
 * panes say so under their unlinked sections).
 *
 * Exclusion invariant: unlinked detection iterates index entries only,
 * and the index build never admits excluded directories (`.git`,
 * `node_modules`, …) — excluded files cannot surface as mentions without
 * any per-pane filtering.
 *
 * Unresolved-links model: an edge with `to: null` is a link to a
 * nonexistent note — valid, listed under Unresolved, creatable via
 * follow-to-create. Never an error, never guessed.
 */

export type Backlink = {
  from: string;
  line: number;
  alias?: string;
  heading?: string;
  blockAnchor?: string;
  embed: boolean;
};

export type UnlinkedMention = {
  from: string;
  matchedText: string;
};

export type OutgoingLink = {
  /** Resolved note path, or `null` for links to nonexistent notes. */
  to: string | null;
  /** Raw target text (for display when unresolved). */
  target: string;
  line: number;
  alias?: string;
  heading?: string;
  blockAnchor?: string;
  embed: boolean;
};

/** Links + embeds leaving one note, in edge-table order (stable). */
export function outgoingFor(edges: Edge[], from: string): OutgoingLink[] {
  const out: OutgoingLink[] = [];
  for (const e of edges) {
    if (e.from !== from || (e.kind !== "link" && e.kind !== "embed")) continue;
    out.push({
      to: e.to,
      target: e.detail?.target ?? e.to ?? "",
      line: e.detail?.line ?? 0,
      ...(e.detail?.alias === undefined ? {} : { alias: e.detail.alias }),
      ...(e.detail?.heading === undefined ? {} : { heading: e.detail.heading }),
      ...(e.detail?.blockAnchor === undefined ? {} : { blockAnchor: e.detail.blockAnchor }),
      embed: e.kind === "embed",
    });
  }
  return out;
}

/** Linked backlinks + unlinked mentions pointing at one note. A note with
 * no index entry (e.g. never created) yields empty panes. */
export function backlinksFor(
  edges: Edge[],
  entries: DocumentIndexEntry[],
  target: string,
): { linked: Backlink[]; unlinked: UnlinkedMention[] } {
  const linked: Backlink[] = [];
  for (const e of edges) {
    if (e.to !== target || (e.kind !== "link" && e.kind !== "embed")) continue;
    linked.push({
      from: e.from,
      line: e.detail?.line ?? 0,
      ...(e.detail?.alias === undefined ? {} : { alias: e.detail.alias }),
      ...(e.detail?.heading === undefined ? {} : { heading: e.detail.heading }),
      ...(e.detail?.blockAnchor === undefined ? {} : { blockAnchor: e.detail.blockAnchor }),
      embed: e.kind === "embed",
    });
  }
  const unlinked: UnlinkedMention[] = [];
  const self = entries.find((e) => e.relativePath === target);
  if (!self) return { linked, unlinked };
  const seen = new Set<string>();
  const names: string[] = [];
  for (const n of [self.title ?? "", ...self.aliases]) {
    const folded = n.toLowerCase();
    if (n.length >= 2 && !seen.has(folded)) {
      seen.add(folded);
      names.push(n);
    }
  }
  const linkedFrom = new Set(linked.map((l) => l.from));
  for (const e of entries) {
    if (e.relativePath === target || linkedFrom.has(e.relativePath)) continue;
    const hay = e.searchableText.toLowerCase();
    let best: string | null = null;
    for (const n of names) {
      if (hay.includes(n.toLowerCase()) && (!best || n.length > best.length)) best = n;
    }
    // A same-named note echoing its own title is a collision, not a
    // mention: skip when the match is also one of the candidate's names.
    if (best) {
      const own = new Set([e.title ?? "", ...e.aliases].map((n) => n.toLowerCase()));
      if (!own.has(best.toLowerCase())) unlinked.push({ from: e.relativePath, matchedText: best });
    }
  }
  unlinked.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return { linked, unlinked };
}

export type OutgoingUnlinked = {
  /** Existing note path whose name appears unlinked in the active note. */
  to: string;
  matchedText: string;
};

/** Outgoing unlinked mentions: other notes' titles/aliases appearing as
 * plain text in the active note with no link/embed edge to them — the
 * mirror of `backlinksFor`'s unlinked set, same 2-character minimum and
 * alias-awareness. Sorted by path. */
export function outgoingUnlinked(
  edges: Edge[],
  entries: DocumentIndexEntry[],
  from: string,
): OutgoingUnlinked[] {
  const self = entries.find((e) => e.relativePath === from);
  if (!self) return [];
  const linkedTo = new Set<string>();
  for (const e of edges) {
    if (e.from === from && (e.kind === "link" || e.kind === "embed") && e.to) linkedTo.add(e.to);
  }
  const hay = self.searchableText.toLowerCase();
  const out: OutgoingUnlinked[] = [];
  for (const cand of entries) {
    if (cand.relativePath === from || linkedTo.has(cand.relativePath)) continue;
    const seen = new Set<string>();
    let best: string | null = null;
    for (const n of [cand.title ?? "", ...cand.aliases]) {
      const folded = n.toLowerCase();
      if (n.length < 2 || seen.has(folded)) continue;
      seen.add(folded);
      if (hay.includes(folded) && (!best || n.length > best.length)) best = n;
    }
    if (best) {
      // Same collision guard as backlinks: the active note echoing its own
      // title is not a mention of the candidate.
      const own = new Set([self.title ?? "", ...self.aliases].map((n) => n.toLowerCase()));
      if (!own.has(best.toLowerCase())) out.push({ to: cand.relativePath, matchedText: best });
    }
  }
  out.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0));
  return out;
}

export type MentionSort = "name" | "modified";

/** Sort mention rows (`linked`, `unlinked`, outgoing): `name` is path-asc
 * (the default); `modified` is index mtime desc, unindexed paths last.
 * `key` picks the sorted path (`from` for backlinks, `to` for outgoing).
 * Returns a new array; never mutates. */
export function sortMentionRows<T>(rows: T[], entries: DocumentIndexEntry[], mode: MentionSort, key: (row: T) => string): T[] {
  if (mode === "name") return rows.slice().sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const mtime = new Map(entries.map((e) => [e.relativePath, e.revision.mtimeMs] as const));
  return rows.slice().sort((a, b) => (mtime.get(key(b)) ?? -1) - (mtime.get(key(a)) ?? -1));
}

/** Filter predicate for the pane filter box: every whitespace-separated
 * token must appear (case-insensitive) in the row path or entry title.
 * Empty query matches everything. */
export function matchesMentionFilter(row: { from: string }, query: string, entry: DocumentIndexEntry | undefined): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = `${row.from} ${entry?.title ?? ""}`.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

/** Context line behind a pane row: the source line of a linked row, or the
 * first line in the row's note mentioning `matched` for an unlinked row.
 * Null when nothing suitable exists (never throws). */
export function mentionContext(
  entries: DocumentIndexEntry[],
  row: { from: string; line?: number; matchedText?: string },
): string | null {
  const entry = entries.find((e) => e.relativePath === row.from);
  if (!entry) return null;
  if (row.line !== undefined) return bodyLinePreview(entry, row.line);
  if (row.matchedText !== undefined) {
    const needle = row.matchedText.toLowerCase();
    for (const line of entry.searchableText.split("\n")) {
      if (line.toLowerCase().includes(needle)) {
        const t = line.trim();
        return t.length > 120 ? `${t.slice(0, 119)}…` : t;
      }
    }
  }
  return null;
}

export { bodyLinePreview };

export type LinkMentionEdit = {
  content: string;
  /** 1-based file line of the converted mention. */
  line: number;
};

/** Convert the first body occurrence of an unlinked mention into a real
 * link (`[[Canon|Alias]]`, or `[Alias](url)` when wikilinks are off).
 *
 * Total: null when nothing convertible exists. The search is
 * case-insensitive but preserves the actual casing as the label; the
 * frontmatter block, fenced code, and existing `[[…]]` spans are never
 * touched, so conversion cannot corrupt metadata, code, or other links.
 * Only the first convertible occurrence changes per call — repeated
 * mentions convert one tap at a time, each re-verified against the index. */
export function linkMentionEdit(
  content: string,
  matchedText: string,
  targetPath: string,
  fromPath: string,
  format: LinkFormat,
  useWikilinks: boolean,
): LinkMentionEdit | null {
  const needle = matchedText.trim();
  if (!needle) return null;
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  let bodyStart = 0;
  if (/^---\s*$/.test(lines[0] ?? "")) {
    for (let i = 1; i < lines.length; i++) {
      if (/^---\s*$/.test(lines[i]!) || /^\.\.\.\s*$/.test(lines[i]!)) {
        bodyStart = i + 1;
        break;
      }
    }
  }
  const folded = needle.toLowerCase();
  let inFence = false;
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^(```+|~~~+)/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // Existing `[[…]]` spans are opaque: a mention inside another link
    // belongs to that link, never to this conversion.
    const spans: Array<{ start: number; end: number }> = [];
    const re = /(!?)\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) spans.push({ start: m.index, end: m.index + m[0].length });
    const hay = line.toLowerCase();
    let at = hay.indexOf(folded);
    while (at >= 0) {
      if (!spans.some((s) => at >= s.start && at < s.end)) {
        const actual = line.slice(at, at + needle.length);
        const link = useWikilinks
          ? `[[${formatWikilink(targetPath, fromPath, format)}|${actual}]]`
          : formatMarkdownLink(targetPath, actual, fromPath, format);
        lines[i] = `${line.slice(0, at)}${link}${line.slice(at + needle.length)}`;
        return { content: lines.join("\n"), line: i + 1 };
      }
      at = hay.indexOf(folded, at + 1);
    }
  }
  return null;
}
