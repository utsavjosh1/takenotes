/**
 * One platform abstraction (§3, §10). Every other module asks this module —
 * never `process.platform` / `navigator.platform` / UA sniffing directly.
 *
 * Main process: call `currentDesktopPlatform()` (reads `process.platform`).
 * Renderer:    use the `usePlatform()` hook (platform is delivered via the
 *              controlled `app:platform` IPC, never sniffed from the DOM).
 */
import type { DesktopPlatform, NodePlatform } from "./types.js";

export function resolveDesktopPlatform(nodePlatform: NodePlatform): DesktopPlatform {
  if (nodePlatform === "win32") return "windows";
  if (nodePlatform === "darwin") return "macos";
  return "linux";
}

/** Main-process (and test) entry point. Unknown POSIX platforms degrade to
 *  the Linux adapter, which is the closest native-filesystem semantic. */
export function currentDesktopPlatform(
  nodePlatform: NodePlatform = process.platform,
): DesktopPlatform {
  return resolveDesktopPlatform(nodePlatform);
}

export function isWindows(p: DesktopPlatform): boolean {
  return p === "windows";
}

export function isMac(p: DesktopPlatform): boolean {
  return p === "macos";
}

export function isLinux(p: DesktopPlatform): boolean {
  return p === "linux";
}

/** Primary modifier word for prose ("Command" on macOS, "Control" elsewhere).
 *  For rendered shortcuts prefer `formatShortcut` in shortcut-labels.ts. */
export function primaryModifierName(p: DesktopPlatform): "Command" | "Control" {
  return p === "macos" ? "Command" : "Control";
}
