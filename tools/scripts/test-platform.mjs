/**
 * Platform smoke report (§210).
 *
 * Prints OS / architecture / display environment / app-path resolution /
 * theme signals / workspace adapter / shortcut-map source — without touching
 * user notes and without collecting sensitive absolute paths beyond the
 * standard Electron `app.getPath` equivalents (home/temp).
 *
 * The machine-readable shortcut maps and collision checks live in
 * `tests/platform/keymap.test.ts` (`npm run keymap:check`).
 * Run: `npm run test:platform`.
 */
import os from "node:os";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

function resolveDesktopPlatform(nodePlatform) {
  if (nodePlatform === "win32") return "windows";
  if (nodePlatform === "darwin") return "macos";
  return "linux";
}

function localWorkspaceKind(platform) {
  if (platform === "windows") return "windows-local";
  if (platform === "macos") return "macos-local";
  return "linux-local";
}

const nodePlatform = process.platform;
const platform = resolveDesktopPlatform(nodePlatform);
const waylandDisplay = process.env.WAYLAND_DISPLAY ?? "(unset)";
const xdgSession = process.env.XDG_SESSION_TYPE ?? "(unset)";
const desktop = process.env.XDG_CURRENT_DESKTOP ?? process.env.DESKTOP_SESSION ?? "(unset)";
const isWayland = typeof process.env.WAYLAND_DISPLAY === "string" && process.env.WAYLAND_DISPLAY !== "";

const report = {
  app: pkg.name,
  version: pkg.version,
  os: platform,
  nodePlatform,
  osRelease: os.release(),
  arch: process.arch,
  node: process.version,
  electron: pkg.devDependencies?.electron ?? "(unknown)",
  display: {
    WAYLAND_DISPLAY: platform === "linux" ? waylandDisplay : "N/A",
    XDG_SESSION_TYPE: platform === "linux" ? xdgSession : "N/A",
    desktop: platform === "linux" ? desktop : "N/A",
    wayland: platform === "linux" ? isWayland : false,
  },
  // app.getPath equivalents — directories only, never note contents (§100).
  paths: {
    home: os.homedir(),
    temp: os.tmpdir(),
  },
  theme: {
    // Renderer resolves light/dark via nativeTheme + prefers-color-scheme (§82);
    // the only static signal available here is an explicit override, if set.
    override: process.env.TAKENOTES_THEME ?? "system (default)",
  },
  workspaceAdapter: localWorkspaceKind(platform),
  wslCapable: platform === "windows",
  shortcutMaps: "tests/platform/keymap.test.ts (npm run keymap:check)",
};

console.log(JSON.stringify(report, null, 2));
