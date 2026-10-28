import { useRef, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";

/** "3 notes", "1 note". Confirmations must say exactly how many. */
export function describeCount(n: number, singular: string, plural = `${singular}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? singular : plural}`;
}

export type ConfirmDialogProps = {
  title: string;
  /** Exactly what will happen, in plain words. */
  children: ReactNode;
  /** Items affected, with their noun: shown as its own line. */
  count?: { n: number; singular: string; plural?: string };
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button. Focus then starts on Cancel. */
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Cancel on the left, the decision on the right. A destructive decision
 * starts with focus on Cancel and ignores the backdrop. */
export function ConfirmDialog({ title, children, count, confirmLabel, cancelLabel = "Cancel", destructive = false,
  pending = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  return <Dialog title={title} onClose={onCancel} dismissible={!pending} initialFocus={destructive ? cancel : undefined}
    footer={<>
      <Button ref={cancel} onClick={onCancel} disabled={pending}>{cancelLabel}</Button>
      <Button variant={destructive ? "danger" : "primary"} className={destructive ? "ui-solid-danger" : ""} pending={pending} onClick={onConfirm}>{confirmLabel}</Button>
    </>}>
    <p className="ui-dialog-text">{children}</p>
    {count && <p className="ui-dialog-count">{describeCount(count.n, count.singular, count.plural)} will be affected.</p>}
  </Dialog>;
}

export type ErrorDialogProps = {
  /** Plain words, e.g. "Could not save the note". */
  title: string;
  /** One sentence: why. */
  cause: string;
  /** Technical text. Hidden behind a collapsed "Details". */
  details?: string;
  /** The one thing to do next. */
  action: { label: string; run: () => void };
  onClose: () => void;
};

export function ErrorDialog({ title, cause, details, action, onClose }: ErrorDialogProps) {
  return <Dialog title={title} onClose={onClose}
    footer={<Button variant="primary" onClick={action.run}>{action.label}</Button>}>
    <p className="ui-dialog-text" role="alert">{cause}</p>
    {details && <details className="ui-details">
      <summary>Details</summary>
      <pre>{details}</pre>
      <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(details); }}>Copy details</Button>
    </details>}
  </Dialog>;
}
