import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { searchResultSummary } from "../../packages/core/src/search/summary";

function rendererSource(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", ...parts), "utf8");
}

/** Phase 6d gate: result-state semantics + live regions. The status strip
 * never announces per-keystroke counters, search/palette expose one
 * announcement each with proper list semantics, and no faux controls
 * remain in the link panes. */
describe("searchResultSummary", () => {
  it("counts files and matches with singular forms", () => {
    expect(searchResultSummary(1, 1)).toBe("1 file · 1 match");
    expect(searchResultSummary(2, 1)).toBe("2 files · 1 match");
    expect(searchResultSummary(1, 5)).toBe("1 file · 5 matches");
    expect(searchResultSummary(0, 0)).toBe("0 files · 0 matches");
  });
});

describe("live-region wiring", () => {
  it("status strip announces only save/connection states", () => {
    const source = rendererSource("components", "chrome.tsx");
    expect(source).not.toMatch(/<footer className="statusbar" role="status"/);
    expect(source).toContain('<span role="status">');
  });

  it("search states announce once with grouped results", () => {
    const source = rendererSource("components", "search.tsx");
    expect(source).toContain('role="status">Searching…');
    expect(source).toContain("searchResultSummary(");
    expect(source).toContain('role="group" aria-label="Files matching by name"');
    expect(source).toContain('role="group" aria-label="Files matching by content"');
    expect(source).toContain('role="status">No matches for');
    expect(source).toContain('role="alert">{searchError}');
  });

  it("palette follows the combobox pattern", () => {
    const source = rendererSource("components", "palette.tsx");
    expect(source).toContain('role="combobox"');
    expect(source).toContain('aria-controls="cmd-listbox"');
    expect(source).toContain("aria-activedescendant");
    expect(source).toContain('id="cmd-listbox"');
    expect(source).toContain("cmd-opt-${i}");
    expect(source).toContain("aria-disabled={c.enabled === false}");
  });

  it("outline roves with Enter-to-navigate", () => {
    const source = rendererSource("components", "outline.tsx");
    expect(source).toContain("moveRovingIndex");
    expect(source).toContain("data-outline-idx");
    expect(source).toContain("tabIndex={i === at ? 0 : -1}");
  });

  it("link-pane actions are native buttons", () => {
    const source = rendererSource("components", "backlinks.tsx");
    expect(source).not.toContain('role="button"');
    expect(source).toContain('type="button"');
    expect(source).toContain('className="link-action"');
  });
});
