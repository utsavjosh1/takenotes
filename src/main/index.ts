import { app, BrowserWindow } from "electron";
import { createWindowIpc } from "./ipc/register.js";
import { currentDesktopPlatform } from "../shared/platform/platform.js";
import { shouldQuitOnAllWindowsClosed } from "../shared/platform/window.js";
import { installAppMenu } from "./platform/menus.js";
import type { CommandId } from "../shared/platform/keymap.js";

function dispatchCommandToFocused(id: CommandId): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send("takenotes:command", id);
  }
}

// One instance: a second launch must focus the existing editor instead of
// creating a conflicting independent editor over the same files.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    installAppMenu(currentDesktopPlatform(), dispatchCommandToFocused);
      createWindowIpc();
    app.on("activate", () => {
      // macOS: Dock click with no windows re-creates a window; the app stays
      // running after the last window closes (§76). Windows/Linux quit on
      // all-windows-closed instead (§77) — see below.
      if (BrowserWindow.getAllWindows().length === 0) createWindowIpc();
    });
  });
}

app.on("window-all-closed", () => {
  // Never run `wsl --shutdown`: only our helper child processes die with us.
  if (shouldQuitOnAllWindowsClosed(currentDesktopPlatform())) app.quit();
});
