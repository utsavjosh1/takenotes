/** Step 6 Tags view — pure aggregation over index entries (no IO).
 *
 * Counts are file counts (notes containing the tag), matching the Tags
 * view convention. Tags arrive normalized from the index (`#a/b` nesting
 * preserved, lowercased); this module never re-normalizes, it only
 * aggregates. Total: malformed entries degrade to skips, never throws.
 */

export type TagCount = {
  /** Normalized tag without `#` (`project/frontend`). */
  tag: string;
  /** Files containing exactly this tag. */
  files: number;
  /** Relative paths of files containing exactly this tag (path order). */
  paths: string[];
};

export type TagTreeNode = {
  /** Single segment (`frontend` in `project/frontend`). */
  name: string;
  /** Full tag path (`project/frontend`). */
  full: string;
  /** Files with exactly `full`. */
  exact: number;
  /** Files with `full` or any tag under `full/` (aggregated). */
  total: number;
  children: TagTreeNode[];
};

export type TagSort = "name" | "frequency";

type Taggable = { relativePath: string; tags: unknown };

function entryTags(entry: Taggable): string[] {
  if (!entry || !Array.isArray(entry.tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of entry.tags) {
    if (typeof t !== "string" || !t) continue;
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Aggregate exact-tag file counts. Paths are sorted for determinism. */
export function aggregateTags(entries: Taggable[]): TagCount[] {
  const byTag = new Map<string, Set<string>>();
  for (const entry of entries ?? []) {
    if (!entry || typeof entry.relativePath !== "string") continue;
    for (const tag of entryTags(entry)) {
      let set = byTag.get(tag);
      if (!set) {
        set = new Set<string>();
        byTag.set(tag, set);
      }
      set.add(entry.relativePath);
    }
  }
  return [...byTag.entries()].map(([tag, paths]) => ({
    tag,
    files: paths.size,
    paths: [...paths].sort(),
  }));
}

export function sortTagCounts(counts: TagCount[], sort: TagSort): TagCount[] {
  const dir = sort === "frequency" ? -1 : 1;
  return [...counts].sort((a, b) =>
    sort === "frequency" && a.files !== b.files
      ? dir * (a.files - b.files) || (a.tag < b.tag ? -1 : 1)
      : sort === "name"
        ? a.tag < b.tag
          ? -1
          : a.tag > b.tag
            ? 1
            : 0
        : a.tag < b.tag
          ? -1
          : 1,
  );
}

/** Build the nested tree (`a/b/c` → `a` → `b` → `c`). Parents aggregate
 * descendant file sets (a file with both `a` and `a/b` counts once). */
export function buildTagTree(counts: TagCount[]): TagTreeNode[] {
  type Mutable = { name: string; full: string; exactPaths: Set<string>; kids: Map<string, Mutable> };
  const roots = new Map<string, Mutable>();
  const at = (map: Map<string, Mutable>, name: string, full: string): Mutable => {
    let n = map.get(name);
    if (!n) {
      n = { name, full, exactPaths: new Set(), kids: new Map() };
      map.set(name, n);
    }
    return n;
  };
  for (const c of counts ?? []) {
    if (!c || typeof c.tag !== "string" || !c.tag) continue;
    const segments = c.tag.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    let map = roots;
    let node: Mutable | undefined;
    for (let i = 0; i < segments.length; i++) {
      const full = segments.slice(0, i + 1).join("/");
      node = at(map, segments[i]!, full);
      map = node.kids;
    }
    for (const p of c.paths ?? []) node!.exactPaths.add(p);
  }
  const finish = (n: Mutable): TagTreeNode => {
    const children = [...n.kids.values()].map(finish).sort((a, b) => (a.name < b.name ? -1 : 1));
    // Aggregate descendant paths (deduped across exact + children).
    const below = new Set<string>(n.exactPaths);
    const collect = (m: Mutable): void => {
      for (const p of m.exactPaths) below.add(p);
      for (const k of m.kids.values()) collect(k);
    };
    for (const k of n.kids.values()) collect(k);
    return { name: n.name, full: n.full, exact: n.exactPaths.size, total: below.size, children };
  };
  return [...roots.values()].map(finish).sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** Flatten the tree depth-first (parent before children) for flat display. */
export function flattenTagTree(roots: TagTreeNode[]): TagTreeNode[] {
  const out: TagTreeNode[] = [];
  const walk = (nodes: TagTreeNode[]): void => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots ?? []);
  return out;
}

/** Click-to-search query for a tag (normalized tags never need quoting). */
export function tagSearchQuery(tag: string): string {
  return `tag:${tag}`;
}
