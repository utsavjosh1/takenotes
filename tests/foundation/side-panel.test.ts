import { describe, expect, it } from "vitest";
import { detailFields, detailsAreBroken, editDetail, panelHeadings } from "@takenotes/core/links/side-panel";

const note = "---\nstatus: active # keep\nowner: utsav\ndue: 2026-10-30\ndone: false\npoints: 3\ntags: [a, b]\n---\n# Roadmap\n\n## Milestones\n### Deep\n#### Deeper\n\nBody @due(2026-10-30)\n";

describe("panelHeadings", () => {
  it("skips the heading that repeats the title and caps indent at 2", () => {
    expect(panelHeadings(note, "Roadmap")).toEqual([
      { text: "Milestones", line: 11, indent: 1 },
      { text: "Deep", line: 12, indent: 2 },
      { text: "Deeper", line: 13, indent: 2 },
    ]);
    expect(panelHeadings(note, "Other")[0]!.text).toBe("Roadmap");
  });
});

describe("details", () => {
  const fm = { status: "active", owner: "utsav", due: "2026-10-30", done: false, points: 3, tags: ["a", "b"], nested: { x: 1 } };
  it("picks a field type per value and skips nested values", () => {
    const f = detailFields(fm);
    expect(f.map((x) => [x.name, x.kind])).toEqual([["status", "text"], ["owner", "text"], ["due", "date"], ["done", "checkbox"], ["points", "number"], ["tags", "text"]]);
    expect(f.find((x) => x.name === "tags")).toMatchObject({ list: true, value: "a, b" });
  });
  it("changing one value changes exactly one line", () => {
    const f = detailFields(fm);
    for (const [name, raw, expectedLine] of [["owner", "ron", "owner: ron"], ["due", "2026-11-02", "due: 2026-11-02"], ["done", true, "done: true"], ["points", 5, "points: 5"]] as const) {
      const res = editDetail(note, f.find((x) => x.name === name)!, raw);
      if ("error" in res) throw new Error(res.error);
      const a = note.split("\n"), b = res.content.split("\n");
      expect(b.length).toBe(a.length);
      const changed = a.map((l, i) => [l, b[i]!] as const).filter(([x, y]) => x !== y);
      expect(changed.length, name).toBe(1);
      expect(changed[0]![1]).toBe(expectedLine);
    }
  });
  it("keeps comments on untouched lines and refuses bad input", () => {
    const f = detailFields(fm);
    const res = editDetail(note, f.find((x) => x.name === "owner")!, "ron");
    expect("content" in res && res.content).toContain("status: active # keep");
    expect(editDetail(note, f.find((x) => x.name === "points")!, "abc")).toEqual({ error: "Enter a number." });
    expect(editDetail(note, f.find((x) => x.name === "owner")!, "")).toHaveProperty("error");
  });
  it("detects unreadable details", () => {
    expect(detailsAreBroken(note)).toBe(false);
    expect(detailsAreBroken("---\nstatus: [oops\n---\nbody")).toBe(true);
    expect(detailsAreBroken("---\nnever closed\n# h")).toBe(true);
    expect(detailsAreBroken("# plain")).toBe(false);
  });
});

import { readDetails } from "@takenotes/core/links/side-panel";
describe("readDetails", () => {
  it("reads fields from text and flags broken blocks", () => {
    expect(readDetails(note).fields.map((f) => f.name)).toEqual(["status", "owner", "due", "done", "points", "tags"]);
    expect(readDetails("# plain")).toEqual({ fields: [], broken: false });
    expect(readDetails("---\nstatus: [oops\n---\n").broken).toBe(true);
    expect(readDetails("---\nnever closed\n").broken).toBe(true);
  });
});
