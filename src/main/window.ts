import { app, BrowserWindow, dialog, shell, type BrowserWindowConstructorOptions } from "electron";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
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
    `(exists=${f.entryExists} asar=${f.asarSize} packaged=${f.isPackaged} ` +
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
  let asarSize: string;
  try {
    const asarPath = path.join(resourcesPath, "app.asar");
    const st = statSync(asarPath);
    asarSize = `${st.size} bytes`;
  } catch (e) {
    asarSize = `unreadable (${String(e).slice(0, 120)})`;
  }
  return formatRendererFailureReport({
    version,
    isPackaged,
    resourcesPath,
    appPath,
    mainDir,
    entry,
    rendererDir,
    entryExists,
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
    const entry = path.join(rendererFile, "index.html");
    // Never white-screen silently: a missing/broken bundle (e.g. installed
    // over a running copy, portable ZIP re-extracted while locked, or AV
    // truncating app.asar) used to leave an empty window with only a
    // console ERR_FILE_NOT_FOUND. Surface it with self-diagnostics so the
    // next screenshot alone explains WHY (no PowerShell needed).
    void window.loadFile(entry).catch((err) => {
      const report = collectRendererFailureReport(rendererFile, entry);
      console.error(`[startup] ${report.logLine}: ${String(err)}`);
      try {
        dialog.showErrorBox("takenotes could not open", report.dialogBody);
      } catch {
        /* dialog unavailable — log is the fallback */
      }
    });
  }
  return window;
}
