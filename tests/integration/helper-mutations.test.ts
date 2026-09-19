import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HelperClient } from "../../src/main/wsl/helper-client";
import { PROTOCOL_VERSION } from "../../src/shared/protocol-version";

async function ensureHelperBuilt(): Promise<string> {
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["scripts/build-helper.mjs"], { stdio: "pipe" });
  return path.resolve("dist-helper/helper.cjs");
}

const IS_ROOT = typeof process.getuid === "function" && process.getuid() === 0;

// POSIX-only: same rationale as helper-roundtrip.test.ts — the helper speaks
// absolute POSIX roots and permission fixtures rely on Linux DAC semantics.
describe.runIf(process.platform !== "win32")("wsl helper mutation parity (P1-04)", () => {
  let root: string;
  let child: ChildProcess | null = null;
  let client: HelperClient;
  const session = { sessionId: "p1-04-mutations", generation: 1 };

  async function req(operation: string, payload: unknown): Promise<unknown> {
    return client.request(operation, payload, session);
  }

  async function reqError(operation: string, payload: unknown): Promise<{ code: string; message: string }> {
    try {
      await req(operation, payload);
    } catch (e) {
      return e as { code: string; message: string };
    }
    throw new Error(`expected ${operation} to fail, but it succeeded`);
  }

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), "dn-p104-"));
    writeFileSync(path.join(root, "seed.md"), "# seed\n");
    const helper = await ensureHelperBuilt();
    child = spawn(process.execPath, [helper, "--stdio"], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    client = new HelperClient(child, 15000);
    await req("hello", { protocolVersion: PROTOCOL_VERSION });
    await req("workspace.open", { root });
  });

  afterEach(() => {
    child?.kill();
    child = null;
    try {
      chmodSync(root, 0o755);
    } catch {
      /* best effort so rm -rf succeeds */
    }
    rmSync(root, { recursive: true, force: true });
  });

  it("directory.create/rename/delete round-trip with precise errors", async () => {
    await req("directory.create", { relativePath: "docs/sub" });
    const listed = (await req("directory.list", { relativePath: "docs" })) as { name: string }[];
    expect(listed.map((e) => e.name)).toContain("sub");

    // Creating where a file lives is a conflict, not a silent no-op.
    await expect(req("directory.create", { relativePath: "seed.md" })).rejects.toMatchObject({
      code: "ALREADY_EXISTS",
    });

    await req("directory.rename", { oldPath: "docs", newPath: "manual" });
    await expect(req("directory.list", { relativePath: "docs" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const top = (await req("directory.list", { relativePath: "" })) as { name: string }[];
    expect(top.map((e) => e.name)).toContain("manual");

    // Renaming onto an existing name refuses.
    await expect(req("directory.rename", { oldPath: "manual", newPath: "seed.md" })).rejects.toMatchObject({
      code: "ALREADY_EXISTS",
    });
    // Renaming a file through the directory op refuses.
    await expect(req("directory.rename", { oldPath: "seed.md", newPath: "seed2.md" })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });

    // Non-empty without recursive refuses — native DIRECTORY_NOT_EMPTY parity.
    await expect(req("directory.delete", { relativePath: "manual", recursive: false })).rejects.toMatchObject({
      code: "DIRECTORY_NOT_EMPTY",
    });
    await req("directory.delete", { relativePath: "manual", recursive: true });
    await expect(req("directory.list", { relativePath: "manual" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Missing dir and file-path deletes are precise, never generic.
    await expect(req("directory.delete", { relativePath: "nope", recursive: false })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(req("directory.delete", { relativePath: "seed.md", recursive: false })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  it("file.rename/delete round-trip (delete is permanent) with precise errors", async () => {
    await req("file.create", { relativePath: "notes/a.md" });
    await req("file.rename", { oldPath: "notes/a.md", newPath: "notes/b.md" });
    const file = (await req("file.read", { relativePath: "notes/b.md" })) as { content: string };
    expect(typeof file.content).toBe("string");
    await expect(req("file.read", { relativePath: "notes/a.md" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Renaming onto an existing file refuses.
    await expect(req("file.rename", { oldPath: "notes/b.md", newPath: "seed.md" })).rejects.toMatchObject({
      code: "ALREADY_EXISTS",
    });
    // Missing source is precise.
    await expect(req("file.rename", { oldPath: "notes/ghost.md", newPath: "notes/x.md" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // Directories are refused through the file op — use folder rename.
    await expect(req("file.rename", { oldPath: "notes", newPath: "notes2" })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });

    // Permanent delete: the note is gone afterwards, readably so.
    await req("file.delete", { relativePath: "notes/b.md" });
    await expect(req("file.read", { relativePath: "notes/b.md" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Deleting a missing file is precise.
    await expect(req("file.delete", { relativePath: "notes/b.md" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Directories are refused through the file op — use folder delete.
    await expect(req("file.delete", { relativePath: "notes" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  // Ticket fixture note: the ticket names "mode 700 dir, wrong uid", but Linux
  // CI has only one uid — a self-owned 700 dir stays accessible, so the
  // wrong-uid case cannot be simulated here. Mode 000 denies even the owner
  // (non-root) through the identical EACCES → PERMISSION_DENIED path the
  // wrong-uid case hits in production. The live two-user matrix
  // (utsav/work, 700-private homes) is tests/wsl/mutations.windows.test.ts.
  it("permission-denied fixture: mode 000 paths surface PERMISSION_DENIED, never generic", async () => {
    if (IS_ROOT) {
      console.warn("skip permission fixture: tests run as root, DAC checks are bypassed");
      return;
    }
    const secretFile = path.join(root, "secret.md");
    writeFileSync(secretFile, "shh\n");
    chmodSync(secretFile, 0o000);
    try {
      expect(await reqError("file.read", { relativePath: "secret.md" })).toMatchObject({ code: "PERMISSION_DENIED" });
    } finally {
      chmodSync(secretFile, 0o644);
    }

    const lockedDir = path.join(root, "locked");
    mkdirSync(lockedDir);
    writeFileSync(path.join(lockedDir, "inside.md"), "x\n");
    chmodSync(lockedDir, 0o000);
    try {
      expect(await reqError("directory.list", { relativePath: "locked" })).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      expect(await reqError("file.read", { relativePath: "locked/inside.md" })).toMatchObject({
        code: "PERMISSION_DENIED",
      });
      expect(await reqError("directory.delete", { relativePath: "locked", recursive: true })).toMatchObject({
        code: "PERMISSION_DENIED",
      });
    } finally {
      chmodSync(lockedDir, 0o755);
    }
  });

  it("symlink escape is refused for mutations and reads", async () => {
    const outside = mkdtempSync(path.join(tmpdir(), "dn-p104-out-"));
    writeFileSync(path.join(outside, "evil.md"), "evil\n");
    const linkTarget = path.join(outside, "evil.md");
    try {
      symlinkSync(linkTarget, path.join(root, "link.md"));
      mkdirSync(path.join(outside, "edir"));
      symlinkSync(path.join(outside, "edir"), path.join(root, "ldir"));

      expect(await reqError("file.read", { relativePath: "link.md" })).toMatchObject({ code: "OUTSIDE_ROOT" });
      expect(await reqError("file.delete", { relativePath: "link.md" })).toMatchObject({ code: "OUTSIDE_ROOT" });
      expect(await reqError("file.rename", { oldPath: "link.md", newPath: "moved.md" })).toMatchObject({
        code: "OUTSIDE_ROOT",
      });
      expect(await reqError("directory.list", { relativePath: "ldir" })).toMatchObject({ code: "OUTSIDE_ROOT" });
      expect(await reqError("directory.delete", { relativePath: "ldir", recursive: false })).toMatchObject({
        code: "OUTSIDE_ROOT",
      });
      expect(await reqError("directory.create", { relativePath: "ldir/sub" })).toMatchObject({ code: "OUTSIDE_ROOT" });
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("traversal, absolute, and NUL paths are rejected before any mutation", async () => {
    for (const bad of ["../escape.md", "a/../../etc/passwd", "/absolute.md", "nul\0byte.md"]) {
      expect(await reqError("file.read", { relativePath: bad })).toMatchObject({ code: "INVALID_PATH" });
      await expect(req("file.create", { relativePath: bad })).rejects.toMatchObject({ code: "INVALID_PATH" });
      await expect(req("directory.create", { relativePath: bad })).rejects.toMatchObject({ code: "INVALID_PATH" });
      await expect(req("file.delete", { relativePath: bad })).rejects.toMatchObject({ code: "INVALID_PATH" });
      await expect(req("directory.delete", { relativePath: bad, recursive: true })).rejects.toMatchObject({
        code: "INVALID_PATH",
      });
    }
  });

  it("write failures stay precise (missing file, not-a-file)", async () => {
    const file = (await req("file.read", { relativePath: "seed.md" })) as {
      content: string;
      revision: { hash: string };
    };
    await expect(
      req("file.write", {
        relativePath: "ghost.md",
        content: "x",
        expectedHash: file.revision.hash,
        newlineStyle: "lf",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    mkdirSync(path.join(root, "adir"));
    await expect(
      req("file.write", {
        relativePath: "adir",
        content: "x",
        expectedHash: file.revision.hash,
        newlineStyle: "lf",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});
