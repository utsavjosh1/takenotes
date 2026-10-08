import { describe, expect, it } from "vitest";
import { parseSearchQuery, type SearchNode } from "@takenotes/core/search/query";

/** Search V2 query language (`docs/specs/search-grammar.md` + Step 5):
 * OR/parens/negation/regex/filters/props with positions on errors.
 * The parser is total: malformed input yields INVALID_REQUEST, never throws. */

function ok(raw: string): SearchNode {
  const r = parseSearchQuery(raw);
  if (!r.ok) throw new Error(`unexpected parse failure for ${JSON.stringify(raw)}: ${r.error.message}`);
  return r.query;
}

function err(raw: string): { operator: string; position: number } {
  const r = parseSearchQuery(raw);
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error("expected failure");
  expect(r.error.code).toBe("INVALID_REQUEST");
  return r.error;
}

describe("text + phrases", () => {
  it("plain terms AND-combine; phrases stay whole", () => {
    expect(ok("MCP server")).toEqual({
      kind: "and",
      children: [
        { kind: "text", value: "mcp" },
        { kind: "text", value: "server" },
      ],
    });
    expect(ok('"workspace identity"')).toEqual({ kind: "phrase", value: "workspace identity" });
    expect(ok('"unfinished')).toEqual({ kind: "phrase", value: "unfinished" });
  });

  it("lowercase and/or/not stay text; uppercase OR splits", () => {
    expect(ok("fish and chips or else")).toEqual({
      kind: "and",
      children: [
        { kind: "text", value: "fish" },
        { kind: "text", value: "and" },
        { kind: "text", value: "chips" },
        { kind: "text", value: "or" },
        { kind: "text", value: "else" },
      ],
    });
    expect(ok("a OR b")).toEqual({
      kind: "or",
      children: [
        { kind: "text", value: "a" },
        { kind: "text", value: "b" },
      ],
    });
    expect(ok("a OR b c")).toEqual({
      kind: "or",
      children: [{ kind: "text", value: "a" }, { kind: "and", children: [{ kind: "text", value: "b" }, { kind: "text", value: "c" }] }],
    });
  });

  it("explicit AND equals whitespace", () => {
    expect(ok("a AND b")).toEqual(ok("a b"));
    expect(ok("AND a")).toEqual({ kind: "and", children: [{ kind: "text", value: "and" }, { kind: "text", value: "a" }] });
  });
});

describe("negation + groups", () => {
  it("- prefixes negate; lone - stays text", () => {
    expect(ok("-mcp")).toEqual({ kind: "not", child: { kind: "text", value: "mcp" } });
    expect(ok("-a b")).toEqual({
      kind: "and",
      children: [{ kind: "not", child: { kind: "text", value: "a" } }, { kind: "text", value: "b" }],
    });
    expect(ok("--a")).toEqual({ kind: "not", child: { kind: "not", child: { kind: "text", value: "a" } } });
    expect(ok("-")).toEqual({ kind: "text", value: "-" });
    expect(ok("- a")).toEqual({
      kind: "and",
      children: [
        { kind: "text", value: "-" },
        { kind: "text", value: "a" },
      ],
    });
  });

  it("parens group; mid-token parens stay literal", () => {
    expect(ok("(a OR b)")).toEqual({
      kind: "or",
      children: [
        { kind: "text", value: "a" },
        { kind: "text", value: "b" },
      ],
    });
    expect(ok("-(a OR b)")).toEqual({
      kind: "not",
      child: { kind: "or", children: [{ kind: "text", value: "a" }, { kind: "text", value: "b" }] },
    });
    expect(ok("@due(2026-09-25)")).toEqual({ kind: "text", value: "@due(2026-09-25)" });
  });

  it("unclosed ( and stray ) are INVALID_REQUEST with positions", () => {
    expect(err("(a OR b")).toMatchObject({ operator: "(", position: 0 });
    expect(err("a)")).toMatchObject({ operator: ")", position: 1 });
  });
});

describe("regex", () => {
  it("compiles case-insensitive patterns", () => {
    const q = ok("/wire\\s+helper/");
    expect(q).toMatchObject({ kind: "regex", pattern: "wire\\s+helper" });
    if (q.kind === "regex") expect(q.regex.test("WIRE   HELPER")).toBe(true);
  });

  it("rejects empty, long, unsafe, and uncompilable patterns", () => {
    expect(err("//")).toMatchObject({ position: 0 });
    expect(err(`/${"a".repeat(201)}/`)).toMatchObject({ position: 0 });
    expect(err("/(a+)+$/")).toMatchObject({ position: 0 });
    expect(err("/(a*)*/")).toMatchObject({ position: 0 });
    expect(err("/([a/")).toMatchObject({ position: 0 });
    expect(err("/unterminated")).toMatchObject({ position: 0 });
  });
});

describe("filters", () => {
  it("all V2 filters parse (names case-insensitive, values quoted)", () => {
    expect(ok("FILE:mcp")).toEqual({ kind: "file", value: "mcp" });
    expect(ok('file:"MCP Architecture"')).toEqual({ kind: "file", value: "mcp architecture" });
    expect(ok("PATH:docs")).toEqual({ kind: "path", value: "docs" });
    expect(ok("TAG:Backend")).toEqual({ kind: "tag", value: "backend" });
    expect(ok("type:project")).toEqual({ kind: "type", value: "project" });
    expect(ok("is:TASK")).toEqual({ kind: "isTask" });
    expect(ok("content:websocket")).toEqual({ kind: "content", value: "websocket" });
    expect(ok('content:"exact phrase"')).toEqual({ kind: "content", value: "exact phrase" });
    expect(ok("section:guide")).toEqual({ kind: "section", value: "guide" });
    expect(ok("task:wire")).toEqual({ kind: "task", value: "wire" });
    expect(ok("task-todo:wire")).toEqual({ kind: "taskTodo", value: "wire" });
    expect(ok("task-todo:")).toEqual({ kind: "taskTodo" });
    expect(ok("task-done:review")).toEqual({ kind: "taskDone", value: "review" });
    expect(ok("task-done:")).toEqual({ kind: "taskDone" });
    expect(ok("line:7")).toEqual({ kind: "line", n: 7 });
    expect(ok("block:blk")).toEqual({ kind: "block", value: "blk" });
    expect(ok("match-case:MCP")).toEqual({ kind: "matchCase", value: "MCP" });
    expect(ok("ignore-case:mcp")).toEqual({ kind: "ignoreCase", value: "mcp" });
  });

  it("unknown operators and bad values name operator + position", () => {
    expect(err("link:note")).toMatchObject({ operator: "link:note", position: 0 });
    expect(err("due:2026-09-25")).toMatchObject({ operator: "due:2026-09-25", position: 0 });
    expect(err("foo:bar")).toMatchObject({ operator: "foo:bar", position: 0 });
    expect(err("a foo:bar")).toMatchObject({ operator: "foo:bar", position: 2 });
    expect(err("is:done")).toMatchObject({ operator: "is:done", position: 0 });
    expect(err("line:abc")).toMatchObject({ operator: "line:abc", position: 0 });
    expect(err("line:0")).toMatchObject({ operator: "line:0", position: 0 });
  });

  it("non-operator colons stay plain text", () => {
    expect(ok("https://example.com/a:b")).toEqual({ kind: "text", value: "https://example.com/a:b" });
    expect(ok("12:30")).toEqual({ kind: "text", value: "12:30" });
    expect(ok("dotted.names:x")).toEqual({ kind: "text", value: "dotted.names:x" });
  });

  it("empty filter values are no-ops, not errors", () => {
    expect(ok("file:")).toEqual({ kind: "true" });
    expect(ok("tag:")).toEqual({ kind: "true" });
  });
});

describe("props", () => {
  it("[p:v], [p:], [p:null], comparators, quoted values", () => {
    expect(ok("[status:done]")).toEqual({ kind: "prop", name: "status", value: "done" });
    expect(ok("[status:]")).toEqual({ kind: "propExists", name: "status" });
    expect(ok("[status:null]")).toEqual({ kind: "propMissing", name: "status" });
    expect(ok("[n:<5]")).toEqual({ kind: "propCompare", name: "n", op: "<", value: "5" });
    expect(ok("[n:>=10]")).toEqual({ kind: "propCompare", name: "n", op: ">=", value: "10" });
    expect(ok("[title:\"My Note\"]")).toEqual({ kind: "prop", name: "title", value: "My Note" });
    expect(ok("-[status:done]")).toEqual({ kind: "not", child: { kind: "prop", name: "status", value: "done" } });
  });

  it("malformed props are INVALID_REQUEST with positions", () => {
    expect(err("[status:done")).toMatchObject({ position: 0 });
    expect(err("[status]")).toMatchObject({ position: 0 });
    expect(err("[:v]")).toMatchObject({ position: 0 });
    expect(err("[n:<]")).toMatchObject({ position: 0 });
  });
});

describe("totality", () => {
  it("malformed input never throws", () => {
    for (const raw of ['"', "file:", "tag:", '"unfinished phrase', 'path:"unterminated', "   ", "is:", "(", ")", "[", "[]", "/", "//"]) {
      expect(() => parseSearchQuery(raw)).not.toThrow();
    }
    expect(ok("   ")).toEqual({ kind: "and", children: [] });
  });
});
