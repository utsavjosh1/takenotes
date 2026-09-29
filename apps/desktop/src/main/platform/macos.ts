/**
 * macOS main-process adapter (§70, §76, §78, §88).
 * Native traffic lights via `hiddenInset`; last-window-close does not quit;
 * no privacy permissions (camera/mic/location/…) are requested for notes.
 */
import type { BrowserWindowConstructorOptions } from "electron";

export function macosWindowOptions(): BrowserWindowConstructorOptions {
  return {
    autoHideMenuBar: false,
    titleBarStyle: "hiddenInset",
    // Traffic-light safe area: keep ≥70px at the top-left free of controls
    // (§70, §157). The renderer offsets `.titlebar` padding via
    // `data-platform="macos"`.
    trafficLightPosition: { x: 12, y: 12 },
  };
}
