/**
 * Step 7 Graph pane (Phase 4b): read-only global + local graph over the
 * typed edge table. Presentation only — `packages/core/graph/model`
 * owns nodes/links/filter/groups/BFS/layout. Deterministic circle
 * layout (no force simulation in MVP); pan/zoom via SVG transform.
 *
 * Deferred (documented, not faked): force physics, text-fade/thickness
 * sliders, tag nodes + tags toggle, time-lapse. Nodes are notes;
 * ghosts/attachments appear only under their opt-in toggles.
 */
import { useMemo, useState, type JSX } from "react";
import {
  buildGraph,
  colorGroups,
  filterGraph,
  layoutCircle,
  localSubgraph,
  MAX_GRAPH_DEPTH,
} from "@takenotes/core/graph/model";
import type { DocumentIndexEntry } from "@takenotes/core/index/document";
import type { Edge } from "@takenotes/core/index/edges";

const GROUP_COLORS = ["#e45649", "#986801", "#50a14f", "#4078f2", "#a626a4", "#0184bc"];

type T = { x: number; y: number; k: number };

export function GraphPane({
  entries,
  edges,
  activePath,
  onOpen,
}: {
  entries: DocumentIndexEntry[] | null;
  edges: Edge[] | null;
  activePath: string | null;
  onOpen: (rel: string) => void;
}): JSX.Element {
  const [mode, setMode] = useState<"global" | "local">("global");
  const [query, setQuery] = useState("");
  const [showOrphans, setShowOrphans] = useState(true);
  const [includeUnresolved, setIncludeUnresolved] = useState(false);
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [depth, setDepth] = useState(1);
  const [groupQuery, setGroupQuery] = useState("");
  const [groups, setGroups] = useState<Array<{ query: string; color: string }>>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [t, setT] = useState<T>({ x: 0, y: 0, k: 1 });

  const base = useMemo(
    () => buildGraph(entries ?? [], edges ?? [], { includeUnresolved, includeAttachments }),
    [entries, edges, includeUnresolved, includeAttachments],
  );
  const filtered = useMemo(
    () => filterGraph(base, entries ?? [], { query: query.trim() ? query : undefined, showOrphans }),
    [base, entries, query, showOrphans],
  );
  const model = useMemo(() => {
    if (!filtered.ok) return base;
    if (mode === "local" && activePath) return localSubgraph(filtered.model, activePath, depth);
    return filtered.ok ? filtered.model : base;
  }, [filtered, base, mode, activePath, depth]);

  const colors = useMemo(() => colorGroups(entries ?? [], groups), [entries, groups]);
  const pos = useMemo(() => layoutCircle(model), [model]);

  const neighbours = useMemo(() => {
    if (!hover) return null;
    const s = new Set<string>([hover]);
    for (const l of model.links) {
      if (l.source === hover) s.add(l.target);
      else if (l.target === hover) s.add(l.source);
    }
    return s;
  }, [hover, model]);

  if (!entries || !edges) {
    return (
      <div className="pane-placeholder">
        <p className="panel-title">Graph</p>
        <p>No workspace index yet.</p>
      </div>
    );
  }

  const resetView = (): void => setT({ x: 0, y: 0, k: 1 });
  const zoom = (f: number): void => setT((p) => ({ ...p, k: Math.max(0.2, Math.min(4, p.k * f)) }));

  return (
    <div className="graph-pane">
      <div className="pane-toolbar" role="toolbar" aria-label="Graph mode">
        <div className="seg" role="group" aria-label="Graph scope">
          <button className={mode === "global" ? "active" : ""} onClick={() => setMode("global")}>Global</button>
          <button className={mode === "local" ? "active" : ""} onClick={() => setMode("local")}>Local</button>
        </div>
        {mode === "local" && (
          <label className="graph-depth" title="Local depth">
            Depth
            <input
              type="range" min={0} max={MAX_GRAPH_DEPTH} step={1} value={depth}
              aria-label="Local graph depth"
              onChange={(e) => setDepth(Number(e.target.value))}
            />
            <span>{depth}</span>
          </label>
        )}
      </div>

      <div className="pane-toolbar" role="toolbar" aria-label="Graph filters">
        <input
          className="rename-input" aria-label="Filter by search" placeholder="Filter: search grammar…"
          value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <label title="Hide notes with no links"><input type="checkbox" checked={!showOrphans} onChange={(e) => setShowOrphans(!e.target.checked)} /> Hide orphans</label>
        <label title="Show links to nonexistent notes as ghost nodes"><input type="checkbox" checked={includeUnresolved} onChange={(e) => setIncludeUnresolved(e.target.checked)} /> Unresolved</label>
        <label title="Show attachment targets as nodes"><input type="checkbox" checked={includeAttachments} onChange={(e) => setIncludeAttachments(e.target.checked)} /> Attachments</label>
      </div>
      {!filtered.ok && <p className="inline-error" style={{ padding: "0 12px" }}>{filtered.error}</p>}

      <div className="pane-toolbar" role="toolbar" aria-label="Graph groups">
        <input
          className="rename-input" aria-label="Group query" placeholder="Group: query → color…"
          value={groupQuery} onChange={(e) => setGroupQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && groupQuery.trim()) {
              setGroups((g) => [...g, { query: groupQuery.trim(), color: GROUP_COLORS[g.length % GROUP_COLORS.length]! }]);
              setGroupQuery("");
            }
            e.stopPropagation();
          }}
        />
        {groups.map((g, i) => (
          <span key={`${g.query}-${i}`} className="graph-group" title={g.query}>
            <span className="graph-swatch" style={{ background: g.color }} />
            {g.query}
            <button aria-label={`Remove group ${g.query}`} onClick={() => setGroups((p) => p.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>

      <p className="pane-hint">
        {model.nodes.length} note{model.nodes.length === 1 ? "" : "s"} · {model.links.length} link{model.links.length === 1 ? "" : "s"}
        {mode === "local" && !activePath ? " — open a note for its local graph." : ""}
        {" · "}Node size = reference count; circle layout (no force physics in MVP).
      </p>

      <div className="pane-toolbar" role="toolbar" aria-label="Graph view">
        <button onClick={() => zoom(1.25)} aria-label="Zoom in">+</button>
        <button onClick={() => zoom(0.8)} aria-label="Zoom out">−</button>
        <button onClick={resetView}>Reset</button>
      </div>

      <svg
        className="graph-svg" role="img" aria-label="Note graph"
        onWheel={(e) => { zoom(e.deltaY < 0 ? 1.1 : 0.9); }}
        onMouseDown={(e) => {
          const sx = e.clientX; const sy = e.clientY; const ox = t.x; const oy = t.y;
          const move = (m: MouseEvent): void => setT((p) => ({ ...p, x: ox + (m.clientX - sx), y: oy + (m.clientY - sy) }));
          const up = (): void => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
        }}
      >
        <defs>
          <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </marker>
        </defs>
        <g transform={`translate(200 ${t.y + 160}) scale(${t.k}) translate(${t.x / t.k} 0)`}>
          {model.links.map((l) => {
            const a = pos.get(l.source); const b = pos.get(l.target);
            if (!a || !b) return null;
            const dim = neighbours && !(neighbours.has(l.source) && neighbours.has(l.target));
            return <line key={`${l.source}→${l.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={dim ? "g-link dim" : "g-link"} markerEnd="url(#graph-arrow)" />;
          })}
          {model.nodes.map((n) => {
            const p = pos.get(n.id);
            if (!p) return null;
            const ghost = n.ghost === true || n.attachment === true;
            const r = 6 + Math.min(n.inDegree, 6) * 1.5;
            const fill = colors.get(n.id) ?? (ghost ? "var(--text-muted)" : "var(--accent)");
            const dim = neighbours && !neighbours.has(n.id);
            return (
              <g
                key={n.id} transform={`translate(${p.x} ${p.y})`}
                className={dim ? "g-node dim" : "g-node"}
                opacity={ghost ? 0.55 : 1}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover((h) => (h === n.id ? null : h))}
                onClick={() => { if (!ghost) onOpen(n.id); }}
              >
                <title>{ghost ? `${n.label} (missing — not clickable)` : `${n.label}\n${n.id}`}</title>
                <circle r={r} fill={fill} stroke={hover === n.id ? "var(--text-primary)" : "transparent"} strokeWidth={2} style={ghost ? undefined : { cursor: "pointer" }} />
                <text y={r + 11} textAnchor="middle" className="g-label">{n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}</text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
