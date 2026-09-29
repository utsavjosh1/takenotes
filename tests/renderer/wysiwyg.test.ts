import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  collectWysiwygRanges,
  toggleTaskMarkInText,
} from "../../apps/desktop/src/renderer/editor/wysiwyg";

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
}

function ranges(doc: string) {
  const state = stateOf(doc);
  return collectWysiwygRanges(state, 0, state.doc.length);
}

describe("markdown-backed wysiwyg ranges", () => {
  it("always hides heading marks (no syntax view)", () => {
    const { hide, lineClasses } = ranges("# Hello\n\ntext\n");
    expect(hide).toContainEqual({ from: 0, to: 1 });
    expect(lineClasses).toContainEqual({ line: 1, cls: "wys-h1" });
  });

  it("hides bold/italic/strike/code marks but keeps their content", () => {
    const doc = "a **b** c _d_ e ~~f~~ g `h_i` j\n";
    const { hide } = ranges(doc);
    // `**` pair around b.
    expect(hide).toContainEqual({ from: 2, to: 4 });
    expect(hide).toContainEqual({ from: 5, to: 7 });
    // `~~` pair around f.
    expect(hide).toContainEqual({ from: doc.indexOf("~~"), to: doc.indexOf("~~") + 2 });
    // Backticks around h_i (underscores inside code stay intact).
    expect(hide).toContainEqual({ from: doc.indexOf("`"), to: doc.indexOf("`") + 1 });
    const content = doc.slice(doc.indexOf("h_i"), doc.indexOf("h_i") + 3);
    expect(content).toBe("h_i");
    for (const h of hide) {
      expect(doc.slice(h.from, h.to)).not.toContain("h_i");
    }
  });

  it("hides link brackets and URL but keeps the label", () => {
    const doc = "[label](https://example.com/x)\n";
    const { hide } = ranges(doc);
    expect(hide.length).toBeGreaterThan(0);
    const labelAt = doc.indexOf("label");
    for (const h of hide) {
      expect(h.from >= labelAt + 5 || h.to <= labelAt).toBe(true);
    }
    expect(doc.slice(hide.map((h) => h.from).sort((a, b) => a - b)[0] ?? 0)).toBeDefined();
  });

  it("never hides a bare autolinked URL", () => {
    expect(ranges("see https://example.com/a_b here\n").hide).toEqual([]);
  });

  it("hides quote marks and tags the line", () => {
    const doc = "> hi\n";
    const { hide, lineClasses } = ranges(doc);
    expect(hide).toContainEqual({ from: 0, to: 1 });
    expect(lineClasses).toContainEqual({ line: 1, cls: "wys-quote" });
  });

  it("collects task markers with any-non-space-checked semantics", () => {
    const { tasks } = ranges("- [ ] a\n- [x] b\n- [-] c\n");
    expect(tasks.map((t) => t.checked)).toEqual([false, true, true]);
    expect(tasks).toHaveLength(3);
  });

  it("ignores task syntax inside headings and code blocks", () => {
    expect(ranges("# - [ ] not a task\n").tasks).toEqual([]);
    expect(ranges("```\n- [ ] not a task\n```\n").tasks).toEqual([]);
    expect(ranges("- `a [ ] b` c\n").tasks).toEqual([]);
  });

  it("toggles task markers as pure text edits", () => {
    expect(toggleTaskMarkInText("- [ ] a")).toEqual({ from: 3, to: 4, insert: "x" });
    expect(toggleTaskMarkInText("- [x] a")).toEqual({ from: 3, to: 4, insert: " " });
    expect(toggleTaskMarkInText("- [-] a")).toEqual({ from: 3, to: 4, insert: " " });
    expect(toggleTaskMarkInText("1. [ ] a")).toEqual({ from: 4, to: 5, insert: "x" });
    expect(toggleTaskMarkInText("plain")).toBeNull();
  });

});
