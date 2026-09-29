import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  cycleHeadingLine,
  fmtLink,
  linkAt,
  linkUrlEdit,
  mapBlockLines,
  toggleBulletLine,
  toggleOrderedLine,
  toggleQuoteLine,
  toggleTaskLine,
  toggleWrap,
  type FormatResult,
} from "../../apps/desktop/src/renderer/editor/format";

function stateOf(doc: string, anchor?: number, head?: number): EditorState {
  return EditorState.create({
    doc,
    selection: anchor !== undefined ? { anchor, head: head ?? anchor } : undefined,
    extensions: [markdown({ base: markdownLanguage })],
  });
}

function apply(state: EditorState, res: FormatResult): EditorState {
  return state.update({ changes: res.changes, selection: res.selection }).state;
}

function fmt(state: EditorState, fn: (s: EditorState) => FormatResult | null): EditorState {
  const res = fn(state);
  expect(res).not.toBeNull();
  return apply(state, res!);
}

describe("wysiwyg formatting engine", () => {
  it("bolds, unbolds, and inserts pairs on collapsed cursors", () => {
    const wrapped = fmt(stateOf("Hello world", 6, 11), (s) => toggleWrap(s, "**"));
    expect(wrapped.doc.toString()).toBe("Hello **world**");
    expect(wrapped.selection.main).toMatchObject({ anchor: 8, head: 13 });

    const unwrapped = fmt(wrapped, (s) => toggleWrap(s, "**"));
    expect(unwrapped.doc.toString()).toBe("Hello world");
    expect(unwrapped.selection.main).toMatchObject({ anchor: 6, head: 11 });

    const paired = fmt(stateOf("ab", 1), (s) => toggleWrap(s, "**"));
    expect(paired.doc.toString()).toBe("a****b");
    expect(paired.selection.main).toMatchObject({ anchor: 3, head: 3 });
  });

  it("unwraps via surrounding marks when content alone is selected", () => {
    const next = fmt(stateOf("Hello **world**", 8, 13), (s) => toggleWrap(s, "**"));
    expect(next.doc.toString()).toBe("Hello world");
    expect(next.selection.main).toMatchObject({ anchor: 6, head: 11 });
  });

  it("toggles italic, strike, and code with their own marks", () => {
    expect(fmt(stateOf("a b", 2, 3), (s) => toggleWrap(s, "*")).doc.toString()).toBe("a *b*");
    expect(fmt(stateOf("a b", 2, 3), (s) => toggleWrap(s, "~~")).doc.toString()).toBe("a ~~b~~");
    expect(fmt(stateOf("a b", 2, 3), (s) => toggleWrap(s, "`")).doc.toString()).toBe("a `b`");
    expect(fmt(stateOf("a *b*", 3, 4), (s) => toggleWrap(s, "*")).doc.toString()).toBe("a b");
  });

  it("bullets every selected line, excluding a trailing line start", () => {
    const all = fmt(stateOf("a\nb", 0, 3), (s) => mapBlockLines(s, toggleBulletLine));
    expect(all.doc.toString()).toBe("- a\n- b");
    // Selection ending exactly at line 2 start leaves line 2 alone.
    const partial = fmt(stateOf("a\nb\n", 0, 2), (s) => mapBlockLines(s, toggleBulletLine));
    expect(partial.doc.toString()).toBe("- a\nb\n");
  });

  it("toggles bullets, ordered, and tasks per line", () => {
    expect(toggleBulletLine("a")).toBe("- a");
    expect(toggleBulletLine("- a")).toBe("a");
    expect(toggleBulletLine("1. a")).toBe("- a");
    expect(toggleBulletLine("* a")).toBe("- a");
    expect(toggleBulletLine("- [x] a")).toBe("- a");
    expect(toggleBulletLine("  - nested")).toBe("  nested");

    expect(toggleOrderedLine("a")).toBe("1. a");
    expect(toggleOrderedLine("1. a")).toBe("a");
    expect(toggleOrderedLine("- a")).toBe("1. a");

    expect(toggleTaskLine("a")).toBe("- [ ] a");
    expect(toggleTaskLine("- a")).toBe("- [ ] a");
    expect(toggleTaskLine("1. a")).toBe("- [ ] a");
    expect(toggleTaskLine("- [ ] a")).toBe("- a");
    expect(toggleTaskLine("- [x] a")).toBe("- a");
    expect(toggleTaskLine("- [-] a")).toBe("- a");
  });

  it("cycles headings paragraph → H1 → H2 → H3 → paragraph", () => {
    expect(cycleHeadingLine("a")).toBe("# a");
    expect(cycleHeadingLine("# a")).toBe("## a");
    expect(cycleHeadingLine("## a")).toBe("### a");
    expect(cycleHeadingLine("### a")).toBe("a");
    expect(cycleHeadingLine("###### a")).toBe("a");
  });

  it("toggles quotes", () => {
    expect(toggleQuoteLine("a")).toBe("> a");
    expect(toggleQuoteLine("> a")).toBe("a");
    expect(toggleQuoteLine("  > nested")).toBe("  nested");
  });

  it("wraps links with the url pre-selected", () => {
    const next = fmt(stateOf("Hello world", 6, 11), fmtLink);
    expect(next.doc.toString()).toBe("Hello [world](url)");
    expect(next.selection.main).toMatchObject({ anchor: 14, head: 17 });
  });

  it("selects the existing url when invoked inside a link label", () => {
    const doc = "[a](https://x.io)\n";
    const next = fmt(stateOf(doc, 1), fmtLink);
    expect(next.doc.toString()).toBe(doc);
    expect(next.selection.main).toMatchObject({ anchor: 4, head: 16 });

    const target = linkAt(stateOf(doc), 1);
    expect(target).toMatchObject({ url: "https://x.io", urlFrom: 4, urlTo: 16 });
    expect(linkAt(stateOf(doc), 8)).toBeNull();
    expect(linkAt(stateOf("plain"), 2)).toBeNull();
  });

  it("rewrites link destinations", () => {
    const state = stateOf("[a](https://x.io)\n");
    const edit = linkUrlEdit(state, 1, "https://y.io");
    expect(edit).toEqual({ from: 4, to: 16, insert: "https://y.io" });
    expect(linkUrlEdit(stateOf("plain"), 2, "https://y.io")).toBeNull();
  });
});
