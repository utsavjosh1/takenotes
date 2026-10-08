import { describe, expect, it } from "vitest";
import { parseDocument } from "@takenotes/core/index/document";
import { collectTodayTasks } from "@takenotes/core/productivity/today";

const TODAY = "2026-10-06";

function entry(relativePath: string, content: string) {
  return parseDocument("ws", relativePath, content, { hash: relativePath, size: content.length, mtimeMs: 0 });
}

describe("today view (fake clock)", () => {
  it("groups overdue, due-today, and scheduled-today tasks", () => {
    const entries = [
      entry("Notes/a.md", [
        "- [ ] overdue one @due(2026-10-01)",
        "- [ ] due today @due(2026-10-06)",
        "- [ ] future @due(2026-10-20)",
        "- [ ] blocked @scheduled(2026-10-06T14:00)",
        "- [x] done overdue @due(2026-09-01)",
        "- [ ] plain task",
      ].join("\n")),
      entry("Notes/b.md", "- [ ] also overdue @due(2026-10-05)\n- [ ] scheduled only @scheduled(2026-10-06)\n"),
    ];
    const groups = collectTodayTasks(entries, TODAY);
    expect(groups.overdue.map((t) => t.description)).toEqual(["overdue one", "also overdue"]);
    expect(groups.dueToday.map((t) => t.description)).toEqual(["due today"]);
    expect(groups.scheduledToday.map((t) => t.description)).toEqual(["scheduled only", "blocked"]);
    // Completed and dateless tasks appear nowhere.
    expect(JSON.stringify(groups)).not.toContain("done overdue");
    expect(JSON.stringify(groups)).not.toContain("plain task");
  });

  it("sorts overdue oldest-first and scheduled by time", () => {
    const entries = [
      entry("n.md", "- [ ] newer @due(2026-10-05)\n- [ ] older @due(2026-10-01)\n- [ ] late @scheduled(2026-10-06T15:00)\n- [ ] early @scheduled(2026-10-06T09:00)\n"),
    ];
    const groups = collectTodayTasks(entries, TODAY);
    expect(groups.overdue.map((t) => t.due)).toEqual(["2026-10-01", "2026-10-05"]);
    expect(groups.scheduledToday.map((t) => t.scheduled)).toEqual(["2026-10-06T09:00", "2026-10-06T15:00"]);
  });

  it("rejects a bad today value instead of grouping silently", () => {
    expect(() => collectTodayTasks([], "tomorrow")).toThrow();
    expect(() => collectTodayTasks([], "2026-13-01")).toThrow();
  });
});
