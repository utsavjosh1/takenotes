import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCENT_TOKENS,
  APPEARANCE_ACCENTS,
  APPEARANCE_SURFACES,
  EDITOR_FONTS,
  appearanceVars,
  clampZoom,
  contrastRatio,
  isAppearanceAccent,
  isEditorFont,
  stepZoom,
  type AppearanceAccent,
  type AppearanceTheme,
} from "../../packages/core/src/appearance/appearance";
import { parseSettings } from "../../packages/core/src/validation/schemas";
import { DEFAULT_SETTINGS } from "../../apps/desktop/src/renderer/components/types";

/** Phase 6a gate: appearance foundation (Step 9). Settings persist +
 * validate, zoom clamps/steps, every accent holds link-text AA on the
 * editor surface in both themes, and the desktop CSS mirrors the token
 * table (drift fails loudly instead of silently forking palettes). */
describe("appearance settings", () => {
  it("defaults to violet/system-sans/100%/inline-title", () => {
    expect(DEFAULT_SETTINGS.accent).toBe("violet");
    expect(DEFAULT_SETTINGS.editorFont).toBe("system");
    expect(DEFAULT_SETTINGS.zoomLevel).toBe(1);
    expect(DEFAULT_SETTINGS.inlineTitle).toBe(true);
  });

  it("parses the persisted appearance fields", () => {
    expect(parseSettings({ accent: "blue", editorFont: "serif", zoomLevel: 1.5, inlineTitle: false }))
      .toMatchObject({ accent: "blue", editorFont: "serif", zoomLevel: 1.5, inlineTitle: false });
  });

  it("drops corrupt appearance values without breaking boot", () => {
    expect(parseSettings({ accent: "neon", editorFont: 3, zoomLevel: "big", inlineTitle: "yes" }))
      .not.toHaveProperty("accent");
    const parsed = parseSettings({ accent: "neon", editorFont: 3, zoomLevel: "big", inlineTitle: "yes" });
    expect(parsed).not.toHaveProperty("editorFont");
    expect(parsed).not.toHaveProperty("zoomLevel");
    expect(parsed).not.toHaveProperty("inlineTitle");
  });

  it("rejects out-of-range zoom at the schema boundary", () => {
    expect(parseSettings({ zoomLevel: 0.5 })).not.toHaveProperty("zoomLevel");
    expect(parseSettings({ zoomLevel: 3 })).not.toHaveProperty("zoomLevel");
  });
});

describe("zoom helpers", () => {
  it("clamps into 0.8–2 with one-decimal steps", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(0.5)).toBe(0.8);
    expect(clampZoom(2.5)).toBe(2);
    expect(clampZoom(1.16)).toBe(1.2);
    expect(clampZoom(0.84)).toBe(0.8);
  });

  it("falls back to 100% for non-numeric input", () => {
    expect(clampZoom(undefined)).toBe(1);
    expect(clampZoom("big")).toBe(1);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("steps ±0.1 without float drift and stops at the rails", () => {
    expect(stepZoom(1, "in")).toBe(1.1);
    expect(stepZoom(1, "out")).toBe(0.9);
    expect(stepZoom(1.1, "in")).toBe(1.2);
    expect(stepZoom(2, "in")).toBe(2);
    expect(stepZoom(0.8, "out")).toBe(0.8);
    expect(stepZoom(Number.NaN, "in")).toBe(1.1);
  });
});

describe("appearanceVars", () => {
  it("maps the editor face to a bundled system stack", () => {
    expect(appearanceVars({ editorFont: "system", fontSize: 16, lineHeight: 1.625, readableWidth: 760 })["--font-editor"])
      .toContain("system-ui");
    expect(appearanceVars({ editorFont: "serif", fontSize: 16, lineHeight: 1.625, readableWidth: 760 })["--font-editor"])
      .toContain("Georgia");
    expect(appearanceVars({ editorFont: "mono", fontSize: 16, lineHeight: 1.625, readableWidth: 760 })["--font-editor"])
      .toContain("monospace");
  });

  it("passes font size, line height, and measure through", () => {
    const vars = appearanceVars({ editorFont: "system", fontSize: 18, lineHeight: 1.7, readableWidth: 900 });
    expect(vars["--editor-font-size"]).toBe("18px");
    expect(vars["--editor-line-height"]).toBe("1.7");
    expect(vars["--editor-max-width"]).toBe("900px");
  });

  it("never points at a remote font", () => {
    for (const font of EDITOR_FONTS) {
      const stack = appearanceVars({ editorFont: font, fontSize: 16, lineHeight: 1.625, readableWidth: 760 })["--font-editor"]!;
      expect(stack).not.toMatch(/https?:|url\(|@font-face/i);
    }
  });
});

describe("accent guards", () => {
  it("accepts only the shipped accent families and editor faces", () => {
    for (const accent of APPEARANCE_ACCENTS) expect(isAppearanceAccent(accent)).toBe(true);
    expect(isAppearanceAccent("neon")).toBe(false);
    expect(isAppearanceAccent(undefined)).toBe(false);
    for (const font of EDITOR_FONTS) expect(isEditorFont(font)).toBe(true);
    expect(isEditorFont("comic")).toBe(false);
  });
});

describe("accent contrast (AA on the editor surface)", () => {
  const themes: AppearanceTheme[] = ["light", "dark"];
  const accents: AppearanceAccent[] = [...APPEARANCE_ACCENTS];
  for (const theme of themes) {
    for (const accent of accents) {
      it(`${accent}/${theme}: link text holds 4.5:1 on the editor`, () => {
        const tokens = ACCENT_TOKENS[accent][theme];
        const surface = APPEARANCE_SURFACES[theme].editor;
        expect(contrastRatio(tokens.accent, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens.accentHover, surface)).toBeGreaterThanOrEqual(4.5);
      });
      it(`${accent}/${theme}: primary text holds 4.5:1 on selection fills`, () => {
        const tokens = ACCENT_TOKENS[accent][theme];
        expect(contrastRatio(APPEARANCE_SURFACES[theme].textPrimary, tokens.selection)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

/** Drift tripwire: `styles/tokens.css` `[data-accent]` rules must mirror
 * `ACCENT_TOKENS` — update both deliberately when adding an accent. */
describe("accent css mirror", () => {
  const css = readFileSync(
    join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", "styles", "tokens.css"),
    "utf8",
  );
  for (const accent of APPEARANCE_ACCENTS) {
    for (const theme of ["light", "dark"] as const) {
      const tokens = ACCENT_TOKENS[accent][theme];
      it(`css carries ${accent}/${theme} (${tokens.accent})`, () => {
        expect(css).toContain(tokens.accent);
        expect(css).toContain(tokens.accentHover);
        expect(css).toContain(tokens.selection);
      });
    }
  }
});
