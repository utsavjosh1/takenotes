import { app, BrowserWindow, dialog, shell, type BrowserWindowConstructorOptions } from "electron";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

/** Custom-protocol renderer fallback. Primary load is always `file://`
 * (`loadFile`); the `takenotes://bundle/…` origin exists only for machines
 * where Chromium's built-in asar file handling fails while Node fs reads the
 * same bundle fine (observed: existsSync=true + full readdir listing, yet
 * ERR_FILE_NOT_FOUND on loadFile). Served bytes still come from the asar —
 * only the transport changes. Registration is lazy (fallback path only) so
 * normal launches are untouched; scheme privileges are declared pre-ready in
 * `src/main/index.ts` (`standard` is load-bearing: without it the origin is
 * opaque and the bundle's own `script-src 'self'` CSP blocks its scripts). */
export const RENDERER_PROTOCOL_SCHEME = "takenotes";
export const RENDERER_PROTOCOL_HOST = "bundle";

const RENDERER_MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function mimeForRendererFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
  return RENDERER_MIME[ext] ?? "application/octet-stream";
}

export function rendererAppUrl(pathname: string): string {
  const clean = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${RENDERER_PROTOCOL_SCHEME}://${RENDERER_PROTOCOL_HOST}${clean}`;
}

/** Map an app-protocol request path to a file under rendererDir.
 * Returns null for anything escaping the bundle root (plain, encoded, or
 * absolute traversal) or naming a directory. `exists`/`isDirectory` are
 * injected so the confinement logic is unit-testable without touching fs. */
export function resolveFileForAppRequest(
  rendererDir: string,
  requestPath: string,
  exists: (p: string) => boolean,
  isDirectory: (p: string) => boolean,
): string | null {
  let pathname = requestPath;
  const q = pathname.indexOf("?");
  if (q >= 0) pathname = pathname.slice(0, q);
  const h = pathname.indexOf("#");
  if (h >= 0) pathname = pathname.slice(0, h);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const rel = decoded.replace(/^[/\\]+/, "");
  if (/^(?:[a-zA-Z]:|\\\\)/.test(rel)) return null;
  const target = path.normalize(path.join(rendererDir, rel === "" ? "index.html" : rel));
  const relToRoot = path.relative(rendererDir, target);
  if (relToRoot === "" || relToRoot === ".." || relToRoot.startsWith(`..${path.sep}`)) return null;
  try {
    if (!exists(target) || isDirectory(target)) return null;
  } catch {
    return null;
  }
  return target;
}

const handledSessions = new WeakSet<object>();

function ensureRendererProtocolHandler(session: Electron.Session, rendererDir: string): void {
  if (handledSessions.has(session)) return;
  session.protocol.handle(RENDERER_PROTOCOL_SCHEME, (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return new Response("not found", { status: 404 });
    }
    if (url.hostname !== RENDERER_PROTOCOL_HOST || request.method !== "GET") {
      return new Response("not found", { status: 404 });
    }
    const file = resolveFileForAppRequest(
      rendererDir,
      url.pathname,
      (p) => {
        try {
          return existsSync(p);
        } catch {
          return false;
        }
      },
      (p) => {
        try {
          return statSync(p).isDirectory();
        } catch {
          return true;
        }
      },
    );
    if (!file) return new Response("not found", { status: 404 });
    try {
      const body = readFileSync(file);
      return new Response(body, { status: 200, headers: { "content-type": mimeForRendererFilename(file) } });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
  handledSessions.add(session);
}

/** Load the renderer with ordered fallbacks, one variable at a time:
 * `loadFile` (primary, unchanged for healthy machines) → `loadURL(file:)`
 * (same bytes, different Chromium entry point) → `takenotes://` served from
 * the asar via Node fs (proven readable where Chromium's asar file handling
 * fails). Only total failure shows the diagnostics dialog. */
async function loadRendererWithFallbacks(
  window: BrowserWindow,
  rendererDir: string,
  entry: string,
): Promise<void> {
  try {
    await window.loadFile(entry);
    return;
  } catch (err) {
    console.error(`[startup] renderer loadFile failed, trying file URL: ${String(err)}`);
  }
  const fileUrl = pathToFileURL(entry).href;
  try {
    await window.loadURL(fileUrl);
    console.error(`[startup] renderer loaded via file-URL fallback ${fileUrl}`);
    return;
  } catch (err) {
    console.error(`[startup] renderer file-URL fallback failed, trying app protocol: ${String(err)}`);
  }
  try {
    ensureRendererProtocolHandler(window.webContents.session, rendererDir);
    const appUrl = rendererAppUrl("/index.html");
    await window.loadURL(appUrl);
    console.error(`[startup] renderer loaded via app-protocol fallback ${appUrl}`);
    return;
  } catch (err) {
    const report = collectRendererFailureReport(rendererDir, entry);
    console.error(`[startup] ${report.logLine}: ${String(err)}`);
    try {
      dialog.showErrorBox("takenotes could not open", report.dialogBody);
    } catch {
      /* dialog unavailable — log is the fallback */
    }
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

export type RendererFailureFacts = {
  version: string;
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
  mainDir: string;
  entry: string;
  rendererDir: string;
  entryExists: boolean;
  /** file | directory | missing — distinguishes archive-vs-folder confusion. */
  entryKind: string;
  /** Human-readable: file list or the fs error, never file contents. */
  rendererListing: string;
  /** Human-readable: byte size or the fs error. */
  asarSize: string;
};

/** Pure formatter: every field above is load-bearing in the next bug report
 * (version distinguishes stale/mixed installs, listing distinguishes
 * truncated vs mislocated bundles). No secrets: paths/sizes only. */
export function formatRendererFailureReport(f: RendererFailureFacts): { logLine: string; dialogBody: string } {
  const logLine =
    `v${f.version} failed to load renderer entry ${f.entry} ` +
    `(exists=${f.entryExists} kind=${f.entryKind} asar=${f.asarSize} packaged=${f.isPackaged} ` +
    `resources=${f.resourcesPath} appPath=${f.appPath} mainDir=${f.mainDir} rendererDir=${f.rendererDir} ` +
    `listing=[${f.rendererListing}])`;
  const dialogBody =
    `Missing renderer bundle (app v${f.version}):\n${f.entry}\n\n` +
    `What the app sees:\n- app.asar: ${f.asarSize}\n- renderer folder: ${f.rendererListing}\n\n` +
    `Fix (2 min, like any other app):\n` +
    `1. Quit takenotes fully (Task Manager > End task if needed).\n` +
    `2. Settings > Apps > takenotes > Uninstall (portable ZIP: delete the folder).\n` +
    `3. Reinstall fresh — never install over a running copy.`;
  return { logLine, dialogBody };
}

/** Probe the filesystem (asar-aware via Electron's fs patch) and format.
 * All probes are best-effort: an probe failure becomes part of the report. */
export function collectRendererFailureReport(rendererDir: string, entry: string): {
  logLine: string;
  dialogBody: string;
} {
  const version = (() => {
    try {
      return app.getVersion();
    } catch {
      return "unknown";
    }
  })();
  const isPackaged = (() => {
    try {
      return app.isPackaged;
    } catch {
      return false;
    }
  })();
  const resourcesPath = (() => {
    try {
      return process.resourcesPath ?? "(no resourcesPath)";
    } catch {
      return "(no resourcesPath)";
    }
  })();
  const appPath = (() => {
    try {
      return app.getAppPath();
    } catch {
      return "(no appPath)";
    }
  })();
  const mainDir = (() => {
    try {
      return typeof __dirname === "string" ? __dirname : "(no __dirname)";
    } catch {
      return "(no __dirname)";
    }
  })();
  const entryExists = (() => {
    try {
      return existsSync(entry);
    } catch {
      return false;
    }
  })();
  let rendererListing: string;
  try {
    const names = readdirSync(rendererDir);
    rendererListing = names.length > 0 ? names.slice(0, 20).join(", ") : "(empty folder)";
  } catch (e) {
    rendererListing = `unreadable (${String(e).slice(0, 120)})`;
  }
  // Ground truth for the asar file size: Electron patches `fs` for asar
  // paths (stat on the archive itself can report the virtual root, 0 bytes),
  // so prefer `original-fs` (unpatched). Falls back to patched fs outside
  // Electron (tests) and reports failures instead of throwing.
  let asarSize: string;
  const asarPath = path.join(resourcesPath, "app.asar");
  try {
    const req = createRequire(import.meta.url);
    const mod: unknown = req("original-fs");
    const statSyncFn = (mod as { statSync?: unknown }).statSync;
    if (typeof statSyncFn !== "function") throw new Error("no statSync");
    const size = (statSyncFn as (p: string) => { size: number })(asarPath).size;
    asarSize = `${size} bytes (on-disk)`;
  } catch {
    try {
      asarSize = `${statSync(asarPath).size} bytes`;
    } catch (e) {
      asarSize = `unreadable (${String(e).slice(0, 120)})`;
    }
  }
  const entryKind = (() => {
    try {
      const st = statSync(entry);
      return st.isDirectory() ? "directory" : st.isFile() ? "file" : "other";
    } catch {
      return entryExists ? "unknown" : "missing";
    }
  })();
  return formatRendererFailureReport({
    version,
    isPackaged,
    resourcesPath,
    appPath,
    mainDir,
    entry,
    rendererDir,
    entryExists,
    entryKind,
    rendererListing,
    asarSize,
  });
}

/** Resolve the packaged renderer dir without assuming main-bundle depth.
 * `app.getAppPath()` is `.../resources/app.asar` when packaged (stable
 * anchor); the legacy `__dirname/../../` traversal breaks silently if the
 * esbuild outfile layout ever changes depth. Pure + unit-tested. */
export function resolveRendererDir(opts: {
  appPath: string;
  mainDir: string;
  exists: (p: string) => boolean;
}): string {
  const fromApp = path.join(opts.appPath, "dist", "renderer");
  try {
    if (opts.exists(path.join(fromApp, "index.html"))) return fromApp;
  } catch {
    /* fall through to legacy */
  }
  return path.join(opts.mainDir, "..", "..", "dist", "renderer");
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
  // Same-app fallback origin (`takenotes://bundle/…`) navigates freely like
  // the dev-server URL; everything else still needs explicit allowlisting.
  window.webContents.on("will-navigate", (event, url) => {
    if (rendererUrl && url.startsWith(rendererUrl)) return;
    if (url.startsWith(`${RENDERER_PROTOCOL_SCHEME}://${RENDERER_PROTOCOL_HOST}/`)) return;
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
    // Never white-screen silently: ordered fallbacks (file → file-URL →
    // app-protocol-from-asar) before the diagnostics dialog, so one broken
    // Chromium code path no longer bricks the app while Node can read it.
    const entry = path.join(rendererFile, "index.html");
    void loadRendererWithFallbacks(window, rendererFile, entry).catch((err) => {
      console.error(`[startup] renderer fallback chain crashed: ${String(err)}`);
    });
  }
  return window;
}
