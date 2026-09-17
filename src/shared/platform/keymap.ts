/**
 * Central semantic command registry (§33–§35, §53, §57).
 *
 * Command identity is NEVER a keystroke: the command is `file.save`,
 * `Ctrl+S` / `⌘S` are merely platform bindings. All keyboard listeners,
 * Electron accelerators, CodeMirror bindings and menu shortcuts derive from
 * this table via `acceleratorFor(command, platform)` — nothing else in the
 * codebase may invent a shortcut.
 *
 * Accelerator syntax is Electron's (`CommandOrControl`, `Command`, `Ctrl`,
 * `Alt`, `Option`, `Shift`, `F2`, …). Display strings are produced by
 * `shortcut-labels.ts` — never show `CommandOrControl+P` to a user (§37).
 */
import type { CommandScope, DesktopPlatform } from "./types.js";

export type CommandId =
  | "file.new"
  | "file.save"
  | "file.closeTab"
  | "file.quickOpen"
  | "file.closeWindow"
  | "workspace.search"
  | "commandPalette.open"
  | "editor.find"
  | "settings.open"
  | "app.checkForUpdates"
  | "view.toggleSidebar"
  | "view.toggleFocus"
  | "view.nextTab"
  | "view.prevTab"
  | "tree.rename"
  | "tree.trash"
  | "app.quit"
  | "app.toggleFullscreen"
  | "app.zoomIn"
  | "app.zoomOut"
  | "app.zoomReset";

export type PlatformAccelerators = {
  mac?: string;
  windows?: string;
  linux?: string;
};

export type CommandDefinition = {
  id: CommandId;
  title: string;
  scope: CommandScope;
  /** Electron accelerator per platform. Absent = no default binding on that
   *  platform (reachable via menu / palette / context menu instead, §155). */
  accelerators: PlatformAccelerators;
  /** True when the binding shadows an OS-reserved shortcut and must use the
   *  native role instead of a custom handler (§57). */
  nativeRole?: boolean;
};

function same(all: string): PlatformAccelerators {
  return { mac: all, windows: all, linux: all };
}

function ctrl(mac: string, others: string): PlatformAccelerators {
  return { mac, windows: others, linux: others };
}

/**
 * Initial cross-platform keymap (§40). Deliberately conservative:
 * - No `Ctrl+Alt+letter` bindings anywhere (AltGr, §47–§48).
 * - No `Option+letter` bindings on macOS (alternate-character typing, §47).
 * - Redo/fullscreen/quit/zoom are native roles, not custom bindings (§41–§46).
 */
export const COMMANDS: readonly CommandDefinition[] = [
  { id: "file.new", title: "Create new note", scope: "workspace", accelerators: ctrl("Command+N", "CommandOrControl+N") },
  { id: "file.save", title: "Save current file", scope: "editor", accelerators: ctrl("Command+S", "CommandOrControl+S") },
  { id: "file.closeTab", title: "Close current tab", scope: "workspace", accelerators: ctrl("Command+W", "CommandOrControl+W") },
  { id: "file.quickOpen", title: "Quick open…", scope: "application", accelerators: ctrl("Command+P", "CommandOrControl+P") },
  { id: "file.closeWindow", title: "Close window", scope: "application", accelerators: ctrl("Shift+Command+W", "CommandOrControl+Shift+W") },
  { id: "workspace.search", title: "Search in workspace", scope: "workspace", accelerators: ctrl("Shift+Command+F", "CommandOrControl+Shift+F") },
  { id: "commandPalette.open", title: "Open command palette", scope: "application", accelerators: ctrl("Shift+Command+P", "CommandOrControl+Shift+P") },
  { id: "editor.find", title: "Find in note", scope: "editor", accelerators: ctrl("Command+F", "CommandOrControl+F") },
  { id: "settings.open", title: "Open settings", scope: "application", accelerators: ctrl("Command+,", "CommandOrControl+,") },
  // Update check: menu / palette / settings only, never a shortcut — it is
  // rare, deliberate, and must not collide with editing keys (ADR-0006).
  { id: "app.checkForUpdates", title: "Check for updates", scope: "application", accelerators: {} },
  { id: "view.toggleSidebar", title: "Toggle sidebar", scope: "application", accelerators: ctrl("Command+\\", "CommandOrControl+\\") },
  { id: "view.toggleFocus", title: "Toggle focus mode", scope: "application", accelerators: ctrl("Command+.", "CommandOrControl+.") },
  { id: "view.nextTab", title: "Next tab", scope: "workspace", accelerators: same("CommandOrControl+Tab") },
  { id: "view.prevTab", title: "Previous tab", scope: "workspace", accelerators: same("CommandOrControl+Shift+Tab") },
  // Rename: F2 is a Windows/Linux convention (§44). macOS reaches rename via
  // context menu / palette / menu; F2 stays bound where it feels native.
  { id: "tree.rename", title: "Rename selected", scope: "fileTree", accelerators: { windows: "F2", linux: "F2" } },
  // Trash: Delete on Windows/Linux; macOS uses Command+Backspace per Finder
  // convention (§43). Context menu + palette remain universal fallbacks.
  { id: "tree.trash", title: "Move to trash", scope: "fileTree", accelerators: { mac: "Command+Backspace", windows: "Delete", linux: "Delete" } },
  { id: "app.quit", title: "Quit Desktop Notes", scope: "application", accelerators: {}, nativeRole: true },
  { id: "app.toggleFullscreen", title: "Toggle full screen", scope: "application", accelerators: {}, nativeRole: true },
  { id: "app.zoomIn", title: "Zoom in", scope: "application", accelerators: {}, nativeRole: true },
  { id: "app.zoomOut", title: "Zoom out", scope: "application", accelerators: {}, nativeRole: true },
  { id: "app.zoomReset", title: "Actual size", scope: "application", accelerators: {}, nativeRole: true },
];

const BY_ID = new Map<CommandId, CommandDefinition>(COMMANDS.map((c) => [c.id, c]));

export function commandById(id: CommandId): CommandDefinition {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown command: ${id}`);
  return def;
}

/** Electron accelerator for menus / global key handling. */
export function acceleratorFor(id: CommandId, platform: DesktopPlatform): string | undefined {
  const def = commandById(id);
  if (platform === "macos") return def.accelerators.mac;
  if (platform === "windows") return def.accelerators.windows;
  return def.accelerators.linux;
}

/** Machine-readable per-platform shortcut map (§208). Used by the collision
 *  test and by `npm run test:platform`. */
export function shortcutMapFor(platform: DesktopPlatform): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of COMMANDS) {
    const acc = acceleratorFor(def.id, platform);
    if (acc) out[def.id] = acc;
  }
  return out;
}

export type ShortcutCollision = {
  platform: DesktopPlatform;
  accelerator: string;
  commands: CommandId[];
  scope: string;
};

/**
 * Keymap collision test core (§56). Fails when two conflicting commands share
 * the same shortcut in the same scope on the same platform. `view.nextTab`
 * and `view.prevTab` intentionally share the Tab family with different
 * modifiers, so only exact-duplicate accelerators within one scope collide.
 */
export function findShortcutCollisions(): ShortcutCollision[] {
  const collisions: ShortcutCollision[] = [];
  const platforms: DesktopPlatform[] = ["windows", "macos", "linux"];
  for (const platform of platforms) {
    const seen = new Map<string, { scope: CommandScope; id: CommandId }[]>();
    for (const def of COMMANDS) {
      const acc = acceleratorFor(def.id, platform);
      if (!acc) continue;
      const key = `${def.scope}::${normalizeAccelerator(acc)}`;
      const list = seen.get(key) ?? [];
      list.push({ scope: def.scope, id: def.id });
      seen.set(key, list);
    }
    for (const [key, list] of seen) {
      if (list.length > 1) {
        collisions.push({
          platform,
          accelerator: key.split("::")[1]!,
          commands: list.map((l) => l.id),
          scope: list[0]!.scope,
        });
      }
    }
  }
  return collisions;
}

export function normalizeAccelerator(acc: string): string {
  return acc
    .split("+")
    .map((p) => {
      const t = p.trim().toLowerCase();
      if (t === "commandorcontrol") return "ctrlcmd";
      if (t === "command" || t === "cmd") return "cmd";
      if (t === "control" || t === "ctrl") return "ctrl";
      if (t === "option" || t === "alt") return "alt";
      return t;
    })
    .sort()
    .join("+");
}

/** OS-reserved / highly conventional shortcuts we must not override (§57). */
export const RESERVED_SHORTCUTS: readonly string[] = [
  "Command+Q", // macOS quit (native role)
  "Command+H", // macOS hide (native role)
  "Command+M", // macOS minimize (native role)
  "Alt+F4", // Windows/Linux close window
  "Command+Space", // macOS Spotlight
  "Ctrl+Space", // IME / input-source switching on several platforms
];
