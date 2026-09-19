import { useEffect, useRef, type JSX } from "react";
import type { EditorView } from "@codemirror/view";
import { createEditor } from "../editor/create-editor";
import { displayPath } from "./types";

/** One editor instance per pane (P1-06). CodeMirror owns document/undo/
 * selection per pane; the shared doc registry owns content truth.
 *
 * Cross-pane sync: when the doc content changes WITHOUT this pane (other
 * pane edited, reload-from-disk, draft restore) and this editor is
 * unfocused, the change is dispatched into the view so both panes agree.
 * A focused editor owns its text — the revision guard (P1-05) protects
 * its saves, so we never rewrite under an active cursor. */
export function PaneView({
  docKey,
  content,
  relativePath,
  lineNumbers,
  wordWrap,
  fullWidth,
  reportCursor,
  onEdit,
  onCursor,
}: {
  docKey: string;
  content: string;
  relativePath: string;
  lineNumbers: boolean;
  wordWrap: boolean;
  fullWidth: boolean;
  /** Only the active pane reports cursor position to the status strip. */
  reportCursor: boolean;
  onEdit: (docKey: string, content: string) => void;
  onCursor: (line: number, col: number) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const renderedRef = useRef<string>("");
  const cbRef = useRef({ onEdit, onCursor, reportCursor });
  cbRef.current = { onEdit, onCursor, reportCursor };

  const sessionKey = `${docKey}|ln${lineNumbers ? 1 : 0}|ww${wordWrap ? 1 : 0}`;

  // Mount / remount when the pane switches documents or toggles settings.
  // `content` here is the prop value at mount time — the base this editor
  // instance renders; later changes arrive via the sync effect below.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren();
    renderedRef.current = content;
    const session = createEditor(el, content, {
      lineNumbers,
      wordWrap,
      onChange: (c) => {
        renderedRef.current = c;
        cbRef.current.onEdit(docKey, c);
      },
      onCursor: (l, c) => {
        if (cbRef.current.reportCursor) cbRef.current.onCursor(l, c);
      },
    });
    viewRef.current = session.view;
    return () => {
      session.destroy();
      viewRef.current = null;
    };
    // Deps are intentionally just the session key: remount only on document
    // or settings switch; content/callbacks flow through refs and effects.
  }, [sessionKey]);

  // Sync changes that arrived without this pane (sibling edit, reload,
  // restore, remote save). Unfocused only — never under an active cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || content === renderedRef.current) return;
    if (view.hasFocus) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    renderedRef.current = content;
  }, [content]);

  return (
    <div className="editor-scroll">
      <div className={`editor-col${fullWidth ? " full-width" : ""}`}>
        <div ref={ref} aria-label={`Editing ${displayPath(relativePath)}`} />
      </div>
    </div>
  );
}
