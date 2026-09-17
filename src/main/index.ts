import { app, BrowserWindow, dialog } from "electron";
import { createWindowIpc } from "./ipc/register.js";
import { currentDesktopPlatform } from "../shared/platform/platform.js";
import { shouldQuitOnAllWindowsClosed } from "../shared/platform/window.js";
import { installAppMenu } from "./platform/menus.js";
import type { CommandId } from "../shared/platform/keymap.js";

/** Startup diagnostics: failures before first window used to quit silently
 *  on Windows (double-click → nothing). Log to userData + show a dialog
 *  so install-failures are never silent. WSL absence must never block
 *  launch — windows-local works standalone. */
function startupLog(message: string): void {
  console.error(`[startup] ${message}`);
}

function showStartupFailure(title: string, detail: string): void {
  startupLog(`${title}: ${detail}`);
  try {
    if (app.isReady()) {
      dialog.showErrorBox(title, detail);
    } else {
      void app.whenReady().then(() => dialog.showErrorBox(title, detail));
    }
  } catch {
    /* dialog unavailable — log is the fallback */
  }
}

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
    try {
      installAppMenu(currentDesktopPlatform(), dispatchCommandToFocused);
    } catch (err) {
      // Menu failure must never prevent the window from opening.
      startupLog(`menu install failed (continuing): ${String(err)}`);
    }
    try {
      createWindowIpc();
    } catch (err) {
      showStartupFailure("takenotes could not open", String(err));
    }
    app.on("activate", () => {
      // macOS: Dock click with no windows re-creates a window; the app stays
      // running after the last window closes (§76). Windows/Linux quit on
      // all-windows-closed instead (§77) — see below.
      if (BrowserWindow.getAllWindows().length === 0) {
        try {
          createWindowIpc();
        } catch (err) {
          showStartupFailure("takenotes could not open", String(err));
        }
      }
    });
  });
}

// Never quit silently: surface main-process crashes instead of vanishing.
process.on("uncaughtException", (err) => {
  showStartupFailure("takenotes hit an unexpected error", String(err?.stack ?? err));
});

app.on("window-all-closed", () => {
  // Never run `wsl --shutdown`: only our helper child processes die with us.
  if (shouldQuitOnAllWindowsClosed(currentDesktopPlatform())) app.quit();
});
