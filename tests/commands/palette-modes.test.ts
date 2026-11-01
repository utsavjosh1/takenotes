import { describe, expect, it } from "vitest";
import {
  commandDisabledReason, commandGroup, fuzzyPositions, paletteKindOf, parseQuickTask, scheduledToken, searchTagList,
} from "@takenotes/core/commands/palette";

const wed = new Date(2026, 9, 28, 10, 0); // Wednesday 28 Oct 2026

describe("quick open letters", () => {
  it("returns the matched positions", () => {
    expect(fuzzyPositions("Design brief", "brief")).toEqual([7, 8, 9, 10, 11]);
    expect(fuzzyPositions("Design brief", "dsb")).toEqual([0, 2, 7]);
    expect(fuzzyPositions("abc", "z")).toBeNull();
  });
});

describe("palette modes", () => {
  it("first character picks the mode", () => {
    expect(paletteKindOf("> new")).toEqual({ kind: "commands", text: "new" });
    expect(paletteKindOf("#proj")).toEqual({ kind: "tags", text: "proj" });
    expect(paletteKindOf("@call Ron")).toEqual({ kind: "schedule", text: "call Ron" });
    expect(paletteKindOf("? tag:x")).toEqual({ kind: "search", text: "tag:x" });
    expect(paletteKindOf("plain")).toEqual({ kind: "files", text: "plain" });
  });
  it("groups commands and explains why one is off", () => {
    expect(commandGroup({ id: "note.new", category: "Note" })).toBe("File");
    expect(commandGroup({ id: "editor.find", category: "Editor" })).toBe("Edit");
    expect(commandGroup({ id: "view.toggleFocus", category: "View" })).toBe("View");
    expect(commandGroup({ id: "today.open", category: "View" })).toBe("Go to");
    expect(commandGroup({ id: "settings.open", category: "Application" })).toBe("App");
    expect(commandDisabledReason("editor.find")).toBe("Open a note first");
    expect(commandDisabledReason("today.open")).toBe("Open a workspace first");
  });
  it("lists tags with counts", () => {
    const tags = [{ tag: "project", count: 3 }, { tag: "idea", count: 1 }, { tag: "projects/x", count: 2 }];
    expect(searchTagList(tags, "").map((t) => t.tag)).toEqual(["project", "projects/x", "idea"]);
    expect(searchTagList(tags, "#proj").map((t) => t.tag)).toEqual(["project", "projects/x"]);
  });
});

describe("@ quick task", () => {
  it("call Ron tomorrow 3pm", () => {
    const t = parseQuickTask("call Ron tomorrow 3pm", wed)!;
    expect(t).toEqual({ text: "call Ron", date: "2026-10-29", time: "15:00", label: "Tomorrow 15:00" });
    expect(scheduledToken(t)).toBe(" @scheduled(2026-10-29 15:00)");
  });
  it("other phrasings", () => {
    expect(parseQuickTask("pay rent on Oct 30", wed)).toMatchObject({ text: "pay rent", date: "2026-10-30", label: "Fri Oct 30" });
    expect(parseQuickTask("review friday at 9:30", wed)).toMatchObject({ text: "review", date: "2026-10-30", time: "09:30" });
    expect(parseQuickTask("stand up in 2 weeks", wed)).toMatchObject({ text: "stand up", date: "2026-11-11" });
    expect(parseQuickTask("lunch 12pm", wed)).toMatchObject({ text: "lunch", date: "2026-10-28", time: "12:00", label: "Today 12:00" });
    expect(parseQuickTask("ship 2026-12-01", wed)).toMatchObject({ date: "2026-12-01" });
  });
  it("never guesses a date", () => {
    expect(parseQuickTask("buy milk", wed)).toEqual({ text: "buy milk", label: "No date" });
    expect(scheduledToken({ text: "x", label: "No date" })).toBe("");
    expect(parseQuickTask("   ", wed)).toBeNull();
  });
});
