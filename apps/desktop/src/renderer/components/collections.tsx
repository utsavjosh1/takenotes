/**
 * Step 6 Collections pane: saved structured queries with table/list views.
 * A collection is a saved search-grammar query (same operators as Search)
 * with named presentations; definitions travel as
 * `.takenotes/collections/*.yaml`. MVP renders table + list only.
 */
import { Button, Input, Select, Skeleton } from "@takenotes/ui/dom";
import { useMemo, useState, type JSX } from "react";
import { evaluateCollectionView } from "@takenotes/core/collections/evaluate";
import type { CollectionViewKind } from "@takenotes/core/collections/store";
import type { DocumentIndexEntry } from "@takenotes/core/index/document";
import type { CollectionsApi } from "../hooks/use-collections";
import { displayPath } from "./types";

export function CollectionsPane({
  collections,
  entries,
  onOpen,
  runSearch,
}: {
  collections: CollectionsApi;
  entries: DocumentIndexEntry[] | null;
  onOpen: (rel: string) => void;
  runSearch: (query: string) => void;
}): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);
  const [viewName, setViewName] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newView, setNewView] = useState("");
  const [newKind, setNewKind] = useState<CollectionViewKind>("list");

  const active = collections.files.find((f) => f.file === (selected ?? collections.files[0]?.file)) ?? null;
  const view = active ? (active.doc.views.find((v) => v.name === (viewName ?? active.doc.views[0]?.name)) ?? active.doc.views[0]!) : null;

  const result = useMemo(
    () => (active && view && entries ? evaluateCollectionView(entries, active.doc, view.name) : null),
    [active, view, entries],
  );

  if (collections.loading) {
    return (
      <div className="pane-placeholder">
        <p className="panel-title">Collections</p>
        <Skeleton label="Loading collections" />
      </div>
    );
  }
  if (collections.loadError) {
    return (
      <div className="pane-placeholder">
        <p className="panel-title">Collections</p>
        <p className="inline-error">{collections.loadError}</p>
        <button onClick={() => void collections.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="collections-pane">
      <div className="pane-toolbar" role="toolbar" aria-label="Collections">
        <Select
          aria-label="Collection"
          value={active?.file ?? ""}
          onChange={(e) => {
            setSelected(e.target.value || null);
            setViewName(null);
          }}
        >
          <option value="">Select a collection…</option>
          {collections.files.map((f) => (
            <option key={f.file} value={f.file}>{f.doc.name}</option>
          ))}
        </Select>
        {view && active && active.doc.views.length > 1 && (
          <Select aria-label="View" value={view.name} onChange={(e) => setViewName(e.target.value)}>
            {active.doc.views.map((v) => (
              <option key={v.name} value={v.name}>{v.name} ({v.kind})</option>
            ))}
          </Select>
        )}
      </div>

      {active && view ? (
        <>
          <p className="pane-hint" title={active.doc.query}>
            Query: <Button size="sm" variant="ghost" title="Run in Search" onClick={() => runSearch(active.doc.query)}>{active.doc.query || "(empty — matches nothing)"}</Button>
          </p>
          {result === null ? (
            <Skeleton label="Loading results" />
          ) : !result.ok ? (
            <p className="inline-error">{result.error}</p>
          ) : result.rows.length === 0 ? (
            <p className="pane-hint">No notes match this collection.</p>
          ) : view.kind === "table" ? (
            <table className="collection-table">
              <thead>
                <tr>
                  <th>Note</th>
                  {Object.keys(result.rows[0]!.cells).map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.relativePath}>
                    <td>
                      <Button size="sm" variant="ghost" title={displayPath(r.relativePath)} onClick={() => onOpen(r.relativePath)}>
                        {r.title}
                      </Button>
                    </td>
                    {Object.values(r.cells).map((v, i) => (
                      <td key={i}>{v || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ul className="collection-list">
              {result.rows.map((r) => (
                <li key={r.relativePath}>
                  <Button size="sm" variant="ghost" title={displayPath(r.relativePath)} onClick={() => onOpen(r.relativePath)}>
                    {r.title}
                  </Button>
                  {Object.entries(r.cells).filter(([, v]) => v).map(([k, v]) => (
                    <span key={k} className="collection-cell">{k}: {v}</span>
                  ))}
                </li>
              ))}
            </ul>
          )}
          {result !== null && result.ok && result.truncated && <p className="pane-hint">Showing the first {result.rows.length} matches.</p>}
          <div className="pane-toolbar" role="toolbar" aria-label="View management">
            <Input
              className="rename-input"
              aria-label="New view name"
              placeholder={`New ${newKind} view…`}
              value={newView}
              onChange={(e) => setNewView(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newView.trim()) {
                  void collections.addView(active.file, { name: newView.trim(), kind: newKind });
                  setNewView("");
                }
                e.stopPropagation();
              }}
            />
            <Select
              aria-label="New view kind"
              value={newKind}
              onChange={(e) => setNewKind(e.target.value === "table" ? "table" : "list")}
              title="View kind"
            >
              <option value="list">List</option>
              <option value="table">Table</option>
            </Select>
            {active.doc.views.length > 1 && (
              <button title={`Delete view ${view.name}`} onClick={() => { void collections.removeView(active.file, view.name); setViewName(null); }}>
                Delete view
              </button>
            )}
            <button
              title={`Delete collection ${active.doc.name}`}
              onClick={() => {
                void collections.deleteCollection(active.file).then(() => {
                  setSelected(null);
                  setViewName(null);
                });
              }}
            >
              Delete collection
            </button>
          </div>
        </>
      ) : (
        <p className="pane-hint">No collections yet. Name one to begin — its query uses the Search grammar.</p>
      )}

      <div className="pane-toolbar" role="toolbar" aria-label="New collection">
        <Input
          className="rename-input"
          aria-label="New collection name"
          placeholder="New collection…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              void collections.createCollection(newName.trim());
              setNewName("");
            }
            e.stopPropagation();
          }}
        />
      </div>
    </div>
  );
}
