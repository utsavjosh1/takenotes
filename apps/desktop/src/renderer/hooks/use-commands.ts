import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkspaceInfo } from "@takenotes/contracts/ipc";
import { COMMAND_DEFINITIONS, CommandRegistry, type CommandId } from "@takenotes/core/commands/registry";
import { workspaceIndex } from "../index/workspace-index";
import { useIndexMeta } from "../stores/index-meta";
import { activeDoc } from "../panes";
import type { CommandItem } from "../components/palette";
import { getBridge } from "../bridge";
import type { PlatformState } from "./use-platform";
import type { SidebarView } from "../components/chrome";
import type { DocumentsApi } from "./use-documents";
import type { FileTreeApi } from "./use-file-tree";

export type CommandsDeps = {
  workspace: WorkspaceInfo | null;
  docs: DocumentsApi;
  tree: FileTreeApi;
  platform: PlatformState;
  /** Settings opt-in: `workspace.openWsl` enables only when true (and supported). */
  wslEnabled: boolean;
  openLocal: () => void;
  openWslDialog: () => void;
  closeWorkspace: () => void;
  refreshAll: () => void;
  checkUpdates: () => void;
  setView: (v: SidebarView) => void;
  setSidebarOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  toggleFocusMode: () => void;
  openSettings: () => void;
  openPalette: (initialQuery: string) => void;
  /** Step 2 override-aware label (defaults to platform.shortcutLabel). */
  shortcutLabel?: (id: CommandId) => string;
  /** Step 2 Favorites: palette-accessible add of the active note. */
  addActiveToFavorites?: () => void;
};

export type CommandsApi = {
  commands: CommandItem[];
  executeCommand: (id: CommandId) => void;
  newNote: () => void;
  recentCommands: string[];
  remember: (id: CommandId) => void;
};

/** Command dispatch: palette/menu/keyboard share one path. Owns recent
 * commands and the definitions fetch; handlers delegate to the domain
 * hooks, so this layer coordinates but holds no domain state itself. */
export function useCommands(deps: CommandsDeps): CommandsApi {
  const { workspace, docs, tree, platform } = deps;
  const bumpIndex = useIndexMeta((s) => s.bump);
  const [recentCommands, setRecentCommands] = useState<string[]>([]);
  const [commandDefinitions, setCommandDefinitions] = useState([...COMMAND_DEFINITIONS]);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    void bridge.commands.list().then((res) => {
      if (res.ok) setCommandDefinitions(res.result);
    }).catch(() => undefined);
  }, []);

  const rememberCommand = useCallback((id: CommandId) => {
    setRecentCommands((p) => [id, ...p.filter((c) => c !== id)].slice(0, 10));
  }, []);

  const newNote = useCallback(() => {
    if (!workspace) { deps.openLocal(); return; }
    deps.setView("files");
    deps.setSidebarOpen(true);
    void tree.createUntitledNote(tree.preferredNewNoteDir());
  }, [workspace, deps, tree]);

  const openToday = useCallback(async () => {
    if (!workspace) { deps.openLocal(); return; }
    const ws = workspace;
    const bridge = getBridge();
    if (!bridge) { deps.openLocal(); return; }
    const info = await bridge.daily.getToday(workspace.workspaceId);
    if (!info.ok) return;
    if (info.result.exists) {
      await docs.openFile(info.result.relativePath);
      return;
    }
    if (!window.confirm(`Create today's Daily Note at ${info.result.relativePath}?`)) return;
    const created = await getBridge()?.daily.createToday(workspace.workspaceId);
    if (!created) return;
    if (!created.ok) return;
    workspaceIndex.upsert(workspace.workspaceId, created.result.relativePath, created.result.content, created.result.revision);
    bumpIndex();
    void tree.refresh(ws);
    void tree.rebuild(ws);
    await docs.openFile(created.result.relativePath);
  }, [workspace, deps, docs, tree, bumpIndex]);

  /* Single registry table (Step 2): one entry per command holds its
   * runner + enablement predicate. Nothing dispatches outside this
   * registry — palette, menus, and keyboard all go through
   * executeCommand below. */
  const registry = useMemo(() => {
    const runners: Partial<Record<CommandId, () => void>> = {
      "note.new": () => newNote(),
      "note.open": () => deps.openPalette(""),
      "note.openToday": () => { void openToday(); },
      "note.close": () => { const a = activeDoc(docs.layout); if (a) docs.closeTab(a.key); },
      "note.reopenClosed": () => { void docs.reopenClosedTab(); },
      "workspace.open": () => { deps.openLocal(); },
      "workspace.openWsl": () => { deps.openWslDialog(); },
      "workspace.close": () => { if (workspace) void deps.closeWorkspace(); },
      "workspace.refresh": () => { if (workspace) { deps.refreshAll(); } },
      "editor.save": () => { void docs.save(); },
      "search.open": () => { deps.setView("search"); deps.setSidebarOpen(true); },
      "quickOpen.open": () => deps.openPalette(""),
      "palette.open": () => deps.openPalette(">"),
      "view.toggleSidebar": () => deps.setSidebarOpen((v) => !v),
      "view.toggleFocus": () => deps.toggleFocusMode(),
      "view.tab1": () => docs.activateTabByIndex(0),
      "view.tab2": () => docs.activateTabByIndex(1),
      "view.tab3": () => docs.activateTabByIndex(2),
      "view.tab4": () => docs.activateTabByIndex(3),
      "view.tab5": () => docs.activateTabByIndex(4),
      "view.tab6": () => docs.activateTabByIndex(5),
      "view.tab7": () => docs.activateTabByIndex(6),
      "view.tab8": () => docs.activateTabByIndex(7),
      "view.tab9": () => docs.activateTabByIndex(8),
      "settings.open": () => deps.openSettings(),
      "app.checkForUpdates": () => { deps.checkUpdates(); },
      "app.closeWindow": () => window.close(),
      "editor.find": () => window.dispatchEvent(new CustomEvent("takenotes:editor-find")),
      "tree.expandAll": () => { void tree.expandAll(); },
      "tree.collapseAll": () => tree.collapseAll(),
      "favorites.addActive": () => deps.addActiveToFavorites?.(),
      "template.insert": () => window.dispatchEvent(new CustomEvent("takenotes:open-template-picker")),
      "task.new": () => window.dispatchEvent(new CustomEvent("takenotes:open-task-dialog")),
      "today.open": () => { deps.setView("today"); deps.setSidebarOpen(true); },
      "calendar.open": () => { deps.setView("calendar"); deps.setSidebarOpen(true); },
    };
    const whenFor = (id: CommandId): boolean => {
      if (id === "editor.save" || id === "editor.find" || id === "note.close") return activeDoc(docs.layout) !== null;
      if (id === "note.reopenClosed") return docs.layout.closedTabs.length > 0;
      if (id.startsWith("view.tab")) {
        const index = Number(id.replace("view.tab", "")) - 1;
        return docs.layout.openKeys[index] !== undefined;
      }
      if (id === "workspace.refresh" || id === "workspace.close" || id === "search.open" || id === "note.openToday") return workspace !== null;
      if (id === "workspace.openWsl") return platform.capabilities.wsl && deps.wslEnabled;
      if (id === "app.checkForUpdates") return platform.capabilities.updates;
      // Registered but disabled until recent-workspace switching lands.
      if (id === "workspace.switch") return false;
      if (id === "tree.expandAll" || id === "tree.collapseAll") return workspace !== null;
      if (id === "favorites.addActive") return activeDoc(docs.layout) !== null;
      if (id === "template.insert") return workspace !== null && activeDoc(docs.layout) !== null;
      if (id === "task.new") return workspace !== null;
      if (id === "today.open") return workspace !== null;
      if (id === "calendar.open") return workspace !== null;
      return runners[id] !== undefined;
    };
    return new CommandRegistry(
      COMMAND_DEFINITIONS.map((definition) => ({
        ...definition,
        run: runners[definition.id],
        when: () => whenFor(definition.id),
      })),
    );
  }, [newNote, openToday, docs, workspace, deps, platform.capabilities.wsl, platform.capabilities.updates]);

  const commandEnabled = useCallback((id: CommandId): boolean => registry.isEnabled(id, undefined), [registry]);

  const executeCommand = useCallback((id: CommandId) => {
    if (!registry.isEnabled(id, undefined)) return;
    rememberCommand(id);
    void registry.execute(id, undefined).catch(() => undefined);
  }, [registry, rememberCommand]);

  const labelFor = deps.shortcutLabel ?? platform.shortcutLabel;
  const commands: CommandItem[] = useMemo(() => commandDefinitions.map((definition) => ({
    ...definition,
    shortcut: labelFor(definition.id),
    enabled: commandEnabled(definition.id),
    run: () => executeCommand(definition.id),
  })), [commandDefinitions, labelFor, commandEnabled, executeCommand]);

  /* Native menu → same command dispatch (§59). Menu accelerators and the
   * palette forward CommandIds here; mouse and keyboard share one path. */
  useEffect(() => {
    const off = getBridge()?.events.onCommand((id: CommandId) => executeCommand(id));
    return () => { off?.(); };
  }, [executeCommand]);

  return { commands, executeCommand, newNote, recentCommands, remember: rememberCommand };
}

export type { CommandId };
