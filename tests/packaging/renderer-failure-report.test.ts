import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  formatRendererFailureReport,
  mimeForRendererFilename,
  rendererAppUrl,
  resolveFileForAppRequest,
  resolveRendererDir,
} from "../../src/main/window.js";

/** Regression for v0.0.5/v0.0.6 launch-failure: the missing-bundle dialog only
 * carried the version + path, so a fresh-but-broken install on
 * `D:\apps\takenotes` / `D:\new\takenotes` was indistinguishable from a
 * packaging omission (shipped asar is proven good — 309 entries, all boot
 * files present, 12997621 bytes). The v0.0.6 report then proved the sharp
 * paradox: exists=true + full readdir listing, yet ERR_FILE_NOT_FOUND on
 * loadFile — Chromium's asar file handling fails where Node fs succeeds.
 * Ordered fallbacks (file → file-URL → app-protocol-from-asar) plus truthful
 * probes (on-disk size, entry kind) cover that whole class. */
describe("renderer failure report (packaging)", () => {
  it("carries version, asar size and renderer listing in both log and dialog", () => {
    const { logLine, dialogBody } = formatRendererFailureReport({
      version: "0.0.5",
      isPackaged: true,
      resourcesPath: "D:\\apps\\takenotes\\resources",
      appPath: "D:\\apps\\takenotes\\resources\\app.asar",
      mainDir: "D:\\apps\\takenotes\\resources\\app.asar\\dist-electron\\main",
      entry: "D:\\apps\\takenotes\\resources\\app.asar\\dist\\renderer\\index.html",
      rendererDir: "D:\\apps\\takenotes\\resources\\app.asar\\dist\\renderer",
      entryExists: false,
      entryKind: "missing",
      rendererListing: "(empty folder)",
      asarSize: "1234 bytes",
    });
    expect(logLine).toContain("v0.0.5");
    expect(logLine).toContain("exists=false");
    expect(logLine).toContain("kind=missing");
    expect(logLine).toContain("1234 bytes");
    expect(logLine).toContain("(empty folder)");
    expect(logLine).toContain("mainDir=");
    expect(dialogBody).toContain("app v0.0.5");
    expect(dialogBody).toContain("1234 bytes");
    expect(dialogBody).toContain("(empty folder)");
    // Simple fix, like every other app — never PowerShell.
    expect(dialogBody).toContain("Quit takenotes fully");
    expect(dialogBody).toContain("Uninstall");
    expect(dialogBody).not.toContain("asar list");
    expect(dialogBody).not.toContain("npx");
  });

  it("surfaces unreadable probes instead of throwing", () => {
    const { dialogBody } = formatRendererFailureReport({
      version: "unknown",
      isPackaged: true,
      resourcesPath: "(no resourcesPath)",
      appPath: "(no appPath)",
      mainDir: "(no __dirname)",
      entry: "entry",
      rendererDir: "rendererDir",
      entryExists: false,
      entryKind: "missing",
      rendererListing: "unreadable (Error: ENOENT)",
      asarSize: "unreadable (Error: ENOENT)",
    });
    expect(dialogBody).toContain("unreadable");
  });

  it("records the v0.0.6 paradox shape (exists yet unloadable)", () => {
    const { logLine } = formatRendererFailureReport({
      version: "0.0.6",
      isPackaged: true,
      resourcesPath: "D:\\new\\takenotes\\resources",
      appPath: "D:\\new\\takenotes\\resources\\app.asar",
      mainDir: "D:\\new\\takenotes\\resources\\app.asar\\dist-electron\\main",
      entry: "D:\\new\\takenotes\\resources\\app.asar\\dist\\renderer\\index.html",
      rendererDir: "D:\\new\\takenotes\\resources\\app.asar\\dist\\renderer",
      entryExists: true,
      entryKind: "file",
      rendererListing: "assets, index.html, theme-init.js",
      asarSize: "12997621 bytes (on-disk)",
    });
    expect(logLine).toContain("exists=true");
    expect(logLine).toContain("kind=file");
    expect(logLine).toContain("12997621 bytes (on-disk)");
  });
});

describe("resolveRendererDir (packaging)", () => {
  it("prefers the appPath anchor when its index.html exists", () => {
    const appPath = path.join("D:", "new", "takenotes", "resources", "app.asar");
    const got = resolveRendererDir({
      appPath,
      mainDir: path.join("somewhere", "else"),
      exists: (p) => p === path.join(appPath, "dist", "renderer", "index.html"),
    });
    expect(got).toBe(path.join(appPath, "dist", "renderer"));
  });

  it("falls back to the legacy __dirname traversal when the anchor misses", () => {
    const mainDir = path.join("D:", "x", "app.asar", "dist-electron", "main");
    const got = resolveRendererDir({ appPath: "", mainDir, exists: () => false });
    expect(got).toBe(path.join(mainDir, "..", "..", "dist", "renderer"));
  });
});

describe("app-protocol fallback (packaging)", () => {
  const root = path.join("D:", "new", "takenotes", "resources", "app.asar", "dist", "renderer");
  const exists = (p: string) => p === path.join(root, "index.html") || p === path.join(root, "assets", "a.js");
  const isDirectory = (p: string) => p === root || p === path.join(root, "assets");

  it("maps / and /index.html to the bundle entry", () => {
    expect(resolveFileForAppRequest(root, "/", exists, isDirectory)).toBe(path.join(root, "index.html"));
    expect(resolveFileForAppRequest(root, "/index.html", exists, isDirectory)).toBe(path.join(root, "index.html"));
  });

  it("serves nested bundle files and strips query/hash", () => {
    expect(resolveFileForAppRequest(root, "/assets/a.js?v=1#x", exists, isDirectory)).toBe(
      path.join(root, "assets", "a.js"),
    );
  });

  it("blocks plain, encoded, and absolute traversal", () => {
    expect(resolveFileForAppRequest(root, "/../secret", exists, isDirectory)).toBeNull();
    expect(resolveFileForAppRequest(root, "/%2e%2e/secret", exists, isDirectory)).toBeNull();
    expect(resolveFileForAppRequest(root, "/%2E%2E%2Fsecret", exists, isDirectory)).toBeNull();
    expect(resolveFileForAppRequest(root, "/C:/Windows/x", exists, isDirectory)).toBeNull();
    expect(resolveFileForAppRequest(root, "/assets/../../secret", exists, isDirectory)).toBeNull();
  });

  it("returns null for missing files and directories", () => {
    expect(resolveFileForAppRequest(root, "/nope.html", exists, isDirectory)).toBeNull();
    expect(resolveFileForAppRequest(root, "/assets", () => true, isDirectory)).toBeNull();
  });

  it("builds stable app URLs and mime types", () => {
    expect(rendererAppUrl("/index.html")).toBe("takenotes://bundle/index.html");
    expect(rendererAppUrl("index.html")).toBe("takenotes://bundle/index.html");
    expect(mimeForRendererFilename("index.html")).toBe("text/html");
    expect(mimeForRendererFilename("bundle.js")).toBe("text/javascript");
    expect(mimeForRendererFilename("app.css")).toBe("text/css");
    expect(mimeForRendererFilename("icon.svg")).toBe("image/svg+xml");
    expect(mimeForRendererFilename("noext")).toBe("application/octet-stream");
  });
});
