import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export type BannerTone = "info" | "warn" | "danger";
export type BannerProps = {
  tone?: BannerTone;
  /** Bold first sentence: what happened. */
  title: string;
  /** Plain explanation and what to do. */
  children?: ReactNode;
  /** Up to three buttons; any extra are dropped. */
  actions?: ReactNode[];
  compact?: boolean;
  className?: string;
};
export const BANNER_MAX_ACTIONS = 3;
const ICON: Record<BannerTone, IconName> = { info: "info", warn: "warn", danger: "error" };

/** Inline notice inside a view. Warn and danger are announced (role=alert);
 * info is not, so loading a page never shouts. */
export function Banner({ tone = "info", title, children, actions = [], compact = false, className = "" }: BannerProps) {
  return <div className={`ui-banner ui-banner--${tone}${compact ? " ui-banner--compact" : ""} ${className}`}
    role={tone === "info" ? undefined : "alert"}>
    <Icon name={ICON[tone]} size="sm" />
    <div className="ui-banner-text"><strong>{title}</strong>{children && <> {children}</>}</div>
    {actions.length > 0 && <div className="ui-banner-actions">{actions.slice(0, BANNER_MAX_ACTIONS)}</div>}
  </div>;
}
