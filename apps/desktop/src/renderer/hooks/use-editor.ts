import { useEffect, useRef } from "react";
import { createEditor } from "../editor/create-editor";

/**
 * Mounts one CodeMirror session per document identity. The parent remounts on
 * tab switch / settings change via `sessionKey`, so effects re-run cleanly.
 */
export function useCodeMirrorEditor(
  sessionKey: string,
  initialContent: string,
  opts: { lineNumbers: boolean; wordWrap: boolean; onChange: (c: string) => void; onCursor: (l: number, c: number) => void },
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren();
    const session = createEditor(el, initialContent, {
      lineNumbers: optsRef.current.lineNumbers,
      wordWrap: optsRef.current.wordWrap,
      onChange: (c) => optsRef.current.onChange(c),
      onCursor: (l, c) => optsRef.current.onCursor(l, c),
    });
    session.view.focus();
    return () => session.destroy();
  }, [sessionKey]);
  return ref;
}
