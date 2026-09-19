import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "../../src/shared/search/query";

/** P1-08 query language: plain terms, "phrases", file:/path:/tag:/type:,
 * is:task — AND-combined. Deferred operators error as INVALID_REQUEST
 * naming the operator; anything else is text. The parser is total. */
describe("query parser", () => {
  it("plain terms and phrases", () => {
    const r = parseSearchQuery("MCP server");
    expect(r).toEqual({ ok: true, query: expect.objectContaining({ textTerms: ["mcp", "server"], phrases: [] }) });
    const p = parseSearchQuery('"workspace identity"');
    expect(p).toEqual({ ok: true, query: expect.objectContaining({ textTerms: [], phrases: ["workspace identity"] }) });
  });

  it("v1 operators with quoted values and case-insensitive names", () => {
    const r = parseSearchQuery('FILE:mcp PATH:docs TAG:Backend type:project is:TASK');
    expect(r).toEqual({
      ok: true,
      query: expect.objectContaining({
        fileFilters: ["mcp"],
        pathFilters: ["docs"],
        tags: ["backend"],
        types: ["project"],
        taskOnly: true,
      }),
    });
    const q = parseSearchQuery('file:"MCP Architecture"');
    expect(q).toEqual({ ok: true, query: expect.objectContaining({ fileFilters: ["mcp architecture"] }) });
  });

  it("AND-combines mixed terms and filters", () => {
    const r = parseSearchQuery('tag:backend websocket path:projects "exact phrase"');
    expect(r).toEqual({
      ok: true,
      query: expect.objectContaining({
        textTerms: ["websocket"],
        phrases: ["exact phrase"],
        pathFilters: ["projects"],
        tags: ["backend"],
      }),
    });
  });

  it("deferred operators are INVALID_REQUEST naming the operator", () => {
    for (const raw of ["link:note", "due:2026-09-25", "scheduled:tomorrow", "is:done", "backlinks:x", "saved:y"]) {
      const r = parseSearchQuery(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe("INVALID_REQUEST");
        expect(r.error.message).toContain(r.error.operator);
      }
    }
  });

  it("non-operator colons and bare AND/OR/NOT stay plain text", () => {
    const u = parseSearchQuery("https://example.com/a:b fish and chips OR else");
    expect(u).toEqual({
      ok: true,
      query: expect.objectContaining({ textTerms: ["https://example.com/a:b", "fish", "and", "chips", "or", "else"] }),
    });
    const f = parseSearchQuery("foo:bar");
    expect(f).toEqual({ ok: true, query: expect.objectContaining({ textTerms: ["foo:bar"] }) });
  });

  it("malformed input never crashes; empty values are ignored", () => {
    for (const raw of ['"', "file:", "tag:", '"unfinished phrase', 'path:"unterminated', "   ", "is:"]) {
      expect(() => parseSearchQuery(raw)).not.toThrow();
    }
    expect(parseSearchQuery("file:")).toEqual({ ok: true, query: expect.objectContaining({ fileFilters: [] }) });
    expect(parseSearchQuery('"unfinished')).toEqual({ ok: true, query: expect.objectContaining({ phrases: ["unfinished"] }) });
    expect(parseSearchQuery("   ")).toEqual({
      ok: true,
      query: expect.objectContaining({ textTerms: [], phrases: [], tags: [] }),
    });
  });
});
