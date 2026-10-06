import { EditorState, RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, ViewUpdate, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { search, searchKeymap } from "@codemirror/search";
import { wysiwyg } from "./wysiwyg";
import {
  cmdBold,
  cmdBullet,
  cmdCode,
  cmdHeading,
  cmdItalic,
  cmdLink,
  cmdOrdered,
  cmdQuote,
  cmdStrike,
  cmdTask,
} from "./format";
import { HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export type EditorSession = {
  view: EditorView;
  getContent(): string;
  destroy(): void;
};

export type EditorOptions = {
  lineNumbers: boolean;
  wordWrap: boolean;
  /** Live preview (default on). Off renders plain markdown source. */
  livePreview?: boolean;
  onChange: (content: string) => void;
  onCursor?: (line: number, col: number) => void;
  /** Selection/focus changes for the floating format bubble. */
  onSelectionActivity?: (view: EditorView) => void;
};

/** Indent guides (Step 1 editor basics): one hairline per 2-column
 * indentation level, drawn on the whitespace itself so guides track
 * wrapping and variable fonts without layout math. A tab always ends a
 * level. Pure decoration — never touches the document. */
function indentGuides(): Extension {
  const guide = Decoration.mark({ class: "cm-indent-guide" });
  const build = (view: EditorView) => {
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = view.state.doc.lineAt(pos);
        let col = 0;
        for (let idx = 0; idx < line.text.length; idx++) {
          const ch = line.text[idx];
          if (ch !== " " && ch !== "\t") break;
          col = ch === "\t" ? Math.floor(col / 2) * 2 + 2 : col + 1;
          if (col % 2 === 0) builder.add(line.from + idx, line.from + idx + 1, guide);
        }
        pos = line.to + 1;
      }
    }
    return builder.finish();
  };
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) this.decorations = build(update.view);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

/** Single-surface WYSIWYG Markdown editor (ADR-0015). CodeMirror owns
 * document/undo/selection; React only mounts the DOM node and receives
 * change/cursor callbacks. There is no read/edit mode: this one instance
 * lives for the lifetime of the open document (settings changes remount,
 * mode switches do not exist). */
export function createEditor(parent: HTMLElement, initialContent: string, opts: EditorOptions): EditorSession {
  // Single-surface clean source: markdown works behind the text while the
  // surface reads like normal prose. Inline marks (#, *, -, >, [, ]) hide
  // via wysiwyg.ts replace decorations; fenced code fences always stay
  // visible so code blocks remain editable as code. Content carries the
  // emphasis (sized headings, bold, italic, links, quotes, code).
  const highlight = HighlightStyle.define([
    { tag: tags.heading1, class: "tok-heading tok-h1" },
    { tag: tags.heading2, class: "tok-heading tok-h2" },
    { tag: tags.heading3, class: "tok-heading tok-h3" },
    { tag: tags.heading4, class: "tok-heading tok-h4" },
    { tag: tags.heading5, class: "tok-heading tok-h5" },
    { tag: tags.heading6, class: "tok-heading tok-h6" },
    { tag: tags.strong, class: "tok-strong" },
    { tag: tags.emphasis, class: "tok-em" },
    { tag: tags.strikethrough, class: "tok-strike" },
    { tag: tags.monospace, class: "tok-code" },
    { tag: tags.link, class: "tok-link" },
    { tag: tags.url, class: "tok-link" },
    { tag: [tags.meta, tags.processingInstruction, tags.comment], class: "tok-meta" },
    { tag: tags.list, class: "tok-meta" },
    { tag: tags.quote, class: "tok-quote" },
  ]);

  const theme = EditorView.theme(
    {
      "&": { backgroundColor: "transparent", color: "var(--text-primary)" },
      ".cm-content": {
        fontFamily: "var(--font-editor)",
        caretColor: "var(--accent)",
        padding: "0",
      },
      ".cm-cursor": { borderLeft: "2px solid var(--accent)" },
      ".cm-placeholder": { color: "var(--text-muted)", opacity: "0.9" },
      ".cm-selectionBackground, ::selection": { backgroundColor: "var(--selection)" },
      ".cm-gutters": {
        backgroundColor: "transparent",
        border: "none",
        color: "var(--text-muted)",
        fontSize: "12px",
      },
      ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-secondary)" },
      ".cm-activeLine": { backgroundColor: "transparent" },
      ".tok-heading": { fontWeight: "700", color: "var(--text-primary)" },
      ".tok-h1": { fontSize: "1.75em", lineHeight: "1.25" },
      ".tok-h2": { fontSize: "1.45em", lineHeight: "1.3" },
      ".tok-h3": { fontSize: "1.2em" },
      ".tok-h4": { fontSize: "1.05em" },
      ".tok-h5": { fontSize: "1em" },
      ".tok-h6": { fontSize: "0.95em", color: "var(--text-secondary)" },
      // Markers recede; words advance.
      ".tok-meta": { color: "var(--text-muted)", opacity: "0.65", fontWeight: "400" },
      ".tok-code": {
        fontFamily: "var(--font-mono)",
        fontSize: "0.86em",
        backgroundColor: "var(--code-bg)",
        borderRadius: "3px",
        padding: "0 3px",
      },
      ".tok-link": { color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: "2px" },
      ".tok-quote": { color: "var(--text-secondary)", fontStyle: "italic" },
      ".tok-strong": { fontWeight: "700" },
      ".tok-em": { fontStyle: "italic" },
      ".tok-strike": { textDecoration: "line-through", color: "var(--text-secondary)" },
    },
    { dark: true },
  );

  const extensions: Extension[] = [
    history(),
    markdown({ base: markdownLanguage }),
    indentOnInput(),
    // Find + replace panel (replace/replace-all buttons ship inside the
    // panel) with match highlighting. openSearchPanel works without this,
    // but the static extension keeps replace reliably available.
    search(),
    // Markdown-backed WYSIWYG: inline marks hide, task markers become
    // live checkboxes, tables/callouts/code/media earn in-editor styling.
    // The doc stays plain Markdown on this single surface. The cursor
    // line always reveals raw source; `livePreview: false` shows source
    // everywhere (settings kill-switch).
    wysiwyg({ livePreview: opts.livePreview !== false }),
    closeBrackets(),
    // Indent guides for nested lists/tasks (Step 1 editor basics).
    indentGuides(),
    placeholder("Start writing…"),
    syntaxHighlighting(highlight),
    theme,
    // markdownKeymap: Enter continues lists/quotes. indentWithTab: Tab /
    // Shift-Tab indents/outdents nested list items. searchKeymap: Mod-f
    // find, F3/Mod-g next/prev — the panel itself carries replace UI.
    // Format keymap: selection formatting that writes Markdown behind the
    // user's back (Mod-1..9 stay tab switches; Mod-H is macOS-reserved).
    // Inline code lives on Mod-Shift-E (Mod-E stays free: there is no
    // read/edit toggle on this single surface).
    keymap.of([
      { key: "Mod-b", run: cmdBold, preventDefault: true },
      { key: "Mod-i", run: cmdItalic, preventDefault: true },
      { key: "Mod-Shift-x", run: cmdStrike, preventDefault: true },
      { key: "Mod-Shift-e", run: cmdCode, preventDefault: true },
      { key: "Mod-k", run: cmdLink, preventDefault: true },
      { key: "Mod-Shift-8", run: cmdBullet, preventDefault: true },
      { key: "Mod-Shift-7", run: cmdOrdered, preventDefault: true },
      { key: "Mod-Shift-9", run: cmdTask, preventDefault: true },
      { key: "Mod-Shift-h", run: cmdHeading, preventDefault: true },
      { key: "Mod-Shift-q", run: cmdQuote, preventDefault: true },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...markdownKeymap,
      ...closeBracketsKeymap,
      ...searchKeymap,
    ]),
    EditorView.contentAttributes.of({ spellcheck: "true" }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) opts.onChange(update.state.doc.toString());
      if (update.selectionSet && opts.onCursor) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        opts.onCursor(line.number, pos - line.from + 1);
      }
      if ((update.selectionSet || update.docChanged || update.focusChanged) && opts.onSelectionActivity) {
        opts.onSelectionActivity(update.view);
      }
    }),
  ];
  if (opts.lineNumbers) extensions.push(lineNumbers());
  if (opts.wordWrap) extensions.push(EditorView.lineWrapping);

  const state = EditorState.create({ doc: initialContent, extensions });
  const view = new EditorView({ state, parent });
  return {
    view,
    getContent: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
  };
}
