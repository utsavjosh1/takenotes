import { describe, expect, it } from "vitest";
import {
  propertySearchQuery,
  renamePropertyKey,
  sortPropertySummaries,
  summarizeProperties,
} from "@takenotes/core/properties/summary";

/** Phase 3 Properties gate — aggregation + rename vectors. */

const entries = [
  { relativePath: "a.md", frontmatter: { status: "active", count: 3, empty: null } },
  { relativePath: "b.md", frontmatter: { status: "done", count: 5 } },
  { relativePath: "c.md", frontmatter: { tags: ["x", "y"] } },
];

describe("summarizeProperties", () => {
  it("aggregates file counts, resolved types, and distinct values", () => {
    const out = summarizeProperties(entries, {});
    const byName = Object.fromEntries(out.map((s) => [s.name, s]));
    expect(byName["status"]!.files).toBe(2);
    expect(byName["status"]!.type).toBe("text");
    expect(byName["status"]!.values).toEqual(["active", "done"]);
    expect(byName["count"]!.type).toBe("text");
    expect(byName["count"]!.values).toEqual(["3", "5"]);
    // tags resolves through V1 defaults.
    expect(byName["tags"]!.type).toBe("tags");
    expect(byName["tags"]!.values).toEqual(['["x","y"]']);
    expect(byName["empty"]!.allNull).toBe(true);
  });

  it("honors explicit registry types", () => {
    const out = summarizeProperties(entries, { count: "number", status: "text" });
    expect(out.find((s) => s.name === "count")!.type).toBe("number");
  });

  it("skips malformed entries and sorts name/frequency", () => {
    const out = summarizeProperties([null, { relativePath: "x", frontmatter: null }] as never);
    expect(out).toEqual([]);
    const sorted = sortPropertySummaries(summarizeProperties(entries), "frequency");
    // status:2 + count:2 tie breaks by name; tags:1 + empty:1 likewise.
    expect(sorted.map((s) => s.name)).toEqual(["count", "status", "empty", "tags"]);
    expect(sortPropertySummaries(summarizeProperties(entries), "name").map((s) => s.name)).toEqual([
      "count",
      "empty",
      "status",
      "tags",
    ]);
  });
});

describe("propertySearchQuery", () => {
  it("builds bare and valued queries, quoting spaced values", () => {
    expect(propertySearchQuery("status")).toBe("[status]");
    expect(propertySearchQuery("status", "active")).toBe("[status:active]");
    expect(propertySearchQuery("title", "My Note")).toBe('[title:"My Note"]');
  });
});

describe("renamePropertyKey", () => {
  const src = "---\nstatus: active\ntitle: T\n---\nbody\n";

  it("moves the key preserving the rest of the block", () => {
    const res = renamePropertyKey(src, "status", "state");
    expect(res).not.toHaveProperty("error");
    if ("error" in res) throw new Error("unreachable");
    expect(res.content).toContain("state: active");
    expect(res.content).not.toContain("status:");
    expect(res.content).toContain("title: T");
    expect(res.content.endsWith("body\n")).toBe(true);
  });

  it("is a no-op when the old key is absent or names are equal", () => {
    expect(renamePropertyKey(src, "missing", "other")).toEqual({ content: src });
    expect(renamePropertyKey(src, "status", "status")).toEqual({ content: src });
    expect(renamePropertyKey("no frontmatter\n", "a", "b")).toEqual({ content: "no frontmatter\n" });
  });

  it("refuses to clobber, parse garbage, or take bad names", () => {
    expect(renamePropertyKey(src, "status", "title")).toHaveProperty("error");
    expect(renamePropertyKey("---\nkey:\n\t- tab-indent\n---\n", "a", "b")).toHaveProperty("error");
    expect(renamePropertyKey(src, "__proto__", "b")).toHaveProperty("error");
    expect(renamePropertyKey(src, "a", "has space")).toHaveProperty("error");
  });
});
