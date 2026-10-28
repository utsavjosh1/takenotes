import { describe, expect, it } from "vitest";
import { parseDocument } from "@takenotes/core/index/document";
import { parseSearchQuery } from "@takenotes/core/search/query";
import { bodyLines, plainSearchError, plainTerms, searchNotes } from "@takenotes/core/search/hits";

const doc = (rel: string, body: string) => parseDocument("w", rel, body, { hash: rel, size: body.length, mtimeMs: 1 });
const entries = [
  doc("Projects/Roadmap.md", "---\nstatus: active\n---\n# Roadmap\n\nShip the Editor.\nthe editor again\n\n- [ ] Wire editor @due(2026-10-30)\n- [x] Done thing\n\n#project\n"),
  doc("Inbox/Ideas.md", "# Ideas\n\nNothing about it here.\n#idea\n"),
  doc("Areas/Team.md", "# Team\n\nEDITOR duty\n"),
];
const run = (raw: string, o: Partial<{ matchCase: boolean; context: number }> = {}) => searchNotes(entries, raw, { matchCase: false, context: 0, ...o });

describe("every operator", () => {
  it("file:, path:, tag:, task:open, task:done, [property:value], -exclude, phrase", async () => {
    const paths = async (q: string) => (await run(q)).notes.map((n) => n.relativePath);
    expect(await paths("file:roadmap")).toEqual(["Projects/Roadmap.md"]);
    expect(await paths("path:inbox/")).toEqual(["Inbox/Ideas.md"]);
    expect(await paths("tag:idea")).toEqual(["Inbox/Ideas.md"]);
    expect(await paths("task:open")).toEqual(["Projects/Roadmap.md"]);
    expect(await paths("task:done")).toEqual(["Projects/Roadmap.md"]);
    expect(await paths("[status:active]")).toEqual(["Projects/Roadmap.md"]);
    expect(await paths("editor -path:projects/")).toEqual(["Areas/Team.md"]);
    expect(await paths('"editor again"')).toEqual(["Projects/Roadmap.md"]);
  });
  it("unknown operator gives the plain message", async () => {
    expect((await run("foo:bar")).error).toBe("Unknown filter 'foo:'. Try file:, path:, tag: or task:.");
    const bad = parseSearchQuery("zzz:1");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(plainSearchError(bad.error)).toContain("Unknown filter 'zzz:'");
  });
});

describe("hits", () => {
  it("lists every matching line with its file line number", async () => {
    const r = await run("editor");
    const road = r.notes.find((n) => n.relativePath === "Projects/Roadmap.md")!;
    expect(road.hits.map((h) => h.line)).toEqual([6, 7, 9]);
    expect(road.total).toBe(3);
  });
  it("shows context lines", async () => {
    const r = await run("again", { context: 1 });
    expect(r.notes[0]!.hits[0]).toMatchObject({ line: 7, before: ["Ship the Editor."], after: [""] });
  });
  it("match case keeps only exact-case notes and lines", async () => {
    const r = await run("Editor", { matchCase: true });
    expect(r.notes.map((n) => n.relativePath)).toEqual(["Projects/Roadmap.md"]);
    expect(r.notes[0]!.hits.map((h) => h.line)).toEqual([6]);
  });
  it("task selectors list the task lines", async () => {
    const r = await run("task:open");
    expect(r.notes[0]!.hits.map((h) => h.line)).toEqual([9, 10]);
  });
  it("cancels between slices", async () => {
    const many = Array.from({ length: 400 }, (_, i) => doc(`n${i}.md`, "# a\nword\n"));
    let calls = 0;
    const r = await searchNotes(many, "word", { matchCase: false, context: 0, isCancelled: () => ++calls > 1 });
    expect(r.cancelled).toBe(true);
    expect(r.notes.length).toBeLessThan(400);
  });
  it("plainTerms keeps case and drops operators", () => {
    expect(plainTerms('Editor -skip tag:x "Exact Phrase" [a:b]')).toEqual(["Editor", "Exact Phrase"]);
  });
  it("body lines line up with file lines", () => {
    expect(bodyLines(entries[0]!).find((l) => l.text === "Ship the Editor.")!.line).toBe(6);
  });
});
