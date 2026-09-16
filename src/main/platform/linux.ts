/**
 * Linux main-process adapter (§72, §90–§93, §159).
 * Stability outranks pixel-identical appearance: prefer the native system
 * frame over custom chrome. Never force `--ozone-platform=x11` globally
 * (§91); never run with `--no-sandbox` or as root (§90).
 */
import type { BrowserWindowConstructorOptions } from "electron";

export function linuxWindowOptions(wayland: boolean): BrowserWindowConstructorOptions {
  void wayland;
  return {
    autoHideMenuBar: false,
    // Native frame on Linux (§72, §159): the layout must work with a system
    // titlebar above the app chrome, so frameless mode is never mandatory.
    frame: true,
  };
}

/** Detect a Wayland session (§92). Only `WAYLAND_DISPLAY` is authoritative. */
export function detectWayland(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env["WAYLAND_DISPLAY"] === "string" && env["WAYLAND_DISPLAY"] !== "";
}
