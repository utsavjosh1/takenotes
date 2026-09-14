import { BrowserWindow, shell } from "electron";
import path from "node:path";

const ALLOWED_EXTERNAL_SCHEMES = new Set(["https:", "mailto:"]);

export function isAllowedExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return ALLOWED_EXTERNAL_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}

export function createMainWindow(preloadPath: string, rendererUrl: string | null, rendererFile: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

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
