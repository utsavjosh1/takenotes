import { describe, expect, it } from "vitest";
import { parseDocument } from "@takenotes/core/index/document";
import { buildEdges } from "@takenotes/core/index/edges";
import {
  buildGraph,
  colorGroups,
  filterGraph,
  layoutCircle,
  localSubgraph,
} from "@takenotes/core/graph/model";

const REV = (hash: string) => ({ hash, size: 10, mtimeMs: 1 });
const WS = "ws";
const entry = (rel: string, content: string) => parseDocument(WS, rel, content, REV(rel));

function graph(contents: Record<string, string>, opts?: Parameters<typeof buildGraph>[2]) {
  const entries = Object.entries(contents).map(([rel, body]) => entry(rel, body));
  return { entries, model: buildGraph(entries, buildEdges(entries), opts) };
}

/** Phase 4a Graph model gate — pure derivation vectors over the real
 * parser + edge table (no hand-built edges). */

describe("buildGraph", () => {
  it("nodes are notes; links dedupe resolved link/embed pairs", () => {
    const { model } = graph({
      "a.md": "# A\n[[b]] [[b]] ![[b]]\n",
      "b.md": "# B\n",
      "c.md": "# C\n",
    });
    expect(model.nodes.map((n) => n.id)).toEqual(["a.md", "b.md", "c.md"]);
    expect(model.links).toEqual([{ source: "a.md", target: "b.md" }]);
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    expect(byId.get("b.md")!.inDegree).toBe(1);
    expect(byId.get("a.md")!.outDegree).toBe(1);
    expect(byId.get("c.md")!.degree).toBe(0);
  });

  it("ignores property-ref/tag/task edges and keeps self-loops once", () => {
    const { model } = graph({
      "self.md": "# Self\n[[self]] [[self]]\n",
      "hub.md": "---\nref: self\ntags: [x]\n---\n- [ ] chores\n",
    });
    expect(model.links).toEqual([{ source: "self.md", target: "self.md" }]);
    const self = model.nodes.find((n) => n.id === "self.md")!;
    expect(self.inDegree).toBe(1);
    expect(self.outDegree).toBe(1);
  });

  it("unresolved targets stay out by default; opt-in adds deduped ghosts", () => {
    const closed = graph({ "a.md": "# A\n[[missing]] [[missing]]\n" });
    expect(closed.model.nodes.map((n) => n.id)).toEqual(["a.md"]);
    expect(closed.model.links).toEqual([]);
    const { model } = graph({ "a.md": "# A\n[[missing]] [[missing]]\n" }, { includeUnresolved: true });
    expect(model.nodes.map((n) => n.id)).toEqual(["a.md", "ghost:missing"]);
    expect(model.links).toEqual([{ source: "a.md", target: "ghost:missing" }]);
    expect(model.nodes.find((n) => n.id === "ghost:missing")!.ghost).toBe(true);
  });

  it("attachment targets need the attachments flag and arrive typed", () => {
    const contents = { "a.md": "# A\n![[pic.png]]\n" };
    const off = graph(contents);
    expect(off.model.nodes.map((n) => n.id)).toEqual(["a.md"]);
    const { model } = graph(contents, { includeAttachments: true });
    expect(model.nodes.map((n) => n.id)).toEqual(["a.md", "attachment:pic.png"]);
    expect(model.nodes.find((n) => n.id === "attachment:pic.png")!.attachment).toBe(true);
  });

  it("ghost list is bounded", () => {
    const lines = Array.from({ length: 600 }, (_, i) => `[[ghost-${i}]]`).join(" ");
    const { model } = graph({ "a.md": `# A\n${lines}\n` }, { includeUnresolved: true });
    expect(model.nodes.length).toBeLessThanOrEqual(501);
  });
});

describe("filterGraph", () => {
  it("search query subsets notes; ghosts drop under any query", () => {
    const { entries, model } = graph(
      { "a.md": "# Alpha\n[[b]]\n", "b.md": "# Beta\n" },
      { includeUnresolved: true },
    );
    const res = filterGraph(model, entries, { query: "alpha" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.model.nodes.map((n) => n.id)).toEqual(["a.md"]);
  });

  it("invalid queries surface honestly; empty queries are a no-op", () => {
    const { entries, model } = graph({ "a.md": "# A\n" });
    const bad = filterGraph(model, entries, { query: "due:tomorrow" });
    expect(bad.ok).toBe(false);
    const empty = filterGraph(model, entries, { query: "   " });
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.model.nodes.length).toBe(1);
  });

  it("showOrphans:false hides isolates and prunes links", () => {
    const { entries, model } = graph({
      "a.md": "# A\n[[b]]\n",
      "b.md": "# B\n",
      "solo.md": "# Solo\n",
    });
    const res = filterGraph(model, entries, { showOrphans: false });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.model.nodes.map((n) => n.id).sort()).toEqual(["a.md", "b.md"]);
      expect(res.model.links).toEqual([{ source: "a.md", target: "b.md" }]);
    }
  });
});

describe("colorGroups + localSubgraph + layoutCircle", () => {
  it("groups assign first-match colors; invalid groups skip", () => {
    const { entries } = graph({ "a.md": "# Alpha\n", "b.md": "# Beta\n" });
    const colors = colorGroups(entries, [
      { query: "due:tomorrow", color: "red" },
      { query: "alpha", color: "blue" },
      { query: "", color: "green" },
    ]);
    expect(colors.get("a.md")).toBe("blue");
    expect(colors.get("b.md")).toBeUndefined();
  });

  it("local BFS respects depth; unknown centers are empty", () => {
    const { model } = graph({
      "a.md": "# A\n[[b]]\n",
      "b.md": "# B\n[[c]]\n",
      "c.md": "# C\n",
      "far.md": "# Far\n",
    });
    expect(localSubgraph(model, "a.md", 0).nodes.map((n) => n.id)).toEqual(["a.md"]);
    expect(localSubgraph(model, "a.md", 1).nodes.map((n) => n.id).sort()).toEqual(["a.md", "b.md"]);
    expect(localSubgraph(model, "a.md", 2).nodes.map((n) => n.id).sort()).toEqual(["a.md", "b.md", "c.md"]);
    expect(localSubgraph(model, "nope.md", 2).nodes).toEqual([]);
    expect(localSubgraph(model, "a.md", 99).nodes.length).toBe(3);
  });

  it("circle layout is deterministic; singles sit at origin", () => {
    const { model } = graph({ "a.md": "# A\n", "b.md": "# B\n" });
    const first = layoutCircle(model);
    const second = layoutCircle(model);
    expect([...first.entries()]).toEqual([...second.entries()]);
    expect(first.size).toBe(2);
    const single = layoutCircle({ nodes: [{ id: "a.md", label: "A", inDegree: 0, outDegree: 0, degree: 0, tags: [] }], links: [] });
    expect(single.get("a.md")).toEqual({ x: 0, y: 0 });
    expect(layoutCircle({ nodes: [], links: [] }).size).toBe(0);
  });
});
