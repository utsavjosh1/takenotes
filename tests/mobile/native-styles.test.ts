import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buttonStyle, cardStyle, chipStyle, fieldStyle, noticeStyle, palette, radii, rowStyle, scaledFont, touch } from "@takenotes/ui/native";
import { colors, contrastRatio, publicColors } from "@takenotes/ui";

const themes = ["light", "dark"] as const;

describe("native palette", () => {
  it("resolves every public colour in both themes", () => {
    for (const t of themes) {
      const p = palette(t);
      for (const name of Object.keys(publicColors).filter((n) => n !== "shadow")) expect(p[name as keyof typeof p], `${t}/${name}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it("matches the web tokens exactly", () => {
    expect(palette("light").accent).toBe(colors.light.accent);
    expect(palette("dark").text).toBe(colors.dark["text-primary"]);
  });
});

describe("touch sizes", () => {
  it("every control is at least 44pt", () => {
    expect(touch.control).toBeGreaterThanOrEqual(44);
    expect(touch.row).toBeGreaterThanOrEqual(44);
    for (const t of themes) {
      for (const v of ["default", "primary", "ghost", "danger", "secondary", "quiet", "destructive"] as const) {
        expect(buttonStyle(v, t).height).toBeGreaterThanOrEqual(44);
      }
      expect(fieldStyle(t).minHeight).toBeGreaterThanOrEqual(44);
      expect(rowStyle(t).minHeight).toBeGreaterThanOrEqual(44);
    }
  });
  it("font scale grows text but never the hit area", () => {
    expect(scaledFont(16, 1.3)).toBeCloseTo(20.8);
    expect(scaledFont(16, 0.85)).toBeCloseTo(13.6);
    expect(buttonStyle("primary", "light").height).toBe(touch.control);
  });
  it("is no rounder than 10 except pills", () => {
    expect([radii.ctl, radii.field, radii.dialog, radii.card].every((r) => r <= 10)).toBe(true);
    expect(radii.pill).toBe(99);
  });
});

describe("button states", () => {
  it("dims when disabled and keeps deprecated names working", () => {
    expect(buttonStyle("primary", "light", { disabled: true }).opacity).toBe(0.45);
    expect(buttonStyle("destructive", "light")).toEqual(buttonStyle("danger", "light"));
    expect(buttonStyle("quiet", "dark")).toEqual(buttonStyle("ghost", "dark"));
  });
  it("shows pressed feedback", () => {
    expect(buttonStyle("default", "light", { pressed: true }).backgroundColor).not.toBe(buttonStyle("default", "light").backgroundColor);
    expect(buttonStyle("default", "light", { pressed: true, disabled: true }).backgroundColor).toBe(buttonStyle("default", "light", { disabled: true }).backgroundColor);
  });
  it("text is readable on every variant", () => {
    for (const t of themes) {
      const p = palette(t);
      const page = p.editor;
      const primary = buttonStyle("primary", t);
      expect(contrastRatio(primary.color, primary.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(buttonStyle("default", t).color, buttonStyle("default", t).backgroundColor)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(buttonStyle("ghost", t).color, page)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(buttonStyle("danger", t).color, page)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("fields", () => {
  it("marks invalid with the error colour and focus with a thicker accent border", () => {
    for (const t of themes) {
      expect(fieldStyle(t, { invalid: true }).borderColor).toBe(palette(t).bad);
      expect(fieldStyle(t, { focused: true }).borderWidth).toBe(2);
      expect(fieldStyle(t, { focused: true }).borderColor).toBe(palette(t).accent);
      expect(contrastRatio(fieldStyle(t).borderColor, fieldStyle(t).backgroundColor)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("notices, chips, cards", () => {
  it("announces warnings and errors only", () => {
    expect(noticeStyle("danger", "light").accessibilityRole).toBe("alert");
    expect(noticeStyle("warning", "dark").accessibilityRole).toBe("alert");
    expect(noticeStyle("info", "light").accessibilityRole).toBeUndefined();
    expect(noticeStyle("success", "light").accessibilityRole).toBeUndefined();
  });
  it("every tone is readable", () => {
    for (const t of themes) {
      for (const tone of ["info", "success", "warning", "danger"] as const) {
        const s = noticeStyle(tone, t);
        expect(contrastRatio(s.color, s.backgroundColor), `${t}/${tone}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const tone of ["neutral", "due", "planned", "priority", "success"] as const) {
        const s = chipStyle(tone, t);
        expect(contrastRatio(s.color, s.backgroundColor), `${t}/chip ${tone}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("rows and cards use theme surfaces", () => {
    expect(rowStyle("light", { selected: true }).backgroundColor).toBe(palette("light").selected);
    expect(rowStyle("dark", { dimmed: true }).opacity).toBe(0.5);
    expect(cardStyle("dark").backgroundColor).toBe(palette("dark").panel);
  });
});

describe("mobile source follows the rules", () => {
  const root = join(__dirname, "..", "..", "apps", "mobile");
  const files = [...readdirSync(join(root, "components")).map((f) => join(root, "components", f)),
    ...readdirSync(join(root, "app", "(tabs)")).map((f) => join(root, "app", "(tabs)", f))].filter((f) => /\.tsx?$/.test(f));
  const src = files.map((f) => readFileSync(f, "utf8"));
  it("has no raw colours or hard-coded 44s", () => {
    for (const s of src) {
      expect(s).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(s).not.toMatch(/rgba?\(/);
      expect(s).not.toMatch(/minHeight:\s*\d/);
    }
  });
  it("uses plain words", () => {
    for (const s of src) expect(s.replace(/\.md\b/g, "")).not.toMatch(/\b(markdown|backlinks?|outline|properties|frontmatter|vault|wikilinks?)\b/i);
  });
  it("every screen shows loading, empty and error states", () => {
    const screens = files.filter((f) => f.includes("(tabs)") && !f.endsWith("_layout.tsx")).map((f) => readFileSync(f, "utf8"));
    expect(screens.length).toBe(4);
    for (const s of screens) expect(s, "screen").toMatch(/Loading|Skeleton/);
  });
});
