import type { HTMLAttributes } from "react";

export type ChipTone = "neutral" | "due" | "planned" | "priority" | "success";
export type ChipProps = HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone };
/** Small inline tag: task dates, priority, labels. 11.5px. */
export function Chip({ tone = "neutral", className = "", ...props }: ChipProps) {
  return <span {...props} className={`ui-chip ui-chip--${tone} ${className}`} />;
}

export type BadgeTone = "neutral" | "ok" | "warn" | "bad";
export type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };
/** Count or short status next to a heading. 12px. */
export function Badge({ tone = "neutral", className = "", ...props }: BadgeProps) {
  return <span {...props} className={`ui-badge ui-badge--${tone} ${className}`} />;
}

export type PillTone = "neutral" | "accent" | "ok" | "warn" | "bad";
export type PillProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: PillTone;
  /** Leading status dot. The text must still say the state: colour is not enough. */
  dot?: boolean;
};
/** Status pill, e.g. save state or connection. */
export function Pill({ tone = "neutral", dot = false, className = "", children, ...props }: PillProps) {
  return <span {...props} className={`ui-pill ui-pill--${tone} ${className}`}>
    {dot && <span className="ui-pill-dot" aria-hidden="true" />}{children}
  </span>;
}

/** Key cap for shortcut hints. */
export function Kbd({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <kbd {...props} className={`ui-kbd ${className}`} />;
}
