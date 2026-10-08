/**
 * Step 6 Properties pane: file properties for the active note plus the
 * all-properties rollup (type/frequency/click-to-search/global rename).
 * Presentational — bulk rename executes in App (file writes + index
 * upserts), this pane only collects the target name.
 */
import { useMemo, useState, type JSX } from "react";
import type { DocumentIndexEntry } from "@takenotes/core/index/document";
import { cellDisplay } from "@takenotes/core/collections/evaluate";
import {
  propertySearchQuery,
  sortPropertySummaries,
  summarizeProperties,
  type PropertySort,
} from "@takenotes/core/properties/summary";
import { resolvePropertyType, type PropertyRegistry } from "@takenotes/core/index/properties";

function frontmatterRows(entry: DocumentIndexEntry): { name: string; display: string }[] {
  if (!entry.frontmatter || typeof entry.frontmatter !== "object") return [];
  return Object.keys(entry.frontmatter as Record<string, unknown>)
    .sort()
    .map((name) => ({
      name,
      display: cellDisplay((entry.frontmatter as Record<string, unknown>)[name]),
    }));
}

export function PropertiesPane({
  activeEntry,
  entries,
  registry,
  runSearch,
  onRename,
  renaming,
}: {
  activeEntry: DocumentIndexEntry | null;
  entries: DocumentIndexEntry[] | null;
  registry: PropertyRegistry;
  runSearch: (query: string) => void;
  onRename: (oldName: string, newName: string) => Promise<void>;
  renaming: boolean;
}): JSX.Element {
  const [sort, setSort] = useState<PropertySort>("name");
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const summaries = useMemo(
    () => sortPropertySummaries(summarizeProperties(entries ?? [], registry), sort),
    [entries, registry, sort],
  );
  const activeRows = useMemo(() => (activeEntry ? frontmatterRows(activeEntry) : null), [activeEntry]);

  const commitRename = (): void => {
    if (!renamingKey) return;
    const next = renameDraft.trim();
    if (!next || next === renamingKey) {
      setRenamingKey(null);
      return;
    }
    void onRename(renamingKey, next).then(() => setRenamingKey(null));
  };

  return (
    <div className="properties-pane">
      <div className="panel-section">
        <p className="panel-title">File properties</p>
        {activeRows === null ? (
          <p className="pane-hint">No active note.</p>
        ) : activeRows.length === 0 ? (
          <p className="pane-hint">No properties in this note.</p>
        ) : (
          activeRows.map((r) => (
            <button
              key={r.name}
              className="tree-row prop-row"
              style={{ paddingLeft: 12 }}
              title={`Search [${r.name}]`}
              onClick={() => runSearch(propertySearchQuery(r.name))}
            >
              <span className="prop-name">{r.name}</span>
              <span className="prop-type">{resolvePropertyType(registry, r.name)}</span>
              <span className="prop-value">{r.display || "—"}</span>
            </button>
          ))
        )}
      </div>
      <div className="panel-section">
        <div className="pane-toolbar" role="toolbar" aria-label="All properties options">
          <p className="panel-title">All properties</p>
          <label className="sort-control">Sort
            <select aria-label="Properties sort" value={sort} onChange={(e) => setSort(e.target.value as PropertySort)}>
              <option value="name">Name</option>
              <option value="frequency">Frequency</option>
            </select>
          </label>
        </div>
        {entries === null ? (
          <p className="pane-hint">No workspace index yet.</p>
        ) : summaries.length === 0 ? (
          <p className="pane-hint">No properties in this workspace.</p>
        ) : (
          summaries.map((s) => (
            <div key={s.name} className="tree-row prop-row" style={{ paddingLeft: 12 }}>
              <button
                className="prop-main"
                title={`Search [${s.name}] (${s.files} note${s.files === 1 ? "" : "s"})`}
                onClick={() => runSearch(propertySearchQuery(s.name))}
              >
                <span className="prop-name">{s.name}</span>
                <span className="prop-type">{s.type}</span>
                <span className="tag-count">{s.files}</span>
              </button>
              {renamingKey === s.name ? (
                <input
                  className="rename-input"
                  autoFocus
                  aria-label={`Rename property ${s.name}`}
                  value={renameDraft}
                  disabled={renaming}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    else if (e.key === "Escape") setRenamingKey(null);
                    e.stopPropagation();
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <button
                  className="prop-rename"
                  title={`Rename ${s.name} everywhere`}
                  disabled={renaming}
                  onClick={() => {
                    setRenamingKey(s.name);
                    setRenameDraft(s.name);
                  }}
                >
                  Rename
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
