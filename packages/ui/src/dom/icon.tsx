import type { SVGProps } from "react";
import { ART, ICONS } from "./icon-data";

export type IconName = keyof typeof ICONS;
export type ArtName = keyof typeof ART;
export type IconSize = "md" | "sm" | "xs";

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
export const ART_NAMES = Object.keys(ART) as ArtName[];

export type IconProps = Omit<SVGProps<SVGSVGElement>, "name" | "children"> & {
  name: IconName;
  /** md 20px, sm 18px, xs 14px. */
  size?: IconSize;
  /** Only for icons that carry meaning alone. Decorative icons stay hidden. */
  label?: string;
};

/** 1.5px stroke, round caps and joins, currentColor. Markup is the static
 * prototype ICONS map, never user input. */
export function Icon({ name, size = "md", label, className = "", ...props }: IconProps) {
  return <svg {...props} viewBox="0 0 24 24" className={`ui-icon ui-icon--${size} ${className}`}
    role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false"
    dangerouslySetInnerHTML={{ __html: ICONS[name] ?? ICONS.file }} />;
}

export type ArtProps = Omit<SVGProps<SVGSVGElement>, "name" | "children"> & { name: ArtName };
/** Line illustration for empty states. Decorative. */
export function Art({ name, className = "", ...props }: ArtProps) {
  return <svg {...props} viewBox="0 0 140 96" className={`ui-art ${className}`} aria-hidden="true" focusable="false"
    dangerouslySetInnerHTML={{ __html: ART[name] }} />;
}
