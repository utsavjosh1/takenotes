import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { editBlock, parseNote, serializeNote } from "@takenotes/core/markdown/blocks";
import { FileStoreError, MemoryFileStore } from "@takenotes/core/ports/file-store";
import { parseDocument } from "@takenotes/core/index/document";

/** Sample notes come straight from the reference prototype's data layer. */
function sampleNotes(): Record<string, string> {
  const code = readFileSync(path.resolve(__dirname, "../../design/prototype/assets/data.js"), "utf8");
  const DB = vm.runInNewContext(`${code}\n;DB`, {}) as { ws: Record<string, { files: Record<string, { body: string }> }> };
  const out: Record<string, string> = {};
  for (const [w, ws] of Object.entries(DB.ws)) for (const [p, f] of Object.entries(ws.files)) out[`${w}/${p}`] = f.body;
  return out;
}

const parse = (body: string) => parseDocument("w", "n.md", body, { hash: "h", size: body.length, mtimeMs: 1 });

describe("markdown round trip", () => {
  const notes = sampleNotes();
  it("has the prototype samples", () => expect(Object.keys(notes).length).toBeGreaterThan(2000));

  it("every sample note round-trips byte for byte", () => {
    for (const [p, body] of Object.entries(notes)) expect(serializeNote(parseNote(body)), p).toBe(body);
  });

  it("holds for awkward input: CRLF, no final newline, unclosed fence, odd blanks", () => {
    const cases = [
      "", "\n", "# a", "a\r\nb\r\n\r\n- x\r\n", "```js\nunclosed", "---\ntitle: x\n---", "---\nnever closed\n# h",
      "| a | b |\n|---|---|\n| 1 | 2 |\n\ntext", "> [!info] Title\n> body\n\n> plain quote", "%% hidden\nmore %%\nafter",
      "![[pic.png]]\n![alt](x.png)", "  - [X] Done @due(2026-10-30)\n    - nested\n1) one\n2) two", "***\n---\n___",
      "﻿# bom", "tab\tinside\n\n\n\n# end\n\n",
    ];
    for (const c of cases) expect(serializeNote(parseNote(c)), JSON.stringify(c)).toBe(c);
  });

  it("keeps tables, callouts, images and comments opaque", () => {
    const doc = parseNote("| a | b |\n|---|---|\n| 1 | 2 |\n\n> [!info] Hi\n> there\n\n![[x.png]]\n\n%% note %%\n");
    expect(doc.blocks.filter((b) => b.type === "opaque").map((b) => (b as { kind: string }).kind)).toEqual(["table", "callout", "image", "comment"]);
  });

  it("editing one block rewrites only that block", () => {
    const src = notes["dev-notes/Projects/Takenotes roadmap.md"]!;
    const doc = parseNote(src);
    const idx = doc.blocks.findIndex((b) => b.type === "heading");
    const out = serializeNote(editBlock(doc, idx, { text: "Renamed" }));
    expect(out).toBe(src.replace("# Takenotes roadmap", "# Renamed"));
  });

  it("regenerated task lists keep @due/@scheduled/@priority text", () => {
    const doc = parseNote("- [ ] Ship @due(2026-10-30) @priority(high)\n- [x] Done\n");
    const idx = doc.blocks.findIndex((b) => b.type === "list");
    const list = doc.blocks[idx] as Extract<ReturnType<typeof parseNote>["blocks"][number], { type: "list" }>;
    const out = serializeNote(editBlock(doc, idx, { items: list.items.map((i, k) => (k === 0 ? { ...i, checked: true } : i)) }));
    expect(out).toBe("- [x] Ship @due(2026-10-30) @priority(high)\n- [x] Done\n");
  });
});

describe("FileStore (memory)", () => {
  it("rejects a write whose expectedRev is stale with CONFLICT", async () => {
    const fs = new MemoryFileStore();
    fs.seed("w", { "a.md": "one" });
    const r = await fs.read("w", "a.md");
    fs.externalWrite("w", "a.md", "two");
    await expect(fs.write("w", "a.md", "mine", { expectedRev: r.rev })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await fs.read("w", "a.md")).body).toBe("two");
    const fresh = await fs.read("w", "a.md");
    await expect(fs.write("w", "a.md", "mine", { expectedRev: fresh.rev })).resolves.toHaveProperty("rev");
  });

  it("reports OFFLINE, EACCES, ENOENT, EEXIST and watches external changes", async () => {
    const fs = new MemoryFileStore();
    fs.seed("w", { "a.md": "x", "b.md": "y", "Reading/r.md": "z" });
    fs.readOnlyPrefixes = ["Reading/"];
    const events: string[] = [];
    const off = fs.watch("w", (c) => events.push(`${c.kind}:${c.path}`));
    fs.externalWrite("w", "a.md", "x2");
    fs.externalRemove("w", "b.md");
    off();
    fs.externalWrite("w", "a.md", "x3");
    expect(events).toEqual(["changed:a.md", "removed:b.md"]);
    await expect(fs.read("w", "nope.md")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.rename("w", "a.md", "Reading/r.md")).rejects.toMatchObject({ code: "EEXIST" });
    const rev = (await fs.read("w", "Reading/r.md")).rev;
    await expect(fs.write("w", "Reading/r.md", "n", { expectedRev: rev })).rejects.toMatchObject({ code: "EACCES" });
    fs.offline = true;
    await expect(fs.list("w")).rejects.toBeInstanceOf(FileStoreError);
    await expect(fs.list("w")).rejects.toMatchObject({ code: "OFFLINE" });
  });

  it("trash keeps a copy, permanent does not", async () => {
    const fs = new MemoryFileStore();
    fs.seed("w", { "a.md": "x", "b.md": "y" });
    await fs.remove("w", "a.md", "trash");
    await fs.remove("w", "b.md", "permanent");
    expect(fs.trashed.map((t) => t.path)).toEqual(["a.md"]);
    expect(await fs.list("w")).toEqual([]);
  });
});

describe("index extraction on prototype notes", () => {
  it("links, aliases, tags, task metadata and properties", () => {
    const e = parse("---\nstatus: active\nowner: utsav\n---\n# T\n\nSee [[Design brief]] and [[Auth rewrite|auth]].\n\n- [ ] Call @due(2026-10-30) @scheduled(2026-10-28 14:00) @priority(high)\n\n#project #roadmap\n");
    expect(e.links.map((l) => [l.target, l.alias])).toEqual([["Design brief", undefined], ["Auth rewrite", "auth"]]);
    expect(e.tags).toEqual(expect.arrayContaining(["project", "roadmap"]));
    expect(e.tasks[0]).toMatchObject({ completed: false, due: "2026-10-30", scheduled: "2026-10-28T14:00", priority: "high" });
    expect(e.frontmatter).toMatchObject({ status: "active", owner: "utsav" });
  });
});
