import { describe, expect, it } from "vitest";
import { WorkspaceIndex } from "../../src/shared/index/store";

const REV = (hash: string) => ({ hash, size: 10, mtimeMs: 1 });

/** P1-07 store seam: lifecycle, isolation, revision guard. Pure logic —
 * runs anywhere, no filesystem, no React. */
describe("workspace index lifecycle", () => {
  it("upsert parses; get/list return entries; same hash skips re-parse", () => {
    const idx = new WorkspaceIndex();
    const a = idx.upsert("ws", "a.md", "# Hi #tag\n", REV("h1"));
    expect(a?.headings.map((h) => h.text)).toEqual(["Hi #tag"]);
    expect(idx.get("ws", "a.md")?.tags).toEqual(["tag"]);
    expect(idx.list("ws").map((e) => e.relativePath)).toEqual(["a.md"]);
    // Same revision → same object back, no re-parse (stale results can
    // never overwrite a newer entry; sync parsing keeps this trivial).
    expect(idx.upsert("ws", "a.md", "# Hi #tag\n", REV("h1"))).toBe(a);
  });

  it("write with a new revision replaces the entry", () => {
    const idx = new WorkspaceIndex();
    idx.upsert("ws", "a.md", "# Old\n", REV("h1"));
    const b = idx.upsert("ws", "a.md", "# New #tag\n", REV("h2"));
    expect(b?.headings.map((h) => h.text)).toEqual(["New #tag"]);
    expect(idx.get("ws", "a.md")?.tags).toEqual(["tag"]);
  });

  it("rename moves the entry without re-parsing; old key drops", () => {
    const idx = new WorkspaceIndex();
    idx.upsert("ws", "old.md", "# T #tag\n- [ ] Task @due(2026-09-25)\n", REV("h1"));
    expect(idx.move("ws", "old.md", "new.md")).toBe(true);
    expect(idx.get("ws", "old.md")).toBeUndefined();
    const moved = idx.get("ws", "new.md");
    expect(moved?.relativePath).toBe("new.md");
    expect(moved?.tags).toEqual(["tag"]);
    expect(moved?.tasks[0]).toMatchObject({ description: "Task", due: "2026-09-25" });
    expect(moved?.revision.hash).toBe("h1");
    expect(idx.move("ws", "missing.md", "x.md")).toBe(false);
  });

  it("folder rename re-keys the prefix; folder delete drops the prefix", () => {
    const idx = new WorkspaceIndex();
    idx.upsert("ws", "dir/a.md", "# A\n", REV("h1"));
    idx.upsert("ws", "dir/sub/b.md", "# B\n", REV("h2"));
    idx.upsert("ws", "other.md", "# O\n", REV("h3"));
    expect(idx.movePrefix("ws", "dir", "renamed")).toBe(2);
    expect(idx.get("ws", "renamed/a.md")?.headings[0]?.text).toBe("A");
    expect(idx.get("ws", "renamed/sub/b.md")?.headings[0]?.text).toBe("B");
    expect(idx.get("ws", "other.md")).toBeDefined();
    expect(idx.removePrefix("ws", "renamed")).toBe(2);
    expect(idx.list("ws").map((e) => e.relativePath)).toEqual(["other.md"]);
  });

  it("delete drops the entry; unknown removes are no-ops", () => {
    const idx = new WorkspaceIndex();
    idx.upsert("ws", "a.md", "# A\n", REV("h1"));
    expect(idx.remove("ws", "a.md")).toBe(true);
    expect(idx.get("ws", "a.md")).toBeUndefined();
    expect(idx.remove("ws", "a.md")).toBe(false);
  });

  it("drop + rebuild is lossless", () => {
    const idx = new WorkspaceIndex();
    idx.upsert("ws", "a.md", "# A\n", REV("h1"));
    idx.upsert("ws", "b.md", "# B\n", REV("h2"));
    idx.clear("ws");
    expect(idx.list("ws")).toEqual([]);
    idx.rebuild("ws", [
      { workspaceId: "ws", relativePath: "a.md", content: "# A\n", revision: REV("h1") },
      { workspaceId: "ws", relativePath: "b.md", content: "# B\n", revision: REV("h2") },
    ]);
    expect(idx.list("ws").map((e) => e.relativePath).sort()).toEqual(["a.md", "b.md"]);
  });

  it("workspace isolation: same relativePath in two workspaces are distinct", () => {
    const idx = new WorkspaceIndex();
    idx.upsert("A", "README.md", "# Alpha\n", REV("h1"));
    idx.upsert("B", "README.md", "# Beta\n", REV("h1"));
    expect(idx.get("A", "README.md")?.headings[0]?.text).toBe("Alpha");
    expect(idx.get("B", "README.md")?.headings[0]?.text).toBe("Beta");
    idx.remove("A", "README.md");
    expect(idx.get("B", "README.md")).toBeDefined();
    idx.clear("B");
    expect(idx.list("A")).toEqual([]);
  });

  it("oversized content is skipped, never parsed", () => {
    const idx = new WorkspaceIndex();
    const big = `# T\n${"x".repeat(2 * 1024 * 1024)}`;
    expect(idx.upsert("ws", "big.md", big, REV("h"))).toBeNull();
    expect(idx.get("ws", "big.md")).toBeUndefined();
  });

  it("same markdown through native-shaped and wsl-shaped inputs → same entry", () => {
    const idx = new WorkspaceIndex();
    const md = "---\ntitle: Same\ntags: [x]\n---\n# H\n[[L|a]]\n- [ ] T @due(2026-09-25)\n";
    const n = idx.upsert("ws-native", "n.md", md, REV("h1"))!;
    const w = idx.upsert("ws-wsl", "n.md", md, REV("h1"))!;
    const strip = ({ workspaceId: _a, revision: _r, ...rest }: typeof n) => rest;
    expect(strip(w)).toEqual(strip(n));
  });
});
