/**
 * Fixed Phase-1 accelerator source.
 *
 * Command metadata lives in the Command Registry (`shared/commands` and the
 * main-owned `CommandService`). This module owns only default platform
 * accelerators and native-role flags. Command identity is NEVER a keystroke:
 * `editor.save` is the command; `Ctrl+S` / `⌘S` are bindings.
 */
import { commandDefinition, type CommandId } from "../commands/registry.js";
import type { CommandScope, DesktopPlatform } from "./types.js";

export type { CommandId } from "../commands/registry.js";

export type PlatformAccelerators = {
  mac?: string;
  windows?: string;
  linux?: string;
};

export type KeymapCommandDefinition = {
  id: CommandId;
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

/** Fixed P1 defaults only — no customization UI/storage in this phase. */
export const COMMANDS: readonly KeymapCommandDefinition[] = [
  { id: "note.new", accelerators: ctrl("Command+N", "CommandOrControl+N") },
  { id: "editor.save", accelerators: ctrl("Command+S", "CommandOrControl+S") },
  { id: "note.close", accelerators: ctrl("Command+W", "CommandOrControl+W") },
  { id: "quickOpen.open", accelerators: ctrl("Command+P", "CommandOrControl+P") },
  { id: "app.closeWindow", accelerators: ctrl("Shift+Command+W", "CommandOrControl+Shift+W") },
  { id: "search.open", accelerators: ctrl("Shift+Command+F", "CommandOrControl+Shift+F") },
  { id: "palette.open", accelerators: ctrl("Shift+Command+P", "CommandOrControl+Shift+P") },
  { id: "editor.find", accelerators: ctrl("Command+F", "CommandOrControl+F") },
  { id: "settings.open", accelerators: ctrl("Command+,", "CommandOrControl+,") },
  { id: "app.checkForUpdates", accelerators: {} },
  { id: "view.toggleSidebar", accelerators: ctrl("Command+\\", "CommandOrControl+\\") },
  { id: "view.toggleFocus", accelerators: ctrl("Command+.", "CommandOrControl+.") },
  { id: "view.nextTab", accelerators: same("CommandOrControl+Tab") },
  { id: "view.prevTab", accelerators: same("CommandOrControl+Shift+Tab") },
  { id: "tree.rename", accelerators: { windows: "F2", linux: "F2" } },
  { id: "tree.trash", accelerators: { mac: "Command+Backspace", windows: "Delete", linux: "Delete" } },
  { id: "app.quit", accelerators: {}, nativeRole: true },
  { id: "app.toggleFullscreen", accelerators: {}, nativeRole: true },
  { id: "app.zoomIn", accelerators: {}, nativeRole: true },
  { id: "app.zoomOut", accelerators: {}, nativeRole: true },
  { id: "app.zoomReset", accelerators: {}, nativeRole: true },
];

const BY_ID = new Map<CommandId, KeymapCommandDefinition>(COMMANDS.map((c) => [c.id, c]));

export function commandById(id: CommandId): KeymapCommandDefinition & { title: string; scope: CommandScope; category: string } {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown command: ${id}`);
  const meta = commandDefinition(id);
  return { ...def, title: meta.title, scope: meta.scope, category: meta.category };
}

/** Electron accelerator for menus / fixed key handling. */
export function acceleratorFor(id: CommandId, platform: DesktopPlatform): string | undefined {
  const def = BY_ID.get(id);
  if (!def) return undefined;
  if (platform === "macos") return def.accelerators.mac;
  if (platform === "windows") return def.accelerators.windows;
  return def.accelerators.linux;
}

/** Machine-readable per-platform shortcut map (§208). Used by tests and by
 * the renderer platform report. */
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

/** Keymap collision test core (§56). */
export function findShortcutCollisions(): ShortcutCollision[] {
  const collisions: ShortcutCollision[] = [];
  const platforms: DesktopPlatform[] = ["windows", "macos", "linux"];
  for (const platform of platforms) {
    const seen = new Map<string, { scope: CommandScope; id: CommandId }[]>();
    for (const def of COMMANDS) {
      const acc = acceleratorFor(def.id, platform);
      if (!acc) continue;
      const scope = commandDefinition(def.id).scope;
      const key = `${scope}::${normalizeAccelerator(acc)}`;
      const list = seen.get(key) ?? [];
      list.push({ scope, id: def.id });
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

export const RESERVED_SHORTCUTS: readonly string[] = [
  "Command+Q",
  "Command+H",
  "Command+M",
  "Alt+F4",
  "Command+Space",
  "Ctrl+Space",
];
