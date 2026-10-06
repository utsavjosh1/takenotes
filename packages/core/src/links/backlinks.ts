import type { DocumentIndexEntry } from "../index/document";
import type { Edge } from "../index/edges";

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
 * code, so a name inside a code block still counts as a mention.
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
