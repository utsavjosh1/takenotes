import { BrowserWindow, dialog, shell, type BrowserWindowConstructorOptions } from "electron";
import { existsSync } from "node:fs";
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

/** Runtime window icon (dev + Linux taskbar). Packaged Windows/macOS icons
 * come from electron-builder `win/mac.icon` (needs PNG/ICO/ICNS exports —
 * SVGs cannot be used there). In dev this resolves `build/icon.png` when
 * present; otherwise undefined so Electron falls back to its default. */
export function resolveWindowIcon(): string | undefined {
  const candidates = [
    // Dev: repo-root build/ (npm run dev, cwd = repo root).
    path.resolve(process.cwd(), "build/icon.png"),
    // Packaged Linux: extraResources ships build/ alongside app.asar.
    path.join(process.resourcesPath ?? "", "build/icon.png"),
  ];
  return candidates.find((p) => { try { return existsSync(p); } catch { return false; } });
}

export function createMainWindow(preloadPath: string, rendererUrl: string | null, rendererFile: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    icon: resolveWindowIcon(),
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
    const entry = path.join(rendererFile, "index.html");
    // Never white-screen silently: a missing/broken bundle (e.g. packaged
    // without `npm run build`) used to leave an empty window with only a
    // console ERR_FILE_NOT_FOUND. Surface it so install-failures are actionable.
    void window.loadFile(entry).catch((err) => {
      console.error(`[startup] failed to load renderer entry ${entry}: ${String(err)}`);
      try {
        dialog.showErrorBox(
          "takenotes could not open",
          `Missing renderer bundle:\n${entry}\n\nReinstall from a build made with \`npm run build && npm run package:win\`.`,
        );
      } catch {
        /* dialog unavailable — log is the fallback */
      }
    });
  }
  return window;
}
