import {
  COMMAND_DEFINITIONS,
  CommandRegistry,
  assertUniqueCommandDefinitions,
  type CommandDefinition,
  type CommandId,
  type CommandRun,
} from "../../shared/commands/registry.js";

/** Main-owned command registry (P1-09).
 *
 * This service owns canonical command metadata for menus, palette listing,
 * and fixed hotkeys. It deliberately does not expose a generic command
 * execution IPC surface: renderer/application commands are dispatched by ID
 * only through the existing trusted menu event channel, and MCP command
 * execution remains explicitly out of scope.
 */
export class CommandService {
  private readonly registry: CommandRegistry<void>;

  constructor(
    definitions: readonly CommandDefinition[] = COMMAND_DEFINITIONS,
    runners: Partial<Record<CommandId, CommandRun<void>>> = {},
  ) {
    assertUniqueCommandDefinitions(definitions);
    this.registry = new CommandRegistry(definitions.map((definition) => ({ ...definition, run: runners[definition.id] })));
  }

  list(): CommandDefinition[] {
    return this.registry.list().map(({ id, title, category, scope, defaultHotkey }) => ({
      id,
      title,
      category,
      scope,
      ...(defaultHotkey === undefined ? {} : { defaultHotkey }),
    }));
  }

  get(id: CommandId): CommandDefinition | undefined {
    const command = this.registry.get(id);
    if (!command) return undefined;
    const { title, category, scope, defaultHotkey } = command;
    return { id, title, category, scope, ...(defaultHotkey === undefined ? {} : { defaultHotkey }) };
  }

  execute(id: CommandId): Promise<void> {
    return this.registry.execute(id, undefined);
  }
}

export const commandService = new CommandService();
