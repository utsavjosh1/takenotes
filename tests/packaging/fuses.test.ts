import { describe, expect, it } from "vitest";
import { FuseV1Options } from "@electron/fuses";
import { FUSE_CONFIG } from "../../scripts/after-pack-fuses.mjs";

/** Regression for 2026-09-18 Windows launch-failure:
 * `[FATAL:gin/v8_initializer.cc] Error loading V8 startup snapshot file`.
 * Enabling LoadBrowserProcessSpecificV8Snapshot without shipping
 * browser_v8_context_snapshot.bin / browser_snapshot_blob.bin kills the app
 * before any JS runs — even with all stock siblings present. */
describe("electron fuses (packaging)", () => {
  it("keeps LoadBrowserProcessSpecificV8Snapshot disabled (no custom browser snapshot pipeline)", () => {
    expect(FUSE_CONFIG[FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]).toBe(false);
  });

  it("requires all fuses explicitly (loud failure on Electron upgrades)", () => {
    expect(FUSE_CONFIG).toMatchObject({ strictlyRequireAllFuses: true });
  });
});
