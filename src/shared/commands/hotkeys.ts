import { COMMANDS, acceleratorFor, normalizeAccelerator } from "../platform/keymap.js";
import type { DesktopPlatform } from "../platform/types.js";
import type { CommandId } from "./registry.js";

export type KeyEventLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

function keyName(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function acceleratorFromKeyEvent(event: KeyEventLike): string | null {
  const key = keyName(event.key);
  if (!key || key === "Control" || key === "Meta" || key === "Shift" || key === "Alt") return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

export function commandForKeyEvent(platform: DesktopPlatform, event: KeyEventLike): CommandId | null {
  const eventAccelerator = acceleratorFromKeyEvent(event);
  if (!eventAccelerator) return null;
  const normalized = normalizeAccelerator(eventAccelerator);
  for (const command of COMMANDS) {
    if (command.nativeRole) continue;
    const accelerator = acceleratorFor(command.id, platform);
    if (accelerator && normalizeAccelerator(accelerator) === normalized) return command.id;
  }
  return null;
}
