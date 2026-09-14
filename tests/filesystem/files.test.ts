import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTextFile,
  readTextFile,
  writeTextFile,
} from "../../src/main/workspace/local-workspace";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "dn-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// Windows workspace module uses path.win32 semantics end-to-end (win32.join
// converts "/" to "\\"), so it can only execute on Windows. Linux CI covers
// the shared validators (paths.test.ts) and the helper (posix) equivalent.
// The Windows CI job runs this file for real (NTFS replacement, Unicode, etc.).
describe.runIf(process.platform === "win32")("windows workspace files", () => {
  it("creates, reads, and writes with revision", async () => {
    const created = await createTextFile(root, "inbox.md", "# hi\n");
    expect("revision" in created).toBe(true);
    const read = await readTextFile(root, "inbox.md");
    expect("result" in read).toBe(true);
    if (!("result" in read)) return;
    expect(read.result.content).toBe("# hi\n");
    expect(read.result.newlineStyle).toBe("lf");
    const written = await writeTextFile(root, "inbox.md", "# edited\n", read.result.revision.hash, "lf", false);
    expect("revision" in written).toBe(true);
  });

  it("detects conflicts on stale revision", async () => {
    await createTextFile(root, "todo.md", "v1\n");
    const first = await readTextFile(root, "todo.md");
    if (!("result" in first)) throw new Error("read failed");
    // External edit
    await writeTextFile(root, "todo.md", "v2\n", first.result.revision.hash, "lf", false);
    // Stale save must conflict
    const stale = await writeTextFile(root, "todo.md", "stale\n", first.result.revision.hash, "lf", false);
    expect("error" in stale && stale.error.code === "CONFLICT").toBe(true);
  });

  it("refuses to overwrite on create", async () => {
    await createTextFile(root, "dup.md", "x");
    const again = await createTextFile(root, "dup.md", "y");
    expect("error" in again).toBe(true);
  });

  it("handles CRLF preservation and BOM", async () => {
    writeFileSync(path.join(root, "crlf.md"), "# a\r\n# b\r\n");
    const read = await readTextFile(root, "crlf.md");
    if (!("result" in read)) throw new Error("read failed");
    expect(read.result.newlineStyle).toBe("crlf");
    writeFileSync(path.join(root, "bom.md"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("# bom\n")]));
    const bom = await readTextFile(root, "bom.md");
    if (!("result" in bom)) throw new Error("bom read failed");
    expect(bom.result.hadBom).toBe(true);
    expect(bom.result.content).toBe("# bom\n");
  });

  it("rejects binary (NUL) files", async () => {
    writeFileSync(path.join(root, "bin.md"), Buffer.from([0x68, 0x69, 0x00, 0x01]));
    const read = await readTextFile(root, "bin.md");
    expect("error" in read && read.error.code === "UNSUPPORTED_ENCODING").toBe(true);
  });

  it("rejects traversal reads", async () => {
    const read = await readTextFile(root, "..\\outside.md");
    expect("error" in read).toBe(true);
  });

  it("rejects symlinked directory traversal", async () => {
    const outside = mkdtempSync(path.join(tmpdir(), "dn-out-"));
    try {
      writeFileSync(path.join(outside, "secret.md"), "secret");
      symlinkSync(outside, path.join(root, "link"));
      const read = await readTextFile(root, "link\\secret.md");
      expect("error" in read).toBe(true);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("supports unicode and space filenames", async () => {
    const created = await createTextFile(root, "my notes caf\u00e9.md", "# hi\n");
    expect("revision" in created).toBe(true);
  });

  // Nested Windows separators only act as separators on Windows; gate honestly.
  it.runIf(process.platform === "win32")("supports nested windows folders", async () => {
    mkdirSync(path.join(root, "my notes"), { recursive: true });
    const created = await createTextFile(root, "my notes\\nested.md", "# hi\n");
    expect("revision" in created).toBe(true);
  });
});
