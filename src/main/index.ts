import { app, BrowserWindow } from "electron";
import { createWindowIpc } from "./ipc/register.js";

void app.whenReady().then(() => {
  createWindowIpc();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindowIpc();
  });
});

app.on("window-all-closed", () => {
  // Never run `wsl --shutdown`: only our helper child processes die with us.
  if (process.platform !== "darwin") app.quit();
});
