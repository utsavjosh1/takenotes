import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { applyTheme, parseTheme, readThemePreference, resolveTheme, THEME_STORAGE_KEY, type Theme } from "../theme";
import { Icon } from "./Icon";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => parseTheme(document.documentElement.dataset.theme) ?? resolveTheme(readThemePreference(), window.matchMedia("(prefers-color-scheme: dark)").matches));
  const [animating, setAnimating] = useState(false);
  const preference = useRef(readThemePreference());
  const inFlight = useRef(false);

  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const next = resolveTheme(preference.current, system.matches);
      applyTheme(next);
      setTheme(next);
    };
    const onSystemChange = () => { if (preference.current === null) sync(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      preference.current = parseTheme(event.newValue);
      sync();
    };
    sync();
    system.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      system.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function toggle(button: HTMLButtonElement): void {
    if (inFlight.current) return;
    const next: Theme = theme === "light" ? "dark" : "light";
    preference.current = next;
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* In-memory preference still works. */ }

    const update = () => {
      flushSync(() => setTheme(next));
      applyTheme(next);
    };
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update();
      return;
    }

    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const root = document.documentElement;
    root.style.setProperty("--theme-x", `${x}px`);
    root.style.setProperty("--theme-y", `${y}px`);
    root.style.setProperty("--theme-radius", `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
    root.classList.add("theme-revealing");
    inFlight.current = true;
    setAnimating(true);
    const finish = () => {
      root.classList.remove("theme-revealing");
      inFlight.current = false;
      setAnimating(false);
    };
    try {
      const transition = document.startViewTransition(update);
      // Hidden documents can skip the animation; the theme must still change.
      void transition.ready.catch(() => {});
      void transition.finished.then(finish, finish);
    } catch {
      update();
      finish();
    }
  }

  const label = `Switch to ${theme === "light" ? "dark" : "light"} theme`;
  return <button className="theme-toggle" type="button" onClick={(event) => toggle(event.currentTarget)} aria-label={label} title={label} aria-disabled={animating}>
    <span className="theme-toggle-icons" aria-hidden="true"><span className="theme-icon-sun"><Icon name="sun" size={19} /></span><span className="theme-icon-moon"><Icon name="moon" size={19} /></span></span>
  </button>;
}
