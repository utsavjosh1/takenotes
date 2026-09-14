import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HelperClient } from "../../src/main/wsl/helper-client";
import { PROTOCOL_VERSION } from "../../src/shared/protocol-version";

let helperJs: string | null = null;

async function ensureHelperBuilt(): Promise<string> {
  if (helperJs) return helperJs;
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["scripts/build-helper.mjs"], { stdio: "pipe" });
  helperJs = path.resolve("dist-helper/helper.cjs");
  return helperJs;
}

describe("wsl helper direct round-trip (ubuntu node, no wsl.exe)", () => {
  let root: string;
  let child: ChildProcess | null = null;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "dn-helper-"));
    writeFileSync(path.join(root, "architecture.md"), "# Architecture\n");
  });

  afterEach(() => {
    child?.kill();
    child = null;
    rmSync(root, { recursive: true, force: true });
  });

  it("handshake, open, list, read, write", async () => {
    const helper = await ensureHelperBuilt();
    child = spawn(process.execPath, [helper, "--stdio"], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const client = new HelperClient(child, 15000);
    const session = { sessionId: "test-session", generation: 1 };

    const hello = (await client.request("hello", { protocolVersion: PROTOCOL_VERSION }, session)) as {
      protocolVersion: number;
    };
    expect(hello.protocolVersion).toBe(PROTOCOL_VERSION);

    await client.request("workspace.open", { root }, session);
    const entries = (await client.request("directory.list", { relativePath: "" }, session)) as { name: string }[];
    expect(entries.map((e) => e.name)).toContain("architecture.md");

    const file = (await client.request("file.read", { relativePath: "architecture.md" }, session)) as {
      content: string;
      revision: { hash: string };
    };
    expect(file.content).toBe("# Architecture\n");

    const updated = (await client.request(
      "file.write",
      { relativePath: "architecture.md", content: "# Edited\n", expectedHash: file.revision.hash, newlineStyle: "lf" },
      session,
    )) as { hash: string };
    expect(typeof updated.hash).toBe("string");

    // Stale write must conflict
    await expect(
      client.request(
        "file.write",
        { relativePath: "architecture.md", content: "# Stale\n", expectedHash: file.revision.hash, newlineStyle: "lf" },
        session,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await client.request("workspace.close", {}, session);
  });

  it("rejects traversal and unknown operations", async () => {
    const helper = await ensureHelperBuilt();
    child = spawn(process.execPath, [helper, "--stdio"], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const client = new HelperClient(child, 15000);
    const session = { sessionId: "test-session-2", generation: 1 };
    await client.request("hello", { protocolVersion: PROTOCOL_VERSION }, session);
    await client.request("workspace.open", { root }, session);
    await expect(client.request("file.read", { relativePath: "../escape.md" }, session)).rejects.toMatchObject({
      code: "INVALID_PATH",
    });
    await expect(client.request("nope.unknown", {}, session)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});
