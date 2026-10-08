import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRegistry } from "@takenotes/desktop/main/workspace/registry";
import type { WorkspaceKind } from "@takenotes/platform/types";
import { NativeFileAdapter } from "@takenotes/desktop/main/workspace/file-adapter";
import { NoteService } from "@takenotes/desktop/main/services/note-service";
import { WorkspaceService } from "@takenotes/desktop/main/services/workspace-service";

describe("link-aware rename/move through NoteService", () => {
  let root: string;
  let notes: NoteService;
  let workspaceId: string;
  // Production pairs kind with host (windows-local on win32, posix
  // elsewhere). A posix kind rooted at a Windows `tmpdir()` mixes path
  // flavors and is not a real configuration — pick the host kind so this
  // exercises what CI actually runs on each OS.
  const kind: WorkspaceKind = process.platform === "win32" ? "windows-local" : "linux-local";

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "takenotes-link-rename-"));
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    notes = new NoteService(workspaces, {
      native: new NativeFileAdapter(async () => undefined),
      wslRequest: async () => {
        throw { code: "DISCONNECTED", message: "no helper in test" };
      },
      hasWslSession: () => false,
    });
    workspaceId = workspaces.registerLocal("Notes", root, kind).id;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function write(rel: string, content: string): Promise<void> {
    const created = await notes.createFile(workspaceId, rel);
    if (!("revision" in created)) throw new Error(`create failed: ${rel}`);
    const saved = await notes.writeFile(workspaceId, rel, content, created.revision.hash, "lf", false);
    if (!("revision" in saved)) throw new Error(`write failed: ${rel}`);
  }

  function disk(rel: string): string {
    return readFileSync(path.join(root, ...rel.split("/")), "utf8");
  }

  it("renames a note and rewrites wikilinks without touching aliases or fragments", async () => {
    await write("Old.md", "# Old\n");
    await write("Ref.md", "[[Old]] [[Old.md|alias]] ![[Old#Heading]] [[Other]]\n");

    const out = await notes.renamePath(workspaceId, "Old.md", "New.md");

    expect(out).toEqual({ ok: true });
    expect(disk("Ref.md")).toBe("[[New]] [[New.md|alias]] ![[New#Heading]] [[Other]]\n");
  });

  it("does not rewrite bare duplicate-name links when the target is ambiguous", async () => {
    await write("Old.md", "# Root\n");
    mkdirSync(path.join(root, "Other"), { recursive: true });
    await write("Other/Old.md", "# Other\n");
    await write("Ref.md", "[[Old]] [[Old.md]] [[Other/Old]]\n");

    const out = await notes.renamePath(workspaceId, "Old.md", "New.md");

    expect(out).toEqual({ ok: true });
    expect(disk("Ref.md")).toBe("[[Old]] [[Old.md]] [[Other/Old]]\n");
  });

  it("skips the rewrite when auto-update is off (file + directory)", async () => {
    await write("Old.md", "# Old\n");
    await write("Ref.md", "[[Old]]\n");
    mkdirSync(path.join(root, "Docs"), { recursive: true });
    await write("Docs/Plan.md", "# Plan\n");
    await write("Ref2.md", "[[Docs/Plan]]\n");

    expect(await notes.renamePath(workspaceId, "Old.md", "New.md", { autoUpdateLinks: false })).toEqual({
      ok: true,
    });
    expect(await notes.renameDirectory(workspaceId, "Docs", "Archive", { autoUpdateLinks: false })).toEqual({
      ok: true,
    });
    expect(disk("Ref.md")).toBe("[[Old]]\n");
    expect(disk("Ref2.md")).toBe("[[Docs/Plan]]\n");
    expect(disk("New.md")).toBe("# Old\n");
  });

  it("renames a directory and rewrites path-qualified wikilinks beneath it", async () => {
    mkdirSync(path.join(root, "Projects"), { recursive: true });
    await write("Projects/Plan.md", "# Plan\n");
    await write("Ref.md", "[[Projects/Plan]] [[Projects/Plan.md|P]] [[Plan]]\n");

    const out = await notes.renameDirectory(workspaceId, "Projects", "Archive");

    expect(out).toEqual({ ok: true });
    expect(disk("Ref.md")).toBe("[[Archive/Plan]] [[Archive/Plan.md|P]] [[Plan]]\n");
  });
});
