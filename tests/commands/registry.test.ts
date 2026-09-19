import { describe, expect, it, vi } from "vitest";
import {
  COMMAND_DEFINITIONS,
  CommandRegistry,
  P1_REQUIRED_COMMAND_IDS,
  assertUniqueCommandDefinitions,
  type Command,
} from "../../src/shared/commands/registry";
import { acceleratorFor } from "../../src/shared/platform/keymap";
import { CommandService } from "../../src/main/services/command-service";

/** P1-09 canonical command registry: IDs are stable, labels are metadata. */
describe("command registry", () => {
  it("lists every required P1 command with unique id and title", () => {
    expect(() => assertUniqueCommandDefinitions()).not.toThrow();
    const byId = new Map(COMMAND_DEFINITIONS.map((c) => [c.id, c]));
    for (const id of P1_REQUIRED_COMMAND_IDS) {
      expect(byId.get(id), id).toBeDefined();
      expect(byId.get(id)?.title.trim(), id).not.toBe("");
    }
  });

  it("registers, looks up, executes, gates, and preserves insertion order", async () => {
    const calls: string[] = [];
    const commands: Command<{ dirty: boolean }>[] = [
      { id: "note.new", title: "New", category: "Note", scope: "workspace", run: () => { calls.push("new"); } },
      { id: "editor.save", title: "Save", category: "Editor", scope: "editor", when: (ctx) => ctx.dirty, run: () => { calls.push("save"); } },
    ];
    const registry = new CommandRegistry(commands);

    expect(registry.get("note.new")?.title).toBe("New");
    expect(registry.list().map((c) => c.id)).toEqual(["note.new", "editor.save"]);
    expect(registry.isEnabled("editor.save", { dirty: false })).toBe(false);
    await registry.execute("editor.save", { dirty: false });
    await registry.execute("editor.save", { dirty: true });
    await registry.execute("note.new", { dirty: false });
    expect(calls).toEqual(["save", "new"]);
  });

  it("rejects duplicate IDs", () => {
    expect(() => new CommandRegistry([
      { id: "note.new", title: "A", category: "Note", scope: "workspace" },
      { id: "note.new", title: "B", category: "Note", scope: "workspace" },
    ])).toThrow(/Duplicate command id: note\.new/);
  });

  it("uses one command id for Ctrl+S and service execution", async () => {
    const save = vi.fn();
    const service = new CommandService(undefined, { "editor.save": save });
    expect(acceleratorFor("editor.save", "windows")).toBe("CommandOrControl+S");
    await service.execute("editor.save");
    expect(save).toHaveBeenCalledTimes(1);
  });
});
