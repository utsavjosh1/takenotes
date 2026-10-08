import { describe, expect, it } from "vitest";
import {
  aggregateTags,
  buildTagTree,
  flattenTagTree,
  sortTagCounts,
  tagSearchQuery,
} from "@takenotes/core/tags/tree";

/** Phase 3 Tags gate — pure aggregation vectors. */

const entries = [
  { relativePath: "a.md", tags: ["project", "project/frontend"] },
  { relativePath: "b.md", tags: ["project", "project/backend"] },
  { relativePath: "c.md", tags: ["project/frontend", "solo"] },
  { relativePath: "d.md", tags: [] },
];

describe("aggregateTags", () => {
  it("counts files per exact tag with sorted paths", () => {
    const counts = aggregateTags(entries);
    const byTag = new Map(counts.map((c) => [c.tag, c]));
    expect(byTag.get("project")!.files).toBe(2);
    expect(byTag.get("project")!.paths).toEqual(["a.md", "b.md"]);
    expect(byTag.get("project/frontend")!.files).toBe(2);
    expect(byTag.get("solo")!.files).toBe(1);
    expect(byTag.get("nothing")).toBeUndefined();
  });

  it("dedupes repeat tags within one file and skips malformed entries", () => {
    const counts = aggregateTags([
      { relativePath: "x.md", tags: ["t", "t"] },
      { relativePath: "y.md", tags: "not-a-list" },
      null,
      { relativePath: "z.md", tags: ["t"] },
    ] as unknown as { relativePath: string; tags: unknown }[]);
    expect(counts).toEqual([{ tag: "t", files: 2, paths: ["x.md", "z.md"] }]);
  });
});

describe("sortTagCounts", () => {
  it("sorts by name or frequency (ties break by name)", () => {
    const counts = aggregateTags(entries);
    expect(sortTagCounts(counts, "name").map((c) => c.tag)).toEqual([
      "project",
      "project/backend",
      "project/frontend",
      "solo",
    ]);
    expect(sortTagCounts(counts, "frequency").map((c) => `${c.tag}:${c.files}`)).toEqual([
      "project:2",
      "project/frontend:2",
      "project/backend:1",
      "solo:1",
    ]);
  });
});

describe("buildTagTree", () => {
  it("nests by slash with aggregated totals", () => {
    const tree = buildTagTree(aggregateTags(entries));
    const project = tree.find((n) => n.name === "project")!;
    expect(project.full).toBe("project");
    expect(project.exact).toBe(2);
    // a.md, b.md (exact) + c.md (via project/frontend) = 3 files under project/.
    expect(project.total).toBe(3);
    expect(project.children.map((c) => c.name)).toEqual(["backend", "frontend"]);
    const frontend = project.children.find((c) => c.name === "frontend")!;
    expect(frontend.full).toBe("project/frontend");
    expect(frontend.exact).toBe(2);
    expect(tree.find((n) => n.name === "solo")!.total).toBe(1);
  });

  it("a file with both parent and child counts once in the total", () => {
    const tree = buildTagTree(aggregateTags([{ relativePath: "a.md", tags: ["p", "p/q"] }]));
    expect(tree[0]!.total).toBe(1);
  });

  it("flattens depth-first, parent before children", () => {
    const flat = flattenTagTree(buildTagTree(aggregateTags(entries)));
    expect(flat.map((n) => n.full)).toEqual(["project", "project/backend", "project/frontend", "solo"]);
  });
});

describe("tagSearchQuery", () => {
  it("produces the tag: operator form", () => {
    expect(tagSearchQuery("project/frontend")).toBe("tag:project/frontend");
  });
});
