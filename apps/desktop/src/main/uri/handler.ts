/** Step 8 URI handler (Phase 5e): `takenotes://` OS entry points.
 *
 * Guardrails (why no confirmation dialog — roadmap Step 8):
 * 1. No workspace switching or creation: actions run against the
 *    already-open workspace only. With none open the renderer ignores
 *    the action with a notice.
 * 2. Confinement twice: the core parser rejects escapes, and services
 *    re-validate kind-appropriately before touching bytes.
 * 3. No destructive ops exist in the action set (open/new/daily/search
 *    only — no delete, rename, or trash).
 * 4. `new`/`daily` create ordinary files through the normal service
 *    pipeline (revision-tracked, watcher-visible, undoable by delete).
 * 5. `bundle` URLs are renderer internals and never parse as automation.
 * 6. `x-success`/`x-error` are opaque echo strings — never opened,
 *    never fetched, no callbacks.
 *
 * OS wiring: packaged-only `setAsDefaultProtocolClient` (dev builds
 * must not steal the scheme), macOS `open-url`, Windows/Linux protocol
 * argv on first and second instances. Delivery is a renderer event —
 * main never touches workspaces here; the renderer owns identity.
 */
import { app, BrowserWindow } from "electron";
import { parseTakenotesUri } from "@takenotes/core/uri/parse";

export const URI_SCHEME = "takenotes";

/** First `takenotes://` argv entry (Windows/Linux launch + second
 * instance). Skips the binary path and flags. Null when absent. */
export function extractUriArg(argv: readonly string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (arg.toLowerCase().startsWith(`${URI_SCHEME}://`)) return arg;
  }
  return null;
}

/** Claim the scheme for OS links. Packaged builds only — dev must not
 * steal clicks. Best-effort: failure only logs. */
export function registerUriProtocol(): void {
  if (!app.isPackaged) return;
  try {
    app.setAsDefaultProtocolClient(URI_SCHEME);
  } catch (err) {
    console.warn(`URI scheme registration failed: ${String(err)}`);
  }
}

export type UriDelivery = {
  ok: boolean;
  /** Raw URL as received (audit aid). */
  raw: string;
  /** Parsed action or parse error, JSON-safe. */
  payload: unknown;
};

/** Parse, focus the window, and forward to the renderer. Parse failures
 * forward too — the renderer notifies honestly instead of dropping
 * silently. No window yet (startup race) → log and drop. */
export function deliverUri(raw: string): void {
  const parsed =
    parseTakenotesUri(raw);
  const delivery: UriDelivery = parsed.ok
    ? { ok: true, raw, payload: parsed.uri }
    : { ok: false, raw, payload: { code: parsed.error.code, message: parsed.error.message } };
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) {
    console.warn(`URI dropped (no window): ${raw.slice(0, 128)}`);
    return;
  }
  if (win.isMinimized()) win.restore();
  win.focus();
  win.webContents.send("takenotes:uri-action", delivery);
}
