/** Barrel re-export for the platform module (§4). */
export type { DesktopPlatform, NodePlatform, MobilePlatform, WorkspaceKind, CommandScope } from "./types.js";
export {
  resolveDesktopPlatform,
  currentDesktopPlatform,
  isWindows,
  isMac,
  isLinux,
  primaryModifierName,
} from "./platform.js";
export type { PlatformCapabilities, MobileCapabilities } from "./capabilities.js";
export { getCapabilities, getMobileCapabilities } from "./capabilities.js";
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
  parseHotkeyOverrides,
  acceleratorsForCommand,
  primaryAccelerator,
  commandForKeyEventWithOverrides,
  findOverrideCollisions,
} from "./hotkey-overrides.js";
export type { HotkeyOverrides, OverrideCollision, KeyEventLike } from "./hotkey-overrides.js";
export {
  localWorkspaceKind,
  isWslKind,
  isMobileKind,
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
  MAIN_WINDOW_MIN_SIZE,
} from "./window.js";
export type { TitlebarStrategy, WindowGeometry } from "./window.js";
