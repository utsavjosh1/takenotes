import { describe, expect, it } from "vitest";
import { parseDocument } from "../../src/shared/index/document";

function parse(body: string, rel = "note.md") {
  return parseDocument("ws1", rel, body, { hash: "h", size: body.length, mtimeMs: 1 });
}

/** P1-07 acceptance 1: parser vectors. One parse feeds search/links/tasks/
 * calendar later — no second parser per consumer (ADR-0008). */
describe("frontmatter", () => {
  it("no frontmatter → empty map, body fully parsed", () => {
    const e = parse("# Hello\n#tag\n");
    expect(e.frontmatter).toEqual({});
    expect(e.title).toBeUndefined();
    expect(e.headings.map((h) => h.text)).toEqual(["Hello"]);
    expect(e.tags).toEqual(["tag"]);
    expect(e.searchableText).toContain("Hello");
  });

  it("valid YAML: title/type/status/tags list/date fields", () => {
    const e = parse(
      "---\ntitle: MCP Server\naliases: [MCP, Server]\ntags: [backend, project/takenotes]\ntype: note\nstatus: active\ndue: 2026-09-25\ncreated: 2026-09-01\n---\n# Body\n",
    );
    expect(e.frontmatter).toMatchObject({ title: "MCP Server", type: "note", status: "active" });
    expect(e.title).toBe("MCP Server");
    expect(e.aliases).toEqual(["MCP", "Server"]);
    expect(e.tags).toEqual(["backend", "project/takenotes"]);
    expect(e.docType).toBe("note");
    expect(e.status).toBe("active");
    expect(e.dates).toMatchObject({ due: "2026-09-25", created: "2026-09-01" });
    expect(e.headings.map((h) => h.text)).toEqual(["Body"]);
  });

  it("tags/aliases accept a scalar string as well as a list", () => {
    const e = parse("---\naliases: Solo\ntags: single\n---\n");
    expect(e.aliases).toEqual(["Solo"]);
    expect(e.tags).toEqual(["single"]);
  });

  it("malformed frontmatter (no closing fence) → {} and whole file stays searchable", () => {
    const e = parse("---\ntitle: [unclosed\n# Still Here\n");
    expect(e.frontmatter).toEqual({});
    expect(e.title).toBeUndefined();
    expect(e.headings.map((h) => h.text)).toEqual(["Still Here"]);
    expect(e.searchableText).toContain("Still Here");
  });

  it("bad YAML → {} but the file is still indexed", () => {
    const e = parse("---\ntitle: [unclosed\n\tbad: : :\n---\n# Survives\n#kept\n");
    expect(e.frontmatter).toEqual({});
    expect(e.headings.map((h) => h.text)).toEqual(["Survives"]);
    expect(e.tags).toEqual(["kept"]);
  });

  it("CRLF + BOM: frontmatter and headings parse", () => {
    const e = parse("﻿---\r\ntitle: Win\r\ntags: [crlf]\r\n---\r\n# Head\r\n");
    expect(e.title).toBe("Win");
    expect(e.tags).toEqual(["crlf"]);
    expect(e.headings).toMatchObject([{ text: "Head", level: 1, line: 5 }]);
  });

  it("non-string scalars stay in the raw map; unknown keys preserved", () => {
    const e = parse("---\ncount: 3\nflag: true\ncustom: whatever\n---\n");
    expect(e.frontmatter).toMatchObject({ count: 3, flag: true, custom: "whatever" });
    expect(e.title).toBeUndefined();
  });
});

describe("headings", () => {
  it("multiple levels with file-absolute positions and anchors", () => {
    const e = parse("---\ntitle: T\n---\n# Project\n## Architecture\n### MCP\n");
    expect(e.headings).toMatchObject([
      { text: "Project", level: 1, line: 4, anchor: "project" },
      { text: "Architecture", level: 2, line: 5, anchor: "architecture" },
      { text: "MCP", level: 3, line: 6, anchor: "mcp" },
    ]);
  });

  it("duplicate names get distinct anchors; closed ATX stripped", () => {
    const e = parse("# Repeat #\n## Repeat\n");
    expect(e.headings.map((h) => h.anchor)).toEqual(["repeat", "repeat-1"]);
    expect(e.headings[0]!.text).toBe("Repeat");
  });

  it("headings inside fenced code are not headings", () => {
    const e = parse("```\n# Not a heading\n```\n# Real\n");
    expect(e.headings.map((h) => h.text)).toEqual(["Real"]);
  });
});

describe("tags", () => {
  it("inline, nested, frontmatter merge; identical tags counted once", () => {
    const e = parse("---\ntags: [Backend]\n---\n#backend #project/takenotes #backend\n");
    expect(e.tags).toEqual(["backend", "project/takenotes"]);
  });

  it("tags in code fences and inside [[links]] are not tags", () => {
    const e = parse("```\n#notetag\n```\nSee [[#notalink]] and #real.\n");
    expect(e.tags).toEqual(["real"]);
  });
});

describe("links", () => {
  it("v1 forms with target/alias/heading/embed/position, unresolved", () => {
    const e = parse("[[MCP]]\n[[MCP|MCP Server]]\n[[MCP#Server]]\n[[MCP#Server|Server Design]]\n![[Architecture]]\n![[image.png]]\n");
    expect(e.links).toMatchObject([
      { target: "MCP", embed: false, line: 1, resolved: false },
      { target: "MCP", alias: "MCP Server", embed: false, line: 2 },
      { target: "MCP", heading: "Server", embed: false, line: 3 },
      { target: "MCP", heading: "Server", alias: "Server Design", embed: false, line: 4 },
      { target: "Architecture", embed: true, line: 5 },
      { target: "image.png", embed: true, line: 6 },
    ]);
  });

  it("block anchors stay syntactic; resolution belongs to a later layer", () => {
    const e = parse("[[Note#^blk1]]\n");
    expect(e.links[0]).toMatchObject({ target: "Note", blockAnchor: "blk1", resolved: false });
    expect(e.links[0]!.heading).toBeUndefined();
  });
});

describe("tasks", () => {
  it("checkboxes with tokens, tags, anchors, positions", () => {
    const e = parse(
      "- [ ] Fix search #backend @due(2026-09-25)\n- [x] Finish WSL @scheduled(2026-09-25T14:00) @priority(high)\n- [X] Done ^done-1\n- plain item\n",
    );
    expect(e.tasks).toHaveLength(3);
    expect(e.tasks[0]).toMatchObject({
      // #tags are human-visible words: kept in the description AND indexed.
      description: "Fix search #backend",
      completed: false,
      line: 1,
      tags: ["backend"],
      due: "2026-09-25",
    });
    expect(e.tasks[1]).toMatchObject({
      // @tokens are machine syntax: parsed into fields, stripped from text.
      description: "Finish WSL",
      completed: true,
      line: 2,
      scheduled: "2026-09-25T14:00",
      priority: "high",
    });
    expect(e.tasks[2]).toMatchObject({ description: "Done", completed: true, line: 3, anchor: "done-1" });
  });

  it("no IDs assigned while indexing; tasks in code fences ignored", () => {
    const e = parse("- [ ] Real\n```\n- [ ] Fenced\n```\n");
    expect(e.tasks).toHaveLength(1);
    expect(e.tasks[0]).not.toHaveProperty("id");
  });
});

describe("dates are explicit only", () => {
  it("tomorrow / next Friday never become indexed dates", () => {
    const e = parse("---\ndue: tomorrow\n---\nShip it tomorrow, or next Friday. @due(next Friday)\n- [ ] Later today\n");
    expect(e.dates).toEqual({});
    expect(e.tasks[0]!.due).toBeUndefined();
    expect(e.searchableText).toContain("tomorrow");
  });

  it("invalid calendar dates are ignored, not indexed", () => {
    const e = parse("---\ndue: 2026-13-40\n---\n");
    expect(e.dates).toEqual({});
  });
});
