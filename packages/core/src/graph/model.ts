import type { DocumentIndexEntry } from "../index/document";
import type { Edge } from "../index/edges";
import { isAttachmentTarget } from "../links/embed-params";
import { matchesContentEntry } from "../search/search";
import { isEmptyQuery, parseSearchQuery } from "../search/query";

/** Step 7 Graph model (Phase 4a): read-only derivation over the typed edge
 * table + entries. Pure, total, host-independent — identical entries build
 * identical graphs anywhere. No filesystem, no React, no layout physics.
 *
 * MVP scope (roadmap Step 7, minimal):
 * - Nodes = indexed notes. Ghost/attachment nodes exist only when the
 *   caller opts in (`includeUnresolved` / `includeAttachments`) — the
 *   default graph is notes + resolved `link`/`embed` edges only.
 * - `property-ref` / `tag` / `task` edges never become graph links:
 *   the graph visualizes note→note references (Obsidian parity: Mermaid
 *   links are already excluded — the parser drops fenced code blocks).
 * - Links dedupe to unordered? No — directed source→target pairs dedupe
 *   exactly (self-loops kept once); degrees count distinct neighbours.
 * - Node size basis is `inDegree` (reference count): more-referenced
 *   nodes render larger. Degrees are computed from the deduped links.
 * - Filters reuse the Search grammar (`matchesContentEntry`); invalid
 *   queries surface honestly instead of filtering silently.
 * - Local graph is BFS over undirected adjacency with clamped depth.
 * - Layout is a deterministic circle (no force simulation in MVP) so
 *   two renders of the same model are byte-identical.
 */

export type GraphNode = {
  /** Note path, or `ghost:<raw>` / `attachment:<raw>` for opt-in nodes. */
  id: string;
  /** Display label: note title (fallback stem) or raw target. */
  label: string;
  /** Distinct incoming / outgoing neighbours (deduped links). */
  inDegree: number;
  outDegree: number;
  degree: number;
  /** True for unresolved-target ghosts (nonexistent notes). */
  ghost?: boolean;
  /** True for attachment-target nodes (images/PDFs/audio/video). */
  attachment?: boolean;
  tags: string[];
};

export type GraphLink = {
  source: string;
  target: string;
};

export type GraphModel = {
  nodes: GraphNode[];
  links: GraphLink[];
};

export type BuildGraphOptions = {
  /** Add ghost nodes for unresolved `link`/`embed` targets (default false). */
  includeUnresolved?: boolean;
  /** Add attachment nodes for attachment-target edges (default false).
   * Attachment targets are never indexed notes, so they always arrive
   * as typed ghost-adjacent nodes, never as note nodes. */
  includeAttachments?: boolean;
};

/** Cap on opt-in ghost/attachment nodes — a hostile vault degrades to
 * bounded work, never to an unbounded node list. Note nodes are already
 * bounded by the index build cap. */
export const MAX_GRAPH_GHOSTS = 500;
/** Local-graph depth clamp (Obsidian parity: small integer slider). */
export const MAX_GRAPH_DEPTH = 5;

function stemOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

function ghostId(raw: string): string {
  return `ghost:${raw.trim()}`;
}

function attachmentId(raw: string): string {
  return `attachment:${raw.trim()}`;
}

function titleOf(entry: DocumentIndexEntry): string {
  if (entry.title?.trim()) return entry.title.trim();
  return stemOf(entry.relativePath);
}

/** Build the graph model for one workspace. Total: never throws. */
export function buildGraph(
  entries: DocumentIndexEntry[],
  edges: Edge[],
  opts: BuildGraphOptions = {},
): GraphModel {
  const includeUnresolved = opts.includeUnresolved === true;
  const includeAttachments = opts.includeAttachments === true;

  const byPath = new Map<string, DocumentIndexEntry>();
  for (const e of entries) {
    if (!byPath.has(e.relativePath)) byPath.set(e.relativePath, e);
  }

  // Deduped directed pairs first; degrees derive from them.
  const pairSet = new Set<string>();
  const pairs: Array<{ source: string; target: string }> = [];
  const ghostLabels = new Map<string, { label: string; attachment: boolean }>();

  const pushPair = (source: string, target: string): void => {
    const key = `${source}￿${target}`;
    if (pairSet.has(key)) return;
    pairSet.add(key);
    pairs.push({ source, target });
  };

  for (const e of edges) {
    if (e.kind !== "link" && e.kind !== "embed") continue;
    if (!byPath.has(e.from)) continue;
    const raw = (e.detail?.target ?? "").trim();
    if (e.to && byPath.has(e.to)) {
      pushPair(e.from, e.to);
      continue;
    }
    // Unresolved (or resolved-outside-index): opt-in only.
    if (!raw) continue;
    const attachment = isAttachmentTarget(raw);
    if (attachment && !includeAttachments) continue;
    if (!attachment && !includeUnresolved) continue;
    if (ghostLabels.size >= MAX_GRAPH_GHOSTS) continue;
    const id = attachment ? attachmentId(raw) : ghostId(raw);
    if (!ghostLabels.has(id)) ghostLabels.set(id, { label: raw, attachment });
    pushPair(e.from, id);
  }

  const inDeg = new Map<string, Set<string>>();
  const outDeg = new Map<string, Set<string>>();
  const bump = (m: Map<string, Set<string>>, key: string, other: string): void => {
    let s = m.get(key);
    if (!s) {
      s = new Set<string>();
      m.set(key, s);
    }
    s.add(other);
  };
  for (const p of pairs) {
    bump(inDeg, p.target, p.source);
    bump(outDeg, p.source, p.target);
  }

  const nodes: GraphNode[] = [];
  const sortedPaths = [...byPath.keys()].sort();
  for (const path of sortedPaths) {
    const entry = byPath.get(path)!;
    const ins = inDeg.get(path)?.size ?? 0;
    const outs = outDeg.get(path)?.size ?? 0;
    nodes.push({
      id: path,
      label: titleOf(entry),
      inDegree: ins,
      outDegree: outs,
      degree: ins + outs,
      tags: [...entry.tags],
    });
  }
  const ghostIds = [...ghostLabels.keys()].sort();
  for (const id of ghostIds) {
    const g = ghostLabels.get(id)!;
    const ins = inDeg.get(id)?.size ?? 0;
    const outs = outDeg.get(id)?.size ?? 0;
    nodes.push({
      id,
      label: g.label,
      inDegree: ins,
      outDegree: outs,
      degree: ins + outs,
      ...(g.attachment ? { attachment: true as const } : { ghost: true as const }),
      tags: [],
    });
  }

  const links: GraphLink[] = pairs
    .map((p) => ({ source: p.source, target: p.target }))
    .sort((a, b) => (a.source !== b.source ? (a.source < b.source ? -1 : 1) : a.target < b.target ? -1 : 1));

  return { nodes, links };
}

export type GraphFilterOptions = {
  /** Search-grammar query over entries (same operators as Search). Empty
   * or whitespace-only = no filter. Ghost/attachment nodes never match
   * a query — they drop whenever a query filter is active. */
  query?: string;
  /** False hides degree-0 nodes (and prunes their links, of which there
   * are none). Default true. */
  showOrphans?: boolean;
};

export type GraphFilterResult = { ok: true; model: GraphModel } | { ok: false; error: string };

/** Filter a built model. Honest errors: an invalid query returns
 * `{ ok: false }` and the caller keeps the unfiltered model. */
export function filterGraph(
  model: GraphModel,
  entries: DocumentIndexEntry[],
  opts: GraphFilterOptions = {},
): GraphFilterResult {
  const q = (opts.query ?? "").trim();
  const showOrphans = opts.showOrphans !== false;
  let keep: Set<string> | null = null;
  if (q) {
    const parsed = parseSearchQuery(q);
    if (parsed.ok === false) return { ok: false, error: parsed.error.message };
    if (!isEmptyQuery(parsed.query)) {
      const byPath = new Map(entries.map((e) => [e.relativePath, e]));
      keep = new Set<string>();
      for (const n of model.nodes) {
        if (n.ghost === true || n.attachment === true) continue;
        const entry = byPath.get(n.id);
        if (entry && matchesContentEntry(entry, parsed.query)) keep.add(n.id);
      }
    }
  }
  const nodes = model.nodes.filter((n) => {
    if (keep && !keep.has(n.id)) return false;
    if (!showOrphans && n.degree === 0) return false;
    return true;
  });
  const ids = new Set(nodes.map((n) => n.id));
  const links = model.links.filter((l) => ids.has(l.source) && ids.has(l.target));
  return { ok: true, model: { nodes, links } };
}

export type GroupRule = {
  query: string;
  color: string;
};

/** Assign each note node the color of the first matching group query.
 * Invalid or empty queries in a group never match — the group is
 * skipped, never an error. Ghost/attachment nodes stay uncolored. */
export function colorGroups(
  entries: DocumentIndexEntry[],
  groups: GroupRule[],
): Map<string, string> {
  const parsed = groups.map((g) => {
    const q = g.query.trim();
    if (!q) return null;
    const p = parseSearchQuery(q);
    if (p.ok === false || isEmptyQuery(p.query)) return null;
    return { query: p.query, color: g.color };
  });
  const out = new Map<string, string>();
  for (const e of entries) {
    for (const g of parsed) {
      if (!g) continue;
      if (matchesContentEntry(e, g.query)) {
        out.set(e.relativePath, g.color);
        break;
      }
    }
  }
  return out;
}

/** Local subgraph around `center` over undirected adjacency. Depth is
 * clamped to `0..MAX_GRAPH_DEPTH`; unknown centers yield an empty model. */
export function localSubgraph(model: GraphModel, center: string, depth: number): GraphModel {
  const ids = new Set(model.nodes.map((n) => n.id));
  if (!ids.has(center)) return { nodes: [], links: [] };
  const d = Number.isFinite(depth) ? Math.max(0, Math.min(MAX_GRAPH_DEPTH, Math.floor(depth))) : 0;
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    let sa = adj.get(a);
    if (!sa) {
      sa = new Set<string>();
      adj.set(a, sa);
    }
    sa.add(b);
  };
  for (const l of model.links) {
    link(l.source, l.target);
    link(l.target, l.source);
  }
  const seen = new Map<string, number>([[center, 0]]);
  const queue = [center];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    const cd = seen.get(cur)!;
    if (cd >= d) continue;
    for (const nb of adj.get(cur) ?? []) {
      if (!seen.has(nb)) {
        seen.set(nb, cd + 1);
        queue.push(nb);
      }
    }
  }
  const nodes = model.nodes.filter((n) => seen.has(n.id));
  const keep = new Set(nodes.map((n) => n.id));
  const links = model.links.filter((l) => keep.has(l.source) && keep.has(l.target));
  return { nodes, links };
}

/** Deterministic circle layout for the MVP read-only SVG (no force
 * simulation): nodes placed in id-sorted order around radius 120.
 * Single nodes sit at the origin; empty models yield an empty map. */
export function layoutCircle(model: GraphModel): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const ids = model.nodes.map((n) => n.id).sort();
  if (ids.length === 0) return out;
  if (ids.length === 1) {
    out.set(ids[0]!, { x: 0, y: 0 });
    return out;
  }
  const R = 120;
  for (let i = 0; i < ids.length; i++) {
    const a = (2 * Math.PI * i) / ids.length - Math.PI / 2;
    out.set(ids[i]!, { x: Math.round(R * Math.cos(a) * 100) / 100, y: Math.round(R * Math.sin(a) * 100) / 100 });
  }
  return out;
}
