import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(__dirname, "..", "..", "apps", "web", "src");
const read = (f: string) => readFileSync(join(dir, f), "utf8");
const siteCss = ["App.css", "theme.css", "blog.css"].map((f) => [f, read(f)] as const);
const brand = read("brand.css");
const tokens = readFileSync(join(__dirname, "..", "..", "packages", "ui", "src", "tokens.css"), "utf8");
const tsx = readdirSync(join(dir, "components")).filter((f) => f.endsWith(".tsx")).map((f) => read(`components/${f}`)).concat(read("App.tsx"));

describe("web uses the product design", () => {
  it("has no raw colours outside the brand layer", () => {
    for (const [file, css] of siteCss) {
      expect(css, file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(css, file).not.toMatch(/\brgba?\(|\bhsla?\(/);
    }
  });

  it("keeps the brand layer small and colour-only", () => {
    const names = [...brand.matchAll(/(--brand-[a-z0-9-]+):/g)].map((m) => m[1]);
    expect(new Set(names).size).toBeLessThanOrEqual(45);
    expect(brand).not.toMatch(/border-radius|font-size/);
  });

  it("is no rounder than 10px except pills and circles", () => {
    for (const [file, css] of siteCss) {
      for (const m of css.matchAll(/radius[a-z-]*:\s*([^;}]+)/g)) {
        for (const v of m[1]!.trim().split(/\s+/)) {
          if (/^\d/.test(v)) expect(["50%", "0"].includes(v) || Number(v.replace("px", "")) <= 10, `${file}: ${v}`).toBe(true);
        }
      }
    }
  });

  it("no longer defines the old palette or button classes", () => {
    for (const [file, css] of siteCss) {
      expect(css, file).not.toMatch(/--(paper|paper-deep|paper-card|ink|ink-soft|line-soft|violet|violet-deep|violet-wash|mint|mint-ink|amber|dark-btn|solid|on-ink|control-line|hover-fill|radius-(sm|md|lg)|shadow-(soft|card)|font-sans|font-display|font-hand)\b/);
      expect(css, file).not.toMatch(/^\.button|\.button-(dark|text|outline|small)/m);
    }
  });

  it("only references tokens that exist", () => {
    const defined = new Set([...tokens.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
    for (const m of brand.matchAll(/(--[a-z0-9-]+):/g)) defined.add(m[1]!);
    for (const [, css] of siteCss) for (const m of css.matchAll(/(--[a-z0-9-]+):/g)) defined.add(m[1]!);
    // Set inline by ThemeToggle for the reveal animation.
    for (const v of ["--theme-x", "--theme-y", "--theme-radius"]) defined.add(v);
    const missing = new Set<string>();
    for (const [, css] of siteCss) for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) if (!defined.has(m[1]!)) missing.add(m[1]!);
    expect([...missing]).toEqual([]);
  });

  it("uses the stacking scale and the 12px text floor", () => {
    for (const [file, css] of siteCss) {
      for (const m of css.matchAll(/z-index:\s*([^;}]+)/g)) expect(m[1], file).toMatch(/var\(--z-/);
      for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1]), file).toBeGreaterThanOrEqual(12);
    }
  });

  it("uses the shared buttons, and the system font for interface text", () => {
    const all = tsx.join("\n");
    expect(all).toContain('from "@takenotes/ui/dom"');
    expect(all).not.toMatch(/className="[^"]*(?<![-\w])button(?![-\w])/);
    expect(all).toContain("tn-button");
    expect(readFileSync(join(dir, "..", "index.html"), "utf8")).not.toContain("family=Inter");
    expect(read("App.css")).toMatch(/font-family:\s*var\(--font\)/);
  });

  it("scopes the notebook preview with data-theme so product tokens apply", () => {
    expect(read("components/NotebookPreview.tsx")).toContain('data-theme={dark ? "dark" : "light"}');
  });

  it("loads product tokens, component styles, then the brand layer", () => {
    const main = read("main.tsx");
    expect(main.indexOf("tokens.css")).toBeLessThan(main.indexOf("dom.css"));
    expect(main.indexOf("dom.css")).toBeLessThan(main.indexOf("brand.css"));
  });
});
