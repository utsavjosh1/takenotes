import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

// POSIX-only: the helper speaks absolute POSIX roots ("/...") and runs under
// the bundled Linux Node inside WSL. On win32 tmpdir() is `C:\...` so
// `workspace.open` correctly rejects it with INVALID_REQUEST — that is the
// Windows path working as designed, not a helper regression.
describe.runIf(process.platform !== "win32")("wsl helper direct round-trip (ubuntu node, no wsl.exe)", () => {
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

  it("users.list returns filtered humans with the current user marked", async () => {
    const helper = await ensureHelperBuilt();
    child = spawn(process.execPath, [helper, "--stdio"], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const client = new HelperClient(child, 15000);
    const session = { sessionId: "test-users", generation: 1 };
    const hello = (await client.request("hello", { protocolVersion: PROTOCOL_VERSION }, session)) as {
      uid: number;
      home: string;
      capabilities: string[];
    };
    expect(hello.capabilities).toContain("users.list");
    const res = (await client.request("users.list", {}, session)) as {
      users: { name: string; uid: number; gid: number; home: string; shell: string; isCurrent: boolean }[];
    };
    expect(res.users.length).toBeGreaterThan(0);
    for (const u of res.users) {
      expect(typeof u.name).toBe("string");
      expect(typeof u.uid).toBe("number");
      expect(typeof u.home).toBe("string");
    }
    // No service accounts leak through (nobody/root unless self).
    expect(res.users.find((u) => u.name === "nobody" && !u.isCurrent)).toBeUndefined();
    // The user the helper runs as is always present and marked.
    const me = res.users.find((u) => u.isCurrent);
    expect(me).toBeDefined();
    expect(me!.uid).toBe(hello.uid);
  });

  it("hello reports process uid/home and ~/Notes resolves under that home", async () => {
    const helper = await ensureHelperBuilt();
    const fakeHome = mkdtempSync(path.join(tmpdir(), "dn-home-"));
    mkdirSync(path.join(fakeHome, "Notes"));
    try {
      child = spawn(process.execPath, [helper, "--stdio"], {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, HOME: fakeHome },
      });
      const client = new HelperClient(child, 15000);
      const session = { sessionId: "test-tilde", generation: 1 };
      const hello = (await client.request("hello", { protocolVersion: PROTOCOL_VERSION }, session)) as {
        uid: number;
        home: string;
      };
      expect(hello.uid).toBe(typeof process.getuid === "function" ? process.getuid() : -1);
      expect(hello.home).toBe(fakeHome);
      const opened = (await client.request("workspace.open", { root: "~/Notes" }, session)) as { root: string };
      expect(opened.root).toBe(path.join(fakeHome, "Notes"));
      await client.request("workspace.close", {}, session);
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
