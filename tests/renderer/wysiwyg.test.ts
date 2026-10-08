import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { history, undoDepth } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  collectWysiwygRanges,
  rawCopyText,
  selectionActiveLines,
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

describe("live preview: cursor-line reveal", () => {
  function stateWithCursor(doc: string, pos: number): EditorState {
    return EditorState.create({ doc, selection: { anchor: pos }, extensions: [markdown({ base: markdownLanguage })] });
  }

  /** Every hide/replace range (checkbox markers included). */
  function replaces(r: ReturnType<typeof collectWysiwygRanges>): { from: number; to: number }[] {
    return [
      ...r.hide,
      ...r.bullets,
      ...r.pipes,
      ...r.callouts,
      ...r.footnoteRefs.map((f) => ({ from: f.from, to: f.to })),
      ...r.tasks.map((t) => ({ from: t.markerFrom, to: t.markerTo })),
    ];
  }

  it("reveals the cursor line, renders the rest", () => {
    const doc = "# Hello\n\n**bold** here\n";
    // Cursor on the bold line (line 3): its marks stay raw.
    const onBold = stateWithCursor(doc, doc.indexOf("bold"));
    const r1 = collectWysiwygRanges(onBold, 0, onBold.doc.length, { activeLines: selectionActiveLines(onBold) });
    const boldLine = onBold.doc.line(3);
    const onLine = (g: { from: number; to: number }): boolean => g.from < boldLine.to && g.to > boldLine.from;
    expect(replaces(r1).filter(onLine)).toEqual([]);
    // The heading on line 1 still renders.
    expect(r1.hide).toContainEqual({ from: 0, to: 1 });
    // Cursor on the heading (line 1): bold marks hide again, heading reveals.
    const onHead = stateWithCursor(doc, 2);
    const r2 = collectWysiwygRanges(onHead, 0, onHead.doc.length, { activeLines: selectionActiveLines(onHead) });
    expect(r2.hide).toContainEqual({ from: doc.indexOf("**"), to: doc.indexOf("**") + 2 });
    expect(r2.hide).not.toContainEqual({ from: 0, to: 1 });
  });

  it("reveals every line a multi-line selection touches", () => {
    const doc = "# Hello\n\n**bold** here\n";
    const state = EditorState.create({
      doc,
      selection: { anchor: 0, head: doc.length },
      extensions: [markdown({ base: markdownLanguage })],
    });
    const r = collectWysiwygRanges(state, 0, state.doc.length, { activeLines: selectionActiveLines(state) });
    expect(replaces(r)).toEqual([]);
  });

  it("reveals task markers on the cursor line only", () => {
    const doc = "- [ ] a\n- [ ] b\n";
    const onFirst = stateWithCursor(doc, 2);
    const r = collectWysiwygRanges(onFirst, 0, onFirst.doc.length, { activeLines: selectionActiveLines(onFirst) });
    expect(r.tasks.map((t) => t.lineNo)).toEqual([2]);
  });

  it("livePreview:false returns empty ranges (plain source)", () => {
    const state = stateOf("# Hello\n\n- [ ] **x**\n");
    const r = collectWysiwygRanges(state, 0, state.doc.length, { livePreview: false });
    expect(r.hide).toEqual([]);
    expect(r.tasks).toEqual([]);
    expect(r.bullets).toEqual([]);
    expect(r.pipes).toEqual([]);
    expect(r.callouts).toEqual([]);
    expect(r.footnoteRefs).toEqual([]);
    expect(r.lineClasses).toEqual([]);
    expect(r.mediaLines.size).toBe(0);
  });
});

describe("live preview: clipboard and undo", () => {
  it("copy yields raw markdown source, not rendered text", () => {
    const doc = "# Title\n\n- [ ] **bold** task\n";
    const from = doc.indexOf("**");
    const to = doc.indexOf("task") + 4;
    const state = EditorState.create({
      doc,
      selection: { anchor: from, head: to },
      extensions: [markdown({ base: markdownLanguage })],
    });
    expect(rawCopyText(state)).toBe(doc.slice(from, to));
    expect(rawCopyText(state)).toContain("**");
  });

  it("checkbox toggle applies as a single undo step", () => {
    const doc = "- [ ] buy milk\n";
    const state = EditorState.create({ doc, extensions: [history(), markdown({ base: markdownLanguage })] });
    expect(undoDepth(state)).toBe(0);
    const line = state.doc.line(1);
    const edit = toggleTaskMarkInText(line.text)!;
    const next = state.update({
      changes: { from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert },
      userEvent: "input.checkbox",
    }).state;
    expect(next.doc.toString()).toBe("- [x] buy milk\n");
    // One transaction = one undo group: undo restores the marker.
    expect(undoDepth(next)).toBe(1);
  });
});

describe("live preview fuzz", () => {
  /** Deterministic PRNG so failures reproduce. */
  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("decorations never overlap or escape the document", () => {
    const tokens = [
      "# ", "**", "_", "~~", "`", "[", "](url)", "[[", "]]", "- ", "[ ]", "[x]",
      "|", "> ", "%%", "[^a]", "[^", "![", "!", "---", "```", "1. ", ": ",
      "word", " ", "\n",
    ];
    const rand = mulberry32(42);
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(rand() * 40);
      let doc = "";
      for (let k = 0; k < n; k++) doc += tokens[Math.floor(rand() * tokens.length)]!;
      if (!doc.endsWith("\n")) doc += "\n";
      const state = stateOf(doc);
      const active = new Set<number>();
      for (let l = 1; l <= state.doc.lines; l++) if (rand() < 0.3) active.add(l);
      const r = collectWysiwygRanges(state, 0, state.doc.length, { activeLines: active });
      const all = [
        ...r.hide,
        ...r.bullets,
        ...r.pipes,
        ...r.callouts,
        ...r.footnoteRefs.map((f) => ({ from: f.from, to: f.to })),
        ...r.tasks.map((t) => ({ from: t.markerFrom, to: t.markerTo })),
      ];
      for (const g of all) {
        expect(g.from).toBeGreaterThanOrEqual(0);
        expect(g.to).toBeLessThanOrEqual(state.doc.length);
        expect(g.to).toBeGreaterThan(g.from);
      }
      const sorted = all.slice().sort((a, b) => a.from - b.from || a.to - b.to);
      for (let k = 1; k < sorted.length; k++) {
        expect(sorted[k]!.from).toBeGreaterThanOrEqual(sorted[k - 1]!.to);
      }
    }
  });
});
