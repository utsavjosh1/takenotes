export type AppCommand = {
  id: string;
  title: string;
  defaultShortcut?: string;
  execute(): void | Promise<void>;
};

/** Small command registry. This is NOT a plugin API. */
export class CommandRegistry {
  private readonly commands = new Map<string, AppCommand>();

  register(command: AppCommand): void {
    this.commands.set(command.id, command);
  }

  get(id: string): AppCommand | undefined {
    return this.commands.get(id);
  }

  list(): AppCommand[] {
    return [...this.commands.values()];
  }

  async execute(id: string): Promise<void> {
    const command = this.commands.get(id);
    if (!command) throw new Error(`Unknown command: ${id}`);
    await command.execute();
  }
}
