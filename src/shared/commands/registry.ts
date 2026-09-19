import type { CommandScope } from "../platform/types.js";

export type CommandId =
  | "note.new"
  | "note.open"
  | "note.close"
  | "workspace.open"
  | "workspace.openWsl"
  | "workspace.switch"
  | "workspace.close"
  | "workspace.refresh"
  | "editor.save"
  | "search.open"
  | "quickOpen.open"
  | "palette.open"
  | "view.toggleSidebar"
  | "view.toggleFocus"
  | "view.nextTab"
  | "view.prevTab"
  | "pane.splitVertical"
  | "pane.splitHorizontal"
  | "pane.close"
  | "pane.focusNext"
  | "settings.open"
  | "app.checkForUpdates"
  | "app.closeWindow"
  | "app.quit"
  | "app.toggleFullscreen"
  | "app.zoomIn"
  | "app.zoomOut"
  | "app.zoomReset"
  | "editor.find"
  | "tree.rename"
  | "tree.trash";

export type CommandDefinition = {
  id: CommandId;
  title: string;
  category: string;
  scope: CommandScope;
  defaultHotkey?: string;
};

export type CommandPredicate<Context> = (context: Context) => boolean;
export type CommandRun<Context> = (context: Context) => Promise<void> | void;

export type Command<Context> = CommandDefinition & {
  when?: CommandPredicate<Context>;
  run?: CommandRun<Context>;
};

export const P1_REQUIRED_COMMAND_IDS: readonly CommandId[] = [
  "note.new",
  "note.open",
  "workspace.open",
  "workspace.switch",
  "workspace.close",
  "editor.save",
  "search.open",
  "quickOpen.open",
  "palette.open",
  "view.toggleSidebar",
  "settings.open",
];

export const COMMAND_DEFINITIONS: readonly CommandDefinition[] = [
  { id: "note.new", title: "New Note", category: "Note", scope: "workspace" },
  { id: "note.open", title: "Open Note", category: "Note", scope: "workspace" },
  { id: "note.close", title: "Close Tab", category: "Note", scope: "workspace" },
  { id: "workspace.open", title: "Open Folder", category: "Workspace", scope: "application" },
  { id: "workspace.openWsl", title: "Open WSL Folder", category: "Workspace", scope: "application" },
  { id: "workspace.switch", title: "Switch Workspace", category: "Workspace", scope: "application" },
  { id: "workspace.close", title: "Close Workspace", category: "Workspace", scope: "workspace" },
  { id: "workspace.refresh", title: "Refresh Workspace", category: "Workspace", scope: "workspace" },
  { id: "editor.save", title: "Save", category: "Editor", scope: "editor" },
  { id: "editor.find", title: "Find in Note", category: "Editor", scope: "editor" },
  { id: "search.open", title: "Search in Workspace", category: "Search", scope: "workspace" },
  { id: "quickOpen.open", title: "Quick Open", category: "Navigation", scope: "application" },
  { id: "palette.open", title: "Command Palette", category: "Navigation", scope: "application" },
  { id: "view.toggleSidebar", title: "Toggle Sidebar", category: "View", scope: "application" },
  { id: "view.toggleFocus", title: "Toggle Focus Mode", category: "View", scope: "application" },
  { id: "view.nextTab", title: "Next Tab", category: "View", scope: "workspace" },
  { id: "view.prevTab", title: "Previous Tab", category: "View", scope: "workspace" },
  { id: "pane.splitVertical", title: "Split Pane Right", category: "Pane", scope: "workspace" },
  { id: "pane.splitHorizontal", title: "Split Pane Down", category: "Pane", scope: "workspace" },
  { id: "pane.close", title: "Close Split Pane", category: "Pane", scope: "workspace" },
  { id: "pane.focusNext", title: "Focus Next Pane", category: "Pane", scope: "workspace" },
  { id: "settings.open", title: "Settings", category: "Application", scope: "application" },
  { id: "app.checkForUpdates", title: "Check for Updates", category: "Application", scope: "application" },
  { id: "app.closeWindow", title: "Close Window", category: "Application", scope: "application" },
  { id: "app.quit", title: "Quit", category: "Application", scope: "application" },
  { id: "app.toggleFullscreen", title: "Toggle Full Screen", category: "View", scope: "application" },
  { id: "app.zoomIn", title: "Zoom In", category: "View", scope: "application" },
  { id: "app.zoomOut", title: "Zoom Out", category: "View", scope: "application" },
  { id: "app.zoomReset", title: "Actual Size", category: "View", scope: "application" },
  { id: "tree.rename", title: "Rename", category: "File Tree", scope: "fileTree" },
  { id: "tree.trash", title: "Move to Trash", category: "File Tree", scope: "fileTree" },
];

export function commandDefinition(id: CommandId): CommandDefinition {
  const found = COMMAND_DEFINITIONS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown command: ${id}`);
  return found;
}

export class CommandRegistry<Context> {
  private readonly byId = new Map<CommandId, Command<Context>>();
  private readonly order: CommandId[] = [];

  constructor(commands: readonly Command<Context>[] = []) {
    for (const command of commands) this.register(command);
  }

  register(command: Command<Context>): void {
    if (this.byId.has(command.id)) throw new Error(`Duplicate command id: ${command.id}`);
    this.byId.set(command.id, command);
    this.order.push(command.id);
  }

  get(id: CommandId): Command<Context> | undefined {
    return this.byId.get(id);
  }

  list(): Command<Context>[] {
    return this.order.map((id) => this.byId.get(id)!);
  }

  isEnabled(id: CommandId, context: Context): boolean {
    const command = this.byId.get(id);
    if (!command) return false;
    return command.when ? command.when(context) : true;
  }

  async execute(id: CommandId, context: Context): Promise<void> {
    const command = this.byId.get(id);
    if (!command) throw new Error(`Unknown command: ${id}`);
    if (command.when && !command.when(context)) return;
    if (!command.run) throw new Error(`Command has no runner: ${id}`);
    await command.run(context);
  }
}

export function assertUniqueCommandDefinitions(commands: readonly CommandDefinition[] = COMMAND_DEFINITIONS): void {
  const seen = new Set<CommandId>();
  for (const command of commands) {
    if (seen.has(command.id)) throw new Error(`Duplicate command id: ${command.id}`);
    if (!command.title.trim()) throw new Error(`Command ${command.id} has no title.`);
    seen.add(command.id);
  }
}
