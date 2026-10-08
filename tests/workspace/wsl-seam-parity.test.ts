import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HelperClient } from "@takenotes/desktop/main/wsl/helper-client";
import { PROTOCOL_VERSION } from "@takenotes/contracts/protocol-version";
import { WorkspaceRegistry } from "@takenotes/desktop/main/workspace/registry";
import { NativeFileAdapter } from "@takenotes/desktop/main/workspace/file-adapter";
import { NoteService } from "@takenotes/desktop/main/services/note-service";
import { WorkspaceService } from "@takenotes/desktop/main/services/workspace-service";
import { RecoveryStore } from "@takenotes/desktop/main/workspace/recovery";
import { WorkspaceIndex } from "@takenotes/core/index/store";
import { parseSearchQuery } from "@takenotes/core/search/query";
import { searchContent, searchFilenames } from "@takenotes/core/search/search";

async function ensureHelperBuilt(): Promise<string> {
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["tools/scripts/build-helper.mjs"], { stdio: "pipe" });
  return path.resolve("dist-helper/helper.cjs");
}

function q(raw: string) {
  const r = parseSearchQuery(raw);
  if (!r.ok) throw new Error(`unexpected parse failure: ${raw}`);
  return r.query;
}

const hashOf = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");

/** 7d acceptance, part 1: two-actor expectedRevision CONFLICT over the real
 * helper wire. Actor B changes the file on disk between actor A's read and
 * write; A's stale write fails CONFLICT with bytes untouched, and a fresh
 * read-then-write succeeds. POSIX-gated like the other helper suites. */
describe.runIf(process.platform !== "win32")("WSL two-actor CONFLICT over the helper wire", () => {
  let root: string;
  let child: ChildProcess | null = null;
  let client: HelperClient;
  const session = { sessionId: "wsl-7d-conflict", generation: 1 };

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), "dn-7d-"));
    writeFileSync(path.join(root, "shared.md"), "v1\n");
    const helper = await ensureHelperBuilt();
    child = spawn(process.execPath, [helper, "--stdio"], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    client = new HelperClient(child, 15000);
    await client.request("hello", { protocolVersion: PROTOCOL_VERSION }, session);
    await client.request("workspace.open", { root }, session);
  });

  afterEach(() => {
    child?.kill();
    child = null;
    rmSync(root, { recursive: true, force: true });
  });

  it("stale write conflicts, touches nothing, fresh write wins", async () => {
    const first = (await client.request("file.read", { relativePath: "shared.md" }, session)) as {
      content: string;
      revision: { hash: string };
    };
    expect(first.content).toBe("v1\n");
    // Actor B (second user/process) writes straight to disk.
    writeFileSync(path.join(root, "shared.md"), "v2-actor-b\n");
    const stale = await client
      .request(
        "file.write",
        { relativePath: "shared.md", content: "stale-write\n", expectedHash: first.revision.hash },
        session,
      )
      .then(
        () => null,
        (e: { code?: string }) => e,
      );
    expect(stale?.code).toBe("CONFLICT");
    const after = (await client.request("file.read", { relativePath: "shared.md" }, session)) as { content: string };
    expect(after.content).toBe("v2-actor-b\n");
    const current = (await client.request("file.read", { relativePath: "shared.md" }, session)) as {
      revision: { hash: string };
    };
    const won = (await client.request(
      "file.write",
      { relativePath: "shared.md", content: "v3-winner\n", expectedHash: current.revision.hash },
      session,
    )) as { hash: string };
    expect(won.hash).toBe(hashOf("v3-winner\n"));
  });
});

/** In-memory helper backing the seam tests below: serves file.read/list and
 * enforces expectedHash on file.write exactly like the real helper. */
function fakeHelper(files: Map<string, string>, seen: Array<{ operation: string; identity: unknown }>) {
  return async (operation: string, payload: unknown, identity: unknown): Promise<unknown> => {
    seen.push({ operation, identity });
    const p = (payload ?? {}) as Record<string, unknown>;
    if (operation === "file.read") {
      const rel = p["relativePath"] as string;
      const content = files.get(rel);
      if (content === undefined) throw { code: "NOT_FOUND", message: "file not found." };
      return { content, revision: { hash: hashOf(content), size: content.length, mtimeMs: 1 }, newlineStyle: "lf", hadBom: false };
    }
    if (operation === "file.write") {
      const rel = p["relativePath"] as string;
      const current = files.get(rel);
      if (current === undefined) throw { code: "NOT_FOUND", message: "file not found." };
      if (hashOf(current) !== p["expectedHash"]) throw { code: "CONFLICT", message: "The file changed on disk." };
      files.set(rel, p["content"] as string);
      const next = p["content"] as string;
      return { hash: hashOf(next), size: next.length, mtimeMs: 2 };
    }
    if (operation === "directory.list") {
      return [...files.keys()].map((name) => ({ name, relativePath: name, kind: "file", fileClass: "markdown", size: 1, mtimeMs: 1 }));
    }
    throw { code: "INVALID_REQUEST", message: `Unknown operation: ${operation}` };
  };
}

function wslNotes(files: Map<string, string>, seen: Array<{ operation: string; identity: unknown }>) {
  const workspaces = new WorkspaceService(new WorkspaceRegistry());
  const notes = new NoteService(workspaces, {
    native: new NativeFileAdapter(async () => undefined),
    wslRequest: fakeHelper(files, seen),
    hasWslSession: () => true,
  });
  const reg = workspaces.registerWsl("Notes", "/home/utsav/Notes", "Ubuntu", "utsav");
  return { notes, workspaceId: reg.id };
}

/** 7d acceptance, part 2: WSL reads index identically — V1 search operators
 * over WSL-sourced content, with every read carrying distro+user identity. */
describe("WSL reads index identically; search operators work over WSL content", () => {
  it("read → index → query parity with identity on every call", async () => {
    const files = new Map([
      ["MCP.md", "---\ntitle: MCP Server\ntags: [backend]\nstatus: active\n---\n# MCP\nServer design [[MCP#Server|label]].\n- [ ] Wire helper @due(2026-09-25)\n"],
      ["docs/Guide.md", "# Guide\nworkspace identity and connections ^g1\n"],
      ["notes.md", "# Notes\nwebsocket work #live\n- [x] Done\n"],
    ]);
    const seen: Array<{ operation: string; identity: unknown }> = [];
    const { notes, workspaceId } = wslNotes(files, seen);
    const idx = new WorkspaceIndex();
    for (const rel of files.keys()) {
      const read = await notes.readFile(workspaceId, rel);
      if (!("result" in read)) throw new Error(`read ${rel} failed`);
      idx.upsert(workspaceId, rel, read.result.content, read.result.revision);
    }
    // Every helper call rode the Ubuntu/utsav identity — never anonymous.
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) {
      expect(s.identity).toMatchObject({ distro: "Ubuntu", linuxUser: "utsav" });
    }
    const hits = (raw: string) => searchContent(idx, workspaceId, q(raw)).map((m) => m.relativePath).sort();
    expect(hits("tag:backend")).toEqual(["MCP.md"]);
    expect(hits('"Server design"')).toEqual(["MCP.md"]);
    expect(hits("task-todo:")).toEqual(["MCP.md"]);
    expect(hits("task-done:")).toEqual(["notes.md"]);
    expect(hits("websocket live")).toEqual(["notes.md"]);
    expect(hits("path:docs")).toEqual(["docs/Guide.md"]);
    expect(hits("[status:active]")).toEqual(["MCP.md"]);
    expect(searchFilenames(idx, workspaceId, q("file:guide")).map((m) => m.relativePath)).toEqual(["docs/Guide.md"]);
  });
});

/** 7d acceptance, part 3: recovery restore on a WSL workspace writes back
 * through the same revision-checked helper seam (no native fallback), with
 * identity attached and a restore-before snapshot retained. */
describe("recovery restore on WSL writes through the helper seam", () => {
  it("snapshot → restore routes file.write to the helper with expectedHash + identity", async () => {
    const files = new Map([["note.md", "current\n"]]);
    const seen: Array<{ operation: string; identity: unknown }> = [];
    const { notes, workspaceId } = wslNotes(files, seen);
    const base = mkdtempSync(path.join(tmpdir(), "dn-7d-rec-"));
    try {
      const store = new RecoveryStore(base, { now: () => 1_000, id: (() => { let n = 0; return () => `s${++n}`; })() });
      const snap = await store.captureChanged({ workspaceId, relativePath: "note.md", content: "restored\n", reason: "save" });
      expect(snap.ok && snap.result?.snapshotId).toBe("s1");
      const read = await notes.readFile(workspaceId, "note.md");
      if (!("result" in read)) throw new Error("read failed");
      const restored = await store.restore(
        {
          workspaceId,
          relativePath: "note.md",
          snapshotId: "s1",
          currentContent: read.result.content,
          expectedHash: read.result.revision.hash,
          newlineStyle: "lf",
          hadBom: false,
        },
        (content, expectedHash, newlineStyle, hadBom) =>
          notes.writeFile(workspaceId, "note.md", content, expectedHash, newlineStyle, hadBom),
      );
      if (!restored.ok) throw new Error(`restore failed: ${JSON.stringify(restored)}`);
      expect(restored.result.content).toBe("restored\n");
      expect(files.get("note.md")).toBe("restored\n");
      const writes = seen.filter((s) => s.operation === "file.write");
      expect(writes).toHaveLength(1);
      expect(writes[0]!.identity).toMatchObject({ distro: "Ubuntu", linuxUser: "utsav" });
      const listed = await store.list(workspaceId, "note.md");
      expect(listed.ok && listed.result.length).toBe(2); // s1 + restore-before
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
