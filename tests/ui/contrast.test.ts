import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { colors, type ColorToken, type Theme } from "../../packages/ui/src/theme";
import { ACCENT_TOKENS, contrastRatio, type AppearanceAccent } from "../../packages/core/src/appearance/appearance";

const THEMES: Theme[] = ["light", "dark"];
const ACCENTS: AppearanceAccent[] = ["violet", "blue", "graphite"];
/** Every surface body text can sit on (status fills included). */
const SURFACES: ColorToken[] = [
  "surface-app", "surface-sidebar", "surface-editor", "surface-overlay",
  "surface-hover", "surface-selected", "code-surface",
];
const TEXTS: ColorToken[] = [
  "text-primary", "text-secondary", "text-muted",
  "accent", "accent-hover", "success-text", "warning-text", "danger-text",
];

function css(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", ...parts), "utf8");
}

/** Phase 6e gate: measured contrast over the shipped palette (not the
 * design doc's examples). Text holds AA everywhere it can appear;
 * necessary non-text controls hold 3:1. Exemptions are named, never
 * silent: `border-subtle` is decorative separation only (see foundations),
 * and `mark` pins primary text (audited below). */
describe("text contrast (AA)", () => {
  for (const theme of THEMES) {
    for (const text of TEXTS) {
      for (const surface of SURFACES) {
        it(`${theme}: ${text} on ${surface} ≥ 4.5`, () => {
          expect(contrastRatio(colors[theme][text], colors[theme][surface])).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
    it(`${theme}: status text on its own surface ≥ 4.5`, () => {
      expect(contrastRatio(colors[theme]["success-text"], colors[theme]["success-surface"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors[theme]["warning-text"], colors[theme]["warning-surface"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors[theme]["danger-text"], colors[theme]["danger-surface"])).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: primary text on selection + highlight + action pair ≥ 4.5`, () => {
      expect(contrastRatio(colors[theme]["text-primary"], colors[theme]["selection"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors[theme]["text-primary"], colors[theme]["highlight-surface"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors[theme]["action-text"], colors[theme]["action-fill"])).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("accent-family contrast (AA, all user-selectable accents)", () => {
  for (const theme of THEMES) {
    for (const accent of ACCENTS) {
      const tokens = ACCENT_TOKENS[accent][theme];
      for (const surface of ["surface-app", "surface-sidebar", "surface-editor", "surface-overlay", "surface-hover", "surface-selected"] as const) {
        it(`${theme}/${accent}: link text on ${surface} ≥ 4.5`, () => {
          expect(contrastRatio(tokens.accent, colors[theme][surface])).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(tokens.accentHover, colors[theme][surface])).toBeGreaterThanOrEqual(4.5);
        });
      }
      it(`${theme}/${accent}: primary text on selection fill ≥ 4.5`, () => {
        expect(contrastRatio(colors[theme]["text-primary"], tokens.selection)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("non-text contrast (3:1 for necessary controls)", () => {
  for (const theme of THEMES) {
    it(`${theme}: input boundary on input fill ≥ 3`, () => {
      expect(contrastRatio(colors[theme]["border-control"], colors[theme]["surface-input"])).toBeGreaterThanOrEqual(3);
    });
    for (const surface of ["surface-app", "surface-sidebar", "surface-editor", "surface-hover"] as const) {
      it(`${theme}: scrollbar on ${surface} ≥ 3`, () => {
        expect(contrastRatio(colors[theme]["scrollbar"], colors[theme][surface])).toBeGreaterThanOrEqual(3);
      });
    }
    // Focus ring + selected-row tick: every accent, every surface they edge.
    for (const accent of ACCENTS) {
      const tokens = ACCENT_TOKENS[accent][theme];
      for (const surface of ["surface-app", "surface-sidebar", "surface-editor", "surface-hover", "surface-selected"] as const) {
        it(`${theme}/${accent}: focus indicator on ${surface} ≥ 3`, () => {
          expect(contrastRatio(tokens.accent, colors[theme][surface])).toBeGreaterThanOrEqual(3);
        });
      }
    }
  }
});

describe("typography floor (12px minimum for DOM text)", () => {
  const sheets = [
    css("apps", "desktop", "src", "renderer", "styles", "app.css"),
    css("packages", "ui", "src", "dom", "styles.css"),
  ];
  it("no 10/11px DOM text remains", () => {
    const offenders: string[] = [];
    for (const sheet of sheets) {
      for (const line of sheet.split("\n")) {
        if (!/font-size:\s*1[01]px/.test(line)) continue;
        // Exempt: SVG canvas/graph labels (zoomable content, `fill`-based),
        // the decorative pin glyph (parent tab names the state), and the
        // scrollbar itself (non-text control, covered above).
        if (/fill|pin-dot|scrollbar/i.test(line)) continue;
        offenders.push(line.trim());
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("reduced motion + highlight safety nets", () => {
  it("collapses motion globally under prefers-reduced-motion", () => {
    const tokens = css("apps", "desktop", "src", "renderer", "styles", "tokens.css");
    expect(tokens).toContain("@media (prefers-reduced-motion: reduce)");
    expect(tokens).toContain("transition-duration: 0ms !important");
    const dom = css("packages", "ui", "src", "dom", "styles.css");
    expect(dom).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("introduces no animation or smooth-scroll outside the guard", () => {
    const all = [
      css("apps", "desktop", "src", "renderer", "styles", "app.css"),
      css("packages", "ui", "src", "dom", "styles.css"),
    ].join("\n");
    expect(all).not.toMatch(/^\s*animation[^:]*:/m);
    expect(all).not.toContain("scroll-behavior");
  });

  it("search highlights pin primary text (muted/accent-on-highlight never occur)", () => {
    const app = css("apps", "desktop", "src", "renderer", "styles", "app.css");
    expect(app).toMatch(/\.search-result mark \{[^}]*color: var\(--text-primary\)/);
  });

  it("editor find matches use the verified highlight pair", () => {
    const editor = css("apps", "desktop", "src", "renderer", "editor", "create-editor.ts");
    expect(editor).toContain('".cm-searchMatch"');
    expect(editor).toMatch(/cm-searchMatch[^}]*var\(--highlight-surface\)/);
  });
});
