/**
 * Step 6 Tags pane: nested tree / flat list over the workspace index.
 * Counts are file counts; clicking a tag runs the `tag:` search
 * (same click-to-search contract as Favorites search entries).
 */
import { useMemo, useRef, useState, type JSX } from "react";
import { moveRovingIndex } from "@takenotes/ui";
import { EmptyState } from "@takenotes/ui/dom";
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
  at,
  indexOf,
  onFocusRow,
}: {
  nodes: TagTreeNode[];
  depth: number;
  onSearch: (query: string) => void;
  /** Shared roving-index wiring (search/calendar): one Tab stop per list. */
  at: number;
  indexOf: (key: string) => number;
  onFocusRow: (index: number) => void;
}): JSX.Element {
  return (
    <>
      {nodes.map((n) => {
        const i = indexOf(n.full);
        return (
          <div key={n.full}>
            <button
              className="tree-row tag-row"
              style={{ paddingLeft: 12 + depth * 16 }}
              data-tag-idx={i}
              tabIndex={i === at ? 0 : -1}
              onFocus={() => onFocusRow(i)}
              title={`${n.total} note${n.total === 1 ? "" : "s"}`}
              onClick={() => onSearch(tagSearchQuery(n.full))}
            >
              <span className="tag-name">#{n.full}</span>
              <span className="tag-count">{n.total}</span>
            </button>
            {n.children.length > 0 && <TreeRows nodes={n.children} depth={depth + 1} onSearch={onSearch} at={at} indexOf={indexOf} onFocusRow={onFocusRow} />}
          </div>
        );
      })}
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
  // Visual order is depth-first in both modes (flat reuses the tree order),
  // so one index map serves the single roving Tab stop.
  const order = useMemo(
    () => (mode === "tree" ? flattenTagTree(tree).map((n) => n.full) : flat.map((t) => t.tag)),
    [mode, tree, flat],
  );
  const indexOf = useMemo(() => { const m = new Map(order.map((k, i) => [k, i] as const)); return (k: string): number => m.get(k) ?? 0; }, [order]);
  const listRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(0);
  const at = order.length === 0 ? 0 : Math.min(focused, order.length - 1);
  const onListKeyDown = (e: React.KeyboardEvent): void => {
    const next = moveRovingIndex(at, order.length, e.key, "vertical");
    if (next === null) return;
    e.preventDefault();
    setFocused(next);
    listRef.current?.querySelector<HTMLElement>(`[data-tag-idx="${next}"]`)?.focus();
  };

  if (entries === null) {
    return (
      <EmptyState title="No workspace index yet" description="Tags appear once the workspace index builds." />
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
        <EmptyState title="No tags yet" description="Add #tag in a note, or a tags: line at the top." />
      ) : (
        <div ref={listRef} onKeyDown={onListKeyDown}>
          {mode === "tree" ? (
            <TreeRows nodes={tree} depth={0} onSearch={runSearch} at={at} indexOf={indexOf} onFocusRow={setFocused} />
          ) : (
            flat.map((t) => {
              const i = indexOf(t.tag);
              return (
                <button key={t.tag} className="tree-row tag-row" style={{ paddingLeft: 12 }} data-tag-idx={i} tabIndex={i === at ? 0 : -1} onFocus={() => setFocused(i)} title={`${t.files} note${t.files === 1 ? "" : "s"}`} onClick={() => runSearch(tagSearchQuery(t.tag))}>
                  <span className="tag-name">#{t.tag}</span>
                  <span className="tag-count">{t.files}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
