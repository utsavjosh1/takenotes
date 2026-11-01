import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { chipLabel, collectWysiwygRanges, hiddenBlockRanges } from "../../apps/desktop/src/renderer/editor/wysiwyg";
import { LINK_ADDRESS_ERROR, validWebAddress } from "../../apps/desktop/src/renderer/editor/format";

const stateOf = (doc: string): EditorState => EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
const collect = (doc: string, linkExists?: (t: string) => boolean) => {
  const s = stateOf(doc);
  return collectWysiwygRanges(s, 0, s.doc.length, linkExists ? { linkExists } : undefined);
};

describe("task chips", () => {
  it("labels in plain words", () => {
    expect(chipLabel("due", "2026-10-30")).toBe("Due Oct 30");
    expect(chipLabel("scheduled", "2026-10-28 14:00")).toBe("Planned Oct 28, 14:00");
    expect(chipLabel("priority", "high")).toBe("High priority");
    expect(chipLabel("due", "tomorrow")).toBeNull();
    expect(chipLabel("priority", "urgent")).toBeNull();
  });
  it("turns tokens on task lines into chips and hides the brackets", () => {
    const doc = "- [ ] Ship @due(2026-10-30) @priority(high)\n";
    const r = collect(doc);
    expect(r.chips.map((c) => c.label)).toEqual(["Due Oct 30", "High priority"]);
    expect(r.tasks).toHaveLength(1);
    expect(r.hide).toContainEqual({ from: 0, to: 3 }); // "- [" hides, the checkbox widget stands alone
  });
  it("marks done tasks and leaves bad tokens as text", () => {
    const r = collect("- [x] Done @due(someday)\n");
    expect(r.lineClasses).toContainEqual({ line: 1, cls: "wys-task-done" });
    expect(r.chips).toHaveLength(0);
  });
});

describe("note links", () => {
  it("hides brackets and the target before | and flags missing notes", () => {
    const doc = "See [[Design brief]] and [[Gone|that one]].\n";
    const r = collect(doc, (t) => t === "Design brief");
    expect(r.wikilinks.map((w) => [doc.slice(w.from, w.to), w.missing])).toEqual([["Design brief", false], ["that one", true]]);
    expect(r.hide.some((h) => doc.slice(h.from, h.to).startsWith("[["))).toBe(true);
  });
});

describe("hidden blocks", () => {
  it("hides details and a first heading that repeats the title, nothing else", () => {
    const doc = "---\nstatus: active\n---\n# Roadmap\n\nBody\n# Roadmap\n";
    const s = stateOf(doc);
    const r = hiddenBlockRanges(s, "Roadmap");
    expect(r).toEqual([{ from: 0, to: 23 }, { from: 23, to: 33 }]);
    expect(hiddenBlockRanges(s, "Other")).toEqual([{ from: 0, to: 23 }]);
    expect(hiddenBlockRanges(stateOf("# Roadmap\n"), undefined)).toEqual([]);
  });
});

describe("link dialog validation", () => {
  it("accepts full web addresses only", () => {
    expect(validWebAddress("https://example.com")).toBe(true);
    expect(validWebAddress("http://localhost:3000/x")).toBe(true);
    for (const bad of ["example.com", "javascript:alert(1)", "https://", "ftp://x.com", ""]) expect(validWebAddress(bad)).toBe(false);
    expect(LINK_ADDRESS_ERROR).toBe("Enter a full web address, like https://example.com");
  });
});
