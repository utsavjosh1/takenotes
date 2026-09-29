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
    "text-primary": "#191817",
    "text-secondary": "#4c4a45",
    // Slightly stronger than the original guide: >= 4.5:1 on hover too.
    "text-muted": "#6c6558",
    "border-subtle": "#e5dcc8",
    "border-control": "#8a806d",
    accent: "#4f41d6",
    "accent-hover": "#4032ba",
    "action-fill": "#1d1c1a",
    "action-text": "#fffdf7",
    "success-text": "#356b2f",
    "success-surface": "#e7f4df",
    "warning-text": "#805500",
    "warning-surface": "#fff3d1",
    "danger-text": "#a53240",
    "danger-surface": "#fcebed",
    selection: "#e3dcff",
    "code-surface": "#f3ecdd",
    "highlight-surface": "#ffdf8e",
    scrollbar: "#cbbfa6",
  },
  dark: {
    "surface-app": "#151310",
    "surface-sidebar": "#201c16",
    "surface-editor": "#191613",
    "surface-overlay": "#26211a",
    "surface-input": "#191613",
    "surface-hover": "#322b22",
    "surface-selected": "#342b50",
    "text-primary": "#f4ecd9",
    "text-secondary": "#d9cfae",
    "text-muted": "#b7ad9b",
    "border-subtle": "#38322a",
    "border-control": "#887d69",
    accent: "#ad9fff",
    "accent-hover": "#c3b9ff",
    "action-fill": "#f4ecd9",
    "action-text": "#191817",
    "success-text": "#b9e5a8",
    "success-surface": "#20321f",
    "warning-text": "#ffdf8e",
    "warning-surface": "#352a14",
    "danger-text": "#ffadb5",
    "danger-surface": "#3b2025",
    selection: "#493968",
    "code-surface": "#26211a",
    "highlight-surface": "#59451b",
    scrollbar: "#5a5042",
  },
} as const;

export type Theme = keyof typeof colors;
export type ThemePreference = Theme | "system";
export type ColorToken = keyof typeof colors.light;

export function resolveTheme(preference: ThemePreference, system: Theme): Theme {
  return preference === "system" ? system : preference;
}

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;
export const radius = { row: 6, control: 8, menu: 12, dialog: 16 } as const;
export const fontSize = { secondary: 12, control: 14, heading: 20, body: 16, "touch-control": 16, "touch-body": 17 } as const;
export const lineHeight = { ui: 1.4, heading: 1.3, body: 1.65 } as const;
export const targetSize = { control: 36, icon: 32, row: 32, touch: 48, "touch-row": 52 } as const;
