import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export type EditorSession = {
  view: EditorView;
  getContent(): string;
  destroy(): void;
};

export type EditorOptions = {
  lineNumbers: boolean;
  wordWrap: boolean;
  onChange: (content: string) => void;
  onCursor?: (line: number, col: number) => void;
};

/** Markdown source editor. CodeMirror owns document/undo/selection; React only
 * mounts the DOM node and receives change/cursor callbacks. */
export function createEditor(parent: HTMLElement, initialContent: string, opts: EditorOptions): EditorSession {
  const highlight = HighlightStyle.define([
    { tag: tags.heading1, class: "tok-heading tok-h1" },
    { tag: tags.heading2, class: "tok-heading tok-h2" },
    { tag: tags.heading3, class: "tok-heading tok-h3" },
    { tag: tags.heading4, class: "tok-heading tok-h4" },
    { tag: tags.strong, class: "tok-strong" },
    { tag: tags.emphasis, class: "tok-em" },
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
      ".cm-selectionBackground, ::selection": { backgroundColor: "var(--selection)" },
      ".cm-gutters": {
        backgroundColor: "transparent",
        border: "none",
        color: "var(--text-muted)",
        fontSize: "12px",
      },
      ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-secondary)" },
      ".cm-activeLine": { backgroundColor: "transparent" },
      ".tok-heading": { fontWeight: "600", color: "var(--text-primary)" },
      ".tok-h1": { fontSize: "1.75em", lineHeight: "1.25" },
      ".tok-h2": { fontSize: "1.45em", lineHeight: "1.3" },
      ".tok-h3": { fontSize: "1.2em" },
      ".tok-h4": { fontSize: "1em" },
      ".tok-meta": { color: "var(--text-muted)" },
      ".tok-code": {
        fontFamily: "var(--font-mono)",
        fontSize: "0.86em",
        backgroundColor: "var(--code-bg)",
        borderRadius: "3px",
        padding: "0 3px",
      },
      ".tok-link": { color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: "2px" },
      ".tok-quote": { color: "var(--text-secondary)", fontStyle: "italic" },
      ".tok-strong": { fontWeight: "600" },
    },
    { dark: true },
  );

  const extensions: Extension[] = [
    history(),
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(highlight),
    theme,
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) opts.onChange(update.state.doc.toString());
      if (update.selectionSet && opts.onCursor) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        opts.onCursor(line.number, pos - line.from + 1);
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
