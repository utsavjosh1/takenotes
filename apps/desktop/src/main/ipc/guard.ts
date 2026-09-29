/**
 * Renderer-facing IPC sender boundary (M-04).
 *
 * Uniform rule: every `ipcMain.handle` must reject foreign/untrusted
 * senders via this module — no handler gets its own security mechanism.
 * The Electron lookup (`BrowserWindow.fromWebContents`) stays at the call
 * site; the trust decision itself is pure and unit-tested.
 */
export type TrustedWindow = {
  isDestroyed(): boolean;
};

/** True only for a live window owned by this app. Null (unknown sender) or
 * destroyed windows are never trusted — fail closed. */
export function isTrustedWindow(win: TrustedWindow | null): boolean {
  return win !== null && !win.isDestroyed();
}
