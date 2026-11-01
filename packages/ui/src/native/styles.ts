/** Style rules for React Native, as plain objects. No react-native import:
 * the values are what the DOM tokens say, resolved per theme, so mobile and
 * the other apps cannot drift. apps/mobile/components feed them to RN views. */
import type { ButtonVariant, NoticeTone } from "../behavior";
import { canonicalVariant } from "../behavior";
import { colors, controlHeight, publicColors, publicRadius, space, type, type Theme } from "../theme";

export type Palette = { [K in keyof typeof publicColors]: string };

/** Public colour names (`app`, `text`, `accent`, ...) resolved for a theme.
 * `shadow` is a CSS string on the web; native uses `shadowColor` below. */
export function palette(theme: Theme): Palette {
  const out = {} as Record<string, string>;
  for (const [name, key] of Object.entries(publicColors)) out[name] = colors[theme][key];
  return out as Palette;
}

export const touch = { control: controlHeight.touch, icon: controlHeight.touch, row: 52, minHit: 44 } as const;
export const radii = { ctl: publicRadius.ctl, field: publicRadius.in, dialog: publicRadius.dlg, card: publicRadius.max, pill: 99 } as const;
export const gap = { xs: space[1], sm: space[2], md: space[3], lg: space[4], xl: space[6] } as const;

/** Body text scales with the user's setting; hit areas never do. */
export function scaledFont(base: number, fontScale: number): number {
  return Math.round(base * fontScale * 100) / 100;
}
export const text = { ui: 16, small: 13, title: 20, body: type.fs } as const;

export type ButtonStyle = { height: number; paddingHorizontal: number; borderRadius: number; borderWidth: number;
  backgroundColor: string; borderColor: string; color: string; opacity: number };

/** Buttons are always 44pt tall on touch (sizes sm/lg do not shrink it). */
export function buttonStyle(variant: ButtonVariant, theme: Theme, state: { disabled?: boolean; pressed?: boolean } = {}): ButtonStyle {
  const p = palette(theme);
  const v = canonicalVariant(variant);
  const base = { height: touch.control, paddingHorizontal: gap.lg, borderRadius: radii.field, borderWidth: 1, opacity: state.disabled ? 0.45 : 1 };
  const pressed = state.pressed && !state.disabled;
  switch (v) {
    case "primary": return { ...base, backgroundColor: p.btn, borderColor: p.btn, color: p["btn-text"], opacity: pressed ? 0.85 : base.opacity };
    case "ghost": return { ...base, backgroundColor: pressed ? p.hover : "transparent", borderColor: "transparent", color: p.text2 };
    case "danger": return { ...base, backgroundColor: pressed ? p["bad-bg"] : "transparent", borderColor: "transparent", color: p.bad };
    default: return { ...base, backgroundColor: pressed ? p.hover : p.editor, borderColor: p.control, color: p.text };
  }
}

export type FieldStyle = { minHeight: number; borderRadius: number; borderWidth: number; borderColor: string; backgroundColor: string; color: string; placeholder: string };
export function fieldStyle(theme: Theme, state: { invalid?: boolean; focused?: boolean } = {}): FieldStyle {
  const p = palette(theme);
  return { minHeight: touch.control, borderRadius: radii.field, borderWidth: state.focused ? 2 : 1,
    borderColor: state.invalid ? p.bad : state.focused ? p.accent : p.control, backgroundColor: p.editor, color: p.text, placeholder: p.faint };
}

export type NoticeStyle = { backgroundColor: string; color: string; accessibilityRole: "alert" | undefined; icon: "info" | "warn" | "error" | "check" };
/** Warn and danger are announced; info and success are not. */
export function noticeStyle(tone: NoticeTone, theme: Theme): NoticeStyle {
  const p = palette(theme);
  switch (tone) {
    case "warning": return { backgroundColor: p["warn-bg"], color: p.warn, accessibilityRole: "alert", icon: "warn" };
    case "danger": return { backgroundColor: p["bad-bg"], color: p.bad, accessibilityRole: "alert", icon: "error" };
    case "success": return { backgroundColor: p["ok-bg"], color: p.ok, accessibilityRole: undefined, icon: "check" };
    default: return { backgroundColor: p.selected, color: p.text2, accessibilityRole: undefined, icon: "info" };
  }
}

export type ChipTone = "neutral" | "due" | "planned" | "priority" | "success";
export function chipStyle(tone: ChipTone, theme: Theme): { backgroundColor: string; color: string } {
  const p = palette(theme);
  switch (tone) {
    case "due": return { backgroundColor: p["warn-bg"], color: p.warn };
    case "planned": return { backgroundColor: p.selected, color: p.accent };
    case "priority": return { backgroundColor: p["bad-bg"], color: p.bad };
    case "success": return { backgroundColor: p["ok-bg"], color: p.ok };
    default: return { backgroundColor: p.selected, color: p.text2 };
  }
}

export function rowStyle(theme: Theme, state: { selected?: boolean; pressed?: boolean; dimmed?: boolean } = {}) {
  const p = palette(theme);
  return { minHeight: touch.row, paddingHorizontal: gap.lg, backgroundColor: state.selected ? p.selected : state.pressed ? p.hover : "transparent",
    opacity: state.dimmed ? 0.5 : 1, borderBottomWidth: 1, borderBottomColor: p.line };
}

export function cardStyle(theme: Theme) {
  const p = palette(theme);
  return { backgroundColor: p.panel, borderColor: p.line, borderWidth: 1, borderRadius: radii.card, padding: gap.lg };
}
