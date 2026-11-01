import { startCompletion } from "@codemirror/autocomplete";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";

/** Prototype "+" affordance: on an empty line the caret sits beside a
 * quiet round button that opens the same "/" block menu. The button is
 * plain DOM inside the editor, so it never changes the document. */
export function addBlockButton() {
  return ViewPlugin.fromClass(class {
    private readonly button: HTMLButtonElement;
    constructor(private readonly view: EditorView) {
      this.button = document.createElement("button");
      this.button.type = "button";
      this.button.className = "cm-add-block";
      this.button.setAttribute("aria-label", "Add a block");
      this.button.title = "Add a block";
      this.button.textContent = "+";
      this.button.hidden = true;
      // Keep the editor focused so the caret and selection survive the click.
      this.button.addEventListener("mousedown", (e) => e.preventDefault());
      this.button.addEventListener("click", () => {
        const { head } = this.view.state.selection.main;
        this.view.dispatch({ changes: { from: head, insert: "/" }, selection: { anchor: head + 1 } });
        this.view.focus();
        startCompletion(this.view);
      });
      view.dom.appendChild(this.button);
      view.requestMeasure({ read: () => null, write: () => this.place() });
    }
    update(u: ViewUpdate): void {
      if (u.selectionSet || u.docChanged || u.focusChanged || u.geometryChanged) {
        this.view.requestMeasure({ read: () => null, write: () => this.place() });
      }
    }
    private place(): void {
      const { state } = this.view;
      const sel = state.selection.main;
      const line = state.doc.lineAt(sel.head);
      if (!sel.empty || line.length > 0 || !this.view.hasFocus) { this.button.hidden = true; return; }
      // Line geometry (not caret coords): an empty line has no glyph to measure.
      const block = this.view.lineBlockAt(sel.head);
      const host = this.view.dom.getBoundingClientRect();
      this.button.hidden = false;
      this.button.style.top = `${this.view.documentTop + block.top - host.top + (block.height - 24) / 2}px`;
    }
    destroy(): void { this.button.remove(); }
  });
}
