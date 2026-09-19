import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDirectory, deleteDirectory, renameDirectory } from "../../src/main/workspace/local-workspace";

describe.runIf(process.platform !== "win32")("directory operations (posix local workspace)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "dn-dirs-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates nested parents recursively", async () => {
    const out = await createDirectory(root, "linux-local", "a/b/c");
    expect("error" in out).toBe(false);
    expect(statSync(path.join(root, "a", "b", "c")).isDirectory()).toBe(true);
  });

  it("rejects traversal, absolute, and NUL paths", async () => {
    for (const p of ["../escape", "a/../../x", "/etc/passwd", "a\0b"]) {
      const out = await createDirectory(root, "linux-local", p);
      expect("error" in out).toBe(true);
    }
    expect("error" in await deleteDirectory(root, "linux-local", "../escape", false)).toBe(true);
    expect("error" in await renameDirectory(root, "linux-local", "a", "../escape")).toBe(true);
  });

  it("refuses non-empty delete without recursive (DIRECTORY_NOT_EMPTY)", async () => {
    await createDirectory(root, "linux-local", "docs");
    writeFileSync(path.join(root, "docs", "note.md"), "# hi\n");
    const out = await deleteDirectory(root, "linux-local", "docs", false);
    expect(out).toMatchObject({ error: { code: "DIRECTORY_NOT_EMPTY" } });
    // Nothing was removed.
    expect(statSync(path.join(root, "docs", "note.md")).isFile()).toBe(true);
  });

  it("deletes recursively when confirmed", async () => {
    await createDirectory(root, "linux-local", "docs/sub");
    writeFileSync(path.join(root, "docs", "note.md"), "# hi\n");
    const out = await deleteDirectory(root, "linux-local", "docs", true);
    expect("error" in out).toBe(false);
    expect(() => statSync(path.join(root, "docs"))).toThrow();
  });

  it("renames directories with contents", async () => {
    await createDirectory(root, "linux-local", "old/sub");
    writeFileSync(path.join(root, "old", "note.md"), "# hi\n");
    const out = await renameDirectory(root, "linux-local", "old", "new");
    expect("error" in out).toBe(false);
    expect(statSync(path.join(root, "new", "note.md")).isFile()).toBe(true);
    expect(() => statSync(path.join(root, "old"))).toThrow();
  });

  it("rejects operations through symlink escapes", async () => {
    const outside = mkdtempSync(path.join(tmpdir(), "dn-dirs-out-"));
    try {
      mkdirSync(path.join(outside, "real"), { recursive: true });
      symlinkSync(path.join(outside, "real"), path.join(root, "link"));
      const created = await createDirectory(root, "linux-local", "link/evil");
      expect(created).toMatchObject({ error: { code: "OUTSIDE_ROOT" } });
      const deleted = await deleteDirectory(root, "linux-local", "link", true);
      expect(deleted).toMatchObject({ error: { code: "OUTSIDE_ROOT" } });
      const renamed = await renameDirectory(root, "linux-local", "link", "link2");
      expect(renamed).toMatchObject({ error: { code: "OUTSIDE_ROOT" } });
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

// Windows NTFS reality (reserved separators, junctions): runs in Windows CI only.
describe.runIf(process.platform === "win32")("directory operations (windows-local)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "dn-dirs-win-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates, renames, and deletes directories", async () => {
    expect("error" in await createDirectory(root, "windows-local", "docs\\sub")).toBe(false);
    expect("error" in await renameDirectory(root, "windows-local", "docs", "docs2")).toBe(false);
    expect("error" in await deleteDirectory(root, "windows-local", "docs2", true)).toBe(false);
  });

  it("rejects traversal and NUL", async () => {
    expect("error" in await createDirectory(root, "windows-local", "..\\escape")).toBe(true);
    expect("error" in await createDirectory(root, "windows-local", "a\0b")).toBe(true);
  });
});
