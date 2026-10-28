import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { Placement } from "../overlays";
import { useOverlay, type Anchor } from "./use-overlay";

export type PopoverProps = {
  anchor: Anchor;
  label: string;
  onClose: () => void;
  placement?: Placement;
  children: ReactNode;
};

/** Small panel next to a control: a quick form or details. Escape and an outside
 * press close it; focus returns to the opener. */
export function Popover({ anchor, label, onClose, placement, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { style } = useOverlay(ref, {
    anchor, onClose, focusFirst: 'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    ...(placement ? { placement } : {}),
  });
  return <div ref={ref} role="dialog" aria-label={label} tabIndex={-1} className="ui-popover" style={style}>{children}</div>;
}

export const TOOLTIP_DELAY_MS = 400;

type TriggerProps = { "aria-describedby"?: string; onMouseEnter?: (e: never) => void; onMouseLeave?: (e: never) => void; onFocus?: (e: never) => void; onBlur?: (e: never) => void };

/** Names a control on hover or keyboard focus. The text is also the control's
 * description, and Escape hides it without moving focus. */
export function Tooltip({ text, children }: { text: string; children: ReactElement<TriggerProps> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = (delay: number) => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const child = cloneElement(children, {
    "aria-describedby": open ? id : children.props["aria-describedby"],
    onMouseEnter: () => show(TOOLTIP_DELAY_MS), onMouseLeave: hide,
    onFocus: () => show(0), onBlur: hide,
  });
  return <span className="ui-tip-wrap">{child}{open && <span role="tooltip" id={id} className="ui-tooltip">{text}</span>}</span>;
}
