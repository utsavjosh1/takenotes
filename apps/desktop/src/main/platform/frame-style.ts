/**
 * Step 9 window-frame preference (slice 6b).
 *
 * `auto` keeps the platform default (overlay on Windows, hidden-inset on
 * macOS, native frame on Linux). `native` forces the OS title bar
 * everywhere — for tiling window managers, screen readers, or anyone who
 * wants system chrome. Applied at window creation, so a change takes
 * effect after restart; the renderer says exactly that next to the
 * control instead of pretending otherwise.
 *
 * Persistence is a tiny JSON file under the Electron profile (`userData`),
 * outside every note workspace. Main reads it before the renderer exists;
 * the renderer is the sole writer (via `app:setFrameStyle`). All parsing
 * is fail-closed to `auto` — a corrupt file never bricks the window.
 */
import path from "node:path";
import type { BrowserWindowConstructorOptions } from "electron";

export const FRAME_STYLES = ["auto", "native"] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];

export const FRAME_STYLE_FILE = "frame-style.json";

export function isFrameStyle(value: unknown): value is FrameStyle {
  return value === "auto" || value === "native";
}

/** Strict parse for the setter IPC: unknown values are rejected, never
 * coerced — the caller reports INVALID_REQUEST honestly. */
export function parseFrameStyle(input: unknown): FrameStyle | undefined {
  return isFrameStyle(input) ? input : undefined;
}

export function frameStylePath(userDataDir: string): string {
  return path.join(userDataDir, FRAME_STYLE_FILE);
}

/** Parse stored file content; anything unexpected (missing keys, bad
 * JSON, wrong shape) falls back to `auto`. Injected as a string so tests
 * never touch the filesystem. */
export function readFrameStyleFile(content: string): FrameStyle {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      const style = (parsed as { frameStyle?: unknown }).frameStyle;
      if (isFrameStyle(style)) return style;
    }
  } catch {
    /* corrupt file → default below */
  }
  return "auto";
}

export function serializeFrameStyle(style: FrameStyle): string {
  return `${JSON.stringify({ frameStyle: style })}\n`;
}

/** Merge the preference over platform base options. `native` strips the
 * custom-chrome keys (overlay / hidden styles / traffic-light offset) and
 * forces a system frame; `auto` returns the base untouched. Pure. */
export function applyFrameStyle(
  base: BrowserWindowConstructorOptions,
  style: FrameStyle,
): BrowserWindowConstructorOptions {
  if (style !== "native") return base;
  const next = { ...base, frame: true as const };
  delete next.titleBarStyle;
  delete next.titleBarOverlay;
  delete next.trafficLightPosition;
  return next;
}
