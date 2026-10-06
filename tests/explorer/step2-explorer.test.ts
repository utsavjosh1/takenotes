import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  parseExplorerSort,
  resolveCreateTarget,
  sortEntries,
  uniqueCopyName,
} from "@takenotes/core/explorer/sort";

/** Step 2 slice 3 gate: sort/reveal-ancestors/collision naming. */
describe("step2 explorer", () => {
  it("sorts folders-first, name-asc default, stable", () => {
    const entries = [
      { name: "b.md", relativePath: "b.md", kind: "file" as const, mtimeMs: 2 },
      { name: "A", relativePath: "A", kind: "directory" as const, mtimeMs: 99 },
      { name: "a.md", relativePath: "a.md", kind: "file" as const, mtimeMs: 1 },
    ];
    expect(sortEntries(entries, { key: "name", dir: "asc" }).map((e) => e.relativePath)).toEqual(["A", "a.md", "b.md"]);
    expect(sortEntries(entries, { key: "modified", dir: "desc" }).map((e) => e.relativePath)[0]).toBe("A");
  });

  it("falls back to mtimeMs for created until birthtime lands on the wire", () => {
    const entries = [
      { name: "old.md", relativePath: "old.md", kind: "file" as const, mtimeMs: 1 },
      { name: "new.md", relativePath: "new.md", kind: "file" as const, mtimeMs: 5 },
    ];
    expect(sortEntries(entries, { key: "created", dir: "asc" }).map((e) => e.name)).toEqual(["old.md", "new.md"]);
  });

  it("parses persisted sort, defaulting safely", () => {
    expect(parseExplorerSort(null)).toEqual({ key: "name", dir: "asc" });
    expect(parseExplorerSort({ key: "modified", dir: "desc" })).toEqual({ key: "modified", dir: "desc" });
    expect(parseExplorerSort({ key: "nope", dir: "nope" })).toEqual({ key: "name", dir: "asc" });
  });

  it("lists ancestors shallowest-first for reveal", () => {
    expect(ancestorsOf("a/b/c.md")).toEqual(["a", "a/b"]);
    expect(ancestorsOf("root.md")).toEqual([]);
  });

  it("increments copy names case-insensitively, never overwriting", () => {
    const existing = new Set(["note.md", "note 1.md"]);
    expect(uniqueCopyName("NOTE.md", existing)).toBe("NOTE 2.md");
    expect(uniqueCopyName("fresh.md", existing)).toBe("fresh.md");
  });

  it("resolves Quick Open create targets with confinement", () => {
    expect(resolveCreateTarget("My Note", "projects")).toEqual({ ok: true, rel: "projects/My Note.md" });
    expect(resolveCreateTarget("a/b", "")).toEqual({ ok: true, rel: "a/b.md" });
    expect(resolveCreateTarget("pic.png", "")).toEqual({ ok: true, rel: "pic.png" });
    expect(resolveCreateTarget("   ", "")).toEqual({ ok: false, error: "Enter a file name." });
    expect(resolveCreateTarget("../escape", "")).toMatchObject({ ok: false });
    expect(resolveCreateTarget("a/b:c", "")).toMatchObject({ ok: false });
    expect(resolveCreateTarget("CON", "")).toMatchObject({ ok: false });
  });
});
