/**
 * Window + lifecycle policy per platform (§67–§78, §114).
 *
 * - macOS: closing the last window does NOT quit; Dock activate re-creates
 *   the window (§76). `Cmd+Q` performs a real quit (§78).
 * - Windows/Linux: all-windows-closed exits the app (§77). No tray process
 *   in the MVP.
 */
import type { DesktopPlatform } from "./types.js";
import { isMac } from "./platform.js";

export type TitlebarStrategy =
  | "windows-overlay" // native controls + Window Controls Overlay (§68)
  | "mac-hidden-inset" // traffic lights + hiddenInset (§70)
  | "native-frame"; // stable system frame, Linux default (§72, §159)

export function titlebarStrategy(platform: DesktopPlatform): TitlebarStrategy {
  switch (platform) {
    case "windows":
      return "windows-overlay";
    case "macos":
      return "mac-hidden-inset";
    case "linux":
      return "native-frame";
  }
}

/** Whether `window-all-closed` should quit the app. */
export function shouldQuitOnAllWindowsClosed(platform: DesktopPlatform): boolean {
  return !isMac(platform);
}

/** Clamp restored window geometry onto a visible display (§73–§74). */
export type WindowGeometry = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

export function coerceWindowGeometry(
  saved: WindowGeometry | null | undefined,
  displays: { x: number; y: number; width: number; height: number }[],
  fallback: WindowGeometry = { width: 1280, height: 860 },
): WindowGeometry {
  const base = saved ?? fallback;
  const width = Math.min(Math.max(800, base.width), 3840);
  const height = Math.min(Math.max(600, base.height), 2160);
  if (base.x === undefined || base.y === undefined || displays.length === 0) {
    return { width, height };
  }
  const visible = displays.some(
    (d) => base.x! >= d.x - width + 64 && base.x! <= d.x + d.width - 64 && base.y! >= d.y && base.y! <= d.y + d.height - 64,
  );
  if (!visible) return { width, height };
  return { width, height, x: base.x, y: base.y };
}
