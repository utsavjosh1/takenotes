/** Platform-neutral values. CSS is generated from this file; native adapters
 * consume these numbers/colors directly (no CSS, React, or browser imports). */
export const colors = {
  light: {
    "surface-app": "#faf6ee",
    "surface-sidebar": "#f3ecdd",
    "surface-editor": "#fffdf7",
    "surface-overlay": "#fffdf7",
    "surface-input": "#fffdf7",
    "surface-hover": "#ece4d1",
    "surface-selected": "#ece8ff",
    "surface-panel": "#fbf7ef",
    "text-primary": "#191817",
    "text-secondary": "#4c4a45",
    // Slightly stronger than the original guide: >= 4.5:1 on hover too.
    "text-muted": "#6c6558",
    "text-faint": "#968d7d",
    "border-subtle": "#e5dcc8",
    "border-control": "#8a806d",
    accent: "#4f41d6",
    "accent-soft": "#e3dcff",
    "accent-hover": "#4032ba",
    "on-accent": "#fffdf7",
    "action-fill": "#1d1c1a",
    "action-text": "#fffdf7",
    "success-text": "#356b2f",
    "success-surface": "#e7f4df",
    "warning-text": "#805500",
    "warning-surface": "#fff3d1",
    "danger-text": "#a53240",
    "danger-surface": "#fcebed",
    selection: "#e3dcff",
    "shadow-overlay": "0 12px 40px rgba(40,30,10,.18)",
    "code-surface": "#f3ecdd",
    "highlight-surface": "#ffdf8e",
    // 6e: darkened to hold 3:1 (non-text) on every surface incl. hover.
    scrollbar: "#8a7d63",
    "graph-1": "#e45649",
    "graph-2": "#986801",
    "graph-3": "#50a14f",
    "graph-4": "#4078f2",
    "graph-5": "#a626a4",
    "graph-6": "#0184bc",
  },
  dark: {
    "surface-app": "#151310",
    "surface-sidebar": "#201c16",
    "surface-editor": "#191613",
    "surface-overlay": "#26211a",
    "surface-input": "#191613",
    "surface-hover": "#322b22",
    "surface-selected": "#342b50",
    "surface-panel": "#1d1a15",
    "text-primary": "#f4ecd9",
    "text-secondary": "#d9cfae",
    "text-muted": "#b7ad9b",
    "text-faint": "#8f8677",
    "border-subtle": "#38322a",
    "border-control": "#887d69",
    accent: "#ad9fff",
    "accent-soft": "#2c2a48",
    "accent-hover": "#c3b9ff",
    "on-accent": "#191817",
    "action-fill": "#f4ecd9",
    "action-text": "#191817",
    "success-text": "#b9e5a8",
    "success-surface": "#20321f",
    "warning-text": "#ffdf8e",
    "warning-surface": "#352a14",
    "danger-text": "#ffadb5",
    "danger-surface": "#3b2025",
    selection: "#493968",
    "shadow-overlay": "0 12px 40px rgba(0,0,0,.5)",
    "code-surface": "#26211a",
    "highlight-surface": "#59451b",
    // 6e: lightened to hold 3:1 (non-text) on every surface incl. hover.
    scrollbar: "#857861",
    "graph-1": "#e06c75",
    "graph-2": "#d8a657",
    "graph-3": "#98c379",
    "graph-4": "#61afef",
    "graph-5": "#c678dd",
    "graph-6": "#56b6c2",
  },
} as const;

export type Theme = keyof typeof colors;
export type ThemePreference = Theme | "system";
export type ColorToken = keyof typeof colors.light;

export function resolveTheme(preference: ThemePreference, system: Theme): Theme {
  return preference === "system" ? system : preference;
}

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;
// Prototype scale: 4 rows/controls, 6 inputs/menus, 8 dialogs, 10 largest cards.
export const radius = { row: 4, control: 6, menu: 6, dialog: 8, max: 10 } as const;
export const fontSize = { secondary: 12, control: 14, heading: 20, body: 16, "touch-control": 16, "touch-body": 17 } as const;
export const lineHeight = { ui: 1.4, heading: 1.3, body: 1.65 } as const;
export const targetSize = { control: 36, icon: 32, row: 32, touch: 48, "touch-row": 52 } as const;

/** Public token names (prototype vocabulary) -> the colour key that holds the
 * value. tokens.css emits each as `--<name>: var(--tn-<key>)`. The `--tn-*`
 * names are deprecated and go away in M6. */
export const publicColors = {
  app: "surface-app", side: "surface-sidebar", editor: "surface-editor", panel: "surface-panel",
  overlay: "surface-overlay", hover: "surface-hover", selected: "surface-selected",
  code: "code-surface", highlight: "highlight-surface",
  text: "text-primary", text2: "text-secondary", muted: "text-muted", faint: "text-faint",
  line: "border-subtle", control: "border-control",
  accent: "accent", "accent-soft": "accent-soft", "accent-hover": "accent-hover", "on-accent": "on-accent",
  btn: "action-fill", "btn-text": "action-text",
  ok: "success-text", "ok-bg": "success-surface", warn: "warning-text", "warn-bg": "warning-surface",
  bad: "danger-text", "bad-bg": "danger-surface", shadow: "shadow-overlay",
} as const satisfies Record<string, ColorToken>;

/** Shape: 4 small controls and menu items, 6 inputs/buttons/chips, 8 dialogs
 * and menus, 10 cards. Nothing rounder except pills (99px). */
export const publicRadius = { ctl: 4, in: 6, dlg: 8, max: 10 } as const;

/** Layout in px. `measure` is the writing column (plus 48px side padding). */
export const layout = { measure: 760, sb: 248, rp: 300, rail: 48, "titlebar-h": 40, "statusbar-h": 26, "tabstrip-h": 36 } as const;

/** Control heights: 30 default on desktop, 36 "large", 44 on touch and in mobile. */
export const controlHeight = { default: 30, sm: 26, lg: 36, touch: 44, icon: 28 } as const;

/** Type. Note body (`fs`/`lh`) is user-adjustable; UI text is fixed. */
export const type = { fs: 16, lh: 1.7, "fs-ui": 14, "lh-ui": 1.45, "fs-small": 12, "fs-title": 34 } as const;
export const fonts = {
  sans: 'system-ui, "Segoe UI Variable", "Segoe UI", -apple-system, Roboto, sans-serif',
  mono: 'ui-monospace, "Cascadia Code", Consolas, monospace',
} as const;

/** Motion in ms. Zeroed under prefers-reduced-motion. */
export const motion = { "dur-1": 120, "dur-2": 150, "dur-3": 180 } as const;
export const easing = "ease-out";

/** One stacking scale. Components use these, never numbers. */
export const zIndex = { base: 0, sticky: 10, overlay: 100, menu: 200, palette: 300, dialog: 400, toast: 500, tooltip: 600 } as const;

// ---- accent colour maths (pure; DOM glue lives in ./dom/theme-api) ----

type Rgb = [number, number, number];
const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.split("").map((c) => c + c).join("") : m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear blend: 0 = a, 1 = b. */
export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a), y = parseHex(b);
  if (!x || !y) return a;
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio, 1..21. Returns 1 for unparseable input. */
export function contrastRatio(fg: string, bg: string): number {
  const a = parseHex(fg), b = parseHex(bg);
  if (!a || !b) return 1;
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export const MIN_ACCENT_CONTRAST = 4.5;

/** Derive hover, soft tint and on-accent text from a user accent. Hover
 * moves away from the surface (darker in light, lighter in dark); soft is the
 * accent at 14% over the editor surface. */
export function deriveAccent(accent: string, theme: Theme) {
  const surface = colors[theme]["surface-editor"];
  const away = theme === "light" ? "#000000" : "#ffffff";
  const light = colors.light["on-accent"], dark = colors.dark["on-accent"];
  return {
    accent: toHex(parseHex(accent) ?? [0, 0, 0]),
    "accent-hover": mixHex(accent, away, 0.2),
    "accent-soft": mixHex(surface, accent, 0.14),
    "on-accent": contrastRatio(light, accent) >= contrastRatio(dark, accent) ? light : dark,
  };
}

/** True when the accent is readable as text on the editor surface. */
export function accentReadable(accent: string, theme: Theme): boolean {
  return contrastRatio(accent, colors[theme]["surface-editor"]) >= MIN_ACCENT_CONTRAST;
}
