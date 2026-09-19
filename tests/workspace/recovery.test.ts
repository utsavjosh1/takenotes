import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RECOVERY_RETENTION_MS,
  RECOVERY_THROTTLE_MS,
  RecoveryStore,
  type RecoveryRestoreWriter,
} from "../../src/main/workspace/recovery.js";
import type { FileRevision } from "../../src/shared/contracts/ipc.js";
import { appError } from "../../src/shared/errors.js";

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "takenotes-recovery-"));
}

function ids(...values: string[]): () => string {
  let i = 0;
  return () => values[i++] ?? `id-${i}`;
}

function revision(hash: string): FileRevision {
  return { hash, size: 1, mtimeMs: 1 };
}

async function findSnapshotsDir(base: string): Promise<string> {
  const stack = [path.join(base, "recovery")];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const d of dirents) {
      const p = path.join(dir, d.name);
      if (d.isDirectory() && d.name === "snapshots") return p;
      if (d.isDirectory()) stack.push(p);
    }
  }
  throw new Error("snapshots directory not found");
}

describe("recovery snapshots", () => {
  it("creates the first changed snapshot, skips identical content, throttles edits, and permits a later changed snapshot", async () => {
    let now = 1_000;
    const store = new RecoveryStore(await tmpDir(), { now: () => now, id: ids("s1", "s2") });

    const first = await store.captureChanged({ workspaceId: "workspace-1", relativePath: "README.md", content: "A", reason: "edit" });
    expect(first.ok).toBe(true);
    expect(first.ok && first.result?.snapshotId).toBe("s1");

    const same = await store.captureChanged({ workspaceId: "workspace-1", relativePath: "README.md", content: "A", reason: "edit" });
    expect(same).toMatchObject({ ok: true, result: null });

    now += RECOVERY_THROTTLE_MS - 1;
    const throttled = await store.captureChanged({ workspaceId: "workspace-1", relativePath: "README.md", content: "B", reason: "edit" });
    expect(throttled).toMatchObject({ ok: true, result: null });

    now += 1;
    const second = await store.captureChanged({ workspaceId: "workspace-1", relativePath: "README.md", content: "B", reason: "edit" });
    expect(second.ok).toBe(true);
    expect(second.ok && second.result?.snapshotId).toBe("s2");

    const listed = await store.list("workspace-1", "README.md");
    expect(listed.ok && listed.result.map((s) => s.snapshotId)).toEqual(["s2", "s1"]);
  });

  it("captures changed content on save and close even inside the edit throttle, but still skips duplicates", async () => {
    let now = 10_000;
    const store = new RecoveryStore(await tmpDir(), { now: () => now, id: ids("s1", "s2", "s3") });
    await store.captureChanged({ workspaceId: "workspace-1", relativePath: "a.md", content: "draft-1", reason: "edit" });

    now += 1;
    const onSave = await store.captureChanged({ workspaceId: "workspace-1", relativePath: "a.md", content: "draft-2", reason: "save" });
    expect(onSave.ok && onSave.result?.snapshotId).toBe("s2");

    const duplicateSave = await store.captureChanged({ workspaceId: "workspace-1", relativePath: "a.md", content: "draft-2", reason: "save" });
    expect(duplicateSave).toMatchObject({ ok: true, result: null });

    now += 1;
    const onClose = await store.captureChanged({ workspaceId: "workspace-1", relativePath: "a.md", content: "draft-3", reason: "close" });
    expect(onClose.ok && onClose.result?.snapshotId).toBe("s3");
  });

  it("removes snapshots older than 7 days with deterministic boundary behavior", async () => {
    let now = 1_000_000;
    const store = new RecoveryStore(await tmpDir(), { now: () => now, id: ids("old", "boundary", "new") });
    await store.captureChanged({ workspaceId: "workspace-1", relativePath: "a.md", content: "old", reason: "save" });
    now = 1_000_000 + RECOVERY_RETENTION_MS;
    await store.captureChanged({ workspaceId: "workspace-1", relativePath: "a.md", content: "boundary", reason: "save" });
    now = 1_000_000 + RECOVERY_RETENTION_MS + 1;
    await store.captureChanged({ workspaceId: "workspace-1", relativePath: "a.md", content: "new", reason: "save" });

    const listed = await store.list("workspace-1", "a.md");
    expect(listed.ok && listed.result.map((s) => s.snapshotId)).toEqual(["new", "boundary"]);
  });

  it("isolates histories by workspaceId, including same relative path for WSL users", async () => {
    const store = new RecoveryStore(await tmpDir(), { now: () => 1_000, id: ids("utsav", "work") });
    await store.captureChanged({ workspaceId: "ubuntu-utsav", relativePath: "README.md", content: "personal", reason: "save" });
    await store.captureChanged({ workspaceId: "ubuntu-work", relativePath: "README.md", content: "company", reason: "save" });

    const a = await store.list("ubuntu-utsav", "README.md");
    const b = await store.list("ubuntu-work", "README.md");
    expect(a.ok && a.result.map((s) => s.snapshotId)).toEqual(["utsav"]);
    expect(b.ok && b.result.map((s) => s.snapshotId)).toEqual(["work"]);

    const utsav = await store.read("utsav");
    const work = await store.read("work");
    expect(utsav.ok && utsav.result.content).toBe("personal");
    expect(work.ok && work.result.content).toBe("company");
  });

  it("restores by snapshotting current content first, then writing the selected snapshot through the revision gate", async () => {
    let now = 5_000;
    const store = new RecoveryStore(await tmpDir(), { now: () => now, id: ids("old-a", "current-c") });
    const old = await store.captureChanged({ workspaceId: "workspace-1", relativePath: "README.md", content: "A", reason: "save" });
    now += 1;

    const writes: string[] = [];
    const writer: RecoveryRestoreWriter = async (content, expectedHash) => {
      writes.push(`${expectedHash}:${content}`);
      return { revision: revision("rev-after-restore") };
    };

    const restored = await store.restore({
      workspaceId: "workspace-1",
      relativePath: "README.md",
      snapshotId: old.ok && old.result ? old.result.snapshotId : "",
      currentContent: "C",
      expectedHash: "rev-before-restore",
      newlineStyle: "lf",
      hadBom: false,
    }, writer);

    expect(restored.ok && restored.result.content).toBe("A");
    expect(restored.ok && restored.result.revision.hash).toBe("rev-after-restore");
    expect(writes).toEqual(["rev-before-restore:A"]);

    const history = await store.list("workspace-1", "README.md");
    expect(history.ok && history.result.map((s) => s.snapshotId)).toEqual(["current-c", "old-a"]);
    const currentSnapshot = await store.read("current-c");
    expect(currentSnapshot.ok && currentSnapshot.result.content).toBe("C");
  });

  it("does not force-overwrite when restore sees CONFLICT; external file stays under the writer's control", async () => {
    const store = new RecoveryStore(await tmpDir(), { now: () => 1_000, id: ids("old-a", "current-c") });
    const old = await store.captureChanged({ workspaceId: "workspace-1", relativePath: "README.md", content: "A", reason: "save" });
    let externalFile = "D";
    const writer: RecoveryRestoreWriter = async () => ({ error: appError("CONFLICT", "The file changed on disk. Reload before saving.") });

    const restored = await store.restore({
      workspaceId: "workspace-1",
      relativePath: "README.md",
      snapshotId: old.ok && old.result ? old.result.snapshotId : "",
      currentContent: "C",
      expectedHash: "stale-rev",
      newlineStyle: "lf",
      hadBom: false,
    }, async (...args) => {
      const out = await writer(...args);
      if ("revision" in out) externalFile = args[0];
      return out;
    });

    expect(restored.ok).toBe(false);
    expect(!restored.ok && restored.error.code).toBe("CONFLICT");
    expect(externalFile).toBe("D");
    const oldStillExists = await store.read("old-a");
    const currentWasSnapshotted = await store.read("current-c");
    expect(oldStillExists.ok).toBe(true);
    expect(currentWasSnapshotted.ok && currentWasSnapshotted.result.content).toBe("C");
  });

  it("copies snapshot contents without touching the source writer", async () => {
    const store = new RecoveryStore(await tmpDir(), { now: () => 1_000, id: ids("snap") });
    await store.captureChanged({ workspaceId: "workspace-1", relativePath: "copy.md", content: "copy me", reason: "save" });
    const copied = await store.read("snap");
    expect(copied.ok && copied.result.content).toBe("copy me");
  });

  it("rejects malformed workspaceId, relativePath, and snapshotId values without escaping recovery storage", async () => {
    const base = await tmpDir();
    const store = new RecoveryStore(base, { now: () => 1_000, id: ids("snap") });

    expect((await store.captureChanged({ workspaceId: "../x", relativePath: "a.md", content: "x", reason: "save" })).ok).toBe(false);
    expect((await store.captureChanged({ workspaceId: "workspace-1", relativePath: "../secret.md", content: "x", reason: "save" })).ok).toBe(false);
    expect((await store.read("../../secret")).ok).toBe(false);

    await fs.mkdir(path.join(base, "outside"), { recursive: true });
    expect(await fs.readdir(path.join(base, "outside"))).toEqual([]);
  });

  it("ignores incomplete temp writes so partial snapshots are not valid-looking history", async () => {
    const base = await tmpDir();
    const store = new RecoveryStore(base, { now: () => 1_000, id: ids("snap") });
    await store.captureChanged({ workspaceId: "workspace-1", relativePath: "a.md", content: "valid", reason: "save" });
    const snapshotsDir = await findSnapshotsDir(base);
    await fs.writeFile(path.join(snapshotsDir, "partial.json.tmp"), JSON.stringify({ snapshotId: "partial", content: "bad" }), "utf8");

    const listed = await store.list("workspace-1", "a.md");
    expect(listed.ok && listed.result.map((s) => s.snapshotId)).toEqual(["snap"]);
    expect((await store.read("partial")).ok).toBe(false);
  });
});
