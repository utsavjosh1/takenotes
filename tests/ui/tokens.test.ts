import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  accentReadable, colors, contrastRatio, deriveAccent, publicColors, zIndex,
} from "../../packages/ui/src/index";
import { ACCENT_KEY, setAccent, setTheme, type ThemeRoot } from "../../packages/ui/src/dom/theme-api";

const css = readFileSync(new URL("../../packages/ui/src/tokens.css", import.meta.url), "utf8");

function fakeRoot(): ThemeRoot & { props: Map<string, string> } {
  const props = new Map<string, string>();
  return {
    dataset: {}, props,
    style: { setProperty: (n, v) => void props.set(n, v), removeProperty: (n) => void props.delete(n) },
  };
}

describe("public tokens", () => {
  it("every public colour points at a real key in both themes", () => {
    for (const key of Object.values(publicColors)) {
      expect(colors.light).toHaveProperty(key);
      expect(colors.dark).toHaveProperty(key);
    }
  });

  it("emits each public name, the system dark block and the reduced-motion rule", () => {
    for (const name of Object.keys(publicColors)) expect(css).toContain(`--${name}: var(--tn-`);
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not([data-theme="light"])');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain("--measure: 760px");
    expect(css).toContain("--control-h: 30px");
    expect(css).toContain("--control-h-touch: 44px");
  });

  it("keeps z-index strictly increasing", () => {
    const v = Object.values(zIndex);
    expect([...v].sort((a, b) => a - b)).toEqual(v);
  });

});

describe("accent maths", () => {
  it("default accents are readable on their own editor surface", () => {
    expect(accentReadable(colors.light.accent, "light")).toBe(true);
    expect(accentReadable(colors.dark.accent, "dark")).toBe(true);
  });

  it("derives hover, soft and on-accent", () => {
    const d = deriveAccent("#4f41d6", "light");
    expect(d["accent-hover"]).not.toBe(d.accent);
    expect(contrastRatio(d["on-accent"], d.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("rejects an unreadable accent and keeps the default", () => {
    const root = fakeRoot();
    expect(setAccent("#ffff00", root)).toBe(false); // yellow on cream
    expect(root.props.has("--accent")).toBe(false);
    expect(setAccent("#1f4fd8", root)).toBe(true);
    expect(root.props.get("--accent")).toBe("#1f4fd8");
    expect(root.props.get("--tn-accent")).toBe("#1f4fd8");
  });

  it("system removes the theme pin", () => {
    const root = fakeRoot();
    setTheme("dark", root);
    expect(root.dataset.theme).toBe("dark");
    setTheme("system", root);
    expect(root.dataset.theme).toBeUndefined();
    expect(ACCENT_KEY).toBe("takenotes.accent");
  });
});
