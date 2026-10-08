import type { DocumentIndexEntry } from "./document";

/** Typed relation graph over the parse-once index (Step 3 edge table).
 *
 * One `buildEdges` call over a workspace's entries feeds every graph
 * consumer (backlinks, unlinked mentions, graph view, Collections) — there
 * is intentionally one resolution rule, not one per feature. Derived,
 * rebuildable, discardable like the index itself (ADR-0008): dropping the
 * edges loses no knowledge. Pure, total, host-independent: identical
 * entries build identical edges anywhere.
 *
 * Resolution rules (single rule — `resolveWikilinkTarget` in
 * `workspace-flows.ts` delegates here over indexed paths):
 * - Candidates are indexed note paths only (`.md`/`.markdown`/`.txt`).
 * - Alias (`|…`), heading (`#…`) and block (`#^…`) fragments never affect
 *   resolution; they ride along in `detail`.
 * - Bare names: exact-case match wins when unique, else a case-folded
 *   match wins when unique, else unresolved. Duplicate bare names
 *   (two `Note.md`) are ambiguous → unresolved, never guessed.
 * - Path-qualified targets match by suffix (`Projects/Note` =
 *   `Projects/Note.md`), uniquely or not at all. Extension is optional.
 * - Links to nonexistent notes are valid edges with `to: null`.
 *
 * Other kinds:
 * - `property-ref`: a string (or list-of-string) frontmatter value that
 *   resolves to an indexed note. Only resolved values emit edges —
 *   titles and dates that match nothing stay silent. Duplicates within
 *   one property dedupe case-insensitively.
 * - `tag`: one edge per merged entry tag (frontmatter + inline,
 *   normalized). `to` is the normalized tag name; `kind` distinguishes
 *   it from note paths.
 * - `task`: one edge per indexed task. `to` is a stable node id —
 *   `path#^anchor` when the task carries an existing `^anchor`, else
 *   `path#L<line>`. Indexing never assigns anchors (ADR-0010).
 *
 * Same-file `[[#heading]]` links never reach here: the parser drops
 * empty targets. Output is sorted (from, kind, to, line) so two builds
 * over the same entries are byte-identical.
 */

export type EdgeKind = "link" | "embed" | "property-ref" | "tag" | "task";

export type EdgeDetail = {
  /** Raw target text for link/embed/property-ref edges. */
  target?: string;
  alias?: string;
  heading?: string;
  blockAnchor?: string;
  /** 1-based file line (link/embed/task). Frontmatter-derived edges have none. */
  line?: number;
  /** Frontmatter key for property-ref edges. */
  prop?: string;
  /** Normalized tag for tag edges. */
  tag?: string;
  description?: string;
  completed?: boolean;
  anchor?: string;
};

export type Edge = {
  /** Source note (`workspaceId` is implicit: edges never cross workspaces). */
  from: string;
  /** Target note path, tag name, or task node id. `null` = unresolved link. */
  to: string | null;
  kind: EdgeKind;
  detail?: EdgeDetail;
};

const NOTE_EXT = /\.(md|markdown|txt)$/i;

/** Resolve one raw link target against indexed note paths. Single rule —
 * ambiguous (duplicate bare names) or missing targets yield `null`. */
export function resolveLinkTarget(target: string, candidates: string[]): string | null {
  const raw = target.split("#")[0] ?? "";
  const base = raw.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!base) return null;
  const notes = candidates.filter((f) => NOTE_EXT.test(f));
  if (notes.length === 0) return null;
  if (!base.includes("/")) {
    const stem = base.replace(NOTE_EXT, "").toLowerCase();
    const exact = notes.filter((f) => f.split("/").pop()!.replace(NOTE_EXT, "") === base.replace(NOTE_EXT, ""));
    if (exact.length === 1) return exact[0]!;
    const folded = notes.filter((f) => f.split("/").pop()!.replace(NOTE_EXT, "").toLowerCase() === stem);
    return folded.length === 1 ? folded[0]! : null;
  }
  const withExt = NOTE_EXT.test(base) ? base : `${base}.md`;
  const norm = withExt.toLowerCase();
  const hits = notes.filter((f) => {
    const l = f.toLowerCase();
    return l === norm || l.endsWith(`/${norm}`);
  });
  const uniq = [...new Set(hits)];
  return uniq.length === 1 ? uniq[0]! : null;
}

const KIND_RANK: Record<EdgeKind, number> = { link: 0, embed: 1, "property-ref": 2, tag: 3, task: 4 };

/** Build the typed edge table for one workspace's entries. */
export function buildEdges(entries: DocumentIndexEntry[]): Edge[] {
  const sorted = entries.slice().sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
  const paths = sorted.map((e) => e.relativePath);
  const edges: Edge[] = [];
  for (const e of sorted) {
    for (const l of e.links) {
      edges.push({
        from: e.relativePath,
        to: resolveLinkTarget(l.target, paths),
        kind: l.embed ? "embed" : "link",
        detail: {
          target: l.target,
          ...(l.alias === undefined ? {} : { alias: l.alias }),
          ...(l.heading === undefined ? {} : { heading: l.heading }),
          ...(l.blockAnchor === undefined ? {} : { blockAnchor: l.blockAnchor }),
          line: l.line,
        },
      });
    }
    for (const prop of Object.keys(e.frontmatter).sort()) {
      const raw = e.frontmatter[prop];
      const values = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
      const seen = new Set<string>();
      for (const value of values) {
        const trimmed = value.trim();
        const folded = trimmed.toLowerCase();
        if (!trimmed || seen.has(folded)) continue;
        seen.add(folded);
        const to = resolveLinkTarget(trimmed, paths);
        if (to) edges.push({ from: e.relativePath, to, kind: "property-ref", detail: { prop, target: trimmed } });
      }
    }
    for (const t of e.tags) {
      edges.push({ from: e.relativePath, to: t, kind: "tag", detail: { tag: t } });
    }
    for (const t of e.tasks) {
      edges.push({
        from: e.relativePath,
        to: t.anchor ? `${e.relativePath}#^${t.anchor}` : `${e.relativePath}#L${t.line}`,
        kind: "task",
        detail: {
          description: t.description,
          completed: t.completed,
          line: t.line,
          ...(t.anchor === undefined ? {} : { anchor: t.anchor }),
        },
      });
    }
  }
  edges.sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (a.kind !== b.kind) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
    const at = a.to ?? "￿";
    const bt = b.to ?? "￿";
    if (at !== bt) return at < bt ? -1 : 1;
    return (a.detail?.line ?? 0) - (b.detail?.line ?? 0);
  });
  return edges;
}
