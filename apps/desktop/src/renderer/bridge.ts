import type { TakeNotesApi } from "../preload/index";

/**
 * Safe access to the Electron preload bridge.
 *
 * The renderer assumes `window.takenotes` exists, but it is undefined when
 * the bundle runs outside Electron (plain browser / vite dev URL opened
 * manually / preload failed to load). Every direct `window.takenotes.*`
 * access then throws `TypeError: can't access property "app"` and crashes
 * <App> into the ErrorBoundary. All bridge uses must go through here.
 */
export function getBridge(): TakeNotesApi | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const bridge = (window as { takenotes?: TakeNotesApi }).takenotes;
    return bridge ?? undefined;
  } catch {
    return undefined;
  }
}

/** True when the renderer runs without the desktop bridge (browser mode). */
export function isBridgeMissing(): boolean {
  return getBridge() === undefined;
}
