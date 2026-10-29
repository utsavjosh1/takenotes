import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

const setFlash = StateEffect.define<number | null>();

/** Briefly highlights one line (used when the side panel jumps to a heading). */
export const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setFlash)) {
        return e.value === null ? Decoration.none : Decoration.set([Decoration.line({ class: "wys-flash" }).range(tr.state.doc.lineAt(e.value).from)]);
      }
    }
    return tr.docChanged ? Decoration.none : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function flashLine(view: EditorView, pos: number): void {
  view.dispatch({ effects: setFlash.of(pos) });
  window.setTimeout(() => { if (view.dom.isConnected) view.dispatch({ effects: setFlash.of(null) }); }, 1200);
}
