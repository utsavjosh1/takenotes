/** Barrel re-export for the platform module (§4). */
export type { DesktopPlatform, NodePlatform, WorkspaceKind, CommandScope } from "./types.js";
export {
  resolveDesktopPlatform,
  currentDesktopPlatform,
  isWindows,
  isMac,
  isLinux,
  primaryModifierName,
} from "./platform.js";
export type { PlatformCapabilities } from "./capabilities.js";
export { getCapabilities } from "./capabilities.js";
export {
  COMMANDS,
  commandById,
  acceleratorFor,
  shortcutMapFor,
  findShortcutCollisions,
  normalizeAccelerator,
  RESERVED_SHORTCUTS,
} from "./keymap.js";
export type { CommandId, PlatformAccelerators, KeymapCommandDefinition, ShortcutCollision } from "./keymap.js";
export { formatAccelerator, formatShortcut, shortcutLabelsFor } from "./shortcut-labels.js";
export {
  localWorkspaceKind,
  isWslKind,
  isLocalKind,
  toCanonicalRel,
  isWindowsReservedName,
  appliesWindowsReservedRules,
  fileManagerName,
  trashName,
  revealLabel,
  moveToTrashLabel,
} from "./filesystem.js";
export {
  titlebarStrategy,
  shouldQuitOnAllWindowsClosed,
  coerceWindowGeometry,
} from "./window.js";
export type { TitlebarStrategy, WindowGeometry } from "./window.js";
