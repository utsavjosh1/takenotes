import { describe, expect, it } from "vitest";
import { COMMAND_DEFINITIONS } from "../../src/shared/commands/registry";
import { commandQueryText, paletteModeForQuery, searchCommands } from "../../src/shared/commands/palette";

describe("command palette query", () => {
  it("> prefix selects command mode and strips the prefix", () => {
    expect(paletteModeForQuery("> save")).toBe("commands");
    expect(commandQueryText("> save")).toBe("save");
    expect(paletteModeForQuery("save")).toBe("quickOpen");
  });

  it("matches commands by title case-insensitively", () => {
    expect(searchCommands(COMMAND_DEFINITIONS, "> SAVE").map((c) => c.id)).toContain("editor.save");
  });

  it("matches commands by category and id fallback", () => {
    expect(searchCommands(COMMAND_DEFINITIONS, "> pane").map((c) => c.id)).toContain("pane.splitVertical");
    expect(searchCommands(COMMAND_DEFINITIONS, "> quickOpen.open").map((c) => c.id)).toEqual(["quickOpen.open"]);
  });

  it("returns no commands for no match", () => {
    expect(searchCommands(COMMAND_DEFINITIONS, "> xyz-not-a-command")).toEqual([]);
  });
});
