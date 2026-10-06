import type { ReactNode } from "react";
import type { Announcement, NoticeTone } from "../behavior";

export type NoticeProps = {
  tone?: NoticeTone;
  announcement?: Announcement;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
};
/** Tone is visual only. Callers choose whether/how urgently to announce;
 * a warning must not silently become a save-success or durability assertion. */
export function Notice({ tone = "info", announcement = "off", title, children, actions, className = "" }: NoticeProps) {
  return <div className={`tn-notice tn-notice--${tone} ${className}`}>
    <span className="tn-notice-icon" aria-hidden="true">{tone === "success" ? "✓" : tone === "info" ? "i" : "!"}</span>
    <div className="tn-notice-message" role={announcement === "assertive" ? "alert" : announcement === "polite" ? "status" : undefined}>
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
    {actions && <div className="tn-actions">{actions}</div>}
  </div>;
}

export type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  illustration?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  headingLevel?: 1 | 2;
  className?: string;
};
export function EmptyState({ title, description, illustration, actions, children, headingLevel = 2, className = "" }: EmptyStateProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return <div className={`tn-empty-state ${className}`}>
    {illustration}
    <Heading>{title}</Heading>
    {description && <div className="tn-empty-description">{description}</div>}
    {actions && <div className="tn-actions">{actions}</div>}
    {children}
  </div>;
}
