import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HelperClient } from "../../src/main/wsl/helper-client";
import { PROTOCOL_VERSION } from "../../src/shared/protocol-version";
import { WorkspaceRegistry } from "../../src/main/workspace/registry";
import { NativeFileAdapter } from "../../src/main/workspace/file-adapter";
import { NoteService } from "../../src/main/services/note-service";
import { WorkspaceService } from "../../src/main/services/workspace-service";

async function ensureHelperBuilt(): Promise<string> {
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["scripts/build-helper.mjs"], { stdio: "pipe" });
  return path.resolve("dist-helper/helper.cjs");
}

// POSIX-only: the helper speaks absolute POSIX roots (same rationale as the
// other helper round-trip suites).
describe.runIf(process.platform !== "win32")("wsl save/conflict loop (P1-05)", () => {
  let root: string;
  let child: ChildProcess | null = null;
  let client: HelperClient;
  const session = { sessionId: "p1-05-save", generation: 1 };

  async function req(operation: string, payload: unknown): Promise<unknown> {
    return client.request(operation, payload, session);
  }

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), "dn-p105-"));
    const helper = await ensureHelperBuilt();
    child = spawn(process.execPath, [helper, "--stdio"], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    client = new HelperClient(child, 15000);
    await req("hello", { protocolVersion: PROTOCOL_VERSION });
    await req("workspace.open", { root });
  });

  afterEach(() => {
    child?.kill();
    child = null;
    rmSync(root, { recursive: true, force: true });
  });

  function diskBytes(rel: string): Buffer {
    return readFileSync(path.join(root, rel));
  }

  it("two-actor loop: external modification → stale write CONFLICTs, bytes untouched", async () => {
    writeFileSync(path.join(root, "shared.md"), "A\n");
    const read = (await req("file.read", { relativePath: "shared.md" })) as {
      revision: { hash: string };
    };
    // Second actor writes B outside the helper (another editor/process).
    writeFileSync(path.join(root, "shared.md"), "B-external\n");
    await expect(
      req("file.write", {
        relativePath: "shared.md",
        content: "mine\n",
        expectedHash: read.revision.hash,
        newlineStyle: "lf",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(diskBytes("shared.md")).toEqual(Buffer.from("B-external\n", "utf8"));
  });

  it("sequential writes chain revisions", async () => {
    await req("file.create", { relativePath: "chain.md" });
    const r1 = (await req("file.read", { relativePath: "chain.md" })) as {
      revision: { hash: string };
    };
    const s1 = (await req("file.write", {
      relativePath: "chain.md",
      content: "v2\n",
      expectedHash: r1.revision.hash,
      newlineStyle: "lf",
    })) as { hash: string };
    const s2 = (await req("file.write", {
      relativePath: "chain.md",
      content: "v3\n",
      expectedHash: s1.hash,
      newlineStyle: "lf",
    })) as { hash: string };
    expect(typeof s2.hash).toBe("string");
    expect(diskBytes("chain.md").toString("utf8")).toBe("v3\n");
    await expect(
      req("file.write", {
        relativePath: "chain.md",
        content: "stale\n",
        expectedHash: r1.revision.hash,
        newlineStyle: "lf",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(diskBytes("chain.md").toString("utf8")).toBe("v3\n");
  });

  it("CRLF style is preserved byte-exact on write", async () => {
    writeFileSync(path.join(root, "crlf.md"), "a\r\nb\r\n");
    const read = (await req("file.read", { relativePath: "crlf.md" })) as {
      revision: { hash: string };
      newlineStyle: string;
    };
    expect(read.newlineStyle).toBe("crlf");
    await req("file.write", {
      relativePath: "crlf.md",
      content: "a\nb\nc\n",
      expectedHash: read.revision.hash,
      newlineStyle: "crlf",
    });
    expect(diskBytes("crlf.md")).toEqual(Buffer.from("a\r\nb\r\nc\r\n", "utf8"));
  });

  it("BOM is preserved byte-exact on write", async () => {
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("bom\n", "utf8")]);
    writeFileSync(path.join(root, "bom.md"), bom);
    const read = (await req("file.read", { relativePath: "bom.md" })) as {
      revision: { hash: string };
      newlineStyle: string;
      hadBom: boolean;
    };
    expect(read.hadBom).toBe(true);
    await req("file.write", {
      relativePath: "bom.md",
      content: "bom2\n",
      expectedHash: read.revision.hash,
      newlineStyle: read.newlineStyle,
      hadBom: true,
    });
    const bytes = diskBytes("bom.md");
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(bytes.subarray(3).toString("utf8")).toBe("bom2\n");
    const reread = (await req("file.read", { relativePath: "bom.md" })) as { hadBom: boolean };
    expect(reread.hadBom).toBe(true);
  });

  it("stale write leaves conflicting bytes identical and no tmp litter", async () => {
    const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a\r\nb\r\n", "utf8")]);
    writeFileSync(path.join(root, "rich.md"), original);
    await expect(
      req("file.write", {
        relativePath: "rich.md",
        content: "clobber\n",
        expectedHash: "0".repeat(64),
        newlineStyle: "lf",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(diskBytes("rich.md")).toEqual(original);
    expect(readdirSync(root).filter((n) => n.includes(".tmp-"))).toEqual([]);
  });
});

describe("wsl save seam carries hadBom + surfaces CONFLICT (P1-05)", () => {
  it("forwards hadBom/newlineStyle to the helper and preserves structured CONFLICT", async () => {
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    const seen: { operation: string; params: Record<string, unknown> }[] = [];
    const notes = new NoteService(workspaces, {
      native: new NativeFileAdapter(async () => undefined),
      wslRequest: async (operation, params) => {
        seen.push({ operation, params });
        if (operation === "file.write") throw { code: "CONFLICT", message: "The file changed on disk." };
        return { hash: "h", size: 0, mtimeMs: 0 };
      },
    });
    const reg = workspaces.registerWsl("Ubuntu:work:~/Notes", "/home/work/Notes", "Ubuntu", "work");
    // hadBom must reach the helper — otherwise WSL writes silently drop it.
    await notes.writeFile(reg.id, "bom.md", "x\n", "h", "lf", true);
    expect(seen.find((c) => c.operation === "file.write")?.params).toMatchObject({ hadBom: true });
    // Structured CONFLICT survives helper → service (IPC + renderer covered
    // by tests/ipc/helper-errors + error-text suites).
    const out = await notes.writeFile(reg.id, "bom.md", "y\n", "stale", "lf", false);
    expect(out).toMatchObject({ error: { code: "CONFLICT" } });
  });
});
