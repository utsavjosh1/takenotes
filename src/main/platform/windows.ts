/**
 * Windows main-process adapter (§68–§69, §89).
 * Native window controls + Window Controls Overlay; runs as ordinary user
 * (no UAC elevation for notes); WSL is an optional capability, never a
 * requirement (§184).
 */
import type { BrowserWindowConstructorOptions } from "electron";

export function windowsWindowOptions(): BrowserWindowConstructorOptions {
  return {
    autoHideMenuBar: false,
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#00000000", symbolColor: "#888888", height: 40 },
  };
}

/** Windows never needs elevation for ordinary notes (§89). */
export function windowsNeedsElevation(): false {
  return false;
}
