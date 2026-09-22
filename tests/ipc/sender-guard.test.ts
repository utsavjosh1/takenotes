import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isTrustedWindow } from "../../src/main/ipc/guard.js";

/** M-04: the sender boundary is uniform — foreign/untrusted senders are
 * rejected even for low-sensitivity data like platform/version. */
describe("ipc sender guard", () => {
  it("trusts a live window owned by this app", () => {
    expect(isTrustedWindow({ isDestroyed: () => false })).toBe(true);
  });

  it("rejects a foreign/untrusted sender (unknown webContents)", () => {
    expect(isTrustedWindow(null)).toBe(false);
  });

  it("rejects a destroyed window", () => {
    expect(isTrustedWindow({ isDestroyed: () => true })).toBe(false);
  });
});

/** Mechanical audit: every renderer-facing `ipcMain.handle` in register.ts
 * must enforce the sender boundary. This tripwire fails if a new handler is
 * added without `senderIsOurs` — the exact M-04 omission. */
describe("ipc handler sender audit", () => {
  const source = readFileSync(join(__dirname, "..", "..", "src", "main", "ipc", "register.ts"), "utf8");
  const handlers = [...source.matchAll(/ipcMain\.handle\("([^"]+)"/g)].map((m) => m[1]!);

  it("registers the known handler inventory (update this list deliberately)", () => {
    expect(handlers.sort()).toEqual(
      [
        "app:platform",
        "app:version",
        "commands:list",
        "directory:create",
        "directory:delete",
        "directory:list",
        "directory:rename",
        "draft:clear",
        "draft:get",
        "draft:put",
        "file:create",
        "file:read",
        "file:rename",
        "file:trash",
        "file:write",
        "recovery:captureChanged",
        "recovery:list",
        "recovery:read",
        "recovery:restore",
        "shell:reveal",
        "update:check",
        "update:download",
        "workspace:close",
        "workspace:listWsl",
        "workspace:listWslUsers",
        "workspace:openLocal",
        "wsl:connect",
      ].sort(),
    );
  });

  it("every handler validates the sender", () => {
    // Split the source at each handler registration; each block must call
    // the shared guard before touching arguments or services.
    const blocks = source.split(/ipcMain\.handle\("/).slice(1);
    expect(blocks.length).toBe(handlers.length);
    const missing = blocks
      .map((block, i) => ({ channel: handlers[i]!, guarded: block.includes("senderIsOurs(event)") }))
      .filter((h) => !h.guarded)
      .map((h) => h.channel);
    expect(missing).toEqual([]);
  });
});
