import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";

export type EditorSession = {
  view: EditorView;
  getContent(): string;
  setContent(content: string): void;
  destroy(): void;
};

/** Create a Markdown source editor. CodeMirror owns document/undo/selection;
 * React only mounts the DOM node and reads content on demand (no per-keystroke
 * global state copies). */
export function createEditor(
  parent: HTMLElement,
  initialContent: string,
  onChange?: (content: string) => void,
): EditorSession {
  const extensions: Extension[] = [
    lineNumbers(),
    history(),
    markdown(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged && onChange) onChange(update.state.doc.toString());
    }),
  ];
  const state = EditorState.create({ doc: initialContent, extensions });
  const view = new EditorView({ state, parent });
  return {
    view,
    getContent: () => view.state.doc.toString(),
    setContent: (content: string) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    },
    destroy: () => view.destroy(),
  };
}
