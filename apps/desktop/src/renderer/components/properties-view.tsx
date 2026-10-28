/**
 * Step 6 Properties pane: file properties for the active note plus the
 * all-properties rollup (type/frequency/click-to-search/global rename).
 * Presentational — bulk rename executes in App (file writes + index
 * upserts), this pane only collects the target name.
 */
import { useMemo, useRef, useState, type JSX } from "react";
import { moveRovingIndex } from "@takenotes/ui";
import { EmptyState, Input, Select, Skeleton } from "@takenotes/ui/dom";
import type { DocumentIndexEntry } from "@takenotes/core/index/document";
import { cellDisplay } from "@takenotes/core/collections/evaluate";
import {
  propertySearchQuery,
  sortPropertySummaries,
  summarizeProperties,
  type PropertySort,
} from "@takenotes/core/properties/summary";
import { resolvePropertyType, type PropertyRegistry } from "@takenotes/core/index/properties";

export function frontmatterRows(entry: DocumentIndexEntry): { name: string; display: string }[] {
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
  // One roving Tab stop per section (search/tags pattern): arrows/Home/End
  // walk the section's buttons in order — main + rename alike. Rename
  // inputs keep native keys (same INPUT guard as the file tree).
  const fileRef = useRef<HTMLDivElement>(null);
  const allRef = useRef<HTMLDivElement>(null);
  const [fileFocused, setFileFocused] = useState(0);
  const [allFocused, setAllFocused] = useState(0);

  const summaries = useMemo(
    () => sortPropertySummaries(summarizeProperties(entries ?? [], registry), sort),
    [entries, registry, sort],
  );
  const activeRows = useMemo(() => (activeEntry ? frontmatterRows(activeEntry) : null), [activeEntry]);
  // While a rename input is open the row loses its rename button, so the
  // static index map drifts from DOM order: fall back to native Tab order
  // (arrows still walk the live DOM via the query below).
  const allRoving = renamingKey === null;
  const allAt = Math.min(allFocused, summaries.length * 2 - 1);

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
        <p className="panel-title">Details</p>
        {activeRows === null ? (
          <EmptyState title="No active note" description="Open a note to see its details." />
        ) : activeRows.length === 0 ? (
          <EmptyState title="No details in this note" description="Details you add here show up automatically." />
        ) : (
          <div
            ref={fileRef}
            onKeyDown={(e) => {
              const at = Math.min(fileFocused, activeRows.length - 1);
              const next = moveRovingIndex(at, activeRows.length, e.key, "vertical");
              if (next === null) return;
              e.preventDefault();
              setFileFocused(next);
              fileRef.current?.querySelector<HTMLElement>(`[data-prop-idx="${next}"]`)?.focus();
            }}
          >
            {activeRows.map((r, i) => (
              <button
                key={r.name}
                className="tree-row prop-row"
                style={{ paddingLeft: 12 }}
                data-prop-idx={i}
                tabIndex={i === Math.min(fileFocused, activeRows.length - 1) ? 0 : -1}
                onFocus={() => setFileFocused(i)}
                title={`Search [${r.name}]`}
                onClick={() => runSearch(propertySearchQuery(r.name))}
              >
                <span className="prop-name">{r.name}</span>
                <span className="prop-type">{resolvePropertyType(registry, r.name)}</span>
                <span className="prop-value">{r.display || "—"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="panel-section">
        <div className="pane-toolbar" role="toolbar" aria-label="All details options">
          <p className="panel-title">All details</p>
          <label className="sort-control">Sort
            <Select aria-label="Details sort" value={sort} onChange={(e) => setSort(e.target.value as PropertySort)}>
              <option value="name">Name</option>
              <option value="frequency">Frequency</option>
            </Select>
          </label>
        </div>
        {entries === null ? (
          <Skeleton label="Loading details" />
        ) : summaries.length === 0 ? (
          <EmptyState title="No details in this workspace" description="Details you add to any note show up automatically." />
        ) : (
          <div
            ref={allRef}
            onKeyDown={(e) => {
              // Rename inputs keep caret keys; arrows resume once focus leaves.
              if ((e.target as HTMLElement).tagName === "INPUT") return;
              const ctrls = Array.from(allRef.current?.querySelectorAll<HTMLElement>("[data-allprop-idx]") ?? []);
              const cur = ctrls.indexOf(e.target as HTMLElement);
              const next = moveRovingIndex(cur < 0 ? 0 : cur, ctrls.length, e.key, "vertical");
              if (next === null) return;
              e.preventDefault();
              setAllFocused(next);
              ctrls[next]?.focus();
            }}
          >
          {summaries.map((s, si) => (
            <div key={s.name} className="tree-row prop-row" style={{ paddingLeft: 12 }}>
              <button
                className="prop-main"
                data-allprop-idx={si * 2}
                tabIndex={!allRoving || si * 2 === allAt ? 0 : -1}
                onFocus={() => setAllFocused(si * 2)}
                title={`Search [${s.name}] (${s.files} note${s.files === 1 ? "" : "s"})`}
                onClick={() => runSearch(propertySearchQuery(s.name))}
              >
                <span className="prop-name">{s.name}</span>
                <span className="prop-type">{s.type}</span>
                <span className="tag-count">{s.files}</span>
              </button>
              {renamingKey === s.name ? (
                <Input
                  className="rename-input"
                  autoFocus
                  aria-label={`Rename detail ${s.name}`}
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
                  data-allprop-idx={si * 2 + 1}
                  tabIndex={!allRoving || si * 2 + 1 === allAt ? 0 : -1}
                  onFocus={() => setAllFocused(si * 2 + 1)}
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
          ))}
          </div>
        )}
      </div>
    </div>
  );
}
