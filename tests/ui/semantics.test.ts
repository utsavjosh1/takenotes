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
    expect(source).toContain('role="status" aria-label="Searching"');
    expect(source).toContain('className="search-count" role="status"');
    expect(source).toContain("<section key={note.relativePath} className=\"sres-note\" aria-label={note.title}>");
    expect(source).toContain('<div className="search-empty" role="status">');
    expect(source).toContain('role="alert">{searchError}');
  });

  it("palette follows the combobox pattern", () => {
    // The overlay is the shared CommandPalette; desktop only supplies rows.
    expect(rendererSource("components", "palette.tsx")).toContain("<CommandPalette");
    const source = readFileSync(join(__dirname, "..", "..", "packages", "ui", "src", "dom", "command-palette.tsx"), "utf8");
    expect(source).toContain('role="combobox"');
    expect(source).toContain("aria-controls={listId}");
    expect(source).toContain("aria-activedescendant");
    expect(source).toContain("id={listId}");
    expect(source).toContain("optionId(i)");
    expect(source).toContain('role="listbox"');
    expect(source).toContain('role="option"');
    expect(source).toContain("aria-disabled={row.item.disabledReason ? true : undefined}");
  });

  it("quick-open Ctrl+Enter opens in a new tab, Shift+Enter creates", () => {
    const source = rendererSource("components", "palette.tsx");
    expect(source).toContain("{ newTab: o.ctrl }");
    expect(source).toContain("new tab");
    expect(source).toContain('if (kind === "files" && how.shift)');
    expect(source).toContain('keys: ["Shift", "Enter"]');
  });

  it("tags and properties empties use the shared EmptyState voice", () => {
    const tags = rendererSource("components", "tags.tsx");
    expect(tags).toContain("<EmptyState title=\"No tags yet\"");
    expect(tags).toContain("<EmptyState title=\"No workspace index yet\"");
    const props = rendererSource("components", "properties-view.tsx");
    expect(props).toContain("<EmptyState title=\"No active note\"");
    expect(props).toContain("<EmptyState title=\"No properties in this workspace\"");
  });

  it("outline roves with Enter-to-navigate", () => {
    const source = rendererSource("components", "outline.tsx");
    expect(source).toContain("moveRovingIndex");
    expect(source).toContain("data-outline-idx");
    expect(source).toContain("tabIndex={i === at ? 0 : -1}");
  });

  it("link-pane actions are native buttons", () => {
    const source = rendererSource("components", "backlinks.tsx");
    // Inner mention actions stay native buttons (stopPropagation keeps the row intact).
    expect(source).toContain('type="button"');
    expect(source).toContain('className="link-action"');
    // Rows carrying BOTH open + action cannot nest <button> in <button>
    // (invalid HTML), so the row is role="button" — which must then stay
    // keyboard-operable: tabIndex plus Enter/Space activation.
    expect(source).toContain('role="button"');
    expect(source).toContain("tabIndex={0}");
    expect(source).toContain('e.key === "Enter" || e.key === " "');
  });
});
