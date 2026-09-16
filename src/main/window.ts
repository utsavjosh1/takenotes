import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from "electron";
import path from "node:path";
import { currentDesktopPlatform } from "../shared/platform/platform.js";
import { titlebarStrategy } from "../shared/platform/window.js";
import { windowsWindowOptions } from "./platform/windows.js";
import { macosWindowOptions } from "./platform/macos.js";
import { linuxWindowOptions, detectWayland } from "./platform/linux.js";

const ALLOWED_EXTERNAL_SCHEMES = new Set(["https:", "mailto:"]);

export function isAllowedExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return ALLOWED_EXTERNAL_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}

function platformWindowOptions(): BrowserWindowConstructorOptions {
  const platform = currentDesktopPlatform();
  const strategy = titlebarStrategy(platform);
  // WORKAROUND-SCOPE(linux/wayland): native frame stays the default on Linux.
  // Revisit only with a tested Wayland-specific bug + issue link. Never apply
  // overlay styling to Windows/macOS from this branch (§182–§183).
  switch (strategy) {
    case "windows-overlay":
      return windowsWindowOptions();
    case "mac-hidden-inset":
      return macosWindowOptions();
    case "native-frame":
      return linuxWindowOptions(detectWayland());
  }
}

export function createMainWindow(preloadPath: string, rendererUrl: string | null, rendererFile: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    ...platformWindowOptions(),
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // DevTools only in development (`npm run dev` passes `--dev`).
  // Production windows must never open DevTools on launch (§103).
  if (process.argv.includes("--dev")) window.webContents.openDevTools();

  // MVP uses no device/media/notification permissions: deny everything by default.
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  window.webContents.session.setPermissionCheckHandler(() => false);

  // Block unexpected navigation; open allowed externals in the browser.
  window.webContents.on("will-navigate", (event, url) => {
    if (rendererUrl && url.startsWith(rendererUrl)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(path.join(rendererFile, "index.html"));
  }
  return window;
}
