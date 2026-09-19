import { describe, expect, it, vi } from "vitest";
import { WorkspaceRegistry } from "../../src/main/workspace/registry";
import type { FileAdapter } from "../../src/main/workspace/file-adapter";
import { NoteService, type WslRequest } from "../../src/main/services/note-service";
import { WorkspaceService } from "../../src/main/services/workspace-service";

function nativeStub(): FileAdapter {
  return {
    list: async () => ({ entries: [] }),
    read: async () => ({ result: null }),
    write: async () => ({ revision: null }),
    createFile: async () => ({ revision: null }),
    rename: async () => ({ ok: true as const }),
    createDirectory: async () => ({ ok: true as const }),
    deleteDirectory: async () => ({ ok: true as const }),
    renameDirectory: async () => ({ ok: true as const }),
    trash: async () => ({ ok: true as const }),
  } as unknown as FileAdapter;
}

function setup() {
  const workspaces = new WorkspaceService(new WorkspaceRegistry());
  const calls: { operation: string; params: Record<string, unknown>; identity: unknown }[] = [];
  const wslRequest: WslRequest = async (operation, params, identity) => {
    calls.push({ operation, params, identity });
    if (operation === "directory.list") return [];
    if (operation === "file.read") return { content: "", revision: { hash: "h", size: 0, mtimeMs: 0 } };
    if (operation === "file.write" || operation === "file.create") {
      return { hash: "h", size: 0, mtimeMs: 0 };
    }
    return null;
  };
  const notes = new NoteService(workspaces, { native: nativeStub(), wslRequest });
  return { workspaces, notes, calls };
}

describe("NoteService WSL mutation parity (P1-04)", () => {
  it("routes every file/directory mutation to the helper with distro+linuxUser identity", async () => {
    const { workspaces, notes, calls } = setup();
    const reg = workspaces.registerWsl("Ubuntu:work:~/Notes", "/home/work/Notes", "Ubuntu", "work");

    await notes.createFile(reg.id, "a.md");
    await notes.readFile(reg.id, "a.md");
    await notes.writeFile(reg.id, "a.md", "hi", "h", "lf", false);
    await notes.renamePath(reg.id, "a.md", "b.md");
    await notes.trashPath(reg.id, "b.md");
    await notes.listTree(reg.id, "");
    await notes.createDirectory(reg.id, "docs");
    await notes.renameDirectory(reg.id, "docs", "manual");
    await notes.deleteDirectory(reg.id, "docs", false);

    expect(calls.map((c) => c.operation)).toEqual([
      "file.create",
      "file.read",
      "file.write",
      "file.rename",
      "file.delete",
      "directory.list",
      "directory.create",
      "directory.rename",
      "directory.delete",
    ]);
    // Every mutation carries the selected identity — never the distro alone.
    for (const c of calls) {
      expect(c.identity).toEqual({ distro: "Ubuntu", linuxUser: "work" });
    }
    expect(calls.find((c) => c.operation === "directory.delete")?.params).toMatchObject({
      relativePath: "docs",
      recursive: false,
    });
    expect(calls.find((c) => c.operation === "file.delete")?.params).toMatchObject({ relativePath: "b.md" });
  });

  it("same distro with different users yields distinct identities (no session crossover)", async () => {
    const { workspaces, notes, calls } = setup();
    const a = workspaces.registerWsl("Ubuntu:utsav:~/Notes", "/home/utsav/Notes", "Ubuntu", "utsav");
    const b = workspaces.registerWsl("Ubuntu:work:~/Notes", "/home/work/Notes", "Ubuntu", "work");

    await notes.writeFile(a.id, "a.md", "from-a", "h", "lf", false);
    await notes.writeFile(b.id, "a.md", "from-b", "h", "lf", false);

    expect(calls).toHaveLength(2);
    expect(calls[0]!.identity).toEqual({ distro: "Ubuntu", linuxUser: "utsav" });
    expect(calls[1]!.identity).toEqual({ distro: "Ubuntu", linuxUser: "work" });
    expect(calls[0]!.identity).not.toEqual(calls[1]!.identity);
  });

  it("preserves structured helper error codes across the seam (never flattened)", async () => {
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    const codes = [
      "NOT_FOUND",
      "ALREADY_EXISTS",
      "PERMISSION_DENIED",
      "INVALID_PATH",
      "OUTSIDE_ROOT",
      "DIRECTORY_NOT_EMPTY",
      "CONFLICT",
      "INVALID_REQUEST",
      "DISCONNECTED",
    ] as const;
    for (const code of codes) {
      const failing: WslRequest = async () => {
        throw { code, message: `${code} happened.` };
      };
      const notes = new NoteService(workspaces, { native: nativeStub(), wslRequest: failing });
      const reg = workspaces.registerWsl("Ubuntu:work:~/Notes", "/home/work/Notes", "Ubuntu", "work");
      expect(await notes.readFile(reg.id, "a.md")).toMatchObject({ error: { code } });
      expect(await notes.deleteDirectory(reg.id, "d", false)).toMatchObject({ error: { code } });
      expect(await notes.trashPath(reg.id, "a.md")).toMatchObject({ error: { code } });
      expect(await notes.renamePath(reg.id, "a.md", "b.md")).toMatchObject({ error: { code } });
    }
  });

  it("returns DISCONNECTED when no helper session is connected", async () => {
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    const wslRequest = vi.fn(async () => null);
    const notes = new NoteService(workspaces, {
      native: nativeStub(),
      wslRequest,
      hasWslSession: () => false,
    });
    const reg = workspaces.registerWsl("Ubuntu:work:~/Notes", "/home/work/Notes", "Ubuntu", "work");
    for (const out of [
      await notes.listTree(reg.id, ""),
      await notes.readFile(reg.id, "a.md"),
      await notes.createFile(reg.id, "a.md"),
      await notes.renamePath(reg.id, "a.md", "b.md"),
      await notes.trashPath(reg.id, "a.md"),
      await notes.createDirectory(reg.id, "d"),
      await notes.deleteDirectory(reg.id, "d", true),
      await notes.renameDirectory(reg.id, "a", "b"),
    ]) {
      expect(out).toMatchObject({ error: { code: "DISCONNECTED" } });
    }
    expect(wslRequest).not.toHaveBeenCalled();
  });

  it("surfaces a session-identity mismatch as DISCONNECTED, never as the wrong user", async () => {
    // Simulates the main-process guard: the singleton helper session belongs
    // to Ubuntu/utsav while the mutation targets Ubuntu/work. Failing closed
    // with DISCONNECTED proves no crossover — the write never runs as utsav.
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    const ranAsWrongUser = vi.fn(async (_operation: string, _params: unknown) => ({ hash: "h", size: 0, mtimeMs: 0 }));
    const guarded: WslRequest = async (operation, params, identity) => {
      if (identity.distro !== "Ubuntu" || identity.linuxUser !== "utsav") {
        throw { code: "DISCONNECTED", message: "WSL session is not connected as Ubuntu/work." };
      }
      return ranAsWrongUser(operation, params);
    };
    const notes = new NoteService(workspaces, { native: nativeStub(), wslRequest: guarded });
    const work = workspaces.registerWsl("Ubuntu:work:~/Notes", "/home/work/Notes", "Ubuntu", "work");
    const out = await notes.writeFile(work.id, "a.md", "x", "h", "lf", false);
    expect(out).toMatchObject({ error: { code: "DISCONNECTED" } });
    expect(ranAsWrongUser).not.toHaveBeenCalled();
  });

  it("native workspaces never touch the helper", async () => {
    const { workspaces, notes, calls } = setup();
    const reg = workspaces.registerLocal("Notes", "/tmp/notes");
    await notes.trashPath(reg.id, "a.md");
    await notes.createDirectory(reg.id, "d");
    expect(calls).toHaveLength(0);
  });
});
