import { describe, expect, it } from "vitest";
import { COMMAND_DEFINITIONS } from "@takenotes/core/commands/registry";
import {
  acceleratorsForCommand,
  commandForKeyEventWithOverrides,
  findOverrideCollisions,
  parseHotkeyOverrides,
} from "@takenotes/platform";
import { acceleratorFor } from "@takenotes/platform/keymap";

const VALID = COMMAND_DEFINITIONS.map((c) => c.id);

/** Step 2 slice 2 gate: multi-binding overrides, collisions, locked defaults. */
describe("step2 hotkeys", () => {
  it("parses valid overrides and reports unknown commands", () => {
    const { overrides, errors } = parseHotkeyOverrides(
      { "quickOpen.open": ["CommandOrControl+P", "CommandOrControl+O"], "nope.cmd": ["Ctrl+X"], "editor.save": "Ctrl+S" },
      VALID,
    );
    expect(overrides["quickOpen.open"]).toEqual(["CommandOrControl+P", "CommandOrControl+O"]);
    expect(errors.join("\n")).toMatch(/unknown command: nope\.cmd/);
    expect(errors.join("\n")).toMatch(/editor\.save.*expected string array/);
  });

  it("resolves defaults when empty; explicit empty unbinds", () => {
    expect(acceleratorsForCommand("quickOpen.open", "windows", {})).toEqual(["CommandOrControl+P"]);
    expect(acceleratorsForCommand("quickOpen.open", "windows", { "quickOpen.open": [] })).toEqual([]);
  });

  it("matches override bindings incl. Ctrl+O second binding; defaults skipped when overridden", () => {
    const withSecond: Parameters<typeof commandForKeyEventWithOverrides>[2] = { "quickOpen.open": ["CommandOrControl+P", "CommandOrControl+O"] };
    expect(commandForKeyEventWithOverrides("windows", { key: "o", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, withSecond)).toBe("quickOpen.open");
    const unbound: Parameters<typeof commandForKeyEventWithOverrides>[2] = { "quickOpen.open": [] };
    expect(commandForKeyEventWithOverrides("windows", { key: "p", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, unbound)).not.toBe("quickOpen.open");
    expect(commandForKeyEventWithOverrides("windows", { key: "s", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }, {})).toBe("editor.save");
  });

  it("detects same-scope collisions", () => {
    const collisions = findOverrideCollisions(
      { "note.new": ["CommandOrControl+P"], "quickOpen.open": ["CommandOrControl+P"] },
      () => "application",
    );
    expect(collisions.length).toBe(1);
    expect(collisions[0]?.commands).toEqual(expect.arrayContaining(["note.new", "quickOpen.open"]));
  });

  it("detects cross-scope shadowing (matcher ignores scope)", () => {
    // editor.save (scope editor) keeps its default while search.open
    // (scope workspace) is overridden to the same accelerator: the matcher
    // always returns search.open, so this must surface as a collision even
    // though the scopes differ.
    const collisions = findOverrideCollisions(
      { "editor.save": ["CommandOrControl+S"], "search.open": ["CommandOrControl+S"] },
      (id) => (id === "editor.save" ? "editor" : "workspace"),
    );
    expect(collisions.length).toBe(1);
    expect(collisions[0]?.accelerator).toBe("ctrlcmd+s");
    expect(collisions[0]?.commands).toEqual(expect.arrayContaining(["editor.save", "search.open"]));
  });

  it("locks Step 2 defaults: no Ctrl+E toggle, Ctrl+T unbound", () => {
    const map: Record<string, string | undefined> = {};
    for (const def of COMMAND_DEFINITIONS) map[def.id] = acceleratorFor(def.id, "windows");
    expect(Object.values(map)).not.toContain("CommandOrControl+E");
    expect(Object.values(map)).not.toContain("CommandOrControl+T");
    expect(map["quickOpen.open"]).toBe("CommandOrControl+P");
    expect(map["palette.open"]).toBe("CommandOrControl+Shift+P");
  });
});
