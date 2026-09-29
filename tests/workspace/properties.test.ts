import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceRegistry } from "@takenotes/desktop/main/workspace/registry";
import { NativeFileAdapter } from "@takenotes/desktop/main/workspace/file-adapter";
import { NoteService } from "@takenotes/desktop/main/services/note-service";
import { WorkspaceService } from "@takenotes/desktop/main/services/workspace-service";
import { parseDocument } from "@takenotes/core/index/document";
import { WorkspaceIndex } from "@takenotes/core/index/store";

/** Step 3b gate — Linux integration through the production desktop seam
 * (`NoteService.updateProperties` + `NativeFileAdapter`, `linux-local` kind
 * so it runs anywhere; `windows-local` differs only in the path module). */
describe("properties round-trip through NoteService (3b)", () => {
  let root: string;
  let notes: NoteService;
  let workspaceId: string;
  const index = new WorkspaceIndex();

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "dn-props-"));
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    notes = new NoteService(workspaces, {
      native: new NativeFileAdapter(async () => undefined),
      wslRequest: async () => {
        throw { code: "DISCONNECTED", message: "no helper in test" };
      },
      hasWslSession: () => false,
    });
    workspaceId = workspaces.registerLocal("Notes", root, "linux-local").id;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function diskText(rel: string): string {
    return readFileSync(path.join(root, rel), "utf8");
  }

  it("write → re-parse → index update; body intact", async () => {
    writeFileSync(path.join(root, "n.md"), "---\ntitle: Old\n---\n# Hello\nbody\n");
    const read = await notes.readFile(workspaceId, "n.md");
    if (!("result" in read)) throw new Error("read failed");
    const patched = await notes.updateProperties(workspaceId, "n.md", { status: "active", title: "New" }, read.result.revision.hash);
    expect("revision" in patched).toBe(true);
    if (!("revision" in patched)) return;

    const text = diskText("n.md");
    expect(text).toContain("status: active");
    expect(text).toContain("title: New");
    expect(text.endsWith("# Hello\nbody\n")).toBe(true);

    const entry = index.upsert(workspaceId, "n.md", text, patched.revision);
    expect(entry?.frontmatter).toMatchObject({ title: "New", status: "active" });
    expect(entry?.title).toBe("New");
    const reparsed = parseDocument(workspaceId, "n.md", text, patched.revision);
    expect(reparsed.headings.map((h) => h.text)).toEqual(["Hello"]);
  });

  it("stale expectedHash → CONFLICT with disk bytes untouched", async () => {
    writeFileSync(path.join(root, "c.md"), "---\ntitle: A\n---\nbody\n");
    const before = diskText("c.md");
    const res = await notes.updateProperties(workspaceId, "c.md", { status: "x" }, "0".repeat(64));
    if (!("error" in res)) throw new Error("expected CONFLICT");
    expect(res.error.code).toBe("CONFLICT");
    expect(diskText("c.md")).toBe(before);
  });

  it("malformed frontmatter → INVALID_REQUEST with disk bytes untouched", async () => {
    const input = "---\ntitle: [unclosed\n\tbad: : :\n---\n# Survives\n";
    writeFileSync(path.join(root, "m.md"), input);
    const read = await notes.readFile(workspaceId, "m.md");
    if (!("result" in read)) throw new Error("read failed");
    const res = await notes.updateProperties(workspaceId, "m.md", { status: "x" }, read.result.revision.hash);
    if (!("error" in res)) throw new Error("expected INVALID_REQUEST");
    expect(res.error.code).toBe("INVALID_REQUEST");
    expect(diskText("m.md")).toBe(input);
  });

  it("no-op patch returns the current revision without rewriting", async () => {
    writeFileSync(path.join(root, "e.md"), "---\ntitle: A\n---\nbody\n");
    const read = await notes.readFile(workspaceId, "e.md");
    if (!("result" in read)) throw new Error("read failed");
    const mtimeBefore = read.result.revision.mtimeMs;
    const res = await notes.updateProperties(workspaceId, "e.md", {}, read.result.revision.hash);
    if (!("revision" in res)) throw new Error("expected revision");
    expect(res.revision.hash).toBe(read.result.revision.hash);
    expect(res.revision.mtimeMs).toBe(mtimeBefore);
  });

  it("drop stays coherent: patch then trash then index remove", async () => {
    writeFileSync(path.join(root, "d.md"), "---\ntitle: A\n---\nbody\n");
    const read = await notes.readFile(workspaceId, "d.md");
    if (!("result" in read)) throw new Error("read failed");
    const patched = await notes.updateProperties(workspaceId, "d.md", { status: "x" }, read.result.revision.hash);
    if (!("revision" in patched)) throw new Error("patch failed");
    index.upsert(workspaceId, "d.md", diskText("d.md"), patched.revision);
    expect(index.get(workspaceId, "d.md")).toBeDefined();
    const trashed = await notes.trashPath(workspaceId, "d.md");
    expect("ok" in trashed).toBe(true);
    index.remove(workspaceId, "d.md");
    expect(index.get(workspaceId, "d.md")).toBeUndefined();
  });

  it("unknown workspace → INVALID_REQUEST without touching the helper", async () => {
    const wslRequest = vi.fn(async () => null);
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    const svc = new NoteService(workspaces, {
      native: new NativeFileAdapter(async () => undefined),
      wslRequest,
    });
    const res = await svc.updateProperties("nope", "a.md", { x: 1 }, "0".repeat(64));
    if (!("error" in res)) throw new Error("expected error");
    expect(res.error.code).toBe("INVALID_REQUEST");
    expect(wslRequest).not.toHaveBeenCalled();
  });

  it("WSL workspaces delegate read+write to the helper with BOM/newline passthrough", async () => {
    const wslRequest = vi.fn(async (op: string, _params: Record<string, unknown>) => {
      if (op === "file.read") {
        return { content: "---\ntitle: A\n---\nbody\n", revision: { hash: "h", size: 1, mtimeMs: 1 }, newlineStyle: "lf", hadBom: false };
      }
      return { hash: "h2", size: 2, mtimeMs: 2 };
    });
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    const svc = new NoteService(workspaces, {
      native: new NativeFileAdapter(async () => undefined),
      wslRequest: wslRequest as unknown as (op: string, params: Record<string, unknown>, id: { distro?: string; linuxUser?: string }) => Promise<unknown>,
    });
    const reg = workspaces.registerWsl("Ubuntu:~/Notes", "/home/u/Notes", "Ubuntu", "u");
    const res = await svc.updateProperties(reg.id, "n.md", { status: "active" }, "h");
    if (!("revision" in res)) throw new Error(`expected revision: ${JSON.stringify(res)}`);
    expect(wslRequest).toHaveBeenCalledWith("file.read", { relativePath: "n.md" }, { distro: "Ubuntu", linuxUser: "u" });
    const writeCall = wslRequest.mock.calls.find((c) => c[0] === "file.write");
    expect(writeCall).toBeDefined();
    expect(String(writeCall![1].content)).toContain("status: active");
    expect(writeCall![1]).toMatchObject({ expectedHash: "h", newlineStyle: "lf", hadBom: false });
  });
});
