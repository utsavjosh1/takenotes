import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function rendererSource(...parts: string[]): string {
  return readFileSync(join(__dirname, "..", "..", "apps", "desktop", "src", "renderer", ...parts), "utf8");
}

/** ADR-0011 contract gate for the Today aggregate: it must stay an
 * aggregation (scheduled + overdue/due-today + Daily state + recent +
 * quick actions), never the Daily file itself, and a missing Daily Note
 * must surface an explicit create action — never a silent create. */
describe("today aggregate contract", () => {
  const pane = rendererSource("components", "today-pane.tsx");

  it("renders every aggregate section, not just task lists", () => {
    for (const section of ["Scheduled today", "Overdue", "Due today", "Today&rsquo;s note", "Recent"]) {
      expect(pane).toContain(section);
    }
  });

  it("offers an explicit Daily-Note create action and never auto-creates", () => {
    expect(pane).toContain("Create today&rsquo;s note");
    // The pane only opens/creates through callbacks owned by App/commands;
    // it must not write files, touch the bridge, or reach the index itself.
    expect(pane).not.toMatch(/getBridge|workspaceIndex|daily\.create|file\.write/i);
  });

  it("rows are native buttons with disambiguating titles", () => {
    expect(pane).toContain("<button");
    expect(pane).toContain("opens the source note");
    expect(pane).toContain("Today stays here");
  });

  it("App feeds the aggregate from the index + recents, via the command registry", () => {
    const app = rendererSource("App.tsx");
    expect(app).toContain("dailyNotePath(today)");
    expect(app).toContain("recents.recents.filter");
    expect(app).toContain('commandsApi.executeCommand("note.new")');
    expect(app).toContain('commandsApi.executeCommand("task.new")');
    expect(app).toContain('commandsApi.executeCommand("note.openToday")');
  });
});
