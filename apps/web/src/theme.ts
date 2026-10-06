import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "takenotes.web.theme";

export function parseTheme(value: string | null | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

export function readThemePreference(): Theme | null {
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Sandboxed/private browsing may deny storage. The toggle still works.
    return null;
  }
}

export function resolveTheme(preference: Theme | null, prefersDark: boolean): Theme {
  return preference ?? (prefersDark ? "dark" : "light");
}

function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useSiteTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, () => parseTheme(document.documentElement.dataset.theme) ?? "light", () => "light");
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#191613" : "#faf6ee");
}
