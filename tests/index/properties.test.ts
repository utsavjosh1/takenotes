import { describe, expect, it } from "vitest";
import {
  interpretProperty,
  parsePropertyRegistry,
  resolvePropertyType,
  updateFrontmatter,
} from "@takenotes/core/index/properties";

/** Step 3b gate — logic vectors. The writer is pure: "bytes untouched" is
 * asserted by checking the error return while holding the input string. */

function ok(content: string, patch: Record<string, unknown>, registry?: Parameters<typeof updateFrontmatter>[2]): string {
  const res = updateFrontmatter(content, patch, registry);
  expect(res).not.toHaveProperty("error");
  if ("error" in res) throw new Error("unreachable");
  return res.content;
}

function errCode(content: string, patch: Record<string, unknown>, registry?: Parameters<typeof updateFrontmatter>[2]): string {
  const res = updateFrontmatter(content, patch, registry);
  expect(res).toHaveProperty("error");
  if (!("error" in res)) throw new Error("unreachable");
  return (res.error as { code: string }).code;
}

describe("type coercion on explicit write", () => {
  it("text requires a string", () => {
    expect(ok("---\ntitle: A\n---\nbody\n", { title: "B" })).toContain("title: B");
    expect(errCode("---\ntitle: A\n---\nbody\n", { title: 3 })).toBe("INVALID_REQUEST");
  });

  it("list-text: scalar → single-item list", () => {
    const out = ok("body\n", { aliases: "Solo" }, { aliases: "list-text" });
    expect(out).toContain("aliases:\n  - Solo\n");
  });

  it("tags: string splits, list stays a list, missing stays missing", () => {
    const fromScalar = ok("body\n", { tags: "a, b" }, { tags: "tags" });
    expect(fromScalar).toContain("tags:\n  - a\n  - b\n");
    const fromList = ok("body\n", { tags: ["x", "y"] }, { tags: "tags" });
    expect(fromList).toContain("tags:\n  - x\n  - y\n");
    // Missing tags + unrelated patch → no tags key appears (distinguishable).
    const untouched = ok("---\ntitle: T\n---\nbody\n", { title: "T2" });
    expect(untouched).not.toContain("tags");
  });

  it("number/checkbox strictness", () => {
    expect(ok("body\n", { count: 3 }, { count: "number" })).toContain("count: 3");
    expect(errCode("body\n", { count: NaN }, { count: "number" })).toBe("INVALID_REQUEST");
    expect(errCode("body\n", { count: "3" }, { count: "number" })).toBe("INVALID_REQUEST");
    expect(ok("body\n", { flag: true }, { flag: "checkbox" })).toContain("flag: true");
    expect(errCode("body\n", { flag: "yes" }, { flag: "checkbox" })).toBe("INVALID_REQUEST");
  });

  it("dates are explicit-only (isExplicitDate, no NLP)", () => {
    expect(ok("body\n", { due: "2026-09-25" }, { due: "date" })).toContain("due: 2026-09-25");
    expect(ok("body\n", { start: "2026-09-25T14:00" }, { start: "datetime" })).toContain("start: 2026-09-25T14:00");
    expect(errCode("body\n", { due: "tomorrow" }, { due: "date" })).toBe("INVALID_REQUEST");
    expect(errCode("body\n", { due: "2026-13-40" }, { due: "date" })).toBe("INVALID_REQUEST");
    expect(errCode("body\n", { due: "next Friday" }, { due: "date" })).toBe("INVALID_REQUEST");
  });

  it("error messages name the property", () => {
    const res = updateFrontmatter("body\n", { due: "tomorrow" }, { due: "date" });
    if (!("error" in res)) throw new Error("unreachable");
    expect(res.error.message).toContain('"due"');
  });
});

describe("reads never coerce (lossless lens)", () => {
  it("interpretProperty degrades without touching disk", () => {
    expect(interpretProperty("tags", "single")).toEqual(["single"]);
    expect(interpretProperty("date", "tomorrow")).toBeUndefined();
    expect(interpretProperty("number", "3")).toBeUndefined();
    expect(interpretProperty("text", 3)).toBe("3");
  });
});

describe("byte preservation", () => {
  it("BOM survives a patch", () => {
    const out = ok("﻿---\ntitle: A\n---\nbody\n", { status: "active" });
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain("status: active");
    expect(out).toContain("title: A");
  });

  it("CRLF files stay CRLF", () => {
    const out = ok("---\r\ntitle: A\r\n---\r\nbody\r\n", { status: "active" });
    expect(out).toContain("\r\n");
    expect(out).not.toMatch(/[^\r]\n/);
    expect(out).toContain("body\r\n");
  });

  it("body fences and thematic breaks are untouched", () => {
    const input = "---\ntitle: A\n---\n# H\n---\ncode:\n```\n---\n```\n...\n";
    const out = ok(input, { status: "active" });
    expect(out.endsWith("# H\n---\ncode:\n```\n---\n```\n...\n")).toBe(true);
  });

  it("unrelated YAML keeps comments, quoting, and order", () => {
    const input = '---\ntitle: Old # keep me\ncount: 3\nquoted: "x"\n---\nbody\n';
    const out = ok(input, { status: "active" });
    expect(out).toContain("title: Old # keep me");
    expect(out).toContain("count: 3");
    expect(out).toContain('quoted: "x"');
    expect(out).toContain("status: active");
    // Patched field only: count appears exactly once, no duplication.
    expect(out.match(/count:/g)).toHaveLength(1);
  });

  it("empty patch returns the input identical", () => {
    const input = "---\ntitle: A # c\n---\nbody\n";
    expect(ok(input, {})).toBe(input);
  });

  it("undefined deletes; deleting every key drops the block", () => {
    const out = ok("---\ntitle: A\n---\nbody\n", { title: undefined });
    expect(out).toBe("body\n");
    const kept = ok("---\ntitle: A\nstatus: x\n---\nbody\n", { title: undefined });
    expect(kept).toContain("status: x");
    expect(kept).not.toContain("title");
    expect(kept.endsWith("body\n")).toBe(true);
  });

  it("no frontmatter + patch creates a block above the body", () => {
    const out = ok("# Hello\nbody\n", { status: "active" });
    expect(out).toBe("---\nstatus: active\n---\n# Hello\nbody\n");
  });

  it("null patch values are rejected (deletion is undefined)", () => {
    expect(errCode("---\ntitle: A\n---\nbody\n", { title: null })).toBe("INVALID_REQUEST");
  });
});

describe("refusals leave bytes alone", () => {
  it("malformed YAML fails closed", () => {
    const input = "---\ntitle: [unclosed\n\tbad: : :\n---\n# Survives\n";
    expect(errCode(input, { status: "x" })).toBe("INVALID_REQUEST");
  });

  it("unclosed opening fence fails closed (no stacked block)", () => {
    const input = "---\ntitle: [unclosed\n# Still Here\n";
    expect(errCode(input, { status: "x" })).toBe("INVALID_REQUEST");
  });

  it("non-map frontmatter root fails closed", () => {
    expect(errCode("---\n- a\n- b\n---\nbody\n", { status: "x" })).toBe("INVALID_REQUEST");
  });

  it("non-object patch and prototype keys fail closed", () => {
    expect(errCode("body\n", null as unknown as Record<string, unknown>)).toBe("INVALID_REQUEST");
    // NB: `{ __proto__: "x" }` literal sets the prototype (no own key) —
    // build a real own-property to exercise the guard.
    const protoPatch: Record<string, unknown> = {};
    Object.defineProperty(protoPatch, "__proto__", { value: "x", enumerable: true });
    expect(errCode("body\n", protoPatch)).toBe("INVALID_REQUEST");
  });
});

describe("registry", () => {
  it("V1 defaults: tags/aliases/cssclasses; unknown → text; explicit wins", () => {
    expect(resolvePropertyType({}, "tags")).toBe("tags");
    expect(resolvePropertyType({}, "aliases")).toBe("list-text");
    expect(resolvePropertyType({}, "cssclasses")).toBe("list-text");
    expect(resolvePropertyType({}, "whatever")).toBe("text");
    expect(resolvePropertyType({ tags: "text" }, "tags")).toBe("text");
    expect(resolvePropertyType(undefined, "tags")).toBe("tags");
  });

  it("stored registries degrade: corrupt entries drop, protos ignored", () => {
    expect(parsePropertyRegistry(null)).toEqual({});
    expect(parsePropertyRegistry([{ tags: "tags" }])).toEqual({});
    expect(parsePropertyRegistry({ tags: "tags", due: "someday", count: 3, __proto__: "text" })).toEqual({ tags: "tags" });
  });

  it("two workspaces resolve independently", () => {
    const a = { due: "date" } as const;
    const b = {};
    expect(resolvePropertyType(a, "due")).toBe("date");
    expect(resolvePropertyType(b, "due")).toBe("text");
  });
});
