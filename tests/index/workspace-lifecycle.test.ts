import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRegistry } from "../../src/main/workspace/registry";
import { NativeFileAdapter } from "../../src/main/workspace/file-adapter";
import { NoteService } from "../../src/main/services/note-service";
import { WorkspaceService } from "../../src/main/services/workspace-service";
import { WorkspaceIndex } from "../../src/shared/index/store";
import type { WorkspaceKind } from "../../src/shared/platform/types";

/** P1-07 acceptance 2 through the production desktop seam: index entries
 * track real filesystem mutations; rebuild-after-drop matches the disk. */
describe("index tracks filesystem lifecycle (P1-07)", () => {
  const workspaceKind: WorkspaceKind = process.platform === "win32" ? "windows-local" : "linux-local";
  let root: string;
  let notes: NoteService;
  let workspaceId: string;
  let idx: WorkspaceIndex;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "dn-index-"));
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    notes = new NoteService(workspaces, {
      native: new NativeFileAdapter(async () => undefined),
      wslRequest: async () => {
        throw { code: "DISCONNECTED", message: "no helper in test" };
      },
      hasWslSession: () => false,
    });
    workspaceId = workspaces.registerLocal("Notes", root, workspaceKind).id;
    idx = new WorkspaceIndex();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("write → re-parse carries the new revision", async () => {
    const created = await notes.createFile(workspaceId, "a.md");
    if (!("revision" in created)) throw new Error("create failed");
    const read = await notes.readFile(workspaceId, "a.md");
    if (!("result" in read)) throw new Error("read failed");
    const first = idx.upsert(workspaceId, "a.md", read.result.content, read.result.revision);
    expect(first?.headings).toEqual([]);

    const saved = await notes.writeFile(workspaceId, "a.md", "# Hello #tag\n", read.result.revision.hash, "lf", false);
    if (!("revision" in saved)) throw new Error("save failed");
    const entry = idx.upsert(workspaceId, "a.md", "# Hello #tag\n", saved.revision);
    expect(entry?.headings.map((h) => h.text)).toEqual(["Hello #tag"]);
    expect(entry?.tags).toEqual(["tag"]);
    expect(entry?.revision.hash).toBe(saved.revision.hash);
  });

  it("rename → entry moves; delete → entry drops", async () => {
    const created = await notes.createFile(workspaceId, "old.md");
    if (!("revision" in created)) throw new Error("create failed");
    const saved = await notes.writeFile(workspaceId, "old.md", "# Moved\n", created.revision.hash, "lf", false);
    if (!("revision" in saved)) throw new Error("save failed");
    idx.upsert(workspaceId, "old.md", "# Moved\n", saved.revision);

    const renamed = await notes.renamePath(workspaceId, "old.md", "new.md");
    if (!("ok" in renamed)) throw new Error("rename failed");
    expect(idx.move(workspaceId, "old.md", "new.md")).toBe(true);
    expect(idx.get(workspaceId, "new.md")?.headings[0]?.text).toBe("Moved");

    const trashed = await notes.trashPath(workspaceId, "new.md");
    if (!("ok" in trashed)) throw new Error("trash failed");
    expect(idx.remove(workspaceId, "new.md")).toBe(true);
    expect(idx.list(workspaceId)).toEqual([]);
  });

  it("rebuild-after-drop is lossless vs the filesystem", async () => {
    const files: Array<[string, string]> = [
      ["a.md", "---\ntitle: A\n---\n# A\n"],
      ["sub/b.md", "# B #x\n- [ ] T @due(2026-09-25)\n"],
    ];
    for (const [rel, content] of files) {
      const created = await notes.createFile(workspaceId, rel);
      if (!("revision" in created)) throw new Error(`create ${rel}`);
      const saved = await notes.writeFile(workspaceId, rel, content, created.revision.hash, "lf", false);
      if (!("revision" in saved)) throw new Error(`write ${rel}`);
      const read = await notes.readFile(workspaceId, rel);
      if (!("result" in read)) throw new Error(`read ${rel}`);
      idx.upsert(workspaceId, rel, read.result.content, read.result.revision);
    }
    const before = idx
      .list(workspaceId)
      .map((e) => [e.relativePath, e.title ?? e.headings[0]?.text] as const)
      .sort();

    // Drop the whole index (deleting it loses no knowledge — ADR-0008).
    idx.clear(workspaceId);
    expect(idx.list(workspaceId)).toEqual([]);

    // Rebuild straight from disk through the service seam.
    const rebuilt: Array<{ workspaceId: string; relativePath: string; content: string; revision: { hash: string; size: number; mtimeMs: number } }> = [];
    const queue = [""];
    for (let i = 0; i < queue.length; i++) {
      const listed = await notes.listTree(workspaceId, queue[i]!);
      if (!("entries" in listed)) throw new Error("list failed");
      for (const e of listed.entries) {
        if (e.kind === "directory") queue.push(e.relativePath);
        else if (e.fileClass === "markdown") {
          const read = await notes.readFile(workspaceId, e.relativePath);
          if (!("result" in read)) throw new Error(`reread ${e.relativePath}`);
          rebuilt.push({ workspaceId, relativePath: e.relativePath.replace(/\\/g, "/"), content: read.result.content, revision: read.result.revision });
        }
      }
    }
    idx.rebuild(workspaceId, rebuilt);
    const after = idx
      .list(workspaceId)
      .map((e) => [e.relativePath, e.title ?? e.headings[0]?.text] as const)
      .sort();
    expect(after).toEqual(before);
  });
});
