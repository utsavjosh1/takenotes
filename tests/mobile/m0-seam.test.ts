/**
 * M0 gate — mobile seam proof (runs on any OS, no native deps).
 *
 * Mirrors the desktop Gate A contract vectors through the mobile seam:
 * `MobileWorkspace` over `mobile-local` + `MemoryHostFilesystem`, plus
 * `ExpoFileAdapter` atomic-write behavior over a fake `ExpoFsOps`, plus
 * platform identity (mobile-local is local, POSIX, not WSL).
 */
import { describe, expect, it } from "vitest";
import { MobileWorkspace } from "@takenotes/mobile/workspace/mobile-workspace";
import { MemoryHostFilesystem } from "@takenotes/mobile/adapters/memory";
import { ExpoFileAdapter, type ExpoFsOps } from "@takenotes/mobile/adapters/expo-filesystem";
import { LocalOnlySync } from "@takenotes/mobile/sync/sync";
import { CoreNoteService } from "@takenotes/core/services/note-service";
import { isLocalKind, isMobileKind, isWslKind, appliesWindowsReservedRules } from "@takenotes/platform/filesystem";
import { getMobileCapabilities } from "@takenotes/platform/capabilities";

const ROOT = "/sandbox/takenotes";

function makeMobile() {
  const host = new MemoryHostFilesystem();
  const ws = new MobileWorkspace({ workspaceId: "test-ws-01", root: ROOT }, host);
  return { host, ws };
}

describe("M0: MobileWorkspace over mobile-local", () => {
  it("reads a seeded note with revision", async () => {
    const { host, ws } = makeMobile();
    host.seed(`${ROOT}/hello.md`, "# hi\n");
    const out = await ws.read("hello.md");
    expect("result" in out).toBe(true);
    if ("result" in out) {
      expect(out.result.content).toContain("hi");
      expect(out.result.revision.hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("updates with correct expectedRevision, CONFLICTs on stale", async () => {
    const { host, ws } = makeMobile();
    host.seed(`${ROOT}/note.md`, "v1\n");
    const read = await ws.read("note.md");
    expect("result" in read).toBe(true);
    if (!("result" in read)) return;
    const ok = await ws.update("note.md", "v2\n", read.result.revision.hash, read.result.newlineStyle, read.result.hadBom);
    expect("revision" in ok).toBe(true);
    const stale = await ws.update("note.md", "v3\n", read.result.revision.hash, read.result.newlineStyle, read.result.hadBom);
    expect(stale).toMatchObject({ error: { code: "CONFLICT" } });
    const reread = await ws.read("note.md");
    if ("result" in reread) expect(reread.result.content).toBe("v2\n");
  });

  it("returns NOT_FOUND for missing files", async () => {
    const { ws } = makeMobile();
    await expect(ws.read("missing.md")).resolves.toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("rejects traversal/absolute paths (POSIX rules)", async () => {
    const { ws } = makeMobile();
    for (const p of ["../secret.md", "a/../../x.md", "/etc/passwd", "..", "a\0b.md", "C:\\notes\\x.md", "\\\\server\\share\\x.md"] as const) {
      const out = await ws.read(p);
      expect("error" in out, p).toBe(true);
      if ("error" in out) expect(["INVALID_PATH", "OUTSIDE_ROOT"]).toContain(out.error.code);
    }
  });

  it("does NOT apply Windows reserved-name rules (POSIX kind)", async () => {
    const { host, ws } = makeMobile();
    host.seed(`${ROOT}/CON.md`, "reserved on win32, fine on mobile\n");
    const out = await ws.read("CON.md");
    expect("result" in out).toBe(true);
  });

  it("preserves BOM round-trip", async () => {
    const { host, ws } = makeMobile();
    host.seed(`${ROOT}/bom.md`, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("bom\n", "utf8")]));
    const read = await ws.read("bom.md");
    expect("result" in read).toBe(true);
    if (!("result" in read)) return;
    expect(read.result.hadBom).toBe(true);
    const upd = await ws.update("bom.md", "bom2\n", read.result.revision.hash, read.result.newlineStyle, true);
    expect("revision" in upd).toBe(true);
  });
});

function makeFakeOps(): { ops: ExpoFsOps; store: Map<string, Uint8Array>; calls: string[] } {
  const store = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const ops: ExpoFsOps = {
    readBytes: async (p) => {
      const b = store.get(p);
      if (!b) {
        const e = new Error(`ENOENT: ${p}`) as NodeJS.ErrnoException;
        e.code = "ENOENT";
        throw e;
      }
      return b;
    },
    writeBytes: async (p, b) => {
      calls.push(`write:${p}`);
      store.set(p, b);
    },
    move: async (from, to) => {
      calls.push(`move:${from}->${to}`);
      const b = store.get(from);
      if (!b) throw new Error(`ENOENT: ${from}`);
      store.set(to, b);
      store.delete(from);
    },
    deleteSilent: async (p) => {
      calls.push(`delete:${p}`);
      store.delete(p);
    },
    stat: async (p) => {
      const b = store.get(p);
      if (!b) {
        const e = new Error(`ENOENT: ${p}`) as NodeJS.ErrnoException;
        e.code = "ENOENT";
        throw e;
      }
      return { size: b.length, mtimeMs: Date.now(), isDirectory: false };
    },
    exists: async (p) => store.has(p),
    mkdir: async () => {},
    readDir: async (p) => {
      const prefix = `${p}/`;
      const out = new Map<string, { name: string; isDirectory: boolean; mtimeMs: number; size: number }>();
      for (const [k, v] of store) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        if (!rest || rest.includes("/")) continue;
        out.set(rest, { name: rest, isDirectory: false, mtimeMs: Date.now(), size: v.length });
      }
      return [...out.values()];
    },
  };
  return { ops, store, calls };
}

describe("M0: ExpoFileAdapter over fake ops", () => {
  it("writes via tmp+rename, leaves no tmp behind", async () => {
    const { ops, store, calls } = makeFakeOps();
    const adapter = new ExpoFileAdapter(ops);
    await adapter.writeBytesAtomic("/root/a.md", Buffer.from("hello"));
    expect(store.get("/root/a.md")?.length).toBe(5);
    expect([...store.keys()].some((k) => k.includes(".tmp-"))).toBe(false);
    expect(calls.some((c) => c.startsWith("write:") && c.includes(".tmp-"))).toBe(true);
    expect(calls.some((c) => c.startsWith("move:"))).toBe(true);
    // Core policy works on top of it.
    const svc = new CoreNoteService(adapter);
    const out = await svc.read({ root: "/root", kind: "mobile-local" }, "a.md");
    expect("result" in out).toBe(true);
  });

  it("cleans tmp when move fails", async () => {
    const { ops, store } = makeFakeOps();
    ops.move = async () => {
      throw new Error("disk full");
    };
    const adapter = new ExpoFileAdapter(ops);
    await expect(adapter.writeBytesAtomic("/root/b.md", Buffer.from("x"))).rejects.toThrow("disk full");
    expect([...store.keys()].some((k) => k.includes(".tmp-"))).toBe(false);
    expect(store.has("/root/b.md")).toBe(false);
  });

  it("lstat reports isSymlink=false, realpath null when missing", async () => {
    const { ops } = makeFakeOps();
    const adapter = new ExpoFileAdapter(ops);
    await adapter.writeBytesAtomic("/root/c.md", Buffer.from("c"));
    expect((await adapter.lstat("/root/c.md")).isSymlink).toBe(false);
    expect(await adapter.realpath("/root/nope.md")).toBeNull();
  });
});

describe("M0: platform identity", () => {
  it("mobile-local is local + mobile, not WSL, no Windows rules", () => {
    expect(isMobileKind("mobile-local")).toBe(true);
    expect(isLocalKind("mobile-local")).toBe(true);
    expect(isWslKind("mobile-local")).toBe(false);
    expect(appliesWindowsReservedRules("mobile-local")).toBe(false);
    expect(isMobileKind("linux-local")).toBe(false);
  });

  it("mobile capabilities are sandbox/offline, no system trash", () => {
    expect(getMobileCapabilities("ios")).toMatchObject({
      sandboxOnly: true,
      supportsSystemTrash: false,
      supportsShareSheet: true,
      offlineOnly: true,
    });
  });

  it("LocalOnlySync is a no-op (seam reserved, not built)", async () => {
    const s = new LocalOnlySync();
    expect(s.kind).toBe("local-only");
    await expect(s.pull()).resolves.toEqual({ applied: 0 });
    await expect(s.push()).resolves.toEqual({ uploaded: 0 });
    await expect(s.status()).resolves.toEqual({ pending: 0, lastSyncMs: null });
  });
});
