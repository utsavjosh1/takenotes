import { describe, expect, it } from "vitest";
import {
  listNoteTemplates,
  renderNoteTemplate,
  templateDate,
  templateTime,
  templateTitleForPath,
} from "@takenotes/core/productivity/templates";

describe("note templates", () => {
  it("renders only {{title}}, {{date}}, {{time}}", () => {
    const out = renderNoteTemplate("# {{title}}\n{{date}} {{time}} {{workspace.name}} {{unknown}}", {
      title: "Idea",
      date: "2026-10-06",
      time: "09:41",
    });
    expect(out).toBe("# Idea\n2026-10-06 09:41 {{workspace.name}} {{unknown}}");
  });

  it("tolerates whitespace inside tokens", () => {
    expect(renderNoteTemplate("{{  title  }}", { title: "T", date: "d", time: "t" })).toBe("T");
  });

  it("derives title/date/time helpers from local clock and path", () => {
    expect(templateTitleForPath("Notes/My Idea.md")).toBe("My Idea");
    expect(templateDate(new Date(2026, 9, 6, 9, 41))).toBe("2026-10-06");
    expect(templateTime(new Date(2026, 9, 6, 9, 41))).toBe("09:41");
  });

  it("lists only markdown files under the template folder", () => {
    const paths = ["Templates/a.md", "Templates/b.txt", "Notes/a.md", "Templates/Sub/c.md"];
    expect(listNoteTemplates(paths, "Templates")).toEqual(["Templates/a.md", "Templates/Sub/c.md"]);
    expect(listNoteTemplates(paths, "")).toEqual([]);
  });
});
