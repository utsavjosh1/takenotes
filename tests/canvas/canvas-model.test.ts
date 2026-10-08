import { describe, expect, it } from "vitest";
import {
  addEdge,
  addFileNode,
  addGroupNode,
  addLinkNode,
  addTextNode,
  deleteNode,
  edgeEndpoints,
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
} from "@takenotes/core/canvas/model";

/** Phase 4c Canvas model gate — pure JSON Canvas vectors. */

const TEXT = { id: "t1", type: "text", x: 0, y: 0, width: 250, height: 100, text: "hello" };
const FILE = { id: "f1", type: "file", x: 300, y: 0, width: 400, height: 300, file: "Note.md" };

describe("parseCanvasDoc", () => {
  it("parses a valid doc with no errors", () => {
    const r = parseCanvasDoc(JSON.stringify({ nodes: [TEXT, FILE], edges: [] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.nodes.length).toBe(2);
      expect(r.errors).toEqual([]);
    }
  });

  it("refuses non-JSON and non-object roots", () => {
    expect(parseCanvasDoc("{oops")).toMatchObject({ ok: false });
    expect(parseCanvasDoc(null)).toMatchObject({ ok: false });
    expect(parseCanvasDoc({ nodes: {}, edges: [] })).toMatchObject({ ok: false });
  });

  it("drops bad nodes with errors; dangling edges drop too", () => {
    const r = parseCanvasDoc({
      nodes: [TEXT, { id: "t1", type: "text", x: 0, y: 0, width: 10, height: 10, text: "dup" }, { id: "x", type: "weird", x: 0, y: 0, width: 10, height: 10 }],
      edges: [{ id: "e1", fromNode: "t1", toNode: "ghost" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.nodes.map((n) => n.id)).toEqual(["t1"]);
      expect(r.doc.edges).toEqual([]);
      expect(r.errors.length).toBe(3);
    }
  });

  it("rejects bad colors, escaping file refs, and colored groups", () => {
    const r = parseCanvasDoc({
      nodes: [
        { id: "a", type: "text", x: 0, y: 0, width: 10, height: 10, text: "", color: "chartreuse" },
        { id: "b", type: "file", x: 0, y: 0, width: 10, height: 10, file: "../secret.md" },
        { id: "c", type: "group", x: 0, y: 0, width: 10, height: 10, color: "1" },
      ],
      edges: [],
    });
    if (r.ok) {
      expect(r.doc.nodes).toEqual([]);
      expect(r.errors.length).toBe(3);
    } else expect.unreachable();
  });

  it("round-trips through the serializer", () => {
    const r = parseCanvasDoc({ nodes: [TEXT, FILE], edges: [{ id: "e1", fromNode: "t1", toNode: "f1" }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const again = parseCanvasDoc(serializeCanvasDoc(r.doc));
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.doc).toEqual(r.doc);
    }
  });
});

describe("node ops", () => {
  it("adds text/file/link/group cards with generated ids", () => {
    let doc = emptyCanvas();
    const t = addTextNode(doc, { x: 0, y: 0, text: "hi" });
    expect(t.ok).toBe(true);
    if (t.ok) doc = t.doc;
    const f = addFileNode(doc, { x: 10, y: 10, file: "a/b.md" });
    if (f.ok) doc = f.doc;
    const l = addLinkNode(doc, { x: 20, y: 20, url: "https://example.com" });
    if (l.ok) doc = l.doc;
    const g = addGroupNode(doc, { x: -50, y: -50, width: 600, height: 500, label: "area" });
    if (g.ok) doc = g.doc;
    expect(doc.nodes.length).toBe(4);
    expect(new Set(doc.nodes.map((n) => n.id)).size).toBe(4);
  });

  it("refuses duplicates, bad frames, escaping paths, and oversized text", () => {
    const t = addTextNode(emptyCanvas(), { id: "n", x: 0, y: 0 });
    expect(t.ok).toBe(true);
    if (t.ok) {
      expect(addTextNode(t.doc, { id: "n", x: 0, y: 0 })).toMatchObject({ ok: false });
      expect(moveNode(t.doc, "n", NaN, 0)).toMatchObject({ ok: false });
      expect(resizeNode(t.doc, "n", 0, 10)).toMatchObject({ ok: false });
      expect(setNodeText(t.doc, "n", "x".repeat(50001))).toMatchObject({ ok: false });
    }
    expect(addFileNode(emptyCanvas(), { x: 0, y: 0, file: "/abs.md" })).toMatchObject({ ok: false });
    expect(setNodeColor(emptyCanvas(), "missing", "1")).toMatchObject({ ok: false });
  });

  it("moves, resizes, edits text/file/label/color; delete cascades edges", () => {
    let doc = emptyCanvas();
    const g = addGroupNode(doc, { x: 0, y: 0, width: 100, height: 100 });
    if (g.ok) doc = g.doc;
    const gid = g.ok ? g.id! : "";
    expect(renameGroup(doc, gid, "renamed").ok).toBe(true);
    const t = addTextNode(doc, { x: 0, y: 0, text: "a" });
    if (t.ok) doc = t.doc;
    const tid = t.ok ? t.id! : "";
    const moved = moveNode(doc, tid, 5, 6);
    expect(moved.ok).toBe(true);
    if (moved.ok) doc = moved.doc;
    const resized = resizeNode(doc, tid, 300, 200);
    if (resized.ok) doc = resized.doc;
    const edited = setNodeText(doc, tid, "b");
    if (edited.ok) doc = edited.doc;
    const colored = setNodeColor(doc, tid, "#ff0000");
    if (colored.ok) doc = colored.doc;
    const e = addEdge(doc, { fromNode: tid, toNode: gid });
    if (e.ok) doc = e.doc;
    expect(doc.edges.length).toBe(1);
    const del = deleteNode(doc, tid);
    if (del.ok) doc = del.doc;
    expect(doc.edges).toEqual([]);
    expect(doc.nodes.some((n) => n.id === gid)).toBe(true);
    // File repoint + wrong-kind guards.
    const f = addFileNode(doc, { x: 0, y: 0, file: "n.md" });
    if (f.ok) doc = f.doc;
    const fid = f.ok ? f.id! : "";
    expect(setNodeFile(doc, fid, "m.md", "#H").ok).toBe(true);
    expect(setNodeText(doc, fid, "x")).toMatchObject({ ok: false });
    expect(renameGroup(doc, fid, "x")).toMatchObject({ ok: false });
  });

  it("groups selected nodes into a padded bbox", () => {
    let doc = emptyCanvas();
    const a = addTextNode(doc, { x: 0, y: 0, width: 100, height: 100 });
    if (a.ok) doc = a.doc;
    const b = addTextNode(doc, { x: 200, y: 200, width: 100, height: 100 });
    if (b.ok) doc = b.doc;
    const g = groupSelected(doc, [a.ok ? a.id! : "", b.ok ? b.id! : ""], "both");
    expect(g.ok).toBe(true);
    if (g.ok) {
      const group = g.doc.nodes.find((n) => n.id === g.id)!;
      expect([group.x, group.y, group.width, group.height]).toEqual([-40, -40, 380, 380]);
    }
    expect(groupSelected(doc, [])).toMatchObject({ ok: false });
    expect(groupSelected(doc, ["missing"])).toMatchObject({ ok: false });
  });
});

describe("edge ops", () => {
  function twoNodes() {
    let doc = emptyCanvas();
    const a = addTextNode(doc, { x: 0, y: 0 });
    if (a.ok) doc = a.doc;
    const b = addTextNode(doc, { x: 300, y: 0 });
    if (b.ok) doc = b.doc;
    return { doc, a: a.ok ? a.id! : "", b: b.ok ? b.id! : "" };
  }

  it("adds/removes/reconnects/labels/colors edges; endpoints navigate", () => {
    const { doc, a, b } = twoNodes();
    const e = addEdge(doc, { fromNode: a, toNode: b, label: "relates" });
    expect(e.ok).toBe(true);
    let cur = e.ok ? e.doc : doc;
    const eid = e.ok ? e.id! : "";
    expect(edgeEndpoints(cur, eid)).toEqual({ fromNode: a, toNode: b });
    const re = reconnectEdge(cur, eid, { toNode: a });
    if (re.ok) cur = re.doc;
    expect(edgeEndpoints(cur, eid)).toEqual({ fromNode: a, toNode: a });
    const lb = setEdgeLabel(cur, eid, "self");
    if (lb.ok) cur = lb.doc;
    const co = setEdgeColor(cur, eid, "2");
    if (co.ok) cur = co.doc;
    expect(co.ok).toBe(true);
    expect(setEdgeColor(cur, eid, "chartreuse")).toMatchObject({ ok: false });
    expect(reconnectEdge(cur, eid, { toNode: "missing" })).toMatchObject({ ok: false });
    const rm = removeEdge(cur, eid);
    if (rm.ok) cur = rm.doc;
    expect(cur.edges).toEqual([]);
    expect(removeEdge(cur, eid)).toMatchObject({ ok: false });
    expect(addEdge(cur, { fromNode: a, toNode: "missing" })).toMatchObject({ ok: false });
  });

  it("detects image file refs", () => {
    expect(isImageFileRef("pic.png")).toBe(true);
    expect(isImageFileRef("Note.md")).toBe(false);
    expect(isImageFileRef("scan.PDF")).toBe(false);
  });
});
