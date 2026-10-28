import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colors, contrastRatio, publicColors } from "../../packages/ui/src/index";

const read = (p: string) => readFileSync(new URL(`../../packages/ui/src/${p}`, import.meta.url), "utf8");
const styles = read("dom/styles.css");
const tokens = read("tokens.css");
const m2 = styles.slice(styles.indexOf("/* ---- M2 components"));

const c = (theme: "light" | "dark", name: keyof typeof publicColors) => colors[theme][publicColors[name]];

describe("M2 component styles", () => {
  it("use no raw colours or off-scale radii", () => {
    expect(m2).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(m2).not.toMatch(/rgba?\(/);
    for (const m of m2.matchAll(/border-radius:\s*([^;}]+)/g)) {
      expect(["var(--r-pill)", "var(--r-in)", "var(--r-ctl)", "var(--r-max)", "50%", "4px", "5px"]).toContain(m[1]!.trim());
    }
  });

  it("only reference tokens that exist", () => {
    const defined = new Set([...tokens.matchAll(/(--[a-z0-9-]+):/g)].map((x) => x[1]));
    const local = new Set([...styles.matchAll(/(--[a-z0-9-]+):/g)].map((x) => x[1]));
    const missing = new Set<string>();
    for (const x of styles.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (!defined.has(x[1]!) && !local.has(x[1]!)) missing.add(x[1]!);
    }
    expect([...missing]).toEqual([]);
  });

  it("honour reduced motion and touch size", () => {
    expect(m2).toContain("prefers-reduced-motion: reduce");
    expect(styles).toContain("var(--control-h-touch)");
    expect(styles).toContain("var(--control-h-icon)");
  });

  it("use only motion inside 120-180ms", () => {
    expect(tokens).toMatch(/--dur-1: 120ms/);
    expect(tokens).toMatch(/--dur-3: 180ms/);
    expect(m2).not.toMatch(/\b(?:2\d\d|[3-9]\d\d)ms\b/);
  });
});

describe("component colour pairs meet contrast", () => {
  const pairs: Array<[string, keyof typeof publicColors, keyof typeof publicColors, number]> = [
    ["chip due", "warn", "warn-bg", 4.5],
    ["chip success / badge ok", "ok", "ok-bg", 4.5],
    ["chip priority / badge bad", "bad", "bad-bg", 4.5],
    ["chip planned on selected", "accent", "selected", 4.5],
    ["pill accent", "accent", "accent-soft", 4.5],
    ["chip neutral", "text2", "selected", 4.5],
    ["badge neutral", "text2", "hover", 4.5],
    ["primary button", "btn-text", "btn", 4.5],
    ["tick on checked box", "on-accent", "accent", 4.5],
    ["table header", "muted", "panel", 4.5],
    ["kbd", "muted", "panel", 4.5],
    ["ghost icon button hover", "text", "hover", 4.5],
    ["icon button at rest", "muted", "editor", 4.5],
    ["switch off track vs page (non-text)", "control", "editor", 3],
    ["switch knob on accent (non-text)", "editor", "accent", 3],
    ["checkbox border (non-text)", "control", "editor", 3],
    ["step pending text", "muted", "app", 4.5],
  ];
  for (const theme of ["light", "dark"] as const) {
    for (const [name, fg, bg, min] of pairs) {
      it(`${name} (${theme}) >= ${min}`, () => {
        expect(contrastRatio(c(theme, fg), c(theme, bg))).toBeGreaterThanOrEqual(min);
      });
    }
  }
});
