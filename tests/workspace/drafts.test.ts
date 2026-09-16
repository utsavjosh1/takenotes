import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  clearDraft,
  createDraftSaver,
  DRAFT_STALE_AFTER_MS,
  isDraftStale,
  listDrafts,
  loadDraft,
  recoveryDecision,
  saveDraft,
  workspaceKeyFor,
} from "../../src/main/workspace/drafts.js";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "takenotes-drafts-"));
}

function input(over: Partial<Parameters<typeof saveDraft>[1]> = {}) {
  return {
    workspaceType: "windows-local" as const,
    workspaceRoot: "C:\\notes",
    workspaceDisplayName: "notes",
    relativePath: "a.md",
    baseRevisionHash: "a".repeat(64),
    content: "dirty",
    ...over,
  };
}

describe("draft persistence", () => {
  it("dirty note → draft written and reloadable", async () => {
    const dir = await tmpDir();
    expect((await saveDraft(dir, input())).ok).toBe(true);
    const got = await loadDraft(dir, {
      workspaceType: "windows-local",
      workspaceRoot: "C:\\notes",
      relativePath: "a.md",
    });
    expect(got?.content).toBe("dirty");
    expect(got?.baseRevisionHash).toBe("a".repeat(64));
    expect(typeof got?.updatedAt).toBe("number");
  });

  it("app restart, disk unchanged → draft recoverable", async () => {
    const dir = await tmpDir();
    const disk = Buffer.from("on-disk");
    const base = createHash("sha256").update(disk).digest("hex");
    await saveDraft(dir, input({ content: "dirty edit", baseRevisionHash: base }), 1000);
    // Simulate restart: re-read from a fresh handle.
    const draft = await loadDraft(dir, {
      workspaceType: "windows-local",
      workspaceRoot: "C:\\notes",
      relativePath: "a.md",
    });
    expect(draft).not.toBeNull();
    const d = await recoveryDecision(async () => disk, draft!, 2000);
    expect(d.kind).toBe("recoverable");
  });

  it("app restart, disk externally changed → draft does NOT overwrite disk", async () => {
    const dir = await tmpDir();
    const original = Buffer.from("original");
    const base = createHash("sha256").update(original).digest("hex");
    await saveDraft(dir, input({ content: "my unsaved edits", baseRevisionHash: base }), 1000);
    const draft = await loadDraft(dir, {
      workspaceType: "windows-local",
      workspaceRoot: "C:\\notes",
      relativePath: "a.md",
    });
    // External edit happened after the draft was taken.
    const d = await recoveryDecision(async () => Buffer.from("external edit"), draft!, 2000);
    expect(d.kind).toBe("disk-changed");
    // The decision carries no write path: the draft store never touches the note file.
    expect(draft!.content).toBe("my unsaved edits");
  });

  it("file deleted externally → draft retained", async () => {
    const dir = await tmpDir();
    await saveDraft(dir, input({ content: "precious" }), 1000);
    const draft = await loadDraft(dir, {
      workspaceType: "windows-local",
      workspaceRoot: "C:\\notes",
      relativePath: "a.md",
    });
    const d = await recoveryDecision(async () => null, draft!, 2000);
    expect(d.kind).toBe("disk-missing");
    // Retained: still loadable after the decision.
    expect(
      (
        await loadDraft(dir, {
          workspaceType: "windows-local",
          workspaceRoot: "C:\\notes",
          relativePath: "a.md",
        })
      )?.content,
    ).toBe("precious");
  });

  it("workspace unavailable → draft retained and listed", async () => {
    const dir = await tmpDir();
    await saveDraft(
      dir,
      input({
        workspaceType: "windows-wsl",
        workspaceRoot: "/home/u/notes",
        distro: "Ubuntu",
        workspaceDisplayName: "Ubuntu:/home/u/notes",
        relativePath: "b.md",
        content: "wsl edits",
      }),
    );
    // Workspace root gone (WSL stopped/uninstalled): drafts live outside the
    // workspace, so listing still returns them.
    const { drafts } = await listDrafts(dir);
    expect(drafts.some((d) => d.relativePath === "b.md" && d.content === "wsl edits")).toBe(true);
  });

  it("malformed draft → skipped, application still launches (list succeeds)", async () => {
    const dir = await tmpDir();
    await saveDraft(dir, input({ content: "good" }));
    await fs.mkdir(path.join(dir, "drafts"), { recursive: true });
    await fs.writeFile(path.join(dir, "drafts", "corrupt.json"), "{not json", "utf8");
    await fs.writeFile(path.join(dir, "drafts", "wrong-shape.json"), JSON.stringify({ hello: 1 }), "utf8");
    const { drafts, malformed } = await listDrafts(dir);
    expect(drafts.length).toBe(1);
    expect(malformed.sort()).toEqual(["corrupt.json", "wrong-shape.json"]);
    expect(await loadDraft(dir, { workspaceType: "windows-local", workspaceRoot: "C:\\notes", relativePath: "nope.md" })).toBeNull();
  });

  it("stale draft → handled predictably (flagged, never auto-applied)", async () => {
    const dir = await tmpDir();
    const disk = Buffer.from("same");
    const base = createHash("sha256").update(disk).digest("hex");
    await saveDraft(dir, input({ content: "old edits", baseRevisionHash: base }), 0);
    const draft = (await loadDraft(dir, {
      workspaceType: "windows-local",
      workspaceRoot: "C:\\notes",
      relativePath: "a.md",
    }))!;
    expect(isDraftStale(draft, DRAFT_STALE_AFTER_MS + 1)).toBe(true);
    expect(isDraftStale(draft, 1000)).toBe(false);
    const d = await recoveryDecision(async () => disk, draft, DRAFT_STALE_AFTER_MS + 1);
    expect(d).toEqual({ kind: "recoverable", stale: true });
  });

  it("clearDraft removes the draft (e.g. after successful save)", async () => {
    const dir = await tmpDir();
    await saveDraft(dir, input({ content: "x" }));
    await clearDraft(dir, { workspaceType: "windows-local", workspaceRoot: "C:\\notes", relativePath: "a.md" });
    expect(await loadDraft(dir, { workspaceType: "windows-local", workspaceRoot: "C:\\notes", relativePath: "a.md" })).toBeNull();
  });

  it("bounds: oversized drafts rejected; identity is stable across restarts", async () => {
    const dir = await tmpDir();
    const big = await saveDraft(dir, input({ content: "x".repeat(1024 * 1024 + 1) }));
    expect(big.ok).toBe(false);
    expect(workspaceKeyFor({ workspaceType: "windows-local", workspaceRoot: "C:\\notes" })).toBe(
      workspaceKeyFor({ workspaceType: "windows-local", workspaceRoot: "C:\\notes" }),
    );
  });

  it("debounce: bursts collapse to one write; flush persists; cancel drops", async () => {
    vi.useFakeTimers();
    try {
      const writes: string[] = [];
      const saver = createDraftSaver((c) => writes.push(c), 750);
      saver.schedule("a");
      saver.schedule("ab");
      saver.schedule("abc");
      expect(saver.pending()).toBe(true);
      expect(writes).toEqual([]);
      vi.advanceTimersByTime(749);
      expect(writes).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(writes).toEqual(["abc"]);

      saver.schedule("x");
      saver.flush();
      expect(writes).toEqual(["abc", "x"]);

      saver.schedule("y");
      saver.cancel();
      vi.advanceTimersByTime(5000);
      expect(writes).toEqual(["abc", "x"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
