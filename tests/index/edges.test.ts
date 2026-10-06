import { describe, expect, it } from "vitest";
import { parseDocument } from "@takenotes/core/index/document";
import { buildEdges, resolveLinkTarget, type Edge } from "@takenotes/core/index/edges";
import { WorkspaceIndex, type IndexInput } from "@takenotes/core/index/store";

const REV = (hash: string) => ({ hash, size: 10, mtimeMs: 1 });
const WS = "ws";

function entry(rel: string, content: string) {
  return parseDocument(WS, rel, content, REV(rel));
}

function edgeSet(edges: Edge[]): string[] {
  return edges.map((e) => JSON.stringify(e)).sort();
}

/** Step 3 edge table: one typed relation graph over parsed entries.
 * Entries come from the real parser (`parseDocument` unchanged) so the
 * tables pin the parser-to-edges contract, not hand-built fixtures. */
describe("edge kinds", () => {
  it("link: all [[forms]] resolve with alias/heading/block detail", () => {
    const entries = [
      entry("t.md", "# T\n"),
      entry(
        "hub.md",
        "[[t]] [[t|Alias]] [[t#Head]] [[t#^blk]]\n",
      ),
    ];
    const links = buildEdges(entries).filter((e) => e.kind === "link");
    expect(links).toEqual([
      { from: "hub.md", to: "t.md", kind: "link", detail: { target: "t", line: 1 } },
      { from: "hub.md", to: "t.md", kind: "link", detail: { target: "t", alias: "Alias", line: 1 } },
      { from: "hub.md", to: "t.md", kind: "link", detail: { target: "t", heading: "Head", line: 1 } },
      { from: "hub.md", to: "t.md", kind: "link", detail: { target: "t", blockAnchor: "blk", line: 1 } },
    ]);
  });

  it("embed: ![[t]] is its own kind", () => {
    const entries = [entry("t.md", "# T\n"), entry("hub.md", "![[t]]\n")];
    expect(buildEdges(entries).filter((e) => e.kind === "embed")).toEqual([
      { from: "hub.md", to: "t.md", kind: "embed", detail: { target: "t", line: 1 } },
    ]);
  });

  it("property-ref: frontmatter strings resolving to notes", () => {
    const entries = [
      entry("b.md", "# B\n"),
      entry("a.md", "---\nrelated: b\ncount: 3\ntags: [x]\n---\n# A\n"),
    ];
    const refs = buildEdges(entries).filter((e) => e.kind === "property-ref");
    expect(refs).toEqual([{ from: "a.md", to: "b.md", kind: "property-ref", detail: { prop: "related", target: "b" } }]);
  });

  it("property-ref: lists resolve, non-strings and misses stay silent", () => {
    const entries = [
      entry("b.md", "# B\n"),
      entry("a.md", "---\nrelated: [b, Ghost, 7]\n---\n# A\n"),
    ];
    const refs = buildEdges(entries).filter((e) => e.kind === "property-ref");
    expect(refs).toEqual([{ from: "a.md", to: "b.md", kind: "property-ref", detail: { prop: "related", target: "b" } }]);
  });

  it("tag: inline + frontmatter tags merge to tag nodes", () => {
    const entries = [entry("a.md", "---\ntags: [plan]\n---\n# A #todo/nest\n")];
    const tags = buildEdges(entries).filter((e) => e.kind === "tag");
    expect(edgeSet(tags)).toEqual(
      edgeSet([
        { from: "a.md", to: "plan", kind: "tag", detail: { tag: "plan" } },
        { from: "a.md", to: "todo/nest", kind: "tag", detail: { tag: "todo/nest" } },
      ]),
    );
  });

  it("task: anchored tasks get stable ids, plain tasks get line ids", () => {
    const entries = [entry("t.md", "- [ ] anchored ^tid\n- [x] plain\n")];
    // Sorted by `to`: `L2` (`L` < `^`) precedes the anchored node id.
    expect(buildEdges(entries).filter((e) => e.kind === "task")).toEqual([
      {
        from: "t.md",
        to: "t.md#L2",
        kind: "task",
        detail: { description: "plain", completed: true, line: 2 },
      },
      {
        from: "t.md",
        to: "t.md#^tid",
        kind: "task",
        detail: { description: "anchored", completed: false, line: 1, anchor: "tid" },
      },
    ]);
  });
});

describe("resolution", () => {
  it("duplicate bare names are unresolved, never guessed", () => {
    const entries = [
      entry("a/Note.md", "# A\n"),
      entry("b/Note.md", "# B\n"),
      entry("hub.md", "[[Note]] [[a/Note]] [[b/note]]\n"),
    ];
    const links = buildEdges(entries).filter((e) => e.kind === "link");
    // Sorted by `to`; unresolved (`null`) sorts last.
    expect(links).toEqual([
      { from: "hub.md", to: "a/Note.md", kind: "link", detail: { target: "a/Note", line: 1 } },
      { from: "hub.md", to: "b/Note.md", kind: "link", detail: { target: "b/note", line: 1 } },
      { from: "hub.md", to: null, kind: "link", detail: { target: "Note", line: 1 } },
    ]);
  });

  it("links to nonexistent notes are valid unresolved edges", () => {
    const entries = [entry("hub.md", "[[Ghost]] [[Ghost#H|see]]\n")];
    expect(buildEdges(entries)).toEqual([
      { from: "hub.md", to: null, kind: "link", detail: { target: "Ghost", line: 1 } },
      { from: "hub.md", to: null, kind: "link", detail: { target: "Ghost", alias: "see", heading: "H", line: 1 } },
    ]);
  });

  it("resolveLinkTarget: exact-case preferred, then case-fold, then null", () => {
    expect(resolveLinkTarget("Ref", ["Ref.md", "dir/ref.md"])).toBe("Ref.md");
    expect(resolveLinkTarget("ref", ["Ref.md", "dir/ref.md"])).toBe("dir/ref.md");
    expect(resolveLinkTarget("Both", ["a/Both.md", "b/Both.md"])).toBeNull();
    // Bare names match basenames in any folder (exact-case first).
    expect(resolveLinkTarget("Plan", ["Projects/Plan.md"])).toBe("Projects/Plan.md");
    expect(resolveLinkTarget("Projects/Plan", ["Projects/Plan.md"])).toBe("Projects/Plan.md");
    expect(resolveLinkTarget("projects/plan.md", ["Projects/Plan.md"])).toBe("Projects/Plan.md");
    expect(resolveLinkTarget("", ["a.md"])).toBeNull();
    expect(resolveLinkTarget("a.md", [])).toBeNull();
  });
});

describe("store edge lifecycle", () => {
  const INPUTS: IndexInput[] = [
    { workspaceId: WS, relativePath: "b.md", content: "# B #x\n", revision: REV("h1") },
    { workspaceId: WS, relativePath: "a.md", content: "[[b]] #y\n- [ ] t ^tid\n", revision: REV("h2") },
  ];

  it("rebuilding twice gives the same edges", () => {
    const idx = new WorkspaceIndex();
    idx.rebuild(WS, INPUTS);
    const first = idx.edges(WS);
    expect(first.length).toBeGreaterThan(0);
    idx.rebuild(WS, INPUTS);
    expect(idx.edges(WS)).toEqual(first);
    expect(JSON.stringify(idx.edges(WS))).toBe(JSON.stringify(first));
  });

  it("dropping and rebuilding the index restores everything", () => {
    const idx = new WorkspaceIndex();
    idx.rebuild(WS, INPUTS);
    const before = idx.edges(WS);
    idx.clear(WS);
    expect(idx.list(WS)).toEqual([]);
    expect(idx.edges(WS)).toEqual([]);
    idx.rebuild(WS, INPUTS);
    expect(idx.edges(WS)).toEqual(before);
  });

  it("edges stay workspace-isolated", () => {
    const idx = new WorkspaceIndex();
    idx.rebuild(WS, INPUTS);
    idx.rebuild("other", [{ workspaceId: "other", relativePath: "b.md", content: "[[ghost]]\n", revision: REV("h9") }]);
    expect(idx.edges(WS).some((e) => e.detail?.target === "ghost")).toBe(false);
    expect(idx.edges("other")).toEqual([
      { from: "b.md", to: null, kind: "link", detail: { target: "ghost", line: 1 } },
    ]);
  });
});
