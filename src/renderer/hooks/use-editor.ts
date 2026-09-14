import { useEffect, useRef } from "react";
import { createEditor } from "../editor/create-editor";

export function useCodeMirrorEditor(
  initialContent: string,
  onChange: (content: string) => void,
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const session = createEditor(el, initialContent, (c) => onChangeRef.current(c));
    return () => session.destroy();
    // Mount once per document identity; parent remounts on tab switch via key.
  }, []); // mount-once by design
  return ref;
}
