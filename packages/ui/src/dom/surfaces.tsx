import type { HTMLAttributes, ReactNode } from "react";
import { Icon } from "./icon";

export type CardProps = HTMLAttributes<HTMLElement> & { as?: "div" | "section" | "article"; accent?: boolean };
/** Panel container. Fades up on mount unless reduced motion is on. */
export function Card({ as: Tag = "div", accent = false, className = "", ...props }: CardProps) {
  return <Tag {...props} className={`ui-card ${accent ? "ui-card--accent" : ""} ${className}`} />;
}

export type SkeletonProps = { lines?: number; label?: string; className?: string };
/** Shimmering placeholder bars while something loads. */
export function Skeleton({ lines = 3, label = "Loading", className = "" }: SkeletonProps) {
  return <div className={`ui-skeleton ${className}`} role="status" aria-label={label}>
    {Array.from({ length: lines }, (_, i) => <i key={i} style={i === lines - 1 && lines > 1 ? { inlineSize: "60%" } : undefined} />)}
  </div>;
}

export type ProgressProps = {
  /** 0..max. Omit for an indeterminate bar. */
  value?: number;
  max?: number;
  label: string;
  className?: string;
};
export function Progress({ value, max = 100, label, className = "" }: ProgressProps) {
  const known = value !== undefined;
  const pct = known ? Math.min(100, Math.max(0, (value / max) * 100)) : undefined;
  return <div className={`ui-progress ${known ? "" : "ui-progress--indeterminate"} ${className}`} role="progressbar"
    aria-label={label} aria-valuemin={known ? 0 : undefined} aria-valuemax={known ? max : undefined} aria-valuenow={known ? value : undefined}>
    <i style={known ? { inlineSize: `${pct}%` } : undefined} />
  </div>;
}

export type StepState = "pending" | "working" | "done" | "failed";
export type Step = { id: string; label: ReactNode; state: StepState; error?: string };
const STATE_TEXT: Record<StepState, string> = { pending: "Waiting", working: "In progress", done: "Done", failed: "Failed" };
const STATE_ICON = { pending: "today", working: "refresh", done: "check", failed: "error" } as const;

/** Ordered steps with a state each. State is spoken, not only coloured. */
export function Stepper({ steps, label }: { steps: Step[]; label: string }) {
  return <ol className="ui-steps" aria-label={label}>
    {steps.map((s) => <li key={s.id} className={`ui-step ui-step--${s.state}`} aria-current={s.state === "working" ? "step" : undefined}>
      <Icon name={STATE_ICON[s.state]} size="sm" />
      <span>{s.label}</span>
      <span className="ui-visually-hidden">{`: ${STATE_TEXT[s.state]}`}</span>
      {s.error && s.state === "failed" && <span className="ui-step-error">{s.error}</span>}
    </li>)}
  </ol>;
}
