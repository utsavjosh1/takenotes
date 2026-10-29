import type { CSSProperties, ReactNode } from "react";
import { cn } from "../cn";

/* Marketing/landing effects in the spirit of Magic UI + Aceternity UI,
 * rebuilt dependency-free on Tailwind utilities + --tn-* tokens.
 * No framer-motion, no mouse-tracking JS: CSP-safe for Electron, respects
 * prefers-reduced-motion via tailwind.css. Keep these on web/marketing
 * surfaces — app chrome stays with tn-button/tn-dialog primitives. */

// --- Marquee (Magic UI style) ---------------------------------------------

export type MarqueeProps = {
  children: ReactNode;
  className?: string;
  /** Flip scroll direction. */
  reverse?: boolean;
  /** Pause on hover for readability. */
  pauseOnHover?: boolean;
};

/** Infinite horizontal scroller. Duplicate content is aria-hidden. */
export function Marquee({ children, className, reverse = false, pauseOnHover = false }: MarqueeProps) {
  return (
    <div className={cn("group flex overflow-hidden", className)}>
      <div
        className={cn(
          "flex w-max shrink-0 items-center gap-6 pr-6 animate-marquee",
          reverse && "[animation-direction:reverse]",
          pauseOnHover && "group-hover:[animation-play-state:paused]",
        )}
      >
        {children}
        <span aria-hidden="true" className="flex items-center gap-6">
          {children}
        </span>
      </div>
    </div>
  );
}

// --- ShimmerButton (Magic UI style) ----------------------------------------

export type ShimmerButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

/** Call-to-action with a sweeping highlight. Token-aware, no inline script. */
export function ShimmerButton({ children, className, ...props }: ShimmerButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-tn-control",
        "bg-tn-action-fill px-6 text-sm font-semibold text-tn-action-text",
        "transition-transform duration-150 hover:scale-[1.02] active:scale-[0.99]",
        "disabled:cursor-default disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tn-accent",
        // shimmer sweep: gradient background animated via --animate-shimmer
        "animate-shimmer bg-[linear-gradient(110deg,var(--tn-action-fill)_40%,var(--tn-accent)_50%,var(--tn-action-fill)_60%)] bg-[length:200%_100%]",
        className,
      )}
    >
      {children}
    </button>
  );
}

// --- BlurFade (Magic UI style) ----------------------------------------------

export type BlurFadeProps = {
  children: ReactNode;
  className?: string;
  /** Stagger delay in seconds, e.g. 0.15 * index. */
  delay?: number;
  style?: CSSProperties;
};

/** Mount-in reveal: fade + de-blur + rise. Pure CSS animation. */
export function BlurFade({ children, className, delay = 0, style }: BlurFadeProps) {
  return (
    <div
      className={cn("animate-blur-fade", className)}
      style={{ animationDelay: delay ? `${delay}s` : undefined, ...style }}
    >
      {children}
    </div>
  );
}

// --- Spotlight (Aceternity style, static glow) -------------------------------

export type SpotlightCardProps = {
  children: ReactNode;
  className?: string;
};

/** Card with a soft accent glow in the corner. Static gradient (no mouse
 * tracking) so it works in Electron without extra listeners. */
export function SpotlightCard({ children, className }: SpotlightCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-tn-menu border border-tn-subtle bg-tn-editor",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="animate-spotlight pointer-events-none absolute -top-1/3 -left-1/4 h-2/3 w-2/3 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--tn-accent), transparent)" }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
