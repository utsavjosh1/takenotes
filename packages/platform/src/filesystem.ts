/**
 * Filesystem semantics per platform (§21–§25, §30–§32, §116).
 *
 * Canonical wire rule: renderer ↔ main exchange `relativePath` with `/`
 * separators (POSIX-style). Each main-process adapter converts to native
 * semantics at the boundary:
 * - Windows local: `path.win32` (§21)
 * - WSL / macOS / Linux: `path.posix` / native `node:path` (§21)
 */
import type { DesktopPlatform, WorkspaceKind } from "./types.js";

export function localWorkspaceKind(platform: DesktopPlatform): WorkspaceKind {
  switch (platform) {
    case "windows":
      return "windows-local";
    case "macos":
      return "macos-local";
    case "linux":
      return "linux-local";
  }
}

export function isWslKind(kind: WorkspaceKind): boolean {
  return kind === "windows-wsl";
}

export function isLocalKind(kind: WorkspaceKind): boolean {
  return kind !== "windows-wsl";
}

/** Canonicalize a renderer-supplied relative path to `/` separators. */
export function toCanonicalRel(input: string): string {
  return input.replace(/\\/g, "/");
}

/** Windows-reserved basenames (§25). Applies ONLY to Windows local and WSL
 *  workspaces — must not leak into macOS/Linux validation. */
const WINDOWS_RESERVED = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

export function isWindowsReservedName(baseName: string): boolean {
  const stem = baseName.split(".")[0]!.toUpperCase();
  return WINDOWS_RESERVED.has(stem);
}

/** True when reserved-name rules apply to this workspace kind. */
export function appliesWindowsReservedRules(kind: WorkspaceKind): boolean {
  return kind === "windows-local" || kind === "windows-wsl";
}

/** Platform terminology for the file manager (§116). */
export function fileManagerName(platform: DesktopPlatform): string {
  switch (platform) {
    case "windows":
      return "File Explorer";
    case "macos":
      return "Finder";
    case "linux":
      return "File Manager";
  }
}

/** Platform terminology for the system trash (§30, §116). */
export function trashName(platform: DesktopPlatform): string {
  switch (platform) {
    case "windows":
      return "Recycle Bin";
    case "macos":
      return "Trash";
    case "linux":
      return "Trash";
  }
}

/** "Reveal in …" action label (§32). */
export function revealLabel(platform: DesktopPlatform): string {
  switch (platform) {
    case "windows":
      return "Reveal in File Explorer";
    case "macos":
      return "Reveal in Finder";
    case "linux":
      return "Show in File Manager";
  }
}

/** "Move to …" label — accurate wording when relying on system trash (§31). */
export function moveToTrashLabel(platform: DesktopPlatform): string {
  return `Move to ${trashName(platform)}`;
}
