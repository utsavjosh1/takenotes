import { describe, expect, it } from "vitest";
import path from "node:path";
import { formatRendererFailureReport, resolveRendererDir } from "../../src/main/window.js";

/** Regression for v0.0.5 launch-failure: the missing-bundle dialog only
 * carried the version + path, so a fresh-but-broken install on
 * `D:\apps\takenotes` / `D:\new\takenotes` was indistinguishable from a
 * packaging omission (shipped asar is proven good — 309 entries, all boot
 * files present, 12997621 bytes). The report must carry asar size +
 * renderer listing so the next screenshot alone explains WHY. */
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
      rendererListing: "(empty folder)",
      asarSize: "1234 bytes",
    });
    expect(logLine).toContain("v0.0.5");
    expect(logLine).toContain("exists=false");
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
      rendererListing: "unreadable (Error: ENOENT)",
      asarSize: "unreadable (Error: ENOENT)",
    });
    expect(dialogBody).toContain("unreadable");
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
