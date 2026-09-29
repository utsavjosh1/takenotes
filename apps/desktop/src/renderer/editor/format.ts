import type { ChangeSpec, EditorState, SelectionRange } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

/**
 * Formatting engine for the Markdown-backed WYSIWYG editor: shortcuts and
 * the selection bubble call these, and they write Markdown marks behind the
 * user's back. The user never sees or types the syntax.
 *
 * Pure core (`toggleWrap`, line toggles, link helpers) operates on
 * `EditorState` and is headless-tested; thin `cmd*` wrappers dispatch.
 */

export type FormatResult = {
  changes: ChangeSpec[];
  /** Explicit post-selection; omitted → the editor maps it automatically. */
  selection?: { anchor: number; head: number };
};

function mainSel(state: EditorState): SelectionRange {
  return state.selection.main;
}

/** Wrap/unwrap `mark` (`**`, `*`, `~~`, `` ` ``) around the main selection. */
export function toggleWrap(state: EditorState, mark: string): FormatResult {
  const { from, to } = mainSel(state);
  const m = mark.length;
  if (from === to) {
    const before = state.sliceDoc(Math.max(0, from - m), from);
    const after = state.sliceDoc(to, to + m);
    if (before === mark && after === mark) {
      return {
        changes: [
          { from: from - m, to: from },
          { from: to, to: to + m },
        ],
        selection: { anchor: from - m, head: to - m },
      };
    }
    return { changes: [{ from, insert: mark + mark }], selection: { anchor: from + m, head: from + m } };
  }
  const text = state.sliceDoc(from, to);
  if (text.length >= 2 * m && text.startsWith(mark) && text.endsWith(mark)) {
    return {
      changes: [
        { from, to: from + m },
        { from: to - m, to },
      ],
      selection: { anchor: from, head: to - 2 * m },
    };
  }
  const before = state.sliceDoc(Math.max(0, from - m), from);
  const after = state.sliceDoc(to, to + m);
  if (before === mark && after === mark) {
    return {
      changes: [
        { from: from - m, to: from },
        { from: to, to: to + m },
      ],
      selection: { anchor: from - m, head: to - m },
    };
  }
  return {
    changes: [{ from, insert: mark }, { from: to, insert: mark }],
    selection: { anchor: from + m, head: to + m },
  };
}

/** Lines spanned by the main selection (a selection ending exactly at a
 * line start excludes that line). */
function blockRange(state: EditorState): { first: number; last: number } {
  const { from, to } = mainSel(state);
  const first = state.doc.lineAt(from).number;
  let last = state.doc.lineAt(Math.max(from, to)).number;
  if (to > from) {
    const endLine = state.doc.lineAt(to);
    if (to === endLine.from) last = endLine.number - 1;
  }
  return { first, last: Math.max(first, last) };
}

/** Applies a line transform over the selected lines (exported for tests). */
export function mapBlockLines(state: EditorState, fn: (text: string) => string | null): FormatResult | null {
  const { first, last } = blockRange(state);
  const changes: ChangeSpec[] = [];
  for (let n = first; n <= last; n++) {
    if (n < 1 || n > state.doc.lines) continue;
    const line = state.doc.line(n);
    const next = fn(line.text);
    if (next !== null && next !== line.text) changes.push({ from: line.from, to: line.to, insert: next });
  }
  return changes.length > 0 ? { changes } : null;
}

const LIST_MARK = /^(\s*)(?:([-*+]|\d+[.)])\s+)(\[[^\]]\]\s+)?/;

function indentOf(text: string): string {
  return /^\s*/.exec(text)?.[0] ?? "";
}

/** `- ` toggle: `- [x]` drops its box to `-`; plain `-` strips to text;
 * `*`/`+`/numbers convert to `-`; plain lines gain `- `. */
export function toggleBulletLine(text: string): string | null {
  const m = LIST_MARK.exec(text);
  if (m) {
    if (m[3]) return m[1] + "- " + text.slice(m[0].length);
    if (m[2] === "-") return m[1] + text.slice(m[0].length);
    return m[1] + "- " + text.slice(m[0].length);
  }
  const ind = indentOf(text);
  return ind + "- " + text.slice(ind.length);
}

/** `1. ` toggle: converts bullets, strips numbers, else inserts `1. `. */
export function toggleOrderedLine(text: string): string | null {
  const m = LIST_MARK.exec(text);
  if (m) {
    if (/^\d+[.)]$/.test(m[2]!)) return m[1] + text.slice(m[0].length);
    return `${m[1]}1. ` + text.slice(m[0].length);
  }
  const ind = indentOf(text);
  return `${ind}1. ` + text.slice(ind.length);
}

/** Task toggle: task → bullet, bullet/numbered → task, plain → task. */
export function toggleTaskLine(text: string): string | null {
  const m = LIST_MARK.exec(text);
  if (m) {
    if (m[3]) return m[1] + "- " + text.slice(m[0].length);
    return m[1] + "- [ ] " + text.slice(m[0].length);
  }
  const ind = indentOf(text);
  return ind + "- [ ] " + text.slice(ind.length);
}

/** Heading cycle per line: paragraph → H1 → H2 → H3 → paragraph. */
export function cycleHeadingLine(text: string): string | null {
  const m = /^(#{1,6})\s/.exec(text);
  if (!m) return "# " + text;
  const level = m[1]!.length;
  if (level >= 3) return text.slice(m[0].length);
  return "#".repeat(level + 1) + " " + text.slice(m[0].length);
}

/** `> ` quote toggle (outermost level). */
export function toggleQuoteLine(text: string): string | null {
  const m = /^(\s*)> ?/.exec(text);
  if (m) return m[1] + text.slice(m[0].length);
  const ind = indentOf(text);
  return ind + "> " + text.slice(ind.length);
}

export type LinkTarget = {
  labelFrom: number;
  labelTo: number;
  urlFrom: number;
  urlTo: number;
  url: string;
};

/** Wikilink (`[[target]]` / `[[target|alias]]` / `![[embed]]`) whose
 * brackets contain `pos`. Parser-independent (Lezer treats them as
 * generic links), so Ctrl/Cmd+click navigation works while typing.
 * Returns the raw target (before `|`, `#`, `^` are kept for the
 * resolver — it already handles aliases/headings/blocks). */
export function wikilinkAt(state: EditorState, pos: number): string | null {
  const safe = Math.max(0, Math.min(pos, state.doc.length));
  const line = state.doc.lineAt(safe);
  const offset = safe - line.from;
  const re = /!?\[\[([^\]\n]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text)) !== null) {
    if (offset >= m.index && offset <= m.index + m[0].length) {
      const inner = m[1]!.split("|")[0]!.trim();
      return inner || null;
    }
  }
  return null;
}

/** Link (or image) whose label contains `pos`, for URL editing. */
export function linkAt(state: EditorState, pos: number): LinkTarget | null {
  const safe = Math.max(0, Math.min(pos, state.doc.length));
  const tree = ensureSyntaxTree(state, safe, 100) ?? syntaxTree(state);
  let link: SyntaxNode | null = null;
  let node: SyntaxNode | null = tree.resolveInner(safe, -1);
  while (node) {
    if (node.name === "Link" || node.name === "Image") {
      link = node;
      break;
    }
    node = node.parent;
  }
  const cur = link;
  if (!cur) return null;
  const marks = cur.getChildren("LinkMark");
  const urls = cur.getChildren("URL");
  if (marks.length < 2 || urls.length === 0) return null;
  const labelFrom = marks[0]!.to;
  const labelTo = marks[1]!.from;
  if (safe < labelFrom || safe > labelTo) return null;
  const url = urls[0]!;
  return { labelFrom, labelTo, urlFrom: url.from, urlTo: url.to, url: state.sliceDoc(url.from, url.to) };
}

/** Link command: wraps the selection as `[text](url)` with `url` selected
 * for immediate typing; on a collapsed cursor inside a link label it
 * selects the existing URL instead. */
export function fmtLink(state: EditorState): FormatResult {
  const { from, to } = mainSel(state);
  if (from === to) {
    const link = linkAt(state, from);
    if (link) return { changes: [], selection: { anchor: link.urlFrom, head: link.urlTo } };
    return { changes: [{ from, insert: "[](url)" }], selection: { anchor: from + 3, head: from + 6 } };
  }
  return {
    changes: [{ from, insert: "[" }, { from: to, insert: "](url)" }],
    selection: { anchor: to + 3, head: to + 6 },
  };
}

/** Pure URL rewrite for the link whose label contains `labelPos`. */
export function linkUrlEdit(state: EditorState, labelPos: number, url: string): { from: number; to: number; insert: string } | null {
  const link = linkAt(state, labelPos);
  if (!link) return null;
  return { from: link.urlFrom, to: link.urlTo, insert: url };
}

function runFormat(view: EditorView, fn: (state: EditorState) => FormatResult | null): boolean {
  const res = fn(view.state);
  if (!res) return false;
  view.dispatch(
    view.state.update({
      changes: res.changes,
      selection: res.selection ? { anchor: res.selection.anchor, head: res.selection.head } : undefined,
      userEvent: "input.format",
    }),
  );
  return true;
}

export const cmdBold = (view: EditorView): boolean => runFormat(view, (s) => toggleWrap(s, "**"));
export const cmdItalic = (view: EditorView): boolean => runFormat(view, (s) => toggleWrap(s, "*"));
export const cmdStrike = (view: EditorView): boolean => runFormat(view, (s) => toggleWrap(s, "~~"));
export const cmdCode = (view: EditorView): boolean => runFormat(view, (s) => toggleWrap(s, "`"));
export const cmdLink = (view: EditorView): boolean => runFormat(view, fmtLink);
export const cmdBullet = (view: EditorView): boolean => runFormat(view, (s) => mapBlockLines(s, toggleBulletLine));
export const cmdOrdered = (view: EditorView): boolean => runFormat(view, (s) => mapBlockLines(s, toggleOrderedLine));
export const cmdTask = (view: EditorView): boolean => runFormat(view, (s) => mapBlockLines(s, toggleTaskLine));
export const cmdHeading = (view: EditorView): boolean => runFormat(view, (s) => mapBlockLines(s, cycleHeadingLine));
export const cmdQuote = (view: EditorView): boolean => runFormat(view, (s) => mapBlockLines(s, toggleQuoteLine));

export function applyLinkUrl(view: EditorView, labelPos: number, url: string): boolean {
  const edit = linkUrlEdit(view.state, labelPos, url);
  if (!edit) return false;
  view.dispatch(view.state.update({ changes: edit, userEvent: "input.format" }));
  return true;
}
