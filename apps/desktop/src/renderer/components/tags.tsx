/**
 * Step 6 Tags pane: nested tree / flat list over the workspace index.
 * Counts are file counts; clicking a tag runs the `tag:` search
 * (same click-to-search contract as Favorites search entries).
 */
import { useMemo, useState, type JSX } from "react";
import {
  aggregateTags,
  buildTagTree,
  flattenTagTree,
  sortTagCounts,
  tagSearchQuery,
  type TagSort,
  type TagTreeNode,
} from "@takenotes/core/tags/tree";
import type { DocumentIndexEntry } from "@takenotes/core/index/document";

function TreeRows({
  nodes,
  depth,
  onSearch,
}: {
  nodes: TagTreeNode[];
  depth: number;
  onSearch: (query: string) => void;
}): JSX.Element {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.full}>
          <button
            className="tree-row tag-row"
            style={{ paddingLeft: 12 + depth * 16 }}
            title={`${n.total} note${n.total === 1 ? "" : "s"}`}
            onClick={() => onSearch(tagSearchQuery(n.full))}
          >
            <span className="tag-name">#{n.full}</span>
            <span className="tag-count">{n.total}</span>
          </button>
          {n.children.length > 0 && <TreeRows nodes={n.children} depth={depth + 1} onSearch={onSearch} />}
        </div>
      ))}
    </>
  );
}

export function TagsPane({
  entries,
  runSearch,
}: {
  /** Index entries for the open workspace (path order not required). */
  entries: DocumentIndexEntry[] | null;
  runSearch: (query: string) => void;
}): JSX.Element {
  const [mode, setMode] = useState<"tree" | "flat">("tree");
  const [sort, setSort] = useState<TagSort>("name");

  const counts = useMemo(() => sortTagCounts(aggregateTags(entries ?? []), sort), [entries, sort]);
  const tree = useMemo(() => (mode === "tree" ? buildTagTree(counts) : []), [counts, mode]);
  const flat = useMemo(() => (mode === "flat" ? counts : flattenTagTree(tree).map((n) => ({ tag: n.full, files: n.total, paths: [] as string[] }))), [counts, mode, tree]);

  if (entries === null) {
    return (
      <div className="pane-placeholder">
        <p className="panel-title">No workspace index yet.</p>
      </div>
    );
  }
  return (
    <div className="tags-pane">
      <div className="pane-toolbar" role="toolbar" aria-label="Tags view options">
        <div className="seg" role="group" aria-label="Display">
          <button className={mode === "tree" ? "active" : ""} aria-pressed={mode === "tree"} onClick={() => setMode("tree")}>Tree</button>
          <button className={mode === "flat" ? "active" : ""} aria-pressed={mode === "flat"} onClick={() => setMode("flat")}>Flat</button>
        </div>
        <label className="sort-control">Sort
          <select aria-label="Tags sort" value={sort} onChange={(e) => setSort(e.target.value as TagSort)}>
            <option value="name">Name</option>
            <option value="frequency">Frequency</option>
          </select>
        </label>
      </div>
      {counts.length === 0 ? (
        <div className="pane-placeholder">
          <p>No tags yet. Add `#tag` inline or a `tags:` property.</p>
        </div>
      ) : mode === "tree" ? (
        <TreeRows nodes={tree} depth={0} onSearch={runSearch} />
      ) : (
        flat.map((t) => (
          <button key={t.tag} className="tree-row tag-row" style={{ paddingLeft: 12 }} title={`${t.files} note${t.files === 1 ? "" : "s"}`} onClick={() => runSearch(tagSearchQuery(t.tag))}>
            <span className="tag-name">#{t.tag}</span>
            <span className="tag-count">{t.files}</span>
          </button>
        ))
      )}
    </div>
  );
}
