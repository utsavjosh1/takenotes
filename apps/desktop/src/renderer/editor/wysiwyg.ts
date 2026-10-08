import { EditorSelection, type EditorState, type Extension } from "@codemirror/state";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { parseEmbedFragment, parseEmbedSize } from "@takenotes/core/links/embed-params";

/**
 * Single-surface Markdown WYSIWYG (ADR-0015): the user types into
 * rendered-looking text while the document stays plain Markdown. The
 * user never sees Markdown syntax: structural marks are hidden or
 * replaced by rendered widgets, and formatting flows through shortcuts
 * + the selection bubble (`format.ts`), which write marks behind the
 * scenes.
 *
 * Hidden or replaced (user sees rendered output, never the syntax):
 * `#` heading marks, `*`/`**`/`~~`/inline-`` ` `` marks, `>` quote marks,
 * link/image brackets + URLs (label stays), list markers (`-`/`*`/`+`
 * become bullets, `1.` becomes a computed number, task `- [ ]` becomes
 * a checkbox), table `|` pipes (divider widgets) + delimiter rows,
 * callout `[!type]` openers (type chip), `%%comments%%`, footnote
 * `[^id]` refs (superscript) + definition prefixes, setext underlines
 * (`HeaderMark`), thematic breaks (rule styling).
 *
 * Always visible and editable as code: fenced code fences (``` / ~~~)
 * and code block content. Code spans hide only their backticks.
 *
 * Every widget dispatches a CodeMirror transaction — never a direct
 * filesystem write — so undo/redo, selection mapping, dirty, and
 * autosave stay intact. Full-fidelity static HTML (`renderMarkdown`)
 * is for preview/export contexts only, never a second editing mode.
 */

const HIDDEN_MARKS = new Set([
  "EmphasisMark",
  "StrikethroughMark",
  "SuperscriptMark",
  "SubscriptMark",
  "CodeMark",
  "LinkMark",
  "URL",
  "HeaderMark",
  "QuoteMark",
]);

const HEADING_LINE_CLASS: Record<string, string> = {
  ATXHeading1: "wys-h1",
  ATXHeading2: "wys-h2",
  ATXHeading3: "wys-h3",
  ATXHeading4: "wys-h4",
  ATXHeading5: "wys-h5",
  ATXHeading6: "wys-h6",
};

export type HiddenRange = { from: number; to: number };
export type LineClass = { line: number; cls: string };
export type TaskRange = { markerFrom: number; markerTo: number; checked: boolean; lineNo: number };
/** List marker replaced by a rendered bullet/number (task lines hide it). */
export type BulletRange = { from: number; to: number; ordered: boolean; number: number; depth: number };
/** Single table `|` rendered as a cell divider widget. */
export type PipeRange = { from: number; to: number };
/** Callout `!type` text replaced by a type chip (`[`/`]` already hide). */
export type CalloutRange = { from: number; to: number; type: string };
/** Footnote `[^id]` reference replaced by a superscript widget. */
export type FootnoteRefRange = { from: number; to: number; id: string };
/** Note embed `![[target]]` replaced by a target label (`![[`/`]]` hidden). */
export type EmbedRange = { from: number; to: number; target: string };

export type WysiwygRanges = {
  hide: HiddenRange[];
  lineClasses: LineClass[];
  tasks: TaskRange[];
  bullets: BulletRange[];
  pipes: PipeRange[];
  callouts: CalloutRange[];
  footnoteRefs: FootnoteRefRange[];
  embeds: EmbedRange[];
  /** 1-based source lines carrying an image/media reference. */
  mediaLines: Set<number>;
};

export type WysiwygCollectOptions = {
  /** `false` renders plain source (the `editor.livePreview` kill-switch). */
  livePreview?: boolean;
  /** 1-based lines the selection touches: their marks stay raw (cursor-line reveal). */
  activeLines?: ReadonlySet<number>;
};

export const EMPTY_WYSIWYG_RANGES: WysiwygRanges = {
  hide: [],
  lineClasses: [],
  tasks: [],
  bullets: [],
  pipes: [],
  callouts: [],
  footnoteRefs: [],
  embeds: [],
  mediaLines: new Set<number>(),
};

/** 1-based lines touched by any selection range (cursor-line reveal input). */
export function selectionActiveLines(state: EditorState): Set<number> {
  const out = new Set<number>();
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number;
    const last = state.doc.lineAt(r.to).number;
    for (let l = first; l <= last; l++) out.add(l);
  }
  return out;
}

/** Clipboard text for the current selection: raw markdown source, never the
 * rendered widget text. Multi-range selections join with the doc line break. */
export function rawCopyText(state: EditorState): string {
  const parts: string[] = [];
  for (const r of state.selection.ranges) {
    if (!r.empty) parts.push(state.sliceDoc(r.from, r.to));
  }
  return parts.join(state.lineBreak);
}

/** Task bullets stay visible; only the `[ ]` marker becomes a widget. */
const TASK_LINE = /^(\s*(?:[-*+] |\d+[.)] )\[)([^\]])(\])/;

/** `> [!type]` callout opener (case-insensitive, `+`/`-` fold optional). */
const CALLOUT_OPEN = /^\s*>\s*\[!([A-Za-z0-9_-]+)\]/;

/** Media extensions rendered with an in-editor preview chip (see below). */
const MEDIA_EXT = /\.(mp3|wav|ogg|oga|m4a|flac|aac|opus|mp4|webm|mov|mkv|ogv|m4v|pdf|png|jpe?g|gif|webp|svg|bmp|avif)(?:[?#]|$)/i;

/** `![alt](src)` / `![[src]]` image-or-media source on one line. */
const IMAGE_MD = /![^\n]*?\(\s*(?:<([^>]+)>|(\S+?))\s*(?:"[^"]*"|'[^']*')?\s*\)/;
const WIKILINK_MEDIA = /![[\s]*([^\]|\]]+?)[\s\]|]/;

/** Footnote reference `[^id]` (not a definition) and definition prefix. */
const FOOTNOTE_REF = /\[\^([^\]]+)\]/g;
/** Note embed `![[inner]]` (whole-range replacement shows target). */
const EMBED_WIKILINK = /!\[\[([^\]\n]+)\]\]/g;
const FOOTNOTE_DEF_PREFIX = /^(\s*)\[\^([^\]]+)\]:/;
/** `%%comment%%` — hidden entirely (only complete pairs; unclosed stays). */
const COMMENT_PAIR = /%%[\s\S]*?%%/g;
/** Callout type chip `!type` inside `[!type]`. */
const CALLOUT_CHIP = /\[!([A-Za-z0-9_-]+)\]/;
/** Bullet glyphs cycle with nesting depth. */
const BULLETS = ["\u2022", "\u25E6", "\u25AA"];

const inRanges = (ranges: { from: number; to: number }[], from: number, to: number): boolean =>
  ranges.some((r) => from >= r.from && to <= r.to);

/** Nodes whose text is literal: task syntax inside them stays text. */
const LITERAL_NODES = new Set([
  "InlineCode",
  "FencedCode",
  "CodeBlock",
  "HTMLBlock",
  "Comment",
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "SetextHeading",
]);

/** Pure task-marker toggle over one source line. Returns the edit to apply. */
export function toggleTaskMarkInText(lineText: string): { from: number; to: number; insert: string } | null {
  const m = /^(\s*(?:[-*+] |\d+[.)] )\[)([^\]])(\])/.exec(lineText);
  if (!m) return null;
  const start = m[1]!.length;
  return { from: start, to: start + 1, insert: m[2] === " " ? "x" : " " };
}

/** View-level task toggle by 1-based source line number. */
export function toggleTaskMarkerLine(view: EditorView, lineNo: number): boolean {
  if (lineNo < 1 || lineNo > view.state.doc.lines) return false;
  const line = view.state.doc.line(lineNo);
  const edit = toggleTaskMarkInText(line.text);
  if (!edit) return false;
  view.dispatch({
    changes: { from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert },
    userEvent: "input.checkbox",
  });
  return true;
}

class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly lineNo: number,
  ) {
    super();
  }
  eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.lineNo === this.lineNo;
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = this.checked;
    box.className = "wys-task";
    box.setAttribute("aria-label", "Toggle task");
    box.addEventListener("change", () => {
      toggleTaskMarkerLine(view, this.lineNo);
    });
    return box;
  }
}

/** Pure range collection over `[from, to)`. Structural Markdown syntax
 * is hidden or widget-replaced so the user only ever sees the rendered
 * document; the source stays authoritative underneath. Line-regex passes
 * (tasks, callouts, footnotes, comments, media) are parser-independent
 * so half-typed Markdown while typing never breaks them.
 *
 * Live preview: lines in `opts.activeLines` keep their raw source (cursor-
 * line reveal) — every hide/replace range touching them is dropped, so the
 * cursor can never sit inside hidden text. `livePreview: false` returns
 * empty ranges (plain source). Line classes and additive media previews
 * never hide source, so they apply on all lines. */
export function collectWysiwygRanges(state: EditorState, from: number, to: number, opts?: WysiwygCollectOptions): WysiwygRanges {
  if (opts?.livePreview === false) {
    return { hide: [], lineClasses: [], tasks: [], bullets: [], pipes: [], callouts: [], footnoteRefs: [], embeds: [], mediaLines: new Set<number>() };
  }
  const active = opts?.activeLines;
  const touchesActive = (rfrom: number, rto: number): boolean => {
    if (!active || active.size === 0) return false;
    const first = state.doc.lineAt(Math.max(0, Math.min(rfrom, state.doc.length))).number;
    const last = rfrom >= rto
      ? first
      : state.doc.lineAt(Math.max(0, Math.min(rto - 1, state.doc.length))).number;
    for (let l = first; l <= last; l++) if (active.has(l)) return true;
    return false;
  };
  const hideCandidates: HiddenRange[] = [];
  const lineClasses: LineClass[] = [];
  const tasks: TaskRange[] = [];
  const bullets: BulletRange[] = [];
  const pipes: PipeRange[] = [];
  const callouts: CalloutRange[] = [];
  const footnoteRefs: FootnoteRefRange[] = [];
  const embeds: EmbedRange[] = [];
  const tree = ensureSyntaxTree(state, to, 200) ?? syntaxTree(state);
  const lineOf = (pos: number): number => state.doc.lineAt(Math.max(0, Math.min(pos, state.doc.length))).number;
  const literal: { from: number; to: number }[] = [];
  const fenced: { from: number; to: number }[] = [];
  const inFenced = (pos: number): boolean => fenced.some((r) => pos >= r.from && pos < r.to);
  const listMarks: { from: number; to: number; text: string }[] = [];
  /** ListMark start → rendered item number (ordered lists). */
  const orderedNumbers = new Map<number, number>();
  tree.iterate({
    from,
    to,
    enter: (ref) => {
      if (ref.from >= ref.to) return;
      // Literal ranges gate regex-based hiding; fenced ranges gate
      // CodeMark hiding so ``` fences stay visibly editable as code.
      if (ref.name === "FencedCode") fenced.push({ from: ref.from, to: ref.to });
      if (LITERAL_NODES.has(ref.name)) literal.push({ from: ref.from, to: ref.to });
      const headingCls = HEADING_LINE_CLASS[ref.name];
      if (headingCls) {
        lineClasses.push({ line: lineOf(ref.from), cls: headingCls });
        return;
      }
      if (ref.name === "Blockquote") {
        lineClasses.push({ line: lineOf(ref.from), cls: "wys-quote" });
        return;
      }
      // Ordered lists: number items among direct ListItem siblings so
      // `1. 1. 1.` sources still render 1. 2. 3. Start parses from the
      // first marker (`3.` starts at 3); nested lists recurse naturally.
      if (ref.name === "OrderedList") {
        const items = ref.node.getChildren("ListItem");
        const firstMark = items[0]?.getChildren("ListMark")[0];
        const start = firstMark ? Number(/^\d+/.exec(state.sliceDoc(firstMark.from, firstMark.to))?.[0] ?? 1) : 1;
        items.forEach((item, i) => {
          const mark = item.getChildren("ListMark")[0];
          if (mark) orderedNumbers.set(mark.from, start + i);
        });
        return;
      }
      // List markers render as bullets/numbers below (task lines hide
      // theirs — the checkbox is the marker). Collected here, resolved
      // against task lines in the line pass.
      if (ref.name === "ListMark") {
        listMarks.push({ from: ref.from, to: ref.to, text: state.sliceDoc(ref.from, ref.to) });
        return;
      }
      // Tables: header/row lines earn structure classes; every `|` pipe
      // becomes a divider widget and delimiter-row dashes/colons hide,
      // so the user sees structured cells, never raw table syntax.
      if (ref.name === "TableHeader") {
        lineClasses.push({ line: lineOf(ref.from), cls: "wys-table-head" });
        return;
      }
      if (ref.name === "TableRow") {
        lineClasses.push({ line: lineOf(ref.from), cls: "wys-table-row" });
        return;
      }
      if (ref.name === "TableDelimiter") {
        const text = state.sliceDoc(ref.from, ref.to);
        for (let i = 0; i < text.length; i++) {
          const ch = text[i]!;
          if (ch === "|") pipes.push({ from: ref.from + i, to: ref.from + i + 1 });
          else if (ch !== "\n") hideCandidates.push({ from: ref.from + i, to: ref.from + i + 1 });
        }
        if (ref.node.parent?.name === "Table") {
          lineClasses.push({ line: lineOf(ref.from), cls: "wys-table-delim" });
        }
        return;
      }
      // Fenced blocks: one class for the whole span; fences stay visible.
      if (ref.name === "FencedCode" || ref.name === "CodeBlock") {
        const first = lineOf(ref.from);
        const last = lineOf(Math.max(ref.from, ref.to - 1));
        for (let n = first; n <= last; n++) lineClasses.push({ line: n, cls: "wys-codeblock" });
        return;
      }
      if (ref.name === "HorizontalRule") {
        // The rule line hides its `---`/`***` text; the line class draws
        // the visible rule, so the user sees a divider, never syntax.
        lineClasses.push({ line: lineOf(ref.from), cls: "wys-hr" });
        hideCandidates.push({ from: ref.from, to: ref.to });
        return;
      }
      // Images/media: the markdown line earns a class; the label shows
      // (bracket marks + URL hide like links) and a preview renders as
      // an additive block widget below — source never replaced.
      if (ref.name === "Image") {
        lineClasses.push({ line: lineOf(ref.from), cls: "wys-media" });
      }
      if (!HIDDEN_MARKS.has(ref.name)) return;
      // Fence backticks/tilde rows are structural code syntax: keep them.
      if (ref.name === "CodeMark" && inFenced(ref.from)) return;
      // A bare/GFM-autolinked URL is itself the visible text — hide a URL
      // only when its link also carries bracket marks to hide.
      // ("URL" is in HIDDEN_MARKS so this branch is reachable; the guard
      // below keeps bare URLs visible.)
      if (ref.name === "URL") {
        const parent = ref.node.parent;
        if (!parent || (parent.name !== "Link" && parent.name !== "Image")) return;
        if (parent.getChildren("LinkMark").length === 0) return;
      }
      hideCandidates.push({ from: ref.from, to: ref.to });
    },
  });
  const firstLine = lineOf(from);
  const lastLine = lineOf(Math.max(from, to - 1));
  const mediaLines = new Set<number>();
  const taskLines = new Set<number>();
  // Definition prefixes and footnote bodies hide as whole ranges
  // (comments below join them). Overlaps resolve in the sweep at the
  // end: CodeMirror forbids overlapping replaces, so every range must
  // be disjoint before it leaves this function.
  const ownedHides: HiddenRange[] = [];
  for (let lineNo = firstLine; lineNo <= lastLine; lineNo++) {
    if (lineNo < 1 || lineNo > state.doc.lines) continue;
    const line = state.doc.line(lineNo);
    const lineInCode = line.from >= 0 && fenced.some((r) => line.from >= r.from && line.to <= r.to);
    // Tasks (any non-space = done). The `[ ]` marker becomes a checkbox
    // widget; the line's list marker hides with it.
    const m = TASK_LINE.exec(line.text);
    if (m) {
      const markerFrom = line.from + m[1]!.length;
      const markerTo = markerFrom + 1;
      if (!inRanges(literal, markerFrom, markerTo)) {
        tasks.push({ markerFrom, markerTo, checked: m[2] !== " ", lineNo });
        taskLines.add(lineNo);
      }
    }
    // Callout opener tags its line; the `!type` text becomes a type chip
    // (the `[`/`]` brackets already hide as link marks).
    const callout = CALLOUT_OPEN.exec(line.text);
    if (callout && line.text.trimStart().startsWith(">") && !lineInCode) {
      lineClasses.push({ line: lineNo, cls: "wys-callout" });
      lineClasses.push({ line: lineNo, cls: `wys-callout-${callout[1]!.toLowerCase()}` });
      const chip = CALLOUT_CHIP.exec(line.text);
      if (chip?.index !== undefined) {
        const chipFrom = line.from + chip.index + 1;
        const chipTo = chipFrom + chip[1]!.length + 1;
        callouts.push({ from: chipFrom, to: chipTo, type: chip[1]!.toLowerCase() });
      }
    }
    // Footnote definitions hide their `[^id]:` prefix; the body stays
    // editable text.
    const def = FOOTNOTE_DEF_PREFIX.exec(line.text);
    if (def && !inRanges(literal, line.from, line.to)) {
      const preLen = def[1]!.length;
      const prefixFrom = line.from + preLen;
      const prefixTo = prefixFrom + def[0].length - preLen;
      ownedHides.push({ from: prefixFrom, to: prefixTo });
      lineClasses.push({ line: lineNo, cls: "wys-footnote-def" });
    } else if (!lineInCode) {
      // Footnote references become superscript widgets showing the id.
      FOOTNOTE_REF.lastIndex = 0;
      let ref: RegExpExecArray | null;
      while ((ref = FOOTNOTE_REF.exec(line.text)) !== null) {
        const refFrom = line.from + ref.index;
        const refTo = refFrom + ref[0].length;
        if (inRanges(literal, refFrom, refTo)) continue;
        footnoteRefs.push({ from: refFrom, to: refTo, id: ref[1]! });
      }
    }
    // Note embeds `![[target]]` show the target label (`![[`/`]]` hidden
    // via the whole-range replacement below). Skip code/literal spans.
    if (!lineInCode) {
      EMBED_WIKILINK.lastIndex = 0;
      let em: RegExpExecArray | null;
      while ((em = EMBED_WIKILINK.exec(line.text)) !== null) {
        const emFrom = line.from + em.index;
        const emTo = emFrom + em[0].length;
        if (inRanges(literal, emFrom, emTo)) continue;
        const inner = em[1] ?? "";
        const target = inner.split("|")[0]!.split("#")[0]!.trim() || inner.trim();
        if (!target) continue;
        embeds.push({ from: emFrom, to: emTo, target });
      }
    }
    // Media/embed source lines earn a preview block below the source.
    if (!lineInCode) {
      const imgSrc = mediaSrcOnLine(line.text);
      if (imgSrc && MEDIA_EXT.test(imgSrc)) mediaLines.add(lineNo);
    }
  }
  // `%%comments%%` hide entirely (complete pairs only — unclosed stays
  // visible while typing). Comment bodies are plain text to the parser,
  // so inner mark-hides resolve against them in the sweep below.
  COMMENT_PAIR.lastIndex = 0;
  const viewportText = state.sliceDoc(from, to);
  let comment: RegExpExecArray | null;
  while ((comment = COMMENT_PAIR.exec(viewportText)) !== null) {
    const cFrom = from + comment.index;
    const cTo = cFrom + comment[0].length;
    if (inRanges(literal, cFrom, cTo)) continue;
    ownedHides.push({ from: cFrom, to: cTo });
  }
  // Resolve list markers: task lines hide theirs, others render.
  for (const mark of listMarks) {
    const lineNo = lineOf(mark.from);
    if (taskLines.has(lineNo)) {
      hideCandidates.push({ from: mark.from, to: mark.to });
      continue;
    }
    const ordered = /^\d+[.)]$/.test(mark.text);
    const line = state.doc.line(lineNo);
    const indent = /^\s*/.exec(line.text)?.[0].replace(/\t/g, "    ").length ?? 0;
    bullets.push({
      from: mark.from,
      to: mark.to,
      ordered,
      number: ordered ? (orderedNumbers.get(mark.from) ?? Number(/^\d+/.exec(mark.text)?.[0] ?? 1)) : 0,
      depth: Math.floor(indent / 2),
    });
  }
  // Overlap sweep: every replace range leaving this function is disjoint
  // (CodeMirror throws on overlapping replaces — e.g. a LinkMark hide
  // partially covering a footnote-ref widget inside an image label).
  // Priority: whole-range hides win, then widgets by rank (tasks first),
  // then mark-hides. Hides share one decoration, so overlapping pairs
  // merge. Active lines reveal everything, including task checkboxes.
  type Ranked = { from: number; to: number; rank: number };
  const sweepSpans = <T extends Ranked>(spans: T[]): T[] => {
    const sorted = spans.slice().sort((a, b) => a.from - b.from || a.rank - b.rank);
    const kept: T[] = [];
    for (const cur of sorted) {
      const last = kept[kept.length - 1];
      if (!last || cur.from >= last.to) kept.push(cur);
      else if (cur.rank < last.rank) kept[kept.length - 1] = cur;
    }
    return kept;
  };
  const mergeSpans = (spans: { from: number; to: number }[]): HiddenRange[] => {
    const sorted = spans.slice().sort((a, b) => a.from - b.from || a.to - b.to);
    const out: HiddenRange[] = [];
    for (const s of sorted) {
      const last = out[out.length - 1];
      if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
      else out.push({ from: s.from, to: s.to });
    }
    return out;
  };
  const blocked = (rfrom: number, rto: number): boolean =>
    ownedHides.some((o) => rfrom < o.to && rto > o.from) || touchesActive(rfrom, rto);
  type WidgetKey = { kind: "task" | "fnref" | "callout" | "bullet" | "pipe" | "embed"; index: number };
  const rankedWidgets: (Ranked & WidgetKey)[] = [
    ...tasks.map((t, index) => ({ from: t.markerFrom, to: t.markerTo, rank: 0, kind: "task" as const, index })),
    ...footnoteRefs.map((f, index) => ({ from: f.from, to: f.to, rank: 1, kind: "fnref" as const, index })),
    ...embeds.map((e, index) => ({ from: e.from, to: e.to, rank: 1, kind: "embed" as const, index })),
    ...callouts.map((c, index) => ({ from: c.from, to: c.to, rank: 2, kind: "callout" as const, index })),
    ...bullets.map((b, index) => ({ from: b.from, to: b.to, rank: 3, kind: "bullet" as const, index })),
    ...pipes.map((p, index) => ({ from: p.from, to: p.to, rank: 4, kind: "pipe" as const, index })),
  ].filter((w) => !blocked(w.from, w.to));
  const keptWidgets = sweepSpans(rankedWidgets);
  const kept = (kind: WidgetKey["kind"], index: number): boolean =>
    keptWidgets.some((w) => w.kind === kind && w.index === index);
  const hide = mergeSpans([
    ...ownedHides.filter((h) => !touchesActive(h.from, h.to)),
    ...hideCandidates.filter(
      (h) => !touchesActive(h.from, h.to) && !keptWidgets.some((w) => h.from < w.to && h.to > w.from),
    ),
  ]);
  return {
    hide,
    lineClasses,
    tasks: tasks.filter((_, i) => kept("task", i)),
    bullets: bullets.filter((_, i) => kept("bullet", i)),
    pipes: pipes.filter((_, i) => kept("pipe", i)),
    callouts: callouts.filter((_, i) => kept("callout", i)),
    footnoteRefs: footnoteRefs.filter((_, i) => kept("fnref", i)),
    embeds: embeds.filter((_, i) => kept("embed", i)),
    mediaLines,
  };
}

/** Media source URL on one source line, if it carries an image/media ref. */
export function mediaSrcOnLine(lineText: string): string | null {
  const img = IMAGE_MD.exec(lineText);
  if (img) return (img[1] ?? img[2] ?? "").trim() || null;
  const wiki = WIKILINK_MEDIA.exec(lineText);
  if (wiki) return wiki[1]!.trim() || null;
  return null;
}

/** `![[target|alias]]` target + alias slots on one source line (either may
 * be absent — markdown `![alt](src)` images carry no display params). */
const WIKILINK_EMBED_PARTS = /!\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|([^\]\n]*))?\]\]/;

/** Display dimensions for an embed line (`|100x145` alias slot and/or
 * `#height=` fragment; fragment height wins a conflict). Null when the
 * line carries no params — the preview renders at natural size. Computed
 * at widget-creation time from live doc text, so no range-shape change. */
export function mediaDimsOnLine(lineText: string): { width?: number; height?: number } | null {
  const m = WIKILINK_EMBED_PARTS.exec(lineText);
  if (!m) return null;
  const size = parseEmbedSize(m[2]);
  const frag = /#([^\]\n|]*)/.exec(m[0]);
  const fragHeight = parseEmbedFragment(frag?.[1])?.height;
  // Fragment height wins a conflict; width comes from the alias slot only.
  const width = size?.width;
  const height = fragHeight ?? size?.height;
  if (width === undefined && height === undefined) return null;
  return { ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }) };
}

const hideDeco = Decoration.replace({});

/** Click-to-edit: a plain click on a rendered widget puts the caret at the
 * matching source position instead of landing adjacent to it. Modifier
 * clicks pass through (Ctrl/Cmd+click on wikilinks opens the note via the
 * pane-level handler). Checkbox widgets are excluded — they toggle. */
function clickToEdit(el: HTMLElement, view: EditorView, pos: number): void {
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    // preventDefault tells CodeMirror to skip its own cursor placement;
    // the event still bubbles to pane-level handlers (hover-clear, etc.).
    e.preventDefault();
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  });
}

/** Rendered list marker: bullet (depth-cycled) or computed item number.
 * Replaces the source marker so the user sees a list, never `-`/`1.`.
 * Deleting it removes the source marker — the line becomes a paragraph,
 * which is the natural rich-text behavior. */
class ListMarkerWidget extends WidgetType {
  constructor(
    readonly ordered: boolean,
    readonly number: number,
    readonly depth: number,
    /** Source offset of the replaced marker (click-to-edit target). */
    readonly pos: number,
  ) {
    super();
  }
  eq(other: ListMarkerWidget): boolean {
    return other.ordered === this.ordered && other.number === this.number && other.depth === this.depth && other.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("span");
    if (this.ordered) {
      el.className = "wys-olist-num";
      el.textContent = `${this.number}.`;
    } else {
      el.className = "wys-bullet";
      el.textContent = BULLETS[this.depth % BULLETS.length]!;
    }
    clickToEdit(el, view, this.pos);
    return el;
  }
}

/** Table cell divider: replaces one source `|` so the user sees cell
 * structure, never pipes. Cell text stays fully editable around it. */
class PipeWidget extends WidgetType {
  constructor(readonly pos: number) {
    super();
  }
  eq(other: PipeWidget): boolean {
    return other.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("span");
    el.className = "wys-pipe";
    clickToEdit(el, view, this.pos);
    return el;
  }
}

/** Callout type chip: replaces `!type` (brackets already hide) with a
 * labeled pill. Deleting it drops the type — the block stays a quote. */
class CalloutChipWidget extends WidgetType {
  constructor(
    readonly type: string,
    readonly pos: number,
  ) {
    super();
  }
  eq(other: CalloutChipWidget): boolean {
    return other.type === this.type && other.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("span");
    el.className = "wys-callout-chip";
    el.textContent = this.type;
    el.setAttribute("aria-label", `Callout: ${this.type}`);
    clickToEdit(el, view, this.pos);
    return el;
  }
}

/** Footnote reference: replaces `[^id]` with a superscript id label.
 * Deleting it removes the reference from the source. */
class FootnoteRefWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly pos: number,
  ) {
    super();
  }
  eq(other: FootnoteRefWidget): boolean {
    return other.id === this.id && other.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("sup");
    el.className = "wys-fnref";
    el.textContent = this.id;
    el.setAttribute("aria-label", `Footnote ${this.id}`);
    clickToEdit(el, view, this.pos);
    return el;
  }
}

/** Note embed: replaces `![[target]]` with a target label.
 * Deleting it removes the embed from the source. */
class EmbedWidget extends WidgetType {
  constructor(
    readonly target: string,
    readonly pos: number,
  ) {
    super();
  }
  eq(other: EmbedWidget): boolean {
    return other.target === this.target && other.pos === this.pos;
  }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("span");
    el.className = "wys-embed";
    el.textContent = this.target;
    el.setAttribute("aria-label", `Embed ${this.target}`);
    clickToEdit(el, view, this.pos);
    return el;
  }
}

/** Apply embed display dims (`|100x145`, `#height=`) as element size.
 * Images and video honor both; audio/PDF previews ignore them. */
function applyDims(el: HTMLElement, dims: { width?: number; height?: number } | undefined): void {
  if (!dims) return;
  if (dims.width !== undefined) el.style.width = `${dims.width}px`;
  if (dims.height !== undefined) el.style.height = `${dims.height}px`;
}

/** Additive preview below an image/media source line. The Markdown stays
 * fully editable above; this block never replaces source, so cursor,
 * selection, and undo are unaffected. Remote URLs never load: only
 * relative local paths preview (same-root images); anything else shows
 * a neutral label chip. */
class MediaPreviewWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly dims?: { width?: number; height?: number },
  ) {
    super();
  }
  eq(other: MediaPreviewWidget): boolean {
    return other.src === this.src && other.dims?.width === this.dims?.width && other.dims?.height === this.dims?.height;
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "wys-media-preview";
    wrap.contentEditable = "false";
    if (/^(https?:|data:|blob:|javascript:|vbscript:)/i.test(this.src) || this.src.startsWith("/")) {
      wrap.textContent = `\u{1F5BC} ${this.src}`;
      return wrap;
    }
    const kind = MEDIA_EXT.exec(this.src)?.[1]?.toLowerCase() ?? "";
    if (["mp3", "wav", "ogg", "oga", "m4a", "flac", "aac", "opus"].includes(kind)) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = this.src;
      wrap.appendChild(audio);
      return wrap;
    }
    if (["mp4", "webm", "mov", "mkv", "ogv", "m4v"].includes(kind)) {
      const video = document.createElement("video");
      video.controls = true;
      video.preload = "metadata";
      video.src = this.src;
      applyDims(video, this.dims);
      wrap.appendChild(video);
      return wrap;
    }
    if (kind === "pdf") {
      const label = document.createElement("span");
      label.textContent = `\u{1F5CE} ${this.src}`;
      wrap.appendChild(label);
      return wrap;
    }
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = "";
    img.loading = "lazy";
    applyDims(img, this.dims);
    img.addEventListener("error", () => {
      wrap.textContent = `\u{1F5BC} ${this.src}`;
    });
    wrap.appendChild(img);
    return wrap;
  }
}

/** Copy/cut yield raw markdown source, never rendered widget text.
 * Empty selections fall through to the default line-copy behavior. */
function rawClipboardHandlers(): Extension {
  const textOf = (view: EditorView): string | null => {
    const text = rawCopyText(view.state);
    return text ? text : null;
  };
  return EditorView.domEventHandlers({
    copy(e: ClipboardEvent, view: EditorView): boolean {
      const text = textOf(view);
      if (text === null || !e.clipboardData) return false;
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
      return true;
    },
    cut(e: ClipboardEvent, view: EditorView): boolean {
      const text = textOf(view);
      if (text === null || !e.clipboardData) return false;
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
      view.dispatch(
        view.state.changeByRange((r) =>
          r.empty ? { range: r } : { changes: { from: r.from, to: r.to }, range: EditorSelection.cursor(r.from) },
        ),
      );
      return true;
    },
  });
}

export function buildWysiwygDecorations(view: EditorView, opts?: { livePreview?: boolean }): DecorationSet {
  if (opts?.livePreview === false) return Decoration.none;
  const state = view.state;
  const ranges = collectWysiwygRanges(state, view.viewport.from, view.viewport.to, {
    activeLines: selectionActiveLines(state),
  });
  type Op = { from: number; to: number; value: Decoration };
  const ops: Op[] = [];
  for (const h of ranges.hide) ops.push({ from: h.from, to: h.to, value: hideDeco });
  for (const b of ranges.bullets) {
    ops.push({
      from: b.from,
      to: b.to,
      value: Decoration.replace({ widget: new ListMarkerWidget(b.ordered, b.number, b.depth, b.from) }),
    });
  }
  for (const p of ranges.pipes) {
    ops.push({ from: p.from, to: p.to, value: Decoration.replace({ widget: new PipeWidget(p.from) }) });
  }
  for (const c of ranges.callouts) {
    ops.push({
      from: c.from,
      to: c.to,
      value: Decoration.replace({ widget: new CalloutChipWidget(c.type, c.from) }),
    });
  }
  for (const f of ranges.footnoteRefs) {
    ops.push({
      from: f.from,
      to: f.to,
      value: Decoration.replace({ widget: new FootnoteRefWidget(f.id, f.from) }),
    });
  }
  for (const e of ranges.embeds) {
    ops.push({
      from: e.from,
      to: e.to,
      value: Decoration.replace({ widget: new EmbedWidget(e.target, e.from) }),
    });
  }
  for (const t of ranges.tasks) {
    ops.push({
      from: t.markerFrom,
      to: t.markerTo,
      value: Decoration.replace({ widget: new TaskWidget(t.checked, t.lineNo) }),
    });
  }
  for (const l of ranges.lineClasses) {
    if (l.line < 1 || l.line > state.doc.lines) continue;
    const pos = state.doc.line(l.line).from;
    ops.push({ from: pos, to: pos, value: Decoration.line({ class: l.cls }) });
  }
  // Media previews: additive block widgets at end of the source line.
  // Dims parse from live text (no range-shape change); `eq` covers them
  // so resizing the params rebuilds the preview.
  for (const lineNo of ranges.mediaLines) {
    if (lineNo < 1 || lineNo > state.doc.lines) continue;
    const line = state.doc.line(lineNo);
    const src = mediaSrcOnLine(line.text);
    if (!src) continue;
    ops.push({ from: line.to, to: line.to, value: Decoration.widget({ widget: new MediaPreviewWidget(src, mediaDimsOnLine(line.text) ?? undefined), side: 1, block: true }) });
  }
  ops.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const op of ops) builder.add(op.from, op.to, op.value);
  return builder.finish();
}

/** Live-Markdown WYSIWYG extension: hidden marks + task widgets.
 *
 * Cursor-line reveal: decorations rebuild on selection movement so the
 * touched lines show raw source — arrows/Home/End can never strand the
 * cursor inside hidden text, because landing on a line reveals it.
 * Decoration rebuilds pause during IME composition so the composition
 * session is never disturbed. Pass `{ livePreview: false }` for plain
 * source (the `editor.livePreview` kill-switch). */
export function wysiwyg(opts?: { livePreview?: boolean }): Extension {
  const enabled = opts?.livePreview !== false;
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = enabled ? buildWysiwygDecorations(view) : Decoration.none;
      }
      update(update: ViewUpdate): void {
        if (!enabled) return;
        // IME composition owns the DOM mid-composition; rebuilding
        // decorations underneath it breaks the session. The next
        // non-composing update rebuilds from the settled document.
        if (update.view.composing) return;
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          syntaxTree(update.state) !== syntaxTree(update.startState)
        ) {
          this.decorations = buildWysiwygDecorations(update.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
  return [plugin, rawClipboardHandlers()];
}