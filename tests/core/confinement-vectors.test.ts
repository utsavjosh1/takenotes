/**
 * M-03 confinement parity corpus.
 *
 * One shared vector table run against every host boundary that must agree:
 * - `CoreNoteService + LocalHostFilesystem` (canonical policy, linux-local)
 * - `NativeFileAdapter` (production IPC note path)
 * - Core policy validation for `windows-local` (pure validation vectors —
 *   no filesystem touch, so they run on any host)
 *
 * The WSL helper implements the same refusal policy in its own runtime
 * (it cannot import Core) and is covered by its direct-spawn round-trip
 * suite (`tests/integration/helper-mutations.test.ts`: symlink escape
 * refused for reads/mutations). Platform-impossible vectors (symlinks on
 * Windows CI without privileges) are explicitly gated — real NTFS behavior
 * is P1-11.
 *
 * Purpose: future drift prevention. If any boundary starts accepting a
 * vector the others refuse, this suite fails.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CoreNoteService, type CoreWorkspace } from "../../src/core/services/note-service.js";
import { validateNoteRelativePath } from "../../src/core/policy/note-policy.js";
import { LocalHostFilesystem } from "../../src/main/workspace/local-host-filesystem.js";
import { NativeFileAdapter } from "../../src/main/workspace/file-adapter.js";

/** Vectors every boundary must refuse with INVALID_PATH or OUTSIDE_ROOT. */
const REFUSED_VECTORS = [
  "..",
  "../outside.md",
  "a/../../x.md",
  "/etc/passwd",
  "C:\\notes\\x.md",
  "\\\\server\\share\\x.md",
  "a\0b.md",
] as const;

function makeCore() {
  const service = new CoreNoteService(new LocalHostFilesystem());
  return service;
}

function makeNative() {
  return new NativeFileAdapter(async () => undefined);
}

describe("confinement parity vectors", () => {
  it("Core accepts normal + nested relative paths", async () => {
    const root = mkdtempSync(join(tmpdir(), "takenotes-confine-"));
    try {
      const service = makeCore();
      const ws: CoreWorkspace = { root, kind: "linux-local" };
      mkdirSync(join(root, "Daily"), { recursive: true });
      writeFileSync(join(root, "note.md"), "hi\n");
      writeFileSync(join(root, "Daily", "2026-09-19.md"), "daily\n");
      expect(await service.read(ws, "note.md")).toMatchObject({ result: { content: "hi\n" } });
      expect(await service.read(ws, "Daily/2026-09-19.md")).toMatchObject({ result: { content: "daily\n" } });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("Core + production native adapter refuse the same vectors", async () => {
    const root = mkdtempSync(join(tmpdir(), "takenotes-confine-"));
    try {
      const core = makeCore();
      const native = makeNative();
      const ws: CoreWorkspace = { root, kind: "linux-local" };
      for (const p of REFUSED_VECTORS) {
        const c = await core.read(ws, p);
        expect("error" in c, `core accepts ${JSON.stringify(p)}`).toBe(true);
        if ("error" in c) expect(["INVALID_PATH", "OUTSIDE_ROOT"]).toContain(c.error.code);
        const n = await native.read(root, "linux-local", p);
        expect("error" in n, `native accepts ${JSON.stringify(p)}`).toBe(true);
        if ("error" in n) expect(["INVALID_PATH", "OUTSIDE_ROOT"]).toContain(n.error.code);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("windows-local validation refuses the same vectors on any host (pure policy)", () => {
    for (const p of [...REFUSED_VECTORS, "note.md:bad", "aux.md", "NUL", "dir/COM1.txt", "LPT9"] as const) {
      const out = validateNoteRelativePath("windows-local", p);
      expect("error" in out, `windows-local accepts ${JSON.stringify(p)}`).toBe(true);
    }
    expect(validateNoteRelativePath("windows-local", "note.md")).toMatchObject({ relativePath: "note.md" });
  });

  it.runIf(process.platform !== "win32")("symlink file, symlink dir, and realpath escape are refused", async () => {
    const root = mkdtempSync(join(tmpdir(), "takenotes-confine-"));
    const outside = mkdtempSync(join(tmpdir(), "takenotes-outside-"));
    try {
      const core = makeCore();
      const native = makeNative();
      const ws: CoreWorkspace = { root, kind: "linux-local" };
      writeFileSync(join(root, "real.md"), "real\n");
      mkdirSync(join(root, "realdir"), { recursive: true });
      writeFileSync(join(root, "realdir", "inside.md"), "inside\n");
      writeFileSync(join(outside, "outside.md"), "outside\n");
      symlinkSync(join(root, "real.md"), join(root, "link.md"));
      symlinkSync(join(root, "realdir"), join(root, "linkdir"));
      symlinkSync(outside, join(root, "esc"));
      for (const p of ["link.md", "linkdir/inside.md", "esc/outside.md"]) {
        const c = await core.read(ws, p);
        expect(c, `core accepts symlink vector ${p}`).toMatchObject({ error: { code: "OUTSIDE_ROOT" } });
        const n = await native.read(root, "linux-local", p);
        expect(n, `native accepts symlink vector ${p}`).toMatchObject({ error: { code: "OUTSIDE_ROOT" } });
      }
      // The real files are still readable directly — only traversal is refused.
      expect(await core.read(ws, "real.md")).toMatchObject({ result: { content: "real\n" } });
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
