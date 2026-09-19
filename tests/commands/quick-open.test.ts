import { describe, expect, it } from "vitest";
import { searchQuickOpen, type QuickOpenItem } from "../../src/shared/commands/palette";

const files: QuickOpenItem[] = [
  { workspaceId: "A", relativePath: "MCP Architecture.md", title: "MCP Architecture" },
  { workspaceId: "A", relativePath: "docs/mcp-server.md", title: "MCP Server" },
  { workspaceId: "A", relativePath: "projects/alpha-notes.md", title: "Alpha Notes" },
  { workspaceId: "B", relativePath: "MCP Architecture.md", title: "Other Workspace MCP" },
];

function forWorkspace(workspaceId: string): QuickOpenItem[] {
  return files.filter((f) => f.workspaceId === workspaceId);
}

describe("quick open", () => {
  it("ranks exact filename/title before prefix and contains matches", () => {
    expect(searchQuickOpen(forWorkspace("A"), "MCP Architecture").map((r) => r.relativePath)[0]).toBe("MCP Architecture.md");
    expect(searchQuickOpen(forWorkspace("A"), "mcp").map((r) => r.relativePath)).toEqual([
      "MCP Architecture.md",
      "docs/mcp-server.md",
    ]);
  });

  it("matches filename contains, title, and path", () => {
    expect(searchQuickOpen(forWorkspace("A"), "server").map((r) => r.relativePath)).toEqual(["docs/mcp-server.md"]);
    expect(searchQuickOpen(forWorkspace("A"), "alpha notes").map((r) => r.relativePath)).toEqual(["projects/alpha-notes.md"]);
    expect(searchQuickOpen(forWorkspace("A"), "docs/mcp").map((r) => r.relativePath)).toEqual(["docs/mcp-server.md"]);
  });

  it("is scoped to the active workspace by caller-provided entries", () => {
    expect(searchQuickOpen(forWorkspace("B"), "mcp").map((r) => `${r.workspaceId}:${r.relativePath}`)).toEqual([
      "B:MCP Architecture.md",
    ]);
  });

  it("empty query shows only existing recents", () => {
    expect(searchQuickOpen(forWorkspace("A"), "", ["missing.md", "docs/mcp-server.md"]).map((r) => r.relativePath)).toEqual(["docs/mcp-server.md"]);
  });

  it("runs many queries over provided in-memory items only", () => {
    let reads = 0;
    const inMemory = Array.from({ length: 3000 }, (_, i) => ({
      workspaceId: "A",
      relativePath: `folder/note-${i}.md`,
      title: `Note ${i}`,
    }));
    for (let i = 0; i < 100; i++) {
      const result = searchQuickOpen(inMemory, `note-${i}`);
      reads += 0;
      expect(result.length).toBeGreaterThan(0);
    }
    expect(reads).toBe(0);
  });
});
