/** Platform identity + capabilities + filesystem semantics (§3–§5, §11, §25). */
import { describe, expect, it } from "vitest";
import {
  resolveDesktopPlatform,
  currentDesktopPlatform,
  getCapabilities,
  localWorkspaceKind,
  isWslKind,
  isLocalKind,
  toCanonicalRel,
  isWindowsReservedName,
  appliesWindowsReservedRules,
  fileManagerName,
  trashName,
  revealLabel,
  titlebarStrategy,
  shouldQuitOnAllWindowsClosed,
  coerceWindowGeometry,
} from "../../src/shared/platform/index.js";

describe("platform resolution (§3)", () => {
  it("maps Node platforms to desktop platforms", () => {
    expect(resolveDesktopPlatform("win32")).toBe("windows");
    expect(resolveDesktopPlatform("darwin")).toBe("macos");
    expect(resolveDesktopPlatform("linux")).toBe("linux");
  });

  it("currentDesktopPlatform reflects the host", () => {
    expect(["windows", "macos", "linux"]).toContain(currentDesktopPlatform());
  });
});

describe("capabilities (§5)", () => {
  it("gates WSL to Windows only", () => {
    expect(getCapabilities("windows").wsl).toBe(true);
    expect(getCapabilities("macos").wsl).toBe(false);
    expect(getCapabilities("linux").wsl).toBe(false);
  });

  it("assigns traffic lights to macOS and Wayland possibility to Linux", () => {
    expect(getCapabilities("macos").macTrafficLights).toBe(true);
    expect(getCapabilities("windows").macTrafficLights).toBe(false);
    expect(getCapabilities("linux").supportsWayland).toBe(true);
    expect(getCapabilities("windows").supportsWayland).toBe(false);
  });
});

describe("workspace kinds (§11)", () => {
  it("selects the native kind per platform", () => {
    expect(localWorkspaceKind("windows")).toBe("windows-local");
    expect(localWorkspaceKind("macos")).toBe("macos-local");
    expect(localWorkspaceKind("linux")).toBe("linux-local");
  });

  it("distinguishes WSL from native workspaces", () => {
    expect(isWslKind("windows-wsl")).toBe(true);
    expect(isWslKind("windows-local")).toBe(false);
    expect(isLocalKind("macos-local")).toBe(true);
  });

  it("canonicalizes backslashes to the `/` wire format", () => {
    expect(toCanonicalRel("a\\b\\c.md")).toBe("a/b/c.md");
    expect(toCanonicalRel("a/b.md")).toBe("a/b.md");
  });
});

describe("windows reserved names (§25)", () => {
  it("detects reserved basenames", () => {
    expect(isWindowsReservedName("CON")).toBe(true);
    expect(isWindowsReservedName("con.txt")).toBe(true);
    expect(isWindowsReservedName("COM1")).toBe(true);
    expect(isWindowsReservedName("notes.md")).toBe(false);
  });

  it("applies only to Windows workspace kinds", () => {
    expect(appliesWindowsReservedRules("windows-local")).toBe(true);
    expect(appliesWindowsReservedRules("windows-wsl")).toBe(true);
    expect(appliesWindowsReservedRules("macos-local")).toBe(false);
    expect(appliesWindowsReservedRules("linux-local")).toBe(false);
  });
});

describe("platform labels (§32, §116)", () => {
  it("names the file manager natively", () => {
    expect(fileManagerName("windows")).toBe("File Explorer");
    expect(fileManagerName("macos")).toBe("Finder");
    expect(fileManagerName("linux")).toBe("File Manager");
  });

  it("labels trash and reveal natively", () => {
    expect(trashName("windows")).toBe("Recycle Bin");
    expect(trashName("macos")).toBe("Trash");
    expect(revealLabel("macos")).toBe("Reveal in Finder");
    expect(revealLabel("windows")).toBe("Reveal in File Explorer");
    expect(revealLabel("linux")).toBe("Show in File Manager");
  });
});

describe("window policy (§67–§77)", () => {
  it("uses per-platform chrome strategies", () => {
    expect(titlebarStrategy("windows")).toBe("windows-overlay");
    expect(titlebarStrategy("macos")).toBe("mac-hidden-inset");
    expect(titlebarStrategy("linux")).toBe("native-frame");
  });

  it("quits on all-closed everywhere except macOS", () => {
    expect(shouldQuitOnAllWindowsClosed("windows")).toBe(true);
    expect(shouldQuitOnAllWindowsClosed("linux")).toBe(true);
    expect(shouldQuitOnAllWindowsClosed("macos")).toBe(false);
  });

  it("clamps restored geometry onto a visible display", () => {
    const displays = [{ x: 0, y: 0, width: 1920, height: 1080 }];
    const offscreen = coerceWindowGeometry({ width: 1280, height: 860, x: 5000, y: 5000 }, displays);
    expect(offscreen.x).toBeUndefined();
    const sane = coerceWindowGeometry({ width: 1280, height: 860, x: 100, y: 100 }, displays);
    expect(sane.x).toBe(100);
  });
});
