import { describe, expect, it } from "vitest";
import { parseDocument } from "@takenotes/core/index/document";
import {
  addDays,
  collectCalendarRange,
  eventStartOf,
  monthRange,
  rewriteScheduledToken,
  weekRange,
} from "@takenotes/core/productivity/calendar";

function entry(relativePath: string, content: string) {
  return parseDocument("ws", relativePath, content, { hash: relativePath, size: content.length, mtimeMs: 0 });
}

describe("calendar ranges", () => {
  it("computes week (Mon-Sun) and month ranges on a fake clock", () => {
    expect(weekRange("2026-10-07")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(monthRange("2026-10-07")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("calendar sources", () => {
  const entries = [
    entry("Events/retro.md", "---\ntype: event\nstart: 2026-10-06T14:00:00+02:00\nend: 2026-10-06T14:30:00+02:00\n---\n# Retro\n"),
    entry("Events/no-start.md", "---\ntype: event\n---\n# Missing start\n"),
    entry("Notes/plain.md", "---\ntype: note\nstart: 2026-10-06T14:00:00+02:00\n---\n# Not an event\n"),
    entry("Notes/tasks.md", "- [ ] block @scheduled(2026-10-06T09:00)\n- [ ] deadline only @due(2026-10-06)\n- [x] done block @scheduled(2026-10-06T10:00)\n- [ ] next week @scheduled(2026-10-13)\n"),
  ];

  it("shows event notes and @scheduled tasks, nothing else", () => {
    const days = collectCalendarRange(entries, "2026-10-06", "2026-10-06");
    expect(days).toHaveLength(1);
    expect(days[0]!.events.map((e) => e.title)).toEqual(["Retro"]);
    expect(days[0]!.tasks.map((t) => t.description)).toEqual(["block"]);
    expect(eventStartOf(entries[1]!)).toBeNull();
  });

  it("accepts YAML timestamp starts (parsed Dates, not strings)", () => {
    const yamlDate = entry("Events/yaml.md", "---\ntype: event\nstart: 2026-10-07 09:30\n---\n# Standup\n");
    expect(eventStartOf(yamlDate)).not.toBeNull();
    const days = collectCalendarRange([yamlDate], "2026-10-07", "2026-10-07");
    expect(days[0]!.events).toHaveLength(1);
  });

  it("rejects bad ranges instead of guessing", () => {
    expect(() => collectCalendarRange([], "2026-10-07", "2026-10-06")).toThrow();
    expect(() => collectCalendarRange([], "tomorrow", "2026-10-06")).toThrow();
  });
});

describe("calendar drag rewrites @scheduled only", () => {
  it("moves the date but keeps time, @due, and text", () => {
    expect(rewriteScheduledToken("- [ ] report @due(2026-10-10) @scheduled(2026-10-06T14:00)", "2026-10-08")).toBe(
      "- [ ] report @due(2026-10-10) @scheduled(2026-10-08T14:00)",
    );
  });

  it("moves dateless blocks and appends the token when missing", () => {
    expect(rewriteScheduledToken("- [ ] block @scheduled(2026-10-06)", "2026-10-08")).toBe("- [ ] block @scheduled(2026-10-08)");
    expect(rewriteScheduledToken("- [ ] loose @due(2026-10-10)", "2026-10-08")).toBe("- [ ] loose @due(2026-10-10) @scheduled(2026-10-08)");
  });

  it("rejects a bad drop target", () => {
    expect(() => rewriteScheduledToken("- [ ] x @scheduled(2026-10-06)", "next Friday")).toThrow();
  });
});
