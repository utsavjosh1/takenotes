import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  collectWysiwygRanges,
  mediaDimsOnLine,
  mediaSrcOnLine,
  toggleTaskMarkInText,
} from "../../apps/desktop/src/renderer/editor/wysiwyg";
import { toggleWrap, wikilinkAt } from "../../apps/desktop/src/renderer/editor/format";
import { COMMAND_DEFINITIONS } from "../../packages/core/src/commands/registry";
import { COMMANDS } from "../../packages/platform/src/keymap";
import * as panes from "../../apps/desktop/src/renderer/panes";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8");

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
}

function ranges(doc: string) {
  const state = stateOf(doc);
  return collectWysiwygRanges(state, 0, state.doc.length);
}

/** Text the user actually sees: source minus hidden/widget-replaced ranges.
 * Fails the acceptance test if Markdown syntax leaks into it. */
function visibleText(
  doc: string,
  r: Pick<
    ReturnType<typeof collectWysiwygRanges>,
    "hide" | "bullets" | "pipes" | "callouts" | "footnoteRefs" | "tasks"
  >,
): string {
  const cut = [
    ...r.hide,
    ...r.bullets,
    ...r.pipes,
    ...r.callouts,
    ...r.footnoteRefs.map((f) => ({ from: f.from, to: f.to })),
    ...r.tasks.map((t) => ({ from: t.markerFrom, to: t.markerTo })),
  ]
    .slice()
    .sort((a, b) => a.from - b.from);
  let out = "";
  let pos = 0;
  for (const c of cut) {
    out += doc.slice(pos, c.from);
    pos = Math.max(pos, c.to);
  }
  return out + doc.slice(pos);
}

/** ADR-0015: one desktop editing surface — no mode architecture anywhere. */
describe("single-surface invariant (no Edit/Read mode)", () => {
  it("has no editor.toggleReadMode command definition", () => {
    const ids = COMMAND_DEFINITIONS.map((c) => c.id as string);
    expect(ids).not.toContain("editor.toggleReadMode");
  });

  it("has no editor.toggleReadMode keymap binding (Ctrl/Cmd+E freed)", () => {
    const ids = COMMANDS.map((c) => c.id as string);
    expect(ids).not.toContain("editor.toggleReadMode");
  });

  it("has no setReadMode layout helper", () => {
    expect("setReadMode" in panes).toBe(false);
  });

  it("pane-view has no mode switch: no readMode, no reading branch, one mount", () => {
    const src = read("apps/desktop/src/renderer/components/pane-view.tsx");
    expect(src).not.toMatch(/readMode/);
    expect(src).not.toMatch(/onToggleReadMode|onToggleTask/);
    expect(src).not.toMatch(/dangerouslySetInnerHTML/);
    expect(src).not.toMatch(/renderMarkdown/);
    expect(src).not.toMatch(/markdown-reading|read-toggle/);
    // Session identity is document + settings only — no mode segment.
    expect(src).not.toMatch(/\|rm/);
    expect(src).toMatch(/sessionKey/);
  });

  it("document state has no read-mode or second-path mutations", () => {
    const src = read("apps/desktop/src/renderer/hooks/use-documents.ts");
    expect(src).not.toMatch(/toggleReadMode|setReadMode|readMode/);
    expect(src).not.toMatch(/toggleTaskCheckbox/);
  });

  it("commands, keyboard, and native menus carry no mode switch", () => {
    expect(read("apps/desktop/src/renderer/hooks/use-commands.ts")).not.toMatch(/toggleReadMode/);
    expect(read("apps/desktop/src/renderer/hooks/use-global-keyboard.ts")).not.toMatch(/toggleReadMode/);
    expect(read("apps/desktop/src/main/platform/menus.ts")).not.toMatch(/toggleReadMode|Reading View/);
    expect(read("apps/desktop/src/renderer/App.tsx")).not.toMatch(/readMode|onToggleReadMode|onToggleTask/);
  });
});

/** Rich constructs render inside the one editor — never a second surface. */
describe("single-surface wysiwyg rich constructs", () => {
  it("tables earn structure classes; pipes become widgets, never visible", () => {
    const doc = "| a | b |\n|---|---|\n| 1 | 2 |\n";
    const r = ranges(doc);
    const classes = r.lineClasses.map((l) => l.cls);
    expect(classes).toContain("wys-table-head");
    expect(classes).toContain("wys-table-row");
    expect(classes).toContain("wys-table-delim");
    // Every `|` is widget-replaced; no pipe survives as visible text.
    const pipeCount = (doc.match(/\|/g) ?? []).length;
    expect(r.pipes).toHaveLength(pipeCount);
    for (const h of r.hide) {
      expect(doc.slice(h.from, h.to)).not.toContain("|");
    }
    const visible = visibleText(doc, r);
    expect(visible).not.toContain("|");
    expect(visible).toContain("a");
    expect(visible).toContain("2");
  });

  it("list markers render as bullets/numbers; tasks hide the marker", () => {
    const doc = "- a\n  - nested\n1. one\n1. two\n- [ ] task\n";
    const r = ranges(doc);
    // Plain bullets + ordered items get widgets; the task line hides `-`.
    expect(r.bullets.filter((b) => !b.ordered)).toHaveLength(2);
    const ordered = r.bullets.filter((b) => b.ordered);
    expect(ordered.map((b) => b.number)).toEqual([1, 2]);
    expect(r.tasks).toHaveLength(1);
    const visible = visibleText(doc, r);
    expect(visible).not.toMatch(/(^|\n)- /);
    expect(visible).not.toMatch(/(^|\n)1\. /);
    expect(visible).not.toContain("[ ]");
  });

  it("ordered numbering follows sibling order from the start marker", () => {
    const r = ranges("3. a\n3. b\n3. c\n");
    expect(r.bullets.filter((b) => b.ordered).map((b) => b.number)).toEqual([3, 4, 5]);
  });

  it("callout openers render as a type chip, never raw syntax", () => {
    const doc = "> [!note] Title\n> body\n";
    const r = ranges(doc);
    expect(r.lineClasses).toContainEqual({ line: 1, cls: "wys-callout" });
    expect(r.lineClasses).toContainEqual({ line: 1, cls: "wys-callout-note" });
    expect(r.lineClasses).toContainEqual({ line: 1, cls: "wys-quote" });
    expect(r.callouts).toHaveLength(1);
    expect(r.callouts[0]!.type).toBe("note");
    const visible = visibleText(doc, r);
    expect(visible).not.toContain("[!note]");
    expect(visible).not.toContain("!note");
    expect(visible).toContain("Title");
  });

  it("fenced code fences stay visible and the span earns a code class", () => {
    const doc = "```js\ncode here\n```\n";
    const r = ranges(doc);
    for (const h of r.hide) {
      expect(doc.slice(h.from, h.to)).not.toContain("```");
    }
    const classes = r.lineClasses.filter((l) => l.cls === "wys-codeblock").map((l) => l.line);
    expect(classes).toEqual([1, 2, 3]);
  });

  it("inline code-span backticks still hide (only fences stay visible)", () => {
    const doc = "a `code` b\n";
    const { hide } = ranges(doc);
    expect(hide).toContainEqual({ from: 2, to: 3 });
    expect(hide).toContainEqual({ from: 7, to: 8 });
  });

  it("thematic breaks hide their syntax and draw a rule", () => {
    const doc = "text\n\n---\n\nmore\n";
    const r = ranges(doc);
    expect(r.lineClasses).toContainEqual({ line: 3, cls: "wys-hr" });
    expect(visibleText(doc, r)).not.toContain("---");
  });

  it("media labels show without raw image syntax", () => {
    const doc = "![alt](img.png)\n";
    const r = ranges(doc);
    expect(r.lineClasses).toContainEqual({ line: 1, cls: "wys-media" });
    expect(r.mediaLines.has(1)).toBe(true);
    const visible = visibleText(doc, r);
    expect(visible).not.toContain("![");
    expect(visible).not.toContain("](");
    expect(visible).not.toContain("img.png");
    expect(visible).toContain("alt");
    expect(mediaSrcOnLine("![alt](img.png)")).toBe("img.png");
    expect(mediaSrcOnLine("![](clip.mp3)")).toBe("clip.mp3");
    expect(mediaSrcOnLine("![[movie.mp4]]")).toBe("movie.mp4");
    expect(mediaSrcOnLine("plain text")).toBeNull();
  });

  it("mediaDimsOnLine reads |WxH and #height= params, else null", () => {
    expect(mediaDimsOnLine("![[pic.png|100]]")).toEqual({ width: 100 });
    expect(mediaDimsOnLine("![[a/pic.png|100x145]]")).toEqual({ width: 100, height: 145 });
    expect(mediaDimsOnLine("![[doc.pdf#height=400]]")).toEqual({ height: 400 });
    // Mixed syntax degrades: the alias slot is not a clean size, the fragment still applies.
    expect(mediaDimsOnLine("![[pic.png|100x145#height=50]]")).toEqual({ height: 50 });
    expect(mediaDimsOnLine("![[movie.mp4]]")).toBeNull();
    expect(mediaDimsOnLine("![[Note|Alias]]")).toBeNull();
    expect(mediaDimsOnLine("![[Note#^blk]]")).toBeNull();
    expect(mediaDimsOnLine("plain text")).toBeNull();
  });

  it("footnote refs become superscripts; definition prefixes hide", () => {
    const doc = "text [^1]\n\n[^1]: the note\n";
    const r = ranges(doc);
    expect(r.lineClasses).toContainEqual({ line: 3, cls: "wys-footnote-def" });
    expect(r.footnoteRefs).toHaveLength(1);
    expect(r.footnoteRefs[0]!.id).toBe("1");
    const visible = visibleText(doc, r);
    expect(visible).not.toContain("[^1]");
    expect(visible).not.toContain("[^1]:");
    expect(visible).toContain("the note");
  });

  it("%%comments%% hide entirely; unclosed markers stay visible", () => {
    const doc = "a %%secret%% b\n";
    const visible = visibleText(doc, ranges(doc));
    expect(visible).not.toContain("%%");
    expect(visible).not.toContain("secret");
    expect(visible).toContain("a");
    expect(visibleText("a %%oops\n", ranges("a %%oops\n"))).toContain("%%");
  });

  it("the worked example renders with no Markdown syntax visible", () => {
    const doc =
      "# Project Ideas\n\nI want to build **something useful**.\n\n## Ideas\n\n" +
      "- Build a notes app\n- Build a developer tool\n\n- [ ] Research editor architecture\n";
    const visible = visibleText(doc, ranges(doc));
    for (const syntax of ["#", "**", "- ", "[ ]", "[^", "%%", "| "]) {
      expect(visible).not.toContain(syntax);
    }
    for (const text of ["Project Ideas", "something useful", "Ideas", "notes app", "developer tool", "Research"]) {
      expect(visible).toContain(text);
    }
  });

  it("tasks still collect with any-non-space-checked semantics", () => {
    const { tasks } = ranges("- [ ] a\n- [x] b\n");
    expect(tasks).toHaveLength(2);
    expect(toggleTaskMarkInText("- [ ] a")).toEqual({ from: 3, to: 4, insert: "x" });
  });
});

/** Transaction core: formatting and wikilinks stay pure editor operations. */
describe("single-surface transactions", () => {
  it("bold wrap inserts marks around the selection", () => {
    const state = stateOf("hello\n");
    const res = toggleWrap(state, "**");
    expect(res).not.toBeNull();
  });

  it("wikilinkAt resolves targets, aliases, and embeds at the cursor", () => {
    const doc = "see [[Note]] and [[Other|Alias]] plus ![[pic.png]]\n";
    const state = stateOf(doc);
    expect(wikilinkAt(state, doc.indexOf("Note") + 1)).toBe("Note");
    expect(wikilinkAt(state, doc.indexOf("Alias") + 1)).toBe("Other");
    expect(wikilinkAt(state, doc.indexOf("pic.png") + 1)).toBe("pic.png");
    expect(wikilinkAt(state, 0)).toBeNull();
  });
});
