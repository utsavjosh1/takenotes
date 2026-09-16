import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

// POSIX-only (same reason as helper-roundtrip.test.ts): symlink semantics under
// test are POSIX `lstat`/`realpath`; NTFS behavior is NOT VERIFIED here.
describe.runIf(process.platform !== "win32")("helper symlink confinement (posix side; NTFS side NOT VERIFIED here)", () => {
  let root: string;
  let child: ChildProcess | null = null;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "dn-symlink-"));
    writeFileSync(path.join(root, "real.md"), "real");
    writeFileSync(path.join(tmpdir(), "dn-outside-secret.txt"), "secret");
  });

  afterEach(() => {
    child?.kill();
    child = null;
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses to read a symlinked file inside the workspace", async () => {
    const helper = await ensureHelperBuilt();
    symlinkSync(path.join(tmpdir(), "dn-outside-secret.txt"), path.join(root, "key.md"));
    child = spawn(process.execPath, [helper, "--stdio"], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const client = new HelperClient(child, 15000);
    const session = { sessionId: "s", generation: 1 };
    await client.request("hello", { protocolVersion: PROTOCOL_VERSION, nonce: "n" }, session);
    await client.request("workspace.open", { root }, session);
    await expect(client.request("file.read", { relativePath: "key.md" }, session)).rejects.toMatchObject({
      code: "OUTSIDE_ROOT",
    });
  });

  it("refuses traversal through a symlinked directory", async () => {
    const helper = await ensureHelperBuilt();
    symlinkSync(tmpdir(), path.join(root, "escape"));
    child = spawn(process.execPath, [helper, "--stdio"], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const client = new HelperClient(child, 15000);
    const session = { sessionId: "s", generation: 1 };
    await client.request("hello", { protocolVersion: PROTOCOL_VERSION, nonce: "n" }, session);
    await client.request("workspace.open", { root }, session);
    await expect(
      client.request("file.read", { relativePath: "escape/dn-outside-secret.txt" }, session),
    ).rejects.toMatchObject({ code: "OUTSIDE_ROOT" });
  });
});
