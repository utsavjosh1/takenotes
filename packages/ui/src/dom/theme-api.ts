import { accentReadable, deriveAccent, type Theme, type ThemePreference } from "../theme";

/** Browser glue for theme and accent. Pure maths lives in ../theme. */
export const THEME_KEY = "takenotes.theme";
export const ACCENT_KEY = "takenotes.accent";

/** The slice of an element these functions touch. Lets tests pass a fake. */
export interface ThemeRoot {
  dataset: Record<string, string | undefined>;
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): void };
}

const ACCENT_PROPS = ["accent", "accent-hover", "accent-soft", "on-accent"] as const;

function rootEl(root?: ThemeRoot): ThemeRoot {
  return root ?? (document.documentElement as unknown as ThemeRoot);
}

function remember(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* Private mode or blocked storage: the choice still applies this session. */ }
}

function recall(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function systemTheme(): Theme {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Theme currently in effect on the root. */
export function activeTheme(root?: ThemeRoot): Theme {
  const pinned = rootEl(root).dataset.theme;
  return pinned === "dark" || pinned === "light" ? pinned : systemTheme();
}

/** `system` removes the pin so tokens.css follows the OS. Re-checks the accent. */
export function setTheme(preference: ThemePreference, root?: ThemeRoot): void {
  const el = rootEl(root);
  if (preference === "system") delete el.dataset.theme; else el.dataset.theme = preference;
  remember(THEME_KEY, preference);
  const accent = recall(ACCENT_KEY);
  if (accent) applyAccent(accent, el);
}

function applyAccent(hex: string, el: ThemeRoot): boolean {
  const theme = activeTheme(el);
  if (!accentReadable(hex, theme)) {
    for (const p of ACCENT_PROPS) el.style.removeProperty(`--${p}`);
    return false;
  }
  const derived = deriveAccent(hex, theme);
  for (const p of ACCENT_PROPS) {
    el.style.setProperty(`--${p}`, derived[p]);
  }
  return true;
}

/** Set a custom accent. Returns false, and keeps the default, when the colour
 * is not readable (4.5:1) on the editor surface in the current theme. */
export function setAccent(hex: string | null, root?: ThemeRoot): boolean {
  const el = rootEl(root);
  if (hex === null) {
    for (const p of ACCENT_PROPS) el.style.removeProperty(`--${p}`);
    remember(ACCENT_KEY, null);
    return true;
  }
  remember(ACCENT_KEY, hex);
  return applyAccent(hex, el);
}

/** Apply the remembered choices. Call once at app start. */
export function initTheme(root?: ThemeRoot): void {
  const el = rootEl(root);
  const pref = recall(THEME_KEY);
  if (pref === "light" || pref === "dark") el.dataset.theme = pref;
  const accent = recall(ACCENT_KEY);
  if (accent) applyAccent(accent, el);
}
