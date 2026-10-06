import { describe, expect, it } from "vitest";
import {
  COMMAND_DEFINITIONS,
  CommandRegistry,
  P1_REQUIRED_COMMAND_IDS,
  assertUniqueCommandDefinitions,
} from "@takenotes/core/commands/registry";

/** Step 2 slice 1 gate: single registry, required IDs, workspace.switch disabled. */
describe("step2 registry cleanup", () => {
  it("has unique definitions covering the Step 2 minimum set", () => {
    expect(() => assertUniqueCommandDefinitions()).not.toThrow();
    const ids = new Set(COMMAND_DEFINITIONS.map((c) => c.id));
    for (const id of P1_REQUIRED_COMMAND_IDS) expect(ids.has(id)).toBe(true);
    for (const id of ["note.new", "note.open", "workspace.open", "workspace.switch", "workspace.close", "editor.save", "search.open", "quickOpen.open", "palette.open", "view.toggleSidebar", "settings.open"] as const) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("holds run+when in one table; disabled commands never execute", async () => {
    const calls: string[] = [];
    const registry = new CommandRegistry([
      { id: "note.new", title: "New", category: "Note", scope: "workspace", run: () => { calls.push("new"); }, when: () => true },
      { id: "workspace.switch", title: "Switch", category: "Workspace", scope: "application", run: () => { calls.push("switch"); }, when: () => false },
    ]);
    expect(registry.isEnabled("workspace.switch", undefined)).toBe(false);
    await registry.execute("workspace.switch", undefined);
    await registry.execute("note.new", undefined);
    expect(calls).toEqual(["new"]);
  });
});
