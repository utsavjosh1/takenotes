import type { CommandScope } from "@takenotes/platform/types";

export type CommandId =
  | "note.new"
  | "note.open"
  | "note.openToday"
  | "note.close"
  | "note.reopenClosed"
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
  | "view.tab1"
  | "view.tab2"
  | "view.tab3"
  | "view.tab4"
  | "view.tab5"
  | "view.tab6"
  | "view.tab7"
  | "view.tab8"
  | "view.tab9"
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
  | "tree.trash"
  | "tree.expandAll"
  | "tree.collapseAll"
  | "favorites.addActive"
  | "template.insert"
  | "task.new"
  | "today.open"
  | "calendar.open"
  | "tags.open"
  | "properties.open"
  | "collections.open"
  | "graph.open"
  | "canvas.new"
  | "file.import";

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
  { id: "note.openToday", title: "Open Today's Daily Note", category: "Note", scope: "workspace" },
  { id: "note.close", title: "Close Tab", category: "Note", scope: "workspace" },
  { id: "note.reopenClosed", title: "Reopen Closed Tab", category: "Note", scope: "workspace" },
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
  { id: "view.tab1", title: "Go to Tab 1", category: "View", scope: "workspace" },
  { id: "view.tab2", title: "Go to Tab 2", category: "View", scope: "workspace" },
  { id: "view.tab3", title: "Go to Tab 3", category: "View", scope: "workspace" },
  { id: "view.tab4", title: "Go to Tab 4", category: "View", scope: "workspace" },
  { id: "view.tab5", title: "Go to Tab 5", category: "View", scope: "workspace" },
  { id: "view.tab6", title: "Go to Tab 6", category: "View", scope: "workspace" },
  { id: "view.tab7", title: "Go to Tab 7", category: "View", scope: "workspace" },
  { id: "view.tab8", title: "Go to Tab 8", category: "View", scope: "workspace" },
  { id: "view.tab9", title: "Go to Tab 9", category: "View", scope: "workspace" },
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
  { id: "tree.expandAll", title: "Expand All Folders", category: "File Tree", scope: "workspace" },
  { id: "tree.collapseAll", title: "Collapse All Folders", category: "File Tree", scope: "workspace" },
  { id: "favorites.addActive", title: "Add Active Note to Favorites", category: "Favorites", scope: "workspace" },
  { id: "template.insert", title: "Insert Template", category: "Note", scope: "editor" },
  { id: "task.new", title: "New task", category: "Tasks", scope: "workspace" },
  { id: "today.open", title: "Today", category: "View", scope: "workspace" },
  { id: "calendar.open", title: "Calendar", category: "View", scope: "workspace" },
  { id: "tags.open", title: "Tags", category: "View", scope: "workspace" },
  { id: "properties.open", title: "Properties", category: "View", scope: "workspace" },
  { id: "collections.open", title: "Collections", category: "View", scope: "workspace" },
  { id: "graph.open", title: "Graph", category: "View", scope: "workspace" },
  { id: "canvas.new", title: "New Canvas", category: "Note", scope: "workspace" },
  { id: "file.import", title: "Import Notes…", category: "File", scope: "workspace" },
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
