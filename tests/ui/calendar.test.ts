import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function rendererSource(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", ...parts), "utf8");
}

/** Calendar density pass: day/week sections cap tasks with an in-place
 * expander (events always show), month cells reuse the shared TaskRow /
 * EventChip instead of inline duplicates, and all overflow affordances
 * are keyboard-operable buttons. */
describe("calendar density", () => {
  it("caps day-section tasks with an in-place expander", () => {
    const source = rendererSource("components", "calendar-pane.tsx");
    expect(source).toContain("DAY_VISIBLE_TASKS");
    expect(source).toContain("day.tasks.slice(0, DAY_VISIBLE_TASKS)");
    expect(source).toContain("Show less");
  });

  it("month cells reuse the shared row components", () => {
    const source = rendererSource("components", "calendar-pane.tsx");
    expect(source).toContain("MONTH_VISIBLE_EVENTS");
    expect(source).toContain("MONTH_VISIBLE_TASKS");
    expect(source).toContain("<TaskRow");
    expect(source).toContain("compact onOpen");
    // No inline month-cell duplicates of the row markup remain.
    expect(source).not.toContain("fontSize: 11");
  });

  it("overflow affordances are buttons, not mouse-only divs", () => {
    const source = rendererSource("components", "calendar-pane.tsx");
    expect(source).not.toContain('<div className="list-section" style={{ padding: 2');
    expect(source).not.toContain('<div className="list-section" style={{ padding: "0 2px"');
    expect(source).toContain('<button className="list-section"');
    expect(source).toContain('<button className="list-item" style={{ cursor: "pointer" }}');
  });
});
