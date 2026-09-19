/**
 * Platform-correct native menus (§60–§65) sharing one semantic command
 * registry. Standard editing uses Electron roles (§41) so each OS keeps its
 * native undo/redo/cut/copy/paste behaviour — including platform-sensitive
 * redo (§42) and fullscreen conventions (§45).
 *
 * Renderer buttons / palette entries dispatch the same `CommandId`s; the
 * menu is the keyboard-accessible, discoverable surface for every critical
 * command (§155).
 */
import { Menu, type MenuItemConstructorOptions } from "electron";
import type { CommandId } from "../../shared/commands/registry.js";
import { acceleratorFor } from "../../shared/platform/keymap.js";
import { commandService } from "../services/command-service.js";
import type { DesktopPlatform } from "../../shared/platform/types.js";

export type MenuAction =
  | { kind: "command"; id: CommandId }
  | { kind: "role"; role: MenuItemConstructorOptions["role"] };

export function buildMenuTemplate(
  platform: DesktopPlatform,
  dispatch: (id: CommandId) => void,
): MenuItemConstructorOptions[] {
  const acc = (id: CommandId): string | undefined => acceleratorFor(id, platform);
  const cmd = (id: CommandId, label?: string): MenuItemConstructorOptions => {
    const item: MenuItemConstructorOptions = { label: label ?? commandTitle(id), click: () => dispatch(id) };
    const a = acc(id);
    if (a) item.accelerator = a;
    return item;
  };
  const mnemonic = (label: string): string => (platform === "macos" ? label : label);

  const fileSubmenu: MenuItemConstructorOptions[] = [
    cmd("note.new", mnemonic("&New Note")),
    // Save is an editor-scope command but stays discoverable here (§155);
    // the renderer + CodeMirror own dispatch so there is one logical path (§58).
    cmd("editor.save", mnemonic("&Save")),
    { type: "separator" },
    cmd("quickOpen.open", mnemonic("&Quick Open…")),
    cmd("search.open", mnemonic("&Search in Workspace…")),
    { type: "separator" },
    cmd("note.close", mnemonic("&Close Tab")),
    cmd("app.closeWindow", mnemonic("Close &Window")),
  ];
  if (platform !== "macos") {
    // Windows/Linux quit lives under File; macOS quits from the app menu (§60).
    fileSubmenu.push({ type: "separator" }, { label: mnemonic("E&xit"), role: "quit" });
  }

  // Edit menu: native roles throughout (§41, §63).
  const editSubmenu: MenuItemConstructorOptions[] = [
    { label: mnemonic("&Undo"), role: "undo" },
    { label: mnemonic("&Redo"), role: "redo" },
    { type: "separator" },
    { label: mnemonic("Cu&t"), role: "cut" },
    { label: mnemonic("&Copy"), role: "copy" },
    { label: mnemonic("&Paste"), role: "paste" },
    { label: mnemonic("Paste and Match St&yle"), role: "pasteAndMatchStyle" },
    { type: "separator" },
    { label: mnemonic("Select &All"), role: "selectAll" },
    { type: "separator" },
    cmd("editor.find", mnemonic("&Find in Note…")),
  ];

  const viewSubmenu: MenuItemConstructorOptions[] = [
    cmd("palette.open", mnemonic("&Command Palette…")),
    cmd("view.toggleSidebar", mnemonic("Toggle &Sidebar")),
    cmd("view.toggleFocus", mnemonic("Toggle &Focus Mode")),
    { type: "separator" },
    { label: mnemonic("Zoom &In"), role: "zoomIn" },
    { label: mnemonic("Zoom &Out"), role: "zoomOut" },
    { label: mnemonic("Actual &Size"), role: "resetZoom" },
    { type: "separator" },
    { label: mnemonic("Toggle &Full Screen"), role: "togglefullscreen" },
  ];

  // Window menu with native roles (§65).
  const windowSubmenu: MenuItemConstructorOptions[] = [
    { role: "minimize" },
    { role: "zoom" },
    ...(platform === "macos" ? [{ role: "front" as const }] : [{ role: "close" as const }]),
  ];

  const helpSubmenu: MenuItemConstructorOptions[] = [
    cmd("app.checkForUpdates", mnemonic("Check for &Updates…")),
    { type: "separator" },
    {
      label: mnemonic("&About Desktop Notes"),
      click: () => dispatch("settings.open"),
    },
  ];

  const template: MenuItemConstructorOptions[] = [
    { label: mnemonic("&File"), submenu: fileSubmenu },
    { label: mnemonic("&Edit"), submenu: editSubmenu },
    { label: mnemonic("&View"), submenu: viewSubmenu },
    { label: mnemonic("&Window"), submenu: windowSubmenu },
    { label: mnemonic("&Help"), submenu: helpSubmenu },
  ];

  if (platform === "macos") {
    // macOS application menu FIRST (§60). Never `File → Exit` on Mac.
    template.unshift({
      label: "Desktop Notes",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Settings…", accelerator: acc("settings.open"), click: () => dispatch("settings.open") },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }
  return template;
}

function commandTitle(id: CommandId): string {
  return commandService.get(id)?.title ?? id;
}

/** Install the platform-correct application menu. Menu clicks forward to the
 *  focused renderer via the same command channel as keyboard shortcuts (§59). */
export function installAppMenu(
  platform: DesktopPlatform,
  dispatch: (id: CommandId) => void,
): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(platform, dispatch)));
}
