/**
 * M3 gate — import/export + appearance (any OS, no native deps).
 *
 * Also pins the device-half of the gate that can't run here: `app.json`
 * (minimal permissions, scheme, assets) and `eas.json` (profiles) are
 * asserted as JSON so config drift fails in CI, not on a device.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MobileWorkspace } from "@takenotes/mobile/workspace/mobile-workspace";
import { MemoryHostFilesystem } from "@takenotes/mobile/adapters/memory";
import { importFiles, readForShare } from "@takenotes/mobile/share/import-export";
import {
  APPEARANCE_KEY,
  AppearanceStore,
  DEFAULT_APPEARANCE,
  MAX_FONT_SCALE,
  MIN_FONT_SCALE,
  parseAppearance,
  scaledFont,
} from "@takenotes/mobile/settings/appearance";

const ROOT = "/sandbox/takenotes";
const MOBILE_ROOT = join(__dirname, "..", "..", "apps", "mobile");

function makeWs() {
  const host = new MemoryHostFilesystem();
  const ws = new MobileWorkspace({ workspaceId: "m3-ws", root: ROOT }, host);
  return { host, ws };
}

const enc = (s: string) => new TextEncoder().encode(s);

describe("M3: import", () => {
  it("copies text in, increments collisions, never overwrites", async () => {
    const { host, ws } = makeWs();
    host.seed(`${ROOT}/note.md`, "original\n");
    const first = await importFiles(ws, host, ROOT, "", [
      { name: "note.md", bytes: enc("incoming\n") },
      { name: "ideas.md", bytes: enc("# ideas\n") },
    ]);
    expect(first.skipped).toEqual([]);
    expect(first.imported.map((f) => f.relativePath).sort()).toEqual(["ideas.md", "note 1.md"]);
    // Original untouched (create-only, never overwrite).
    const orig = await ws.read("note.md");
    if ("result" in orig) expect(orig.result.content).toBe("original\n");
    // Second identical import increments again.
    const second = await importFiles(ws, host, ROOT, "", [{ name: "note.md", bytes: enc("again\n") }]);
    expect(second.imported).toEqual([{ relativePath: "note 2.md", name: "note 2.md" }]);
  });

  it("imports into subfolders (parents created) with case-insensitive dedup", async () => {
    const { host, ws } = makeWs();
    host.seed(`${ROOT}/Docs/Note.MD`, "x\n");
    const res = await importFiles(ws, host, ROOT, "Docs", [{ name: "note.md", bytes: enc("y\n") }]);
    expect(res.imported).toEqual([{ relativePath: "Docs/note 1.md", name: "note 1.md" }]);
    const fresh = await importFiles(ws, host, ROOT, "New/Folder", [{ name: "a.txt", bytes: enc("a\n") }]);
    expect(fresh.imported).toEqual([{ relativePath: "New/Folder/a.txt", name: "a.txt" }]);
  });

  it("skips non-text, oversize, bad-encoding, bad names — with reasons", async () => {
    const { host, ws } = makeWs();
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const res = await importFiles(ws, host, ROOT, "", [
      { name: "photo.png", bytes: enc("fakepng") },
      { name: "doc.pdf", bytes: enc("fakepdf") },
      { name: "big.md", bytes: big },
      { name: "binary.md", bytes: new Uint8Array([0xff, 0xfe, 0x00]) },
      { name: "nul.md", bytes: new Uint8Array([104, 105, 0]) },
      { name: "..", bytes: enc("evil\n") },
      { name: "", bytes: enc("x") },
    ]);
    expect(res.imported).toEqual([]);
    expect(res.skipped).toHaveLength(7);
    expect(res.skipped.find((s) => s.name === "photo.png")?.reason).toMatch(/only markdown/i);
    expect(res.skipped.find((s) => s.name === "big.md")?.reason).toMatch(/too large/i);
    expect(res.skipped.find((s) => s.name === "binary.md")?.reason).toMatch(/utf-8/i);
  });

  it("strips picker path parts (traversal neutralized to basename); bad target dir fails all", async () => {
    const { host, ws } = makeWs();
    const res = await importFiles(ws, host, ROOT, "", [
      { name: "C:\\fakepath\\note.md", bytes: enc("n\n") },
      { name: "../evil.md", bytes: enc("evil\n") },
    ]);
    // Both collapse to harmless basenames inside the workspace — nothing escapes.
    expect(res.imported).toEqual([
      { relativePath: "note.md", name: "note.md" },
      { relativePath: "evil.md", name: "evil.md" },
    ]);
    const badDir = await importFiles(ws, host, ROOT, "../out", [{ name: "a.md", bytes: enc("a") }]);
    expect(badDir.imported).toEqual([]);
    expect(badDir.skipped).toHaveLength(1);
  });
});

describe("M3: export (share-out read)", () => {
  it("returns filename + mime + content; missing → NOT_FOUND", async () => {
    const { host, ws } = makeWs();
    host.seed(`${ROOT}/note.md`, "# hi\n");
    const md = await readForShare(ws, "note.md");
    expect(md).toMatchObject({ payload: { filename: "note.md", mime: "text/markdown", content: "# hi\n" } });
    host.seed(`${ROOT}/plain.txt`, "t\n");
    expect(await readForShare(ws, "plain.txt")).toMatchObject({ payload: { mime: "text/plain" } });
    await expect(readForShare(ws, "missing.md")).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});

describe("M3: appearance", () => {
  it("parses garbage to defaults, clamps scale, falls back theme", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("dark")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ theme: "amoled", fontScale: 99 })).toEqual({ theme: "system", fontScale: MAX_FONT_SCALE });
    expect(parseAppearance({ theme: "dark", fontScale: 0.1 })).toEqual({ theme: "dark", fontScale: MIN_FONT_SCALE });
    expect(parseAppearance({ theme: "light", fontScale: NaN })).toEqual({ theme: "light", fontScale: 1 });
    expect(parseAppearance({ theme: "dark" })).toEqual({ theme: "dark", fontScale: 1 });
  });

  it("scales fonts in .5 steps; touch targets untouched by design", () => {
    expect(scaledFont(16, 1)).toBe(16);
    expect(scaledFont(16, 1.3)).toBe(21);
    expect(scaledFont(16, 99)).toBe(scaledFont(16, MAX_FONT_SCALE));
  });

  it("persists round-trip; corrupt JSON → defaults", async () => {
    const backing = new Map<string, string>();
    const kv = {
      get: async (k: string) => backing.get(k) ?? null,
      set: async (k: string, v: string) => { backing.set(k, v); },
    };
    const store = new AppearanceStore(kv);
    expect(await store.load()).toEqual(DEFAULT_APPEARANCE);
    await store.save({ theme: "dark", fontScale: 9 });
    expect(backing.get(APPEARANCE_KEY)).toContain('"fontScale":1.3');
    expect(await store.load()).toEqual({ theme: "dark", fontScale: 1.3 });
    backing.set(APPEARANCE_KEY, "{corrupt");
    expect(await store.load()).toEqual(DEFAULT_APPEARANCE);
  });
});

describe("M3: app config (device-half pins)", () => {
  const appJson = JSON.parse(readFileSync(join(MOBILE_ROOT, "app.json"), "utf8")) as Record<string, unknown>;

  it("declares minimal permissions (no location, no camera, no network list)", () => {
    const android = appJson["android"] as Record<string, unknown>;
    expect(android["permissions"]).toEqual([]);
    expect(JSON.stringify(appJson)).not.toMatch(/NSLocation|NSCamera|NSMicrophone/);
  });

  it("registers the takenotes:// scheme and router plugin", () => {
    expect(appJson["scheme"]).toBe("takenotes");
    expect(appJson["plugins"]).toContain("expo-router");
    expect(appJson["slug"]).toBe("takenotes-mobile");
  });

  it("references documented assets", () => {
    const doc = readFileSync(join(MOBILE_ROOT, "assets", "README.md"), "utf8");
    for (const asset of ["icon.png", "splash.png", "adaptive-icon.png"] as const) {
      expect(JSON.stringify(appJson)).toContain(asset);
      expect(doc).toContain(asset);
    }
  });

  it("eas profiles cover development/preview/production", () => {
    const eas = JSON.parse(readFileSync(join(MOBILE_ROOT, "eas.json"), "utf8")) as {
      build: Record<string, unknown>;
    };
    expect(Object.keys(eas.build).sort()).toEqual(["development", "preview", "production"]);
  });
});
