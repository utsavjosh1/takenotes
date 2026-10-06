import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import type { EditorView } from "@codemirror/view";
import { openSearchPanel } from "@codemirror/search";
import { createEditor } from "../editor/create-editor";
import {
  applyLinkUrl,
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
  linkAt,
  wikilinkAt,
} from "../editor/format";
import { displayPath, fileName } from "./types";

type FormatCommand = (view: EditorView) => boolean;

type BubbleState = {
  top: number;
  left: number;
  below: boolean;
  /** Set when the cursor sits inside a link label: offers URL editing. */
  linkUrl: string | null;
};

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const mod = isMac ? "\u2318" : "Ctrl";

const FORMAT_BUTTONS: { label: ReactNode; title: string; run: FormatCommand }[] = [
  { label: <b>B</b>, title: `Bold (${mod}+B)`, run: cmdBold },
  { label: <i>I</i>, title: `Italic (${mod}+I)`, run: cmdItalic },
  { label: <s>S</s>, title: `Strikethrough (${mod}+Shift+X)`, run: cmdStrike },
  { label: <span className="fmt-mono">code</span>, title: `Code (${mod}+Shift+E)`, run: cmdCode },
  { label: <span className="fmt-mono">link</span>, title: `Link (${mod}+K)`, run: cmdLink },
  { label: <b>H</b>, title: `Heading (${mod}+Shift+H)`, run: cmdHeading },
  { label: <span aria-hidden>•</span>, title: `Bullet list (${mod}+Shift+8)`, run: cmdBullet },
  { label: <span aria-hidden>1.</span>, title: `Numbered list (${mod}+Shift+7)`, run: cmdOrdered },
  { label: <span aria-hidden>☑</span>, title: `Task (${mod}+Shift+9)`, run: cmdTask },
  { label: <span aria-hidden>❝</span>, title: `Quote (${mod}+Shift+Q)`, run: cmdQuote },
];

function noteTitle(relativePath: string): string {
  return fileName(relativePath).replace(/\.(md|markdown|txt)$/i, "");
}

/** Single-surface WYSIWYG pane (ADR-0015). One CodeMirror instance per open
 * document for the lifetime of the tab: it is mounted on document/settings
 * change and never destroyed for visual mode switching (there is no second
 * mode). CodeMirror owns document/undo/selection; the shared doc registry
 * owns content truth.
 *
 * Cross-pane sync: when the doc content changes WITHOUT this pane (other
 * pane edited, reload-from-disk, draft restore) and this editor is
 * unfocused, the change is dispatched into the view so both panes agree.
 * A focused editor owns its text — the revision guard (P1-05) protects
 * its saves, so we never rewrite under an active cursor. All user
 * mutations (typing, formatting, checkbox widgets, link edits) flow as
 * CodeMirror transactions → onChange → document state → autosave. */
export function PaneView({
  docKey,
  content,
  relativePath,
  lineNumbers,
  wordWrap,
  livePreview,
  fullWidth,
  reportCursor,
  onEdit,
  onCursor,
  onTitleCommit,
  onOpenWikilink,
  onHoverLink,
}: {
  docKey: string;
  content: string;
  relativePath: string;
  lineNumbers: boolean;
  wordWrap: boolean;
  livePreview: boolean;
  fullWidth: boolean;
  /** Only the active pane reports cursor position to the status strip. */
  reportCursor: boolean;
  onEdit: (docKey: string, content: string) => void;
  onCursor: (line: number, col: number) => void;
  onTitleCommit: (title: string) => Promise<void> | void;
  onOpenWikilink: (target: string) => void;
  /** Step 2 hover preview: pane-view reports the hovered [[target]] + coords
   * (400ms debounce); App resolves + renders the card at its root so this
   * file never renders a second reading surface (single-surface invariant). */
  onHoverLink?: (target: string | null, x: number, y: number) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const renderedRef = useRef<string>("");
  const cbRef = useRef({ onEdit, onCursor, reportCursor, onOpenWikilink, onHoverLink, onSelectionActivity: (_v: EditorView) => {} });
  cbRef.current.onEdit = onEdit;
  cbRef.current.onCursor = onCursor;
  cbRef.current.reportCursor = reportCursor;
  cbRef.current.onOpenWikilink = onOpenWikilink;
  cbRef.current.onHoverLink = onHoverLink;
  const [titleDraft, setTitleDraft] = useState(() => noteTitle(relativePath));
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const linkAnchorRef = useRef(0);

  useEffect(() => {
    setTitleDraft(noteTitle(relativePath));
  }, [relativePath]);

  const commitTitle = (): void => {
    const next = titleDraft.trim();
    if (!next || next === noteTitle(relativePath)) {
      setTitleDraft(noteTitle(relativePath));
      return;
    }
    void onTitleCommit(next);
  };

  const sessionKey = `${docKey}|ln${lineNumbers ? 1 : 0}|ww${wordWrap ? 1 : 0}|lp${livePreview ? 1 : 0}`;

  // Mount / remount when the pane switches documents or toggles settings.
  // `content` here is the prop value at mount time — the base this editor
  // instance renders; later changes arrive via the sync effect below.
  // There is intentionally no mode dimension: the editor stays mounted.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren();
    renderedRef.current = content;
    const session = createEditor(el, content, {
      lineNumbers,
      wordWrap,
      livePreview,
      onChange: (c) => {
        renderedRef.current = c;
        cbRef.current.onEdit(docKey, c);
      },
      onCursor: (l, c) => {
        if (cbRef.current.reportCursor) cbRef.current.onCursor(l, c);
      },
      onSelectionActivity: (v) => cbRef.current.onSelectionActivity(v),
    });
    viewRef.current = session.view;
    // Ctrl/Cmd+click on a wikilink label opens the target note. Plain
    // clicks only move the cursor — the editor never navigates away, and
    // external URLs never open from here.
    const onEditorClick = (e: MouseEvent): void => {
      if (!e.metaKey && !e.ctrlKey) return;
      const view = viewRef.current;
      if (!view) return;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) return;
      const target = wikilinkAt(view.state, pos);
      if (!target) return;
      e.preventDefault();
      cbRef.current.onOpenWikilink(target);
    };
    session.view.dom.addEventListener("click", onEditorClick);
    return () => {
      session.view.dom.removeEventListener("click", onEditorClick);
      session.destroy();
      viewRef.current = null;
    };
    // Deps are intentionally just the session key: remount only on
    // document or settings switch; content/callbacks flow through refs
    // and effects so typing never recreates the editor.
  }, [sessionKey]);

  // Find and replace share one CodeMirror search panel: it ships with
  // replace / replace-all controls, so both events open the same panel.
  useEffect(() => {
    const onFind = (): void => {
      if (!cbRef.current.reportCursor) return;
      const view = viewRef.current;
      if (!view) return;
      openSearchPanel(view);
      view.focus();
    };
    window.addEventListener("takenotes:editor-find", onFind);
    window.addEventListener("takenotes:editor-replace", onFind);
    return () => {
      window.removeEventListener("takenotes:editor-find", onFind);
      window.removeEventListener("takenotes:editor-replace", onFind);
    };
  }, []);

  // Step 2: internal drag-into-note inserts [[relative/path]] at the cursor.
  // Tree rows set `takenotes/rel-path`; the editor section drop handler
  // forwards it here so CodeMirror owns the transaction.
  useEffect(() => {
    const onInsertLink = (e: Event): void => {
      const view = viewRef.current;
      if (!view || (!view.hasFocus && document.activeElement?.closest(".pane.active") === null)) return;
      const rel = (e as CustomEvent<string>).detail;
      if (!rel || typeof rel !== "string") return;
      const head = view.state.selection.main.head;
      view.dispatch({ changes: { from: head, to: head, insert: `[[${rel}]]` }, scrollIntoView: true });
      view.focus();
    };
    window.addEventListener("takenotes:insert-link", onInsertLink);
    return () => window.removeEventListener("takenotes:insert-link", onInsertLink);
  }, []);

  // Floating format bubble (Notion-style): select text → bold/italic/list
  // buttons; cursor inside a link → URL field. mousedown is prevented so
  // focus and selection never leave the editor.
  const runCmd = useCallback((cmd: FormatCommand) => {
    const view = viewRef.current;
    if (!view) return;
    cmd(view);
    view.focus();
  }, []);

  const hideBubble = useCallback(() => setBubble(null), []);

  useEffect(() => {
    cbRef.current.onSelectionActivity = (view: EditorView) => {
      if (!cbRef.current.reportCursor || !view.hasFocus) {
        setBubble(null);
        return;
      }
      const sel = view.state.selection.main;
      const coords = view.coordsAtPos(sel.head);
      if (!coords) {
        setBubble(null);
        return;
      }
      const left = Math.max(130, Math.min(coords.left, window.innerWidth - 130));
      const below = coords.top < 84;
      if (!sel.empty) {
        setBubble({ top: below ? coords.bottom + 8 : coords.top - 8, left, below, linkUrl: null });
        return;
      }
      const link = linkAt(view.state, sel.head);
      if (link) {
        linkAnchorRef.current = sel.head;
        setLinkDraft(link.url);
        setBubble({ top: below ? coords.bottom + 8 : coords.top - 8, left, below, linkUrl: link.url });
        return;
      }
      setBubble(null);
    };
  }, []);

  // Scrolling repositions text without editor updates — hide the bubble
  // until the next selection change re-anchors it.
  useEffect(() => {
    window.addEventListener("scroll", hideBubble, true);
    return () => window.removeEventListener("scroll", hideBubble, true);
  }, [hideBubble]);

  const commitLinkUrl = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (applyLinkUrl(view, linkAnchorRef.current, linkDraft.trim())) setBubble(null);
    view.focus();
  }, [linkDraft]);

  // Step 2 Outline click-navigate + Favorites anchor jumps: scroll to a
  // 1-based line without disturbing selection more than necessary.
  useEffect(() => {
    const onGotoLine = (e: Event): void => {
      const view = viewRef.current;
      if (!view) return;
      const line = (e as CustomEvent<number>).detail;
      if (typeof line !== "number" || line < 1) return;
      const clamped = Math.min(line, view.state.doc.lines);
      const pos = view.state.doc.line(clamped).from;
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
    };
    window.addEventListener("takenotes:goto-line", onGotoLine);
    return () => window.removeEventListener("takenotes:goto-line", onGotoLine);
  }, []);

  // Step 2 Page Preview: hover 400ms over a [[link]] reports target + coords;
  // App resolves (index-backed, resolved targets only) and renders the card
  // at its root. Unresolved targets report nothing.
  const hoverTimer = useRef<number | null>(null);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const clear = (): void => {
      if (hoverTimer.current !== null) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null; }
      cbRef.current.onHoverLink?.(null, 0, 0);
    };
    const onMove = (e: MouseEvent): void => {
      const v = viewRef.current;
      const report = cbRef.current.onHoverLink;
      if (!v || !report) return;
      const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
      const target = pos === null ? null : wikilinkAt(v.state, pos);
      if (!target) { clear(); return; }
      if (hoverTimer.current !== null) return;
      const { clientX: x, clientY: y } = e;
      hoverTimer.current = window.setTimeout(() => {
        hoverTimer.current = null;
        // Re-verify the cursor still sits on the same link before reporting.
        const vv = viewRef.current;
        if (!vv) return;
        const p = vv.posAtCoords({ x, y });
        const t = p === null ? null : wikilinkAt(vv.state, p);
        if (t) report(t, x, y);
      }, 400);
    };
    const dom = view.dom;
    dom.addEventListener("mousemove", onMove);
    dom.addEventListener("mouseleave", clear);
    dom.addEventListener("mousedown", clear);
    return () => {
      dom.removeEventListener("mousemove", onMove);
      dom.removeEventListener("mouseleave", clear);
      dom.removeEventListener("mousedown", clear);
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    };
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
        <div className="note-title-row">
          <input
            className="note-title-input"
            aria-label="Note title"
            value={titleDraft}
            placeholder="Untitled"
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTitle();
                viewRef.current?.focus();
              }
            }}
          />
        </div>
        <div ref={ref} aria-label={`Editing ${displayPath(relativePath)}`} />
      </div>
      {bubble && (
        <div
          className="fmt-bubble"
          role="toolbar"
          aria-label="Format selection"
          style={{ top: bubble.top, left: bubble.left, transform: bubble.below ? "translate(-50%, 0)" : "translate(-50%, -100%)" }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {bubble.linkUrl !== null ? (
            <input
              className="fmt-link-input"
              aria-label="Link destination"
              placeholder="https://…"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitLinkUrl();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setBubble(null);
                  viewRef.current?.focus();
                }
              }}
            />
          ) : (
            FORMAT_BUTTONS.map((b) => (
              <button
                key={b.title}
                className="fmt-btn"
                title={b.title}
                aria-label={b.title.split(" (")[0]}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runCmd(b.run)}
              >
                {b.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
