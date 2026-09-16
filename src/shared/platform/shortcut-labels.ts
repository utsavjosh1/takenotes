/**
 * One shortcut formatter (§37–§39, §117–§119, §209). Converts Electron
 * accelerator syntax into platform-native human labels.
 *
 * macOS:   ⌘P  ⇧⌘P  ⌃⌥…   (glyphs, §38)
 * Windows: Ctrl+P, Ctrl+Shift+P, Alt+…   (§39)
 * Linux:   same word labels as Windows    (§39)
 *
 * Never display `CommandOrControl+P` to a user (§37).
 */
import type { DesktopPlatform } from "./types.js";
import { acceleratorFor, type CommandId } from "./keymap.js";
import { isMac } from "./platform.js";

const MAC_SYMBOLS: Record<string, string> = {
  command: "⌘",
  cmd: "⌘",
  shift: "⇧",
  option: "⌥",
  alt: "⌥",
  control: "⌃",
  ctrl: "⌃",
  enter: "↩",
  return: "↩",
  backspace: "⌫",
  delete: "⌫",
  escape: "⎋",
  esc: "⎋",
  tab: "⇥",
  space: "Space",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

const ORDER_MAC = ["⌃", "⌥", "⇧", "⌘"];
const ORDER_WORD = ["Ctrl", "Alt", "Shift", "Meta", "Cmd"];

function splitParts(accelerator: string): string[] {
  return accelerator.split("+").map((p) => p.trim()).filter(Boolean);
}

function wordLabel(part: string): string {
  const t = part.toLowerCase();
  if (t === "commandorcontrol" || t === "command" || t === "cmd" || t === "control" || t === "ctrl") return "Ctrl";
  if (t === "option" || t === "alt") return "Alt";
  if (t === "shift") return "Shift";
  if (t === "enter" || t === "return") return "Enter";
  if (t === "backspace") return "Backspace";
  if (t === "delete" || t === "del") return "Delete";
  if (t === "escape" || t === "esc") return "Esc";
  if (t === " ") return "Space";
  if (part.length === 1) return part.toUpperCase();
  return part.length > 1 ? part[0]!.toUpperCase() + part.slice(1) : part;
}

/** Format a raw Electron accelerator for display on `platform`. */
export function formatAccelerator(accelerator: string, platform: DesktopPlatform): string {
  const parts = splitParts(accelerator);
  if (isMac(platform)) {
    const glyphs: string[] = [];
    let key = "";
    for (const p of parts) {
      const t = p.toLowerCase();
      if (t === "commandorcontrol") glyphs.push("⌘");
      else if (MAC_SYMBOLS[t]) {
        const g = MAC_SYMBOLS[t]!;
        if (["⌃", "⌥", "⇧", "⌘"].includes(g)) glyphs.push(g);
        else key = g;
      } else if (p.length === 1) key = p.toUpperCase();
      else key = p.length > 1 ? p[0]!.toUpperCase() + p.slice(1) : p;
    }
    glyphs.sort((a, b) => ORDER_MAC.indexOf(a) - ORDER_MAC.indexOf(b));
    return `${glyphs.join("")}${key}`;
  }
  const words = parts.map(wordLabel);
  words.sort((a, b) => {
    const ia = ORDER_WORD.indexOf(a);
    const ib = ORDER_WORD.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return words.join("+");
}

/** Display label for a semantic command on a platform. Empty string when the
 *  command has no default binding there (menu/palette-only, §155). */
export function formatShortcut(id: CommandId, platform: DesktopPlatform): string {
  const acc = acceleratorFor(id, platform);
  return acc ? formatAccelerator(acc, platform) : "";
}

/** Human-label snapshot for one platform (§209). */
export function shortcutLabelsFor(platform: DesktopPlatform): Record<string, string> {
  const out: Record<string, string> = {};
  const ids: CommandId[] = [
    "file.new", "file.save", "file.closeTab", "file.quickOpen", "file.closeWindow",
    "workspace.search", "commandPalette.open", "editor.find", "settings.open",
    "view.toggleSidebar", "view.toggleFocus", "view.nextTab", "view.prevTab",
    "tree.rename", "tree.trash",
  ];
  for (const id of ids) {
    const label = formatShortcut(id, platform);
    if (label) out[id] = label;
  }
  return out;
}
