/**
 * Keymap collision test (§56, §206–§209). Builds the active shortcut map for
 * windows / macos / linux and fails on same-scope duplicates. Also snapshots
 * the machine-readable map (§208) and the human labels (§209).
 */
import { describe, expect, it } from "vitest";
import {
  findShortcutCollisions,
  shortcutMapFor,
  RESERVED_SHORTCUTS,
  acceleratorFor,
} from "../../src/shared/platform/keymap.js";
import { formatShortcut, shortcutLabelsFor } from "../../src/shared/platform/shortcut-labels.js";
import type { DesktopPlatform } from "../../src/shared/platform/types.js";

const PLATFORMS: DesktopPlatform[] = ["windows", "macos", "linux"];

describe("keymap collisions (§56)", () => {
  it("has no same-scope duplicate accelerators on any platform", () => {
    const collisions = findShortcutCollisions();
    expect(
      collisions.map((c) => `${c.platform} ${c.scope} ${c.accelerator} → ${c.commands.join(", ")}`),
    ).toEqual([]);
  });

  it("produces a non-empty shortcut map for every platform (§208)", () => {
    for (const p of PLATFORMS) {
      const map = shortcutMapFor(p);
      expect(Object.keys(map).length).toBeGreaterThan(5);
      // Spot-check the canonical bindings (§40).
      expect(map["file.save"]).toBeDefined();
      expect(map["file.quickOpen"]).toBeDefined();
    }
  });

  it("never binds a reserved OS shortcut as a custom command (§57)", () => {
    const reserved = new Set(RESERVED_SHORTCUTS.map((s) => s.toLowerCase()));
    for (const p of PLATFORMS) {
      const map = shortcutMapFor(p);
      for (const acc of Object.values(map)) {
        expect(reserved.has(acc.toLowerCase())).toBe(false);
      }
    }
  });

  it("app.quit / fullscreen / zoom stay native-role (no custom binding)", () => {
    for (const p of PLATFORMS) {
      expect(acceleratorFor("app.quit", p)).toBeUndefined();
      expect(acceleratorFor("app.toggleFullscreen", p)).toBeUndefined();
      expect(acceleratorFor("app.zoomIn", p)).toBeUndefined();
    }
  });
});

describe("shortcut labels (§37–§39, §209)", () => {
  it("never leaks CommandOrControl into display strings", () => {
    for (const p of PLATFORMS) {
      for (const label of Object.values(shortcutLabelsFor(p))) {
        expect(label).not.toMatch(/commandorcontrol/i);
      }
    }
  });

  it("uses macOS glyphs on macos and word labels elsewhere", () => {
    expect(formatShortcut("file.save", "macos")).toBe("⌘S");
    expect(formatShortcut("file.save", "windows")).toBe("Ctrl+S");
    expect(formatShortcut("file.save", "linux")).toBe("Ctrl+S");
    expect(formatShortcut("commandPalette.open", "macos")).toBe("⇧⌘P");
    expect(formatShortcut("commandPalette.open", "windows")).toBe("Ctrl+Shift+P");
    expect(formatShortcut("settings.open", "macos")).toBe("⌘,");
    expect(formatShortcut("tree.trash", "macos")).toBe("⌘⌫");
    expect(formatShortcut("tree.trash", "windows")).toBe("Delete");
  });

  it("mac rename has no default binding (menu/palette/context only, §44)", () => {
    expect(formatShortcut("tree.rename", "macos")).toBe("");
    expect(formatShortcut("tree.rename", "windows")).toBe("F2");
    expect(formatShortcut("tree.rename", "linux")).toBe("F2");
  });
});
