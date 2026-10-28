import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { placeOverlay, type Placement, type Rect } from "../overlays";

export type Anchor = Rect | { x: number; y: number };
export const toRect = (a: Anchor): Rect => ("x" in a ? { left: a.x, top: a.y, width: 0, height: 0 } : a);

/** Shared by Menu and Popover: place next to the anchor once measured, close on
 * Escape or a press outside, and give focus back to whatever opened it. */
export function useOverlay(ref: RefObject<HTMLElement | null>, opts: {
  anchor: Anchor; placement?: Placement; onClose: () => void; focusFirst?: string;
}) {
  const { anchor, placement = "bottom-start", onClose, focusFirst } = opts;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const opener = useRef<Element | null>(null);
  const at = toRect(anchor);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const { left, top } = placeOverlay(at, { width: box.width, height: box.height },
      { width: window.innerWidth, height: window.innerHeight }, placement);
    setPos({ left, top });
  }, [at.left, at.top, placement]);

  useEffect(() => {
    opener.current = document.activeElement;
    const el = ref.current;
    (focusFirst ? el?.querySelector<HTMLElement>(focusFirst) : null)?.focus({ preventScroll: true });
    if (!focusFirst) el?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close.current(); }
    };
    const onDown = (e: MouseEvent) => { if (el && !el.contains(e.target as Node)) close.current(); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
      const back = opener.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true });
    };
  }, []);

  return { style: pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" as const } };
}
