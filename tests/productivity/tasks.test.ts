import { describe, expect, it } from "vitest";
import { appendTaskLine, formatTaskLine, isTaskDueDate } from "@takenotes/core/productivity/tasks";

describe("task capture", () => {
  it("formats a task line with an explicit due date", () => {
    expect(formatTaskLine("Write report", "2026-10-07")).toBe("- [ ] Write report @due(2026-10-07)");
  });

  it("formats a task line without a due date", () => {
    expect(formatTaskLine("Water plants")).toBe("- [ ] Water plants");
  });

  it("collapses multiline input to one line", () => {
    expect(formatTaskLine("  fix\nthe  bug  ")).toBe("- [ ] fix the bug");
  });

  it("rejects empty text and non-explicit due dates", () => {
    expect(() => formatTaskLine("   ")).toThrow();
    expect(() => formatTaskLine("x", "tomorrow")).toThrow();
    expect(() => formatTaskLine("x", "2026-10-07T09:00")).toThrow();
    expect(() => formatTaskLine("x", "2026-13-01")).toThrow();
    expect(isTaskDueDate("2024-02-29")).toBe(true);
    expect(isTaskDueDate("2026-02-29")).toBe(false);
  });

  it("appends preserving the trailing newline", () => {
    expect(appendTaskLine("", "- [ ] a")).toBe("- [ ] a\n");
    expect(appendTaskLine("# Notes\n", "- [ ] a")).toBe("# Notes\n- [ ] a\n");
    expect(appendTaskLine("# Notes", "- [ ] a")).toBe("# Notes\n- [ ] a\n");
  });
});
