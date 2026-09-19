import { describe, expect, it } from "vitest";
import { commandForKeyEvent } from "../../src/shared/commands/hotkeys";
import { acceleratorFor, shortcutMapFor } from "../../src/shared/platform/keymap";

describe("fixed P1 hotkeys", () => {
  it("maps Ctrl+P to Quick Open and Ctrl+Shift+P to commands", () => {
    const map = shortcutMapFor("windows");
    expect(map["quickOpen.open"]).toBe("CommandOrControl+P");
    expect(map["palette.open"]).toBe("CommandOrControl+Shift+P");
  });

  it("maps Ctrl+S to editor.save", () => {
    expect(acceleratorFor("editor.save", "windows")).toBe("CommandOrControl+S");
    expect(commandForKeyEvent("windows", { key: "s", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe("editor.save");
  });

  it("maps Ctrl+Shift+F to search.open", () => {
    expect(commandForKeyEvent("windows", { key: "f", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })).toBe("search.open");
  });
});
