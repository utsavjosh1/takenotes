import { describe, expect, it } from "vitest";
import { WorkspaceIndex } from "../../src/shared/index/store";
import { parseSearchQuery } from "../../src/shared/search/query";
import { searchContent, searchFilenames } from "../../src/shared/search/search";
import { buildWorkspaceIndex, type IndexApi } from "../../src/renderer/index/workspace-index";
import type { FileReadResult } from "../../src/shared/contracts/ipc";

const REV = (h: string) => ({ hash: h, size: 50, mtimeMs: 1 });

/** Fixture index (parsed through the real P1-07 parser — search never
 * reparses; it only reads entry fields). File layout:
 *   MCP.md                   fm lines 1-4, `# MCP` L5, body L6, task L7
 *   docs/Guide.md            no fm: `# Guide` L1, body L2
 *   projects/backend/notes.md fm 1-4, `# Notes` L5, body L6-7
 *   daily/2026-09-19.md      type daily
 *   event.md                 type event
 *   plain.md                 no tasks, no tags, no type
 */
function fixture(): WorkspaceIndex {
  const idx = new WorkspaceIndex();
  idx.upsert("ws", "MCP.md",
    "---\ntitle: MCP Server\ntags: [backend]\n---\n# MCP\nServer design [[MCP#Server|label]].\n- [ ] Wire helper @due(2026-09-25)\n",
    REV("h1"));
  idx.upsert("ws", "docs/Guide.md", "# Guide\nworkspace identity and connections.\n", REV("h2"));
  idx.upsert("ws", "projects/backend/notes.md",
    "---\ntags: [project/takenotes]\ntype: note\n---\n# Notes\nwebsocket work #live\n- [x] Done\n",
    REV("h3"));
  idx.upsert("ws", "daily/2026-09-19.md", "---\ntype: daily\ndate: 2026-09-19\n---\n# Today\n", REV("h4"));
  idx.upsert("ws", "event.md", "---\ntype: event\n---\n# Launch\n", REV("h5"));
  idx.upsert("ws", "plain.md", "# Plain\nnothing special\n", REV("h6"));
  return idx;
}

function q(raw: string) {
  const r = parseSearchQuery(raw);
  if (!r.ok) throw new Error(`unexpected parse failure: ${raw}`);
  return r.query;
}

function contentPaths(idx: WorkspaceIndex, raw: string): string[] {
  return searchContent(idx, "ws", q(raw)).map((m) => m.relativePath);
}

describe("plain text + phrase", () => {
  it("case-insensitive substring; multiword AND; no result", () => {
    expect(contentPaths(fixture(), "mcp")).toContain("MCP.md");
    expect(contentPaths(fixture(), "MCP SERVER")).toContain("MCP.md");
    expect(contentPaths(fixture(), "mcp websocket")).not.toContain("MCP.md");
    expect(contentPaths(fixture(), "websocket")).toEqual(["projects/backend/notes.md"]);
    expect(contentPaths(fixture(), "nope-nothing")).toEqual([]);
  });

  it("exact phrase is one term, not independent tokens", () => {
    expect(contentPaths(fixture(), '"server design"')).toEqual(["MCP.md"]);
    expect(contentPaths(fixture(), '"design server"')).toEqual([]);
    expect(contentPaths(fixture(), '"workspace identity"')).toEqual(["docs/Guide.md"]);
  });

  it("snippets carry honest file lines without reopening files", () => {
    const hits = searchContent(fixture(), "ws", q('"workspace identity"'));
    expect(hits[0]).toMatchObject({ relativePath: "docs/Guide.md", line: 2, column: 1 });
    expect(hits[0]!.preview).toContain("workspace identity");
    const phrase = searchContent(fixture(), "ws", q('"server design"'));
    // MCP.md: fm lines 1-4, `# MCP` L5, phrase on file line 6.
    expect(phrase[0]).toMatchObject({ relativePath: "MCP.md", line: 6, column: 1 });
  });
});

describe("file: + path:", () => {
  it("filename match, nonmatch, quoted multiword, combined with text", () => {
    const names = (raw: string) => searchFilenames(fixture(), "ws", q(raw)).map((m) => m.relativePath);
    expect(names("file:mcp")).toEqual(["MCP.md"]);
    expect(names("file:nope")).toEqual([]);
    expect(names("file:notes websocket")).toEqual(["projects/backend/notes.md"]);
    // A satisfied `file:` earns display; the strict AND still empties Contents.
    expect(names("file:mcp websocket")).toEqual(["MCP.md"]);
    expect(contentPaths(fixture(), "file:mcp websocket")).toEqual([]);
  });

  it("folder and nested filters; path alone selects nothing", () => {
    const idx = fixture();
    expect(contentPaths(idx, "path:docs workspace")).toEqual(["docs/Guide.md"]);
    expect(contentPaths(idx, "path:projects/backend websocket")).toEqual(["projects/backend/notes.md"]);
    expect(contentPaths(idx, "path:docs")).toEqual([]);
    expect(searchFilenames(idx, "ws", q("path:docs"))).toEqual([]);
  });
});

describe("tag: + type:", () => {
  it("inline, frontmatter, and nested tags (P1-07 normalized)", () => {
    expect(contentPaths(fixture(), "tag:backend")).toEqual(["MCP.md"]);
    expect(contentPaths(fixture(), "tag:Backend")).toEqual(["MCP.md"]);
    expect(contentPaths(fixture(), "tag:project/takenotes")).toEqual(["projects/backend/notes.md"]);
    expect(contentPaths(fixture(), "tag:live")).toEqual(["projects/backend/notes.md"]);
    expect(contentPaths(fixture(), "tag:missing")).toEqual([]);
  });

  it("docType matching; missing type excluded", () => {
    expect(contentPaths(fixture(), "type:daily")).toEqual(["daily/2026-09-19.md"]);
    expect(contentPaths(fixture(), "type:event")).toEqual(["event.md"]);
    expect(contentPaths(fixture(), "type:project")).toEqual([]);
  });
});

describe("is:task", () => {
  it("document-level: task docs match, plain notes excluded", () => {
    const paths = contentPaths(fixture(), "is:task");
    expect(paths.sort()).toEqual(["MCP.md", "projects/backend/notes.md"]);
    expect(contentPaths(fixture(), "is:task tag:backend")).toEqual(["MCP.md"]);
    // Text matches at document level (title/body/tasks all count).
    expect(contentPaths(fixture(), "is:task mcp")).toEqual(["MCP.md"]);
    expect(contentPaths(fixture(), "is:task nothing-special-here")).toEqual([]);
  });

  it("task-line snippets use exact file positions", () => {
    const hits = searchContent(fixture(), "ws", q("is:task wire"));
    expect(hits).toHaveLength(1);
    // Earliest-in-file body line wins: the raw task line, exact column.
    expect(hits[0]).toMatchObject({
      relativePath: "MCP.md",
      line: 7,
      column: 7,
      preview: "- [ ] Wire helper @due(2026-09-25)",
    });
  });
});

describe("composition + ranking", () => {
  it("all terms/filters AND together, deterministically ordered", () => {
    expect(contentPaths(fixture(), "tag:backend websocket")).toEqual([]);
    expect(contentPaths(fixture(), 'type:daily "today"')).toEqual(["daily/2026-09-19.md"]);
  });

  it("exact filename/title ranks before general text", () => {
    const idx = new WorkspaceIndex();
    idx.upsert("ws", "mcp.md", "# Other\nunrelated body\n", REV("a"));
    idx.upsert("ws", "other.md", "# Else\nmentions mcp here\n", REV("b"));
    const files = searchFilenames(idx, "ws", q("mcp")).map((m) => m.relativePath);
    expect(files[0]).toBe("mcp.md");
  });
});

describe("lifecycle + isolation (no rescan on query)", () => {
  it("write/move/delete flow into results from live index state", () => {
    const idx = new WorkspaceIndex();
    idx.upsert("ws", "a.md", "# Alpha\n", REV("h1"));
    expect(contentPaths(idx, "alpha")).toEqual(["a.md"]);
    // Edit so the query no longer matches → disappears.
    idx.upsert("ws", "a.md", "# Beta\n", REV("h2"));
    expect(contentPaths(idx, "alpha")).toEqual([]);
    expect(contentPaths(idx, "beta")).toEqual(["a.md"]);
    // Rename → displayed path updates; delete → disappears.
    idx.move("ws", "a.md", "renamed.md");
    expect(searchContent(idx, "ws", q("beta"))[0]?.relativePath).toBe("renamed.md");
    idx.remove("ws", "renamed.md");
    expect(contentPaths(idx, "beta")).toEqual([]);
  });

  it("queries never leave their workspace", () => {
    const idx = new WorkspaceIndex();
    idx.upsert("A", "same.md", "# Shared words\n", REV("h1"));
    idx.upsert("B", "same.md", "# Shared words\n", REV("h1"));
    expect(searchContent(idx, "A", q("shared")).map((m) => m.relativePath)).toEqual(["same.md"]);
    expect(searchFilenames(idx, "B", q("file:same")).map((m) => m.relativePath)).toEqual(["same.md"]);
    expect(searchContent(idx, "C", q("shared"))).toEqual([]);
  });

  it("queries perform zero filesystem reads/lists", async () => {
    let lists = 0;
    let reads = 0;
    const api: IndexApi = {
      directory: {
        list: async (_w, dir) => {
          lists += 1;
          return { ok: true, result: dir === "" ? [{ name: "a.md", relativePath: "a.md", kind: "file", fileClass: "markdown", size: 10, mtimeMs: 1 }] : [] };
        },
      },
      file: {
        read: async () => {
          reads += 1;
          return { ok: true, result: { content: "# Query target\n", revision: REV("h"), newlineStyle: "lf", hadBom: false } as FileReadResult };
        },
      },
    };
    const idx = new WorkspaceIndex();
    const WS = { workspaceId: "ws", displayName: "N", type: "windows-local", connection: "connected" } as const;
    await buildWorkspaceIndex(api, idx, { ...WS });
    const before = [lists, reads];
    const parsed = q("query");
    for (let i = 0; i < 20; i++) {
      searchContent(idx, "ws", parsed);
      searchFilenames(idx, "ws", parsed);
    }
    expect([lists, reads]).toEqual(before);
  });
});

describe("wsl parity + scale", () => {
  it("same entries in two workspaces → identical result shapes", () => {
    const idx = new WorkspaceIndex();
    const md = "---\ntitle: Same\ntags: [x]\n---\n# H\nbody words\n- [ ] T @due(2026-09-25)\n";
    idx.upsert("ws-native", "n.md", md, REV("h"));
    idx.upsert("ws-wsl", "n.md", md, REV("h"));
    // SearchMatch carries no host or workspace identity — shapes are equal.
    expect(searchContent(idx, "ws-wsl", q("body"))).toEqual(searchContent(idx, "ws-native", q("body")));
    expect(searchFilenames(idx, "ws-wsl", q("file:n"))).toEqual(searchFilenames(idx, "ws-native", q("file:n")));
  });

  it("2500 indexed entries answer interactively", () => {
    const idx = new WorkspaceIndex();
    for (let i = 0; i < 2500; i++) {
      idx.upsert("ws", `n${i}.md`, `---\ntags: [t${i % 50}]\n---\n# Note ${i}\nbody filler ${i % 7}\n- [ ] Task @due(2026-09-25)\n`, REV(`h${i}`));
    }
    const parsed = q("tag:t7 filler");
    const t0 = performance.now();
    const hits = searchContent(idx, "ws", parsed);
    const dt = performance.now() - t0;
    expect(hits.length).toBeGreaterThan(0);
    expect(dt).toBeLessThan(2000);
  });
});
