import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { canDismissDialog, type DialogPolicy } from "../behavior";
import { IconButton } from "./button";

export type DialogProps = DialogPolicy & {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "small" | "wide";
  initialFocus?: RefObject<HTMLElement | null>;
};

/** Mount to open; unmount to close. Native showModal owns top-layer placement,
 * inert background and Escape. Tab edges wrap locally rather than moving
 * focus into browser chrome. No app/global event handlers.
 * Default backdrop policy is safe for destructive decisions. */
export function Dialog({ title, onClose, children, footer, size = "small", initialFocus,
  dismissible = true, closeOnBackdrop = false }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const initialFocusRef = useRef(initialFocus);
  const pointerStartedOutside = useRef(false);
  const titleId = useId();
  const policy = { dismissible, closeOnBackdrop };
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    initialFocusRef.current?.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      // showModal normally restores this itself. Avoid focusing behind a
      // replacement modal, or an opener removed by navigation. Deferred: the
      // browser may reset focus to <body> while React is still unmounting.
      requestAnimationFrame(() => {
        if (opener instanceof HTMLElement && opener.isConnected && !document.querySelector("dialog[open]")) {
          opener.focus({ preventScroll: true });
        }
      });
    };
  }, []);

  function outside(event: React.PointerEvent | React.MouseEvent): boolean {
    const rect = ref.current?.getBoundingClientRect();
    return !!rect && event.target === ref.current && (
      event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
    );
  }

  return <dialog ref={ref} tabIndex={-1} className={`tn-dialog tn-dialog--${size}`} aria-labelledby={titleId} aria-modal="true"
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key !== "Tab" || event.nativeEvent.isComposing || event.defaultPrevented) return;
      const dialog = event.currentTarget;
      const targets = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]',
      )).filter((el) => el.tabIndex >= 0 && !el.matches(":disabled") && !el.closest("[inert]") &&
        el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
      // Positive tabindex is discouraged, but respect DOM tab order if a
      // caller uses it. Native navigation handles everything between edges.
      targets.sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
      const first = targets[0];
      const last = targets.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    }}
    onCancel={(event) => {
      event.preventDefault();
      if (canDismissDialog("escape", policy)) onClose();
    }}
    onPointerDown={(event) => { pointerStartedOutside.current = outside(event); }}
    onClick={(event) => {
      if (pointerStartedOutside.current && outside(event) && canDismissDialog("backdrop", policy)) onClose();
      pointerStartedOutside.current = false;
    }}>
    <header className="tn-dialog-header">
      <h2 id={titleId}>{title}</h2>
      <IconButton label={`Close ${title}`} disabled={!dismissible} onClick={() => {
        if (canDismissDialog("close", policy)) onClose();
      }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" /></svg></IconButton>
    </header>
    <div className="tn-dialog-body">{children}</div>
    {footer && <footer className="tn-dialog-footer tn-actions">{footer}</footer>}
  </dialog>;
}
