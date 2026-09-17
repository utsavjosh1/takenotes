/**
 * Platform capabilities (§5, §180). Callers branch on *capabilities*, not on
 * OS identity — e.g. `capabilities.wsl` instead of `platform === "windows"`.
 */
import type { DesktopPlatform } from "./types.js";

export type PlatformCapabilities = {
  /** WSL workspace support. Windows-only capability (§2, §184). */
  wsl: boolean;
  /** In-app software updates (check/download/verified install). Windows-only for now (ADR-0006); parked elsewhere. */
  updates: boolean;
  /** OS draws its own minimize/maximize/close; app must not fake them. */
  nativeWindowControls: boolean;
  /** macOS red/yellow/green traffic lights with inset safe area. */
  macTrafficLights: boolean;
  /** Windows snap layouts / overlay safe area applies. */
  windowControlsOverlay: boolean;
  /** `shell.trashItem` maps to a real OS trash on this platform. */
  supportsSystemTrash: boolean;
  /** Top-level native application menu bar is the convention. */
  usesApplicationMenuBar: boolean;
  /** `&` mnemonics are honoured (Windows/Linux menus). */
  supportsMenuMnemonics: boolean;
  /** Dock integration points exist (macOS). */
  supportsDock: boolean;
  /** Taskbar integration points exist (Windows). */
  supportsTaskbar: boolean;
  /** Wayland session is possible (Linux). Never assumed — detected. */
  supportsWayland: boolean;
  /** Middle-click tab close is a platform convention. */
  middleClickClose: boolean;
  /** Running as a normal user is sufficient; no elevation expected. */
  runsAsNormalUser: boolean;
};

const WINDOWS: PlatformCapabilities = {
  wsl: true,
  updates: true,
  nativeWindowControls: true,
  macTrafficLights: false,
  windowControlsOverlay: true,
  supportsSystemTrash: true,
  usesApplicationMenuBar: true,
  supportsMenuMnemonics: true,
  supportsDock: false,
  supportsTaskbar: true,
  supportsWayland: false,
  middleClickClose: true,
  runsAsNormalUser: true,
};

const MACOS: PlatformCapabilities = {
  wsl: false,
  updates: false,
  nativeWindowControls: true,
  macTrafficLights: true,
  windowControlsOverlay: false,
  supportsSystemTrash: true,
  usesApplicationMenuBar: true,
  supportsMenuMnemonics: false,
  supportsDock: true,
  supportsTaskbar: false,
  supportsWayland: false,
  middleClickClose: false,
  runsAsNormalUser: true,
};

const LINUX: PlatformCapabilities = {
  wsl: false,
  updates: false,
  nativeWindowControls: true,
  macTrafficLights: false,
  windowControlsOverlay: false,
  supportsSystemTrash: true,
  usesApplicationMenuBar: true,
  supportsMenuMnemonics: true,
  supportsDock: false, // desktop-dependent (§5): treated as absent until proven
  supportsTaskbar: false,
  supportsWayland: true,
  middleClickClose: true,
  runsAsNormalUser: true,
};

export function getCapabilities(platform: DesktopPlatform): PlatformCapabilities {
  switch (platform) {
    case "windows":
      return { ...WINDOWS };
    case "macos":
      return { ...MACOS };
    case "linux":
      return { ...LINUX };
  }
}
