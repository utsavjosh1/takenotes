/**
 * Appearance foundation (Step 9, slice 6a): pure helpers for the
 * user-visible theme controls. No DOM, no Electron, no filesystem —
 * runnable on any OS. The renderer applies the computed variables in
 * `App`'s settings effect; CodeMirror reads the same `--accent` /
 * `--font-editor` variables so the editor follows without a remount.
 *
 * Accent is reserved for links, focus, selection, and active controls.
 * Every accent ships explicit light/dark pairs that hold AA for link
 * text on the editor surface (verified in tests/appearance/) — a new
 * accent must add its pairs here, never a hardcoded hex in CSS.
 */

export const APPEARANCE_ACCENTS = ["violet", "blue", "graphite"] as const;
export type AppearanceAccent = (typeof APPEARANCE_ACCENTS)[number];

/** Editor body face. UI chrome stays OS-native system sans (foundations);
 * only the writing surface is switchable, and only to bundled system
 * stacks — no remote font request, offline-safe. */
export const EDITOR_FONTS = ["system", "serif", "mono"] as const;
export type EditorFont = (typeof EDITOR_FONTS)[number];

export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1;

export type AppearanceTheme = "light" | "dark";

type AccentPair = { accent: string; accentHover: string; selection: string };

/** Per-accent, per-theme tokens applied over `--tn-*` as `[data-accent]`
 * overrides. `accent-soft` (selected-row tick wash) is derived in CSS via
 * `color-mix` from `--accent`, so it follows automatically. */
export const ACCENT_TOKENS: Record<AppearanceAccent, Record<AppearanceTheme, AccentPair>> = {
  violet: {
    light: { accent: "#4f41d6", accentHover: "#4032ba", selection: "#e3dcff" },
    dark: { accent: "#ad9fff", accentHover: "#c3b9ff", selection: "#493968" },
  },
  blue: {
    light: { accent: "#1f4fd8", accentHover: "#1a41b4", selection: "#d7e3ff" },
    dark: { accent: "#9dbcff", accentHover: "#bcd2ff", selection: "#2c3d63" },
  },
  graphite: {
    light: { accent: "#4a453c", accentHover: "#37332c", selection: "#d8d2c4" },
    dark: { accent: "#cfc5ae", accentHover: "#e2d9c2", selection: "#4a4436" },
  },
};

/** Editor surfaces these pairs sit on (mirrors `packages/ui` theme). */
export const APPEARANCE_SURFACES: Record<AppearanceTheme, { editor: string; textPrimary: string }> = {
  light: { editor: "#fffdf7", textPrimary: "#191817" },
  dark: { editor: "#191613", textPrimary: "#f4ecd9" },
};

export const EDITOR_FONT_STACKS: Record<EditorFont, string> = {
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", "Nimbus Roman", serif',
  mono: 'ui-monospace, "Cascadia Code", Consolas, monospace',
};

export function isAppearanceAccent(value: unknown): value is AppearanceAccent {
  return (
    typeof value === "string" && (APPEARANCE_ACCENTS as readonly string[]).includes(value)
  );
}

export function isEditorFont(value: unknown): value is EditorFont {
  return typeof value === "string" && (EDITOR_FONTS as readonly string[]).includes(value);
}

/** Clamp a persisted zoom factor into range; non-finite input → default. */
export function clampZoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return ZOOM_DEFAULT;
  const rounded = Math.round(value * 10) / 10;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, rounded));
}

/** One quick-adjust step from the current factor (`"in" | "out"`). */
export function stepZoom(current: number, direction: "in" | "out"): number {
  const base = clampZoom(current);
  const next = base + (direction === "in" ? ZOOM_STEP : -ZOOM_STEP);
  return clampZoom(Math.round(next * 10) / 10);
}

export type AppearanceVarsInput = {
  editorFont: EditorFont;
  fontSize: number;
  lineHeight: number;
  readableWidth: number;
};

/** Pure continuous-variable set for `App`'s settings effect (font face /
 * size / measure). Accent is discrete: `App` sets only `data-accent` and
 * `styles/tokens.css` applies `ACCENT_TOKENS` — one applier, with a drift
 * test asserting the CSS hexes match this table. */
export function appearanceVars(input: AppearanceVarsInput): Record<string, string> {
  return {
    "--font-editor": EDITOR_FONT_STACKS[input.editorFont],
    "--editor-font-size": `${input.fontSize}px`,
    "--editor-line-height": String(input.lineHeight),
    "--editor-max-width": `${input.readableWidth}px`,
  };
}

/** WCAG relative luminance for an sRGB hex color. */
export function luminanceOf(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  const body = m?.[1];
  if (!body) throw new Error(`Bad hex color: ${hex}`);
  const channel = (offset: number): number => {
    const c = parseInt(body.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two sRGB hex colors (1–21). */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminanceOf(foreground);
  const b = luminanceOf(background);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
