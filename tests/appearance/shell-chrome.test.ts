import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAIN_WINDOW_MIN_SIZE, commandForKeyEventWithOverrides } from "@takenotes/platform";
import { acceleratorFor, findShortcutCollisions } from "@takenotes/platform/keymap";
import { parseSettings } from "../../packages/core/src/validation/schemas";
import { DEFAULT_SETTINGS } from "../../apps/desktop/src/renderer/components/types";
import {
  applyFrameStyle,
  frameStylePath,
  isFrameStyle,
  parseFrameStyle,
  readFrameStyleFile,
  serializeFrameStyle,
} from "../../apps/desktop/src/main/platform/frame-style";

/** Phase 6b gate: shell/chrome (Step 9). Zoom is one settings-level path
 * (menu + keyboard + palette, never Chromium native zoom compounding), the
 * frame preference is strict/inert by default, and the window honors the
 * 800×520 layout floor. */
describe("unified zoom path", () => {
  it("binds Ctrl+=/-/0 on every platform (no native-role bypass)", () => {
    expect(acceleratorFor("app.zoomIn", "windows")).toBe("CommandOrControl+=");
    expect(acceleratorFor("app.zoomIn", "macos")).toBe("Command+=");
    expect(acceleratorFor("app.zoomIn", "linux")).toBe("CommandOrControl+=");
    expect(acceleratorFor("app.zoomOut", "windows")).toBe("CommandOrControl+-");
    expect(acceleratorFor("app.zoomReset", "windows")).toBe("CommandOrControl+0");
  });

  it("matches zoom key events to settings commands (not OS roles)", () => {
    const ctrl = { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };
    for (const platform of ["windows", "linux"] as const) {
      expect(commandForKeyEventWithOverrides(platform, { key: "=", ...ctrl }, {})).toBe("app.zoomIn");
      expect(commandForKeyEventWithOverrides(platform, { key: "-", ...ctrl }, {})).toBe("app.zoomOut");
      expect(commandForKeyEventWithOverrides(platform, { key: "0", ...ctrl }, {})).toBe("app.zoomReset");
    }
    // macOS: the in-window matcher only resolves `ctrlcmd`-normalized
    // bindings (pre-existing quirk — mac defaults stay menu-driven via
    // the native accelerator above), so assert the menu binding only.
    expect(acceleratorFor("app.zoomIn", "macos")).toBe("Command+=");
  });

  it("introduces no shortcut collisions involving zoom", () => {
    const zoomIds = ["app.zoomIn", "app.zoomOut", "app.zoomReset"];
    for (const collision of findShortcutCollisions()) {
      expect(collision.commands.filter((id) => zoomIds.includes(id))).toEqual([]);
    }
  });

  it("routes the View-menu zoom items through command dispatch (audit)", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "apps", "desktop", "src", "main", "platform", "menus.ts"),
      "utf8",
    );
    expect(source).toContain('cmd("app.zoomIn"');
    expect(source).toContain('cmd("app.zoomOut"');
    expect(source).toContain('cmd("app.zoomReset"');
    expect(source).not.toContain('role: "zoomIn"');
    expect(source).not.toContain('role: "zoomOut"');
    expect(source).not.toContain('role: "resetZoom"');
  });
});

describe("frame preference", () => {
  it("defaults to auto and round-trips the stored value", () => {
    expect(DEFAULT_SETTINGS.frameStyle).toBe("auto");
    expect(parseSettings({ frameStyle: "native" })).toMatchObject({ frameStyle: "native" });
    expect(parseSettings({ frameStyle: "frameless" })).not.toHaveProperty("frameStyle");
  });

  it("strict-parses the setter input (unknown rejected, never coerced)", () => {
    expect(parseFrameStyle("native")).toBe("native");
    expect(parseFrameStyle("auto")).toBe("auto");
    expect(parseFrameStyle("frameless")).toBe(undefined);
    expect(parseFrameStyle("")).toBe(undefined);
    expect(parseFrameStyle(undefined)).toBe(undefined);
    expect(isFrameStyle("native")).toBe(true);
    expect(isFrameStyle("auto")).toBe(true);
    expect(isFrameStyle("overlay")).toBe(false);
  });

  it("reads the profile file fail-closed to auto", () => {
    expect(readFrameStyleFile(serializeFrameStyle("native"))).toBe("native");
    expect(readFrameStyleFile(serializeFrameStyle("auto"))).toBe("auto");
    expect(readFrameStyleFile("{}")).toBe("auto");
    expect(readFrameStyleFile('{"frameStyle":"frameless"}')).toBe("auto");
    expect(readFrameStyleFile("not json")).toBe("auto");
    expect(readFrameStyleFile("")).toBe("auto");
  });

  it("names the profile file outside every note workspace", () => {
    expect(frameStylePath("/profile")).toContain("frame-style.json");
    expect(frameStylePath("/profile")).not.toContain(".md");
  });

  it("leaves platform chrome untouched on auto", () => {
    const base = { titleBarStyle: "hidden" as const, width: 1280 };
    expect(applyFrameStyle(base, "auto")).toBe(base);
  });

  it("strips custom chrome and forces a system frame on native", () => {
    const base = {
      width: 1280,
      titleBarStyle: "hidden" as const,
      titleBarOverlay: { height: 40 },
      trafficLightPosition: { x: 12, y: 12 },
    };
    const next = applyFrameStyle(base, "native");
    expect(next.frame).toBe(true);
    expect(next).not.toHaveProperty("titleBarStyle");
    expect(next).not.toHaveProperty("titleBarOverlay");
    expect(next).not.toHaveProperty("trafficLightPosition");
    expect(next.width).toBe(1280);
    // Base is never mutated (shared platform option objects).
    expect(base.titleBarStyle).toBe("hidden");
  });
});

describe("window minimums", () => {
  it("pins the 800×520 layout floor", () => {
    expect(MAIN_WINDOW_MIN_SIZE).toEqual({ width: 800, height: 520 });
  });

  it("applies the floor at window creation (audit)", () => {
    const source = readFileSync(
      join(__dirname, "..", "..", "apps", "desktop", "src", "main", "window.ts"),
      "utf8",
    );
    expect(source).toContain("MAIN_WINDOW_MIN_SIZE");
    expect(source).toContain("minWidth");
    expect(source).toContain("minHeight");
  });
});
