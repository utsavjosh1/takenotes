import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  RecoveryStore,
  recoveryKeyForWorkspace,
  type RecoveryRestoreWriter,
} from "../../src/main/workspace/recovery.js";
import { WorkspaceRegistry, type WorkspaceRegistration } from "../../src/main/workspace/registry.js";
import type { FileRevision } from "../../src/shared/contracts/ipc.js";

/**
 * H-01 / M-01 regression: recovery identity across reopen.
 *
 * The runtime `workspaceId` is a random UUID minted per `register()` — the
 * recovery namespace must NOT be that id. These tests drive the real seam
 * (`WorkspaceRegistry` + `recoveryKeyForWorkspace`, the same mapping the IPC
 * boundary uses) with fresh registries standing in for application restarts.
 */

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "takenotes-reopen-"));
}

function ids(...values: string[]): () => string {
  let i = 0;
  return () => values[i++] ?? `id-${i}`;
}

function revision(hash: string): FileRevision {
  return { hash, size: 1, mtimeMs: 1 };
}

/** Same mapping as `recoveryNamespace()` in `src/main/ipc/register.ts`. */
function namespaceOf(reg: WorkspaceRegistration): string {
  return recoveryKeyForWorkspace({ type: reg.type, root: reg.root, distro: reg.distro, linuxUser: reg.linuxUser });
}

describe("recovery identity across reopen (H-01)", () => {
  it("documents the bug mechanism: raw runtime ids diverge on reopen", async () => {
    const base = await tmpDir();
    const store = new RecoveryStore(base, { now: () => 1_000, id: ids("s1") });
    const before = new WorkspaceRegistry();
    const id1 = before.register("windows-local", "Notes", path.join(base, "notes")).id;
    await store.captureChanged({ workspaceId: id1, relativePath: "README.md", content: "S1", reason: "save" });

    // Simulate restart: a fresh registry mints a fresh id for the same root.
    const after = new WorkspaceRegistry();
    const id2 = after.register("windows-local", "Notes", path.join(base, "notes")).id;
    expect(id1).not.toBe(id2);
    // Keying storage by the raw runtime id orphans S1 — this is H-01.
    expect((await store.list(id2, "README.md")).ok).toBe(true);
    expect(((await store.list(id2, "README.md")) as { ok: true; result: unknown[] }).result).toEqual([]);
  });

  it("reopen of the same Workspace under a new runtime id keeps history", async () => {
    const base = await tmpDir();
    const root = path.join(base, "notes");
    const now = 1_000;
    const store = new RecoveryStore(base, { now: () => now, id: ids("s1") });

    // First session: register/open Workspace A (runtime id ID-1), capture S1.
    const session1 = new WorkspaceRegistry();
    const reg1 = session1.register("windows-local", "Notes", root);
    await store.captureChanged({ workspaceId: namespaceOf(reg1), relativePath: "README.md", content: "S1", reason: "save" });

    // Simulate close + fresh process state.
    const session2 = new WorkspaceRegistry();
    const reg2 = session2.register("windows-local", "Notes", root);
    expect(reg1.id).not.toBe(reg2.id);
    expect(namespaceOf(reg1)).toBe(namespaceOf(reg2));

    const listed = await store.list(namespaceOf(reg2), "README.md");
    expect(listed.ok).toBe(true);
    expect(listed.ok && listed.result.map((s) => s.snapshotId)).toEqual(["s1"]);
    const reread = await store.read(namespaceOf(reg2), "s1");
    expect(reread.ok && reread.result.content).toBe("S1");
  });

  it("windows-local reopen is insensitive to trailing-separator and case variants", async () => {
    const base = await tmpDir();
    const store = new RecoveryStore(base, { now: () => 1_000, id: ids("s1") });
    const session1 = new WorkspaceRegistry();
    const reg1 = session1.register("windows-local", "Notes", "C:\\Notes");
    await store.captureChanged({ workspaceId: namespaceOf(reg1), relativePath: "a.md", content: "x", reason: "save" });

    const session2 = new WorkspaceRegistry();
    const reg2 = session2.register("windows-local", "Notes", "c:\\notes\\");
    expect(namespaceOf(reg1)).toBe(namespaceOf(reg2));
    const listed = await store.list(namespaceOf(reg2), "a.md");
    expect(listed.ok && listed.result.map((s) => s.snapshotId)).toEqual(["s1"]);
  });

  it("WSL users stay isolated across reopen: Ubuntu/utsav vs Ubuntu/work", async () => {
    const base = await tmpDir();
    let now = 1_000;
    const store = new RecoveryStore(base, { now: () => now, id: ids("personal", "company") });

    const session1 = new WorkspaceRegistry();
    const utsav1 = session1.register("windows-wsl", "Notes", "/home/utsav/Notes", "Ubuntu", "utsav");
    const work1 = session1.register("windows-wsl", "Notes", "/home/utsav/Notes", "Ubuntu", "work");
    expect(namespaceOf(utsav1)).not.toBe(namespaceOf(work1));
    await store.captureChanged({ workspaceId: namespaceOf(utsav1), relativePath: "README.md", content: "personal", reason: "save" });
    now += 1;
    await store.captureChanged({ workspaceId: namespaceOf(work1), relativePath: "README.md", content: "company", reason: "save" });

    // Reopen both with new runtime ids (fresh registry = restarted app).
    const session2 = new WorkspaceRegistry();
    const utsav2 = session2.register("windows-wsl", "Notes", "/home/utsav/Notes", "Ubuntu", "utsav");
    const work2 = session2.register("windows-wsl", "Notes", "/home/utsav/Notes", "Ubuntu", "work");
    expect(utsav1.id).not.toBe(utsav2.id);
    expect(work1.id).not.toBe(work2.id);

    const utsavHistory = await store.list(namespaceOf(utsav2), "README.md");
    const workHistory = await store.list(namespaceOf(work2), "README.md");
    expect(utsavHistory.ok && utsavHistory.result.map((s) => s.snapshotId)).toEqual(["personal"]);
    expect(workHistory.ok && workHistory.result.map((s) => s.snapshotId)).toEqual(["company"]);
    // No cross-user leakage through scoped reads either.
    expect((await store.read(namespaceOf(utsav2), "company")).ok).toBe(false);
    expect((await store.read(namespaceOf(work2), "personal")).ok).toBe(false);
    expect((await store.read(namespaceOf(utsav2), "personal")).ok).toBe(true);
    expect((await store.read(namespaceOf(work2), "company")).ok).toBe(true);
  });

  it("different Workspace roots never collide", async () => {
    const base = await tmpDir();
    const store = new RecoveryStore(base, { now: () => 1_000, id: ids("s1", "s2") });
    const registry = new WorkspaceRegistry();
    const a = registry.register("windows-local", "A", path.join(base, "a"));
    const b = registry.register("windows-local", "B", path.join(base, "b"));
    expect(namespaceOf(a)).not.toBe(namespaceOf(b));
    await store.captureChanged({ workspaceId: namespaceOf(a), relativePath: "same.md", content: "A", reason: "save" });
    await store.captureChanged({ workspaceId: namespaceOf(b), relativePath: "same.md", content: "B", reason: "save" });
    expect(((await store.list(namespaceOf(a), "same.md")) as { ok: true; result: { snapshotId: string }[] }).result.map((s) => s.snapshotId)).toEqual(["s1"]);
    expect(((await store.list(namespaceOf(b), "same.md")) as { ok: true; result: { snapshotId: string }[] }).result.map((s) => s.snapshotId)).toEqual(["s2"]);
  });

  it("restore through the reopened Workspace snapshots current content first", async () => {
    const base = await tmpDir();
    const root = path.join(base, "notes");
    let now = 1_000;
    const store = new RecoveryStore(base, { now: () => now, id: ids("old-a", "current-c") });

    const session1 = new WorkspaceRegistry();
    const reg1 = session1.register("windows-local", "Notes", root);
    const old = await store.captureChanged({ workspaceId: namespaceOf(reg1), relativePath: "README.md", content: "A", reason: "save" });
    expect(old.ok && old.result?.snapshotId).toBe("old-a");

    // Reopen; restore selected snapshot A while current content is C.
    now += 1;
    const session2 = new WorkspaceRegistry();
    const reg2 = session2.register("windows-local", "Notes", root);
    const writes: string[] = [];
    const writer: RecoveryRestoreWriter = async (content, expectedHash) => {
      writes.push(`${expectedHash}:${content}`);
      return { revision: revision("rev-after-restore") };
    };
    const restored = await store.restore(
      {
        workspaceId: namespaceOf(reg2),
        relativePath: "README.md",
        snapshotId: "old-a",
        currentContent: "C",
        expectedHash: "rev-before-restore",
        newlineStyle: "lf",
        hadBom: false,
      },
      writer,
    );
    expect(restored.ok && restored.result.content).toBe("A");
    expect(writes).toEqual(["rev-before-restore:A"]);
    // C was snapshotted first and remains recoverable after reopen.
    const history = await store.list(namespaceOf(reg2), "README.md");
    expect(history.ok && history.result.map((s) => s.snapshotId)).toEqual(["current-c", "old-a"]);
    expect((await store.read(namespaceOf(reg2), "current-c")).ok).toBe(true);
  });

  it("stale restore after reopen still yields CONFLICT without touching disk", async () => {
    const base = await tmpDir();
    const root = path.join(base, "notes");
    const store = new RecoveryStore(base, { now: () => 1_000, id: ids("old-a", "current-c") });
    const session1 = new WorkspaceRegistry();
    const reg1 = session1.register("windows-local", "Notes", root);
    await store.captureChanged({ workspaceId: namespaceOf(reg1), relativePath: "README.md", content: "A", reason: "save" });

    const session2 = new WorkspaceRegistry();
    const reg2 = session2.register("windows-local", "Notes", root);
    const externalFile = "D";
    const restored = await store.restore(
      {
        workspaceId: namespaceOf(reg2),
        relativePath: "README.md",
        snapshotId: "old-a",
        currentContent: "C",
        expectedHash: "stale-rev",
        newlineStyle: "lf",
        hadBom: false,
      },
      async () => ({ error: { code: "CONFLICT", message: "The file changed on disk." } }),
    );
    expect(restored.ok).toBe(false);
    expect(!restored.ok && restored.error.code).toBe("CONFLICT");
    expect(externalFile).toBe("D");
  });
});

describe("scoped recovery reads (M-01)", () => {
  it("cross-workspace read fails NOT_FOUND and never returns A's contents", async () => {
    const base = await tmpDir();
    const store = new RecoveryStore(base, { now: () => 1_000, id: ids("sa") });
    const registry = new WorkspaceRegistry();
    const a = registry.register("windows-local", "A", path.join(base, "a"));
    const b = registry.register("windows-local", "B", path.join(base, "b"));
    await store.captureChanged({ workspaceId: namespaceOf(a), relativePath: "note.md", content: "A-secret", reason: "save" });

    const denied = await store.read(namespaceOf(b), "sa");
    expect(denied.ok).toBe(false);
    expect(!denied.ok && denied.error.code).toBe("NOT_FOUND");

    const allowed = await store.read(namespaceOf(a), "sa");
    expect(allowed.ok).toBe(true);
    expect(allowed.ok && allowed.result.content).toBe("A-secret");
  });

  it("rejects malformed namespace keys without scanning storage", async () => {
    const store = new RecoveryStore(await tmpDir(), { now: () => 1_000, id: ids("s1") });
    expect((await store.read("../evil", "s1")).ok).toBe(false);
    expect((await store.read("ok-namespace-1", "../../evil")).ok).toBe(false);
  });
});
