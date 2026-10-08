/**
 * Step 7 Canvas editor (Phase 4d, minimal): editable mindmap over `.canvas`
 * JSON Canvas files. Presentation + interaction only — the core model owns
 * parse/validate/ops. Files ride the existing doc-tab pipeline (dirty,
 * debounced autosave, CONFLICT, drafts, recovery): every committed op
 * serializes through `onEdit`, so no second save system exists.
 *
 * Minimal scope: infinite 2D SVG (pan/zoom/fit), text cards (inline
 * textarea) + file cards (note/image path + open) + link cards (URL,
 * no in-app navigation — web cards deferred) + groups (create/rename/
 * group-selected bbox), directed edges (add via Connect, select +
 * repoint/sides/ends/label, delete), card/edge colors (presets + hex),
 * drag-move + corner resize, multi-select (shift) for grouping, tolerant
 * parse banner (dropped items listed; edits adopt the cleaned doc).
 *
 * Deferred (documented, not faked): image bitmap previews, web-card
 * previews, audio/PDF cards, Alt-drag duplicate, aspect-lock, background
 * images, jump-to-group, readonly mode, export-image, Canvas-in-Canvas
 * text, shapes-only `![[x.canvas]]` embed rendering.
 */
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import {
  addEdge,
  addFileNode,
  addGroupNode,
  addLinkNode,
  addTextNode,
  CANVAS_ENDS,
  CANVAS_PRESET_COLORS,
  CANVAS_SIDES,
  deleteNode,
  emptyCanvas,
  groupSelected,
  isImageFileRef,
  moveNode,
  parseCanvasDoc,
  reconnectEdge,
  removeEdge,
  renameGroup,
  resizeNode,
  serializeCanvasDoc,
  setEdgeColor,
  setEdgeLabel,
  setNodeColor,
  setNodeFile,
  setNodeText,
  type CanvasDoc,
  type CanvasEdge,
  type CanvasNode,
  type CanvasSide,
} from "@takenotes/core/canvas/model";

export { isCanvasPath } from "@takenotes/core/canvas/model";

type T = { x: number; y: number; k: number };

const COLOR_LABEL: Record<string, string> = {
  "1": "red",
  "2": "orange",
  "3": "yellow",
  "4": "green",
  "5": "cyan",
  "6": "purple",
};

function colorStyle(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) return color;
  const map: Record<string, string> = {
    "1": "#e45649", "2": "#d2842a", "3": "#b09a2a",
    "4": "#50a14f", "5": "#0184bc", "6": "#a626a4",
  };
  return map[color] ?? undefined;
}

function port(n: CanvasNode, side: CanvasSide | undefined, def: CanvasSide): { x: number; y: number } {
  const s = side ?? def;
  if (s === "left") return { x: n.x, y: n.y + n.height / 2 };
  if (s === "right") return { x: n.x + n.width, y: n.y + n.height / 2 };
  if (s === "top") return { x: n.x + n.width / 2, y: n.y };
  return { x: n.x + n.width / 2, y: n.y + n.height };
}

function bboxOf(doc: CanvasDoc): { x: number; y: number; w: number; h: number } | null {
  if (doc.nodes.length === 0) return null;
  const xs = doc.nodes.map((n) => n.x);
  const ys = doc.nodes.map((n) => n.y);
  const rs = doc.nodes.map((n) => n.x + n.width);
  const bs = doc.nodes.map((n) => n.y + n.height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...rs) - x, h: Math.max(...bs) - y };
}

function shortFile(file: string): string {
  const base = file.slice(file.lastIndexOf("/") + 1);
  return base.length > 28 ? `${base.slice(0, 27)}…` : base;
}

export function CanvasEditor({
  docKey,
  content,
  onEdit,
  onOpenNote,
}: {
  docKey: string;
  /** Raw `.canvas` file text (the doc-tab buffer). */
  content: string;
  onEdit: (docKey: string, content: string) => void;
  onOpenNote: (rel: string) => void;
}): JSX.Element {
  const first = useMemo(() => parseCanvasDoc(content), []);
  const [doc, setDoc] = useState<CanvasDoc>(() => (first.ok ? first.doc : emptyCanvas()));
  const [parseErrors, setParseErrors] = useState<string[]>(() => (first.ok ? first.errors : []));
  const [unparseable, setUnparseable] = useState(() => !first.ok);
  const pushed = useRef(content);
  const [sel, setSel] = useState<string[]>([]);
  const [edgeSel, setEdgeSel] = useState<string | null>(null);
  const [t, setT] = useState<T>({ x: 40, y: 30, k: 1 });
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [adding, setAdding] = useState<null | "note" | "image" | "link">(null);
  const [addPath, setAddPath] = useState("");
  const [opError, setOpError] = useState<string | null>(null);
  const [cascade, setCascade] = useState(0);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const resize = useRef<{ id: string; sx: number; sy: number; w: number; h: number } | null>(null);

  // External arrivals (reload-from-disk, restore, sibling write): adopt
  // when the buffer changed without us. Our own commits set `pushed`.
  useEffect(() => {
    if (content === pushed.current) return;
    pushed.current = content;
    const r = parseCanvasDoc(content);
    if (r.ok) {
      setDoc(r.doc);
      setParseErrors(r.errors);
      setUnparseable(false);
    } else {
      setUnparseable(true);
    }
    setSel([]);
    setEdgeSel(null);
  }, [content]);

  const commit = (next: CanvasDoc): void => {
    const json = serializeCanvasDoc(next);
    pushed.current = json;
    setDoc(next);
    setOpError(null);
    onEdit(docKey, json);
  };

  const fail = (error: string): void => setOpError(error);

  const place = (): { x: number; y: number } => {
    const n = (cascade % 8) * 36;
    return { x: Math.round((-t.x + 120 + n) / t.k), y: Math.round((-t.y + 90 + n) / t.k) };
  };

  const byId = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc]);
  const selectedNode = sel.length > 0 ? (byId.get(sel[sel.length - 1]!) ?? null) : null;
  const selectedEdge: CanvasEdge | null = edgeSel ? (doc.edges.find((e) => e.id === edgeSel) ?? null) : null;

  const zoomAt = (cx: number, cy: number, f: number): void =>
    setT((p) => {
      const k = Math.max(0.2, Math.min(3, p.k * f));
      return { k, x: cx - ((cx - p.x) * k) / p.k, y: cy - ((cy - p.y) * k) / p.k };
    });

  const fit = (): void => {
    const b = bboxOf(doc);
    if (!b) {
      setT({ x: 40, y: 30, k: 1 });
      return;
    }
    const k = Math.max(0.2, Math.min(1.5, Math.min(560 / Math.max(b.w, 1), 380 / Math.max(b.h, 1))));
    setT({ k, x: 300 - (b.x + b.w / 2) * k, y: 230 - (b.y + b.h / 2) * k });
  };

  const clickNode = (id: string, additive: boolean): void => {
    if (connectFrom && id !== connectFrom) {
      const r = addEdge(doc, { fromNode: connectFrom, toNode: id });
      if (!r.ok) fail(r.error);
      else {
        commit(r.doc);
        setEdgeSel(r.id!);
        setSel([]);
      }
      setConnectFrom(null);
      return;
    }
    setEdgeSel(null);
    setSel((s) => (additive ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
  };

  const commitMove = (id: string, x: number, y: number): void => {
    const r = moveNode(doc, id, Math.round(x), Math.round(y));
    if (!r.ok) fail(r.error);
    else commit(r.doc);
  };

  const commitResize = (id: string, w: number, h: number): void => {
    const r = resizeNode(doc, id, Math.round(w), Math.round(h));
    if (!r.ok) fail(r.error);
    else commit(r.doc);
  };

  if (unparseable) {
    return (
      <div className="pane-placeholder">
        <p className="panel-title">Canvas</p>
        <p className="inline-error">This file is not valid canvas JSON — it was left untouched.</p>
        <button
          onClick={() => {
            const seed = serializeCanvasDoc(emptyCanvas());
            pushed.current = seed;
            setDoc(emptyCanvas());
            setParseErrors([]);
            setUnparseable(false);
            onEdit(docKey, seed);
          }}
        >
          Start an empty canvas
        </button>
      </div>
    );
  }

  const groups = doc.nodes.filter((n) => n.type === "group");
  const cards = doc.nodes.filter((n) => n.type !== "group");

  return (
    <div className="canvas-wrap">
      <div className="pane-toolbar" role="toolbar" aria-label="Canvas cards">
        <button
          onClick={() => {
            const p = place();
            const r = addTextNode(doc, { ...p, text: "" });
            if (!r.ok) fail(r.error);
            else {
              commit(r.doc);
              setSel([r.id!]);
              setCascade((c) => c + 1);
            }
          }}
        >
          + Text
        </button>
        <button onClick={() => { setAdding("note"); setAddPath(""); }}>+ Note</button>
        <button onClick={() => { setAdding("image"); setAddPath(""); }}>+ Image</button>
        <button onClick={() => { setAdding("link"); setAddPath(""); }}>+ Link</button>
        <button
          onClick={() => {
            const p = place();
            const r = addGroupNode(doc, { ...p, width: 420, height: 300, label: "Group" });
            if (!r.ok) fail(r.error);
            else {
              commit(r.doc);
              setSel([r.id!]);
              setCascade((c) => c + 1);
            }
          }}
        >
          + Group
        </button>
        <button
          className={connectFrom ? "active-toggle" : ""}
          disabled={sel.length === 0 && !connectFrom}
          title="Pick a source node, then click Connect, then click the target node"
          onClick={() => setConnectFrom((c) => (c ? null : (sel[sel.length - 1] ?? null)))}
        >
          {connectFrom ? "Connecting… (click target)" : "Connect"}
        </button>
        {sel.length > 1 && (
          <button
            onClick={() => {
              const r = groupSelected(doc, sel, "Group");
              if (!r.ok) fail(r.error);
              else {
                commit(r.doc);
                setSel([r.id!]);
              }
            }}
          >
            Group selected ({sel.length})
          </button>
        )}
        {(sel.length > 0 || edgeSel) && (
          <button
            onClick={() => {
              if (edgeSel) {
                const r = removeEdge(doc, edgeSel);
                if (!r.ok) fail(r.error);
                else {
                  commit(r.doc);
                  setEdgeSel(null);
                }
              } else {
                let cur = doc;
                for (const id of sel) {
                  const r = deleteNode(cur, id);
                  if (!r.ok) {
                    fail(r.error);
                    return;
                  }
                  cur = r.doc;
                }
                commit(cur);
                setSel([]);
              }
            }}
          >
            Delete
          </button>
        )}
      </div>

      {adding && (
        <div className="pane-toolbar" role="toolbar" aria-label={adding === "link" ? "New link card" : adding === "image" ? "New image card" : "New note card"}>
          <input
            className="rename-input"
            autoFocus
            aria-label={adding === "link" ? "URL" : "Vault-relative path"}
            placeholder={adding === "link" ? "https://…" : adding === "image" ? "images/pic.png" : "Notes/My note.md"}
            value={addPath}
            onChange={(e) => setAddPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAdding(null);
              if (e.key !== "Enter" || !addPath.trim()) return;
              const p = place();
              const r =
                adding === "link"
                  ? addLinkNode(doc, { ...p, url: addPath.trim() })
                  : addFileNode(doc, { ...p, file: addPath.trim() });
              if (!r.ok) fail(r.error);
              else {
                commit(r.doc);
                setSel([r.id!]);
                setCascade((c) => c + 1);
                setAdding(null);
              }
              e.stopPropagation();
            }}
          />
          <button
            disabled={!addPath.trim()}
            onClick={() => {
              const p = place();
              const r =
                adding === "link"
                  ? addLinkNode(doc, { ...p, url: addPath.trim() })
                  : addFileNode(doc, { ...p, file: addPath.trim() });
              if (!r.ok) fail(r.error);
              else {
                commit(r.doc);
                setSel([r.id!]);
                setCascade((c) => c + 1);
                setAdding(null);
              }
            }}
          >
            Create
          </button>
          <button onClick={() => setAdding(null)}>Cancel</button>
        </div>
      )}

      {parseErrors.length > 0 && (
        <p className="pane-hint" title={parseErrors.join("\n")}>
          {parseErrors.length} invalid item{parseErrors.length === 1 ? "" : "s"} dropped on load (file untouched until you edit).
        </p>
      )}
      {opError && <p className="inline-error" style={{ padding: "0 12px" }}>{opError}</p>}

      <div className="pane-toolbar" role="toolbar" aria-label="Canvas view">
        <button onClick={() => zoomAt(300, 230, 1.25)} aria-label="Zoom in">+</button>
        <button onClick={() => zoomAt(300, 230, 0.8)} aria-label="Zoom out">−</button>
        <button onClick={fit}>Fit</button>
        <button onClick={() => setT({ x: 40, y: 30, k: 1 })}>Reset</button>
        <span className="pane-hint">
          {doc.nodes.length} card{doc.nodes.length === 1 ? "" : "s"} · {doc.edges.length} edge{doc.edges.length === 1 ? "" : "s"}
          {connectFrom ? " · click a target node" : ""}
        </span>
      </div>

      <svg
        className="canvas-svg"
        role="application"
        aria-label="Canvas"
        onWheel={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 0.9);
        }}
        onPointerDown={(e) => {
          if ((e.target as SVGElement).closest(".c-node")) return;
          const sx = e.clientX;
          const sy = e.clientY;
          const ox = t.x;
          const oy = t.y;
          setSel([]);
          setEdgeSel(null);
          const move = (m: PointerEvent): void => setT((p) => ({ ...p, x: ox + (m.clientX - sx), y: oy + (m.clientY - sy) }));
          const up = (): void => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        <defs>
          <marker id="canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </marker>
        </defs>
        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
          {groups.map((n) => (
            <g
              key={n.id}
              className={`c-node${sel.includes(n.id) ? " selected" : ""}`}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest(".c-resize")) return;
                e.stopPropagation();
                if (e.shiftKey) {
                  clickNode(n.id, true);
                  return;
                }
                clickNode(n.id, false);
                const startX = e.clientX;
                const startY = e.clientY;
                const ox = n.x;
                const oy = n.y;
                drag.current = { id: n.id, dx: startX, dy: startY };
                const move = (m: PointerEvent): void => {
                  const d = drag.current;
                  if (!d) return;
                  const nx = ox + (m.clientX - d.dx) / t.k;
                  const ny = oy + (m.clientY - d.dy) / t.k;
                  setDoc((prev) => ({ ...prev, nodes: prev.nodes.map((x) => (x.id === n.id ? { ...x, x: nx, y: ny } : x)) }));
                };
                const up = (m: PointerEvent): void => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                  commitMove(n.id, ox + (m.clientX - startX) / t.k, oy + (m.clientY - startY) / t.k);
                  drag.current = null;
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
            >
              <rect
                x={n.x} y={n.y} width={n.width} height={n.height} rx={10}
                className="c-group"
              />
              <text x={n.x + 12} y={n.y + 22} className="c-group-label">
                {n.type === "group" && n.label ? (n.label.length > 40 ? `${n.label.slice(0, 39)}…` : n.label) : "Group"}
              </text>
              <rect
                className="c-resize" x={n.x + n.width - 10} y={n.y + n.height - 10} width={10} height={10}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const sx = e.clientX;
                  const sy = e.clientY;
                  resize.current = { id: n.id, sx, sy, w: n.width, h: n.height };
                  const move = (m: PointerEvent): void => {
                    const r = resize.current;
                    if (!r) return;
                    setDoc((prev) => ({
                      ...prev,
                      nodes: prev.nodes.map((x) =>
                        x.id === n.id ? { ...x, width: Math.max(50, r.w + (m.clientX - r.sx) / t.k), height: Math.max(40, r.h + (m.clientY - r.sy) / t.k) } : x,
                      ),
                    }));
                  };
                  const up = (m: PointerEvent): void => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                    const r = resize.current;
                    if (r) commitResize(n.id, Math.max(50, r.w + (m.clientX - sx) / t.k), Math.max(40, r.h + (m.clientY - sy) / t.k));
                    resize.current = null;
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              />
            </g>
          ))}

          {doc.edges.map((e) => {
            const a = byId.get(e.fromNode);
            const b = byId.get(e.toNode);
            if (!a || !b) return null;
            const p1 = port(a, e.fromSide, "right");
            const p2 = port(b, e.toSide, "left");
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            return (
              <g key={e.id} className={`c-edge${edgeSel === e.id ? " selected" : ""}`} onClick={(ev) => { ev.stopPropagation(); setEdgeSel(e.id); setSel([]); }}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="c-edge-line" style={e.color ? { color: colorStyle(e.color), stroke: colorStyle(e.color) } : undefined} markerEnd={e.toEnd === "none" ? undefined : "url(#canvas-arrow)"} />
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="c-edge-hit" />
                {e.label && <text x={mx} y={my - 5} textAnchor="middle" className="c-edge-label">{e.label.length > 40 ? `${e.label.slice(0, 39)}…` : e.label}</text>}
              </g>
            );
          })}

          {cards.map((n) => (
            <g
              key={n.id}
              className={`c-node${sel.includes(n.id) ? " selected" : ""}`}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("textarea,button,input,select,.c-resize")) return;
                e.stopPropagation();
                if (e.shiftKey) {
                  clickNode(n.id, true);
                  return;
                }
                clickNode(n.id, false);
                if (connectFrom) return;
                const startX = e.clientX;
                const startY = e.clientY;
                const ox = n.x;
                const oy = n.y;
                drag.current = { id: n.id, dx: startX, dy: startY };
                const move = (m: PointerEvent): void => {
                  const d = drag.current;
                  if (!d) return;
                  const nx = ox + (m.clientX - d.dx) / t.k;
                  const ny = oy + (m.clientY - d.dy) / t.k;
                  setDoc((prev) => ({ ...prev, nodes: prev.nodes.map((x) => (x.id === n.id ? { ...x, x: nx, y: ny } : x)) }));
                };
                const up = (m: PointerEvent): void => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                  commitMove(n.id, ox + (m.clientX - startX) / t.k, oy + (m.clientY - startY) / t.k);
                  drag.current = null;
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
            >
              <rect
                x={n.x} y={n.y} width={n.width} height={n.height} rx={8}
                className="c-card"
                style={n.color ? { stroke: colorStyle(n.color), strokeWidth: 2 } : undefined}
              />
              {n.type === "text" && (
                <foreignObject x={n.x + 6} y={n.y + 6} width={Math.max(n.width - 12, 20)} height={Math.max(n.height - 12, 20)}>
                  <textarea
                    className="c-text"
                    aria-label="Text card"
                    placeholder="Markdown…"
                    value={n.text}
                    onChange={(ev) => {
                      const r = setNodeText(doc, n.id, ev.target.value);
                      if (!r.ok) fail(r.error);
                      else commit(r.doc);
                    }}
                    onPointerDown={(ev) => ev.stopPropagation()}
                  />
                </foreignObject>
              )}
              {n.type === "file" && (
                <>
                  <text x={n.x + 12} y={n.y + 24} className="c-card-title">
                    {isImageFileRef(n.file) ? "🖼 " : "📄 "}{shortFile(n.file)}
                  </text>
                  {n.subpath && <text x={n.x + 12} y={n.y + 42} className="c-card-sub">{n.subpath}</text>}
                  {isImageFileRef(n.file) && <text x={n.x + 12} y={n.y + (n.subpath ? 60 : 42)} className="c-card-sub">image preview deferred — path kept</text>}
                  <foreignObject x={n.x + 6} y={n.y + n.height - 34} width={n.width - 12} height={28}>
                    <button
                      className="c-open"
                      disabled={isImageFileRef(n.file)}
                      title={isImageFileRef(n.file) ? "Images open in the file list in this MVP" : `Open ${n.file}`}
                      onClick={(ev) => { ev.stopPropagation(); onOpenNote(n.file); }}
                      onPointerDown={(ev) => ev.stopPropagation()}
                    >
                      Open
                    </button>
                  </foreignObject>
                </>
              )}
              {n.type === "link" && (
                <>
                  <text x={n.x + 12} y={n.y + 24} className="c-card-title">🔗 Link</text>
                  <foreignObject x={n.x + 6} y={n.y + 30} width={Math.max(n.width - 12, 20)} height={Math.max(n.height - 36, 20)}>
                    <div className="c-url" title={`${n.url} (web cards open in a browser post-MVP)`}>{n.url}</div>
                  </foreignObject>
                </>
              )}
              <rect
                className="c-resize" x={n.x + n.width - 10} y={n.y + n.height - 10} width={10} height={10}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const sx = e.clientX;
                  const sy = e.clientY;
                  resize.current = { id: n.id, sx, sy, w: n.width, h: n.height };
                  const move = (m: PointerEvent): void => {
                    const r = resize.current;
                    if (!r) return;
                    setDoc((prev) => ({
                      ...prev,
                      nodes: prev.nodes.map((x) =>
                        x.id === n.id ? { ...x, width: Math.max(50, r.w + (m.clientX - r.sx) / t.k), height: Math.max(40, r.h + (m.clientY - r.sy) / t.k) } : x,
                      ),
                    }));
                  };
                  const up = (m: PointerEvent): void => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", up);
                    const r = resize.current;
                    if (r) commitResize(n.id, Math.max(50, r.w + (m.clientX - sx) / t.k), Math.max(40, r.h + (m.clientY - sy) / t.k));
                    resize.current = null;
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              />
            </g>
          ))}
        </g>
      </svg>

      {selectedNode && (
        <NodePanel
          node={selectedNode}
          doc={doc}
          onOp={(next) => commit(next)}
          onFail={fail}
          onOpenNote={onOpenNote}
        />
      )}
      {selectedEdge && (
        <EdgePanel
          edge={selectedEdge}
          doc={doc}
          onOp={(next) => commit(next)}
          onFail={fail}
        />
      )}
    </div>
  );
}

function ColorField({ value, onPick }: { value: string | undefined; onPick: (c: string | undefined) => void }): JSX.Element {
  return (
    <span className="canvas-field">
      <label>
        Color
        <select
          aria-label="Color"
          value={value && COLOR_LABEL[value] ? value : value?.startsWith("#") ? "custom" : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") onPick(undefined);
            else if (v !== "custom") onPick(v);
          }}
        >
          <option value="">none</option>
          {CANVAS_PRESET_COLORS.map((c) => (
            <option key={c} value={c}>{COLOR_LABEL[c]} ({c})</option>
          ))}
          <option value="custom">custom hex…</option>
        </select>
      </label>
      <input
        aria-label="Custom hex color"
        placeholder="#rrggbb"
        defaultValue={value?.startsWith("#") ? value : ""}
        key={value ?? "none"}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = (e.target as HTMLInputElement).value.trim();
            onPick(v ? v : undefined);
          }
          e.stopPropagation();
        }}
      />
    </span>
  );
}

function NodePanel({
  node,
  doc,
  onOp,
  onFail,
  onOpenNote,
}: {
  node: CanvasNode;
  doc: CanvasDoc;
  onOp: (next: CanvasDoc) => void;
  onFail: (error: string) => void;
  onOpenNote: (rel: string) => void;
}): JSX.Element {
  const [fileDraft, setFileDraft] = useState(node.type === "file" ? node.file : "");
  const [subDraft, setSubDraft] = useState(node.type === "file" ? (node.subpath ?? "") : "");
  const [labelDraft, setLabelDraft] = useState(node.type === "group" ? (node.label ?? "") : "");
  useEffect(() => {
    setFileDraft(node.type === "file" ? node.file : "");
    setSubDraft(node.type === "file" ? (node.subpath ?? "") : "");
    setLabelDraft(node.type === "group" ? (node.label ?? "") : "");
  }, [node.id]);
  const apply = (r: { ok: true; doc: CanvasDoc } | { ok: false; error: string }): void => {
    if (!r.ok) onFail(r.error);
    else onOp(r.doc);
  };
  return (
    <div className="pane-toolbar canvas-panel" role="toolbar" aria-label="Selected card">
      <span className="pane-hint">{node.type} · {node.id}</span>
      {node.type === "file" && (
        <>
          <input className="rename-input" aria-label="Card file path" value={fileDraft} onChange={(e) => setFileDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <input className="rename-input" aria-label="Card subpath" placeholder="#Heading (optional)" value={subDraft} onChange={(e) => setSubDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <button onClick={() => apply(setNodeFile(doc, node.id, fileDraft.trim(), subDraft.trim() || undefined))}>Apply</button>
          {!isImageFileRef(node.file) && <button onClick={() => onOpenNote(node.file)}>Open note</button>}
        </>
      )}
      {node.type === "group" && (
        <>
          <input className="rename-input" aria-label="Group label" value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <button onClick={() => apply(renameGroup(doc, node.id, labelDraft))}>Rename</button>
        </>
      )}
      {node.type !== "group" && (
        <ColorField value={node.color} onPick={(c) => apply(setNodeColor(doc, node.id, c))} />
      )}
    </div>
  );
}

function EdgePanel({
  edge,
  doc,
  onOp,
  onFail,
}: {
  edge: CanvasEdge;
  doc: CanvasDoc;
  onOp: (next: CanvasDoc) => void;
  onFail: (error: string) => void;
}): JSX.Element {
  const [label, setLabel] = useState(edge.label ?? "");
  useEffect(() => setLabel(edge.label ?? ""), [edge.id, edge.label]);
  const apply = (r: { ok: true; doc: CanvasDoc } | { ok: false; error: string }): void => {
    if (!r.ok) onFail(r.error);
    else onOp(r.doc);
  };
  const ids = doc.nodes.filter((n) => n.type !== "group").map((n) => n.id);
  const pick = (key: "fromNode" | "toNode" | "fromSide" | "toSide" | "fromEnd" | "toEnd", value: string): void => {
    apply(reconnectEdge(doc, edge.id, { [key]: value } as { fromNode: string }));
  };
  return (
    <div className="pane-toolbar canvas-panel" role="toolbar" aria-label="Selected edge">
      <span className="pane-hint">edge · {edge.id}</span>
      <label>From <select aria-label="Edge source" value={edge.fromNode} onChange={(e) => pick("fromNode", e.target.value)}>{ids.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
      <label>To <select aria-label="Edge target" value={edge.toNode} onChange={(e) => pick("toNode", e.target.value)}>{ids.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
      <label>From side <select aria-label="Edge source side" value={edge.fromSide ?? "right"} onChange={(e) => pick("fromSide", e.target.value)}>{CANVAS_SIDES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>To side <select aria-label="Edge target side" value={edge.toSide ?? "left"} onChange={(e) => pick("toSide", e.target.value)}>{CANVAS_SIDES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>Source end <select aria-label="Edge source end" value={edge.fromEnd ?? "none"} onChange={(e) => pick("fromEnd", e.target.value)}>{CANVAS_ENDS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>Target end <select aria-label="Edge target end" value={edge.toEnd ?? "arrow"} onChange={(e) => pick("toEnd", e.target.value)}>{CANVAS_ENDS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <input className="rename-input" aria-label="Edge label" placeholder="label…" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") apply(setEdgeLabel(doc, edge.id, label)); e.stopPropagation(); }} />
      <button onClick={() => apply(setEdgeLabel(doc, edge.id, label))}>Label</button>
      <ColorField value={edge.color} onPick={(c) => apply(setEdgeColor(doc, edge.id, c))} />
    </div>
  );
}
