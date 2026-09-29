import { describe, expect, it } from "vitest";
import { assertDailyDate, dailyNoteContent, dailyNotePath, localDateParts, renderTemplate } from "@takenotes/core/productivity/daily";

describe("daily notes", () => {
  it("resolves the ADR-0011 path from a local calendar date", () => {
    expect(dailyNotePath("2026-09-22")).toBe("Daily/2026/09/2026-09-22.md");
    expect(localDateParts(new Date(2026, 8, 22, 23, 59)).isoDate).toBe("2026-09-22");
  });

  it("rejects invalid calendar dates", () => {
    expect(assertDailyDate("2026-02-29")).toBeNull();
    expect(assertDailyDate("2024-02-29")?.isoDate).toBe("2024-02-29");
    expect(assertDailyDate("2026-13-01")).toBeNull();
  });

  it("renders only V1 template variables", () => {
    expect(renderTemplate("{{date}} {{time}} {{title}} {{workspace.name}} {{unknown}}", {
      date: "2026-09-22",
      time: "08:05",
      title: "2026-09-22",
      workspace: { name: "Notes" },
    })).toBe("2026-09-22 08:05 2026-09-22 Notes {{unknown}}");
  });

  it("creates daily-note frontmatter and content", () => {
    const content = dailyNoteContent({ date: "2026-09-22", workspaceName: "Notes", now: new Date(2026, 8, 22, 8, 5) });
    expect(content).toContain("type: daily\ndate: 2026-09-22");
    expect(content).toContain("# 2026-09-22");
    expect(content.endsWith("\n")).toBe(true);
  });
});
