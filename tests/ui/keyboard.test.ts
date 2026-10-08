import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { moveRovingIndex } from "../../packages/ui/src/behavior";

function rendererSource(name: string): string {
  return readFileSync(
    join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", name),
    "utf8",
  );
}

/** Phase 6c gate: one shared roving-tabindex mapping behind the settings
 * tablist, the tab strip, and context menus — arrows wrap, Home/End jump,
 * orientation gates the axis, anything else stays native. */
describe("moveRovingIndex", () => {
  it("moves forward/backward with wrap", () => {
    expect(moveRovingIndex(0, 3, "ArrowRight")).toBe(1);
    expect(moveRovingIndex(2, 3, "ArrowRight")).toBe(0);
    expect(moveRovingIndex(0, 3, "ArrowLeft")).toBe(2);
    expect(moveRovingIndex(1, 3, "ArrowDown")).toBe(2);
    expect(moveRovingIndex(0, 3, "ArrowUp")).toBe(2);
  });

  it("jumps on Home/End", () => {
    expect(moveRovingIndex(2, 5, "Home")).toBe(0);
    expect(moveRovingIndex(0, 5, "End")).toBe(4);
  });

  it("gates the axis by orientation", () => {
    expect(moveRovingIndex(1, 4, "ArrowDown", "horizontal")).toBe(null);
    expect(moveRovingIndex(1, 4, "ArrowRight", "horizontal")).toBe(2);
    expect(moveRovingIndex(1, 4, "ArrowRight", "vertical")).toBe(null);
    expect(moveRovingIndex(1, 4, "ArrowUp", "vertical")).toBe(0);
    expect(moveRovingIndex(1, 4, "Home", "vertical")).toBe(0);
  });

  it("leaves other keys to native behavior", () => {
    expect(moveRovingIndex(1, 4, "Enter")).toBe(null);
    expect(moveRovingIndex(1, 4, " ")).toBe(null);
    expect(moveRovingIndex(1, 4, "Delete")).toBe(null);
    expect(moveRovingIndex(1, 4, "Tab")).toBe(null);
  });

  it("clamps out-of-range input and refuses empty lists", () => {
    expect(moveRovingIndex(9, 3, "ArrowRight")).toBe(0);
    expect(moveRovingIndex(-2, 3, "ArrowLeft")).toBe(2);
    expect(moveRovingIndex(0, 0, "ArrowRight")).toBe(null);
    expect(moveRovingIndex(0, 1, "ArrowRight")).toBe(0);
    expect(moveRovingIndex(Number.NaN, 3, "ArrowRight")).toBe(null);
  });
});

/** Wiring audits: the components above can't render in the node harness,
 * so these tripwires fail if the tablist/tabs/menu/tree/skip-link
 * semantics regress — update deliberately, never silently. */
describe("keyboard wiring", () => {
  it("settings nav is a vertical tablist with a labelled panel", () => {
    const source = rendererSource(join("components", "settings.tsx"));
    expect(source).toContain('role="tablist"');
    expect(source).toContain('aria-orientation="vertical"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("moveRovingIndex");
  });

  it("tab strip roves with automatic activation", () => {
    const source = rendererSource(join("components", "overlays.tsx"));
    expect(source).toContain("data-tab-key");
    expect(source).toContain("moveRovingIndex");
    expect(source).toContain('"Delete"');
  });

  it("context menu arrows between items and returns focus", () => {
    const source = rendererSource(join("components", "overlays.tsx"));
    expect(source).toContain('aria-label="Actions"');
    expect(source).toContain(".ctx-item:not(:disabled)");
    expect(source).toContain("opener");
  });

  it("file tree exposes one Tab stop with travelling focus", () => {
    const tree = rendererSource(join("components", "tree.tsx"));
    expect(tree).toContain("tabbableRel");
    const hook = rendererSource(join("hooks", "use-file-tree.ts"));
    expect(hook).toContain('?.focus({ preventScroll: true })');
  });

  it("skip link targets a labelled main region", () => {
    const source = rendererSource("App.tsx");
    expect(source).toContain('className="skip-link"');
    expect(source).toContain('href="#main-content"');
    expect(source).toContain('id="main-content"');
  });
});
