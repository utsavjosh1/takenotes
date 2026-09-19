import { describe, expect, it, vi } from "vitest";
import { WorkspaceRegistry } from "../../src/main/workspace/registry";
import { adapterKindFor, type FileAdapter } from "../../src/main/workspace/file-adapter";
import { NoteService } from "../../src/main/services/note-service";
import { WorkspaceService } from "../../src/main/services/workspace-service";

describe("adapter dispatch by kind", () => {
  it("routes native kinds to the native adapter and WSL to the helper", () => {
    expect(adapterKindFor("windows-local")).toBe("native");
    expect(adapterKindFor("macos-local")).toBe("native");
    expect(adapterKindFor("linux-local")).toBe("native");
    expect(adapterKindFor("windows-wsl")).toBe("wsl");
  });
});

describe("NoteService seam", () => {
  it("delegates native directory ops to the FileAdapter", async () => {
    const registry = new WorkspaceRegistry();
    const workspaces = new WorkspaceService(registry);
    const native = {
      list: vi.fn(async () => ({ entries: [] })),
      read: vi.fn(async () => ({ result: null })),
      write: vi.fn(async () => ({ revision: null })),
      createFile: vi.fn(async () => ({ revision: null })),
      rename: vi.fn(async () => ({ ok: true as const })),
      createDirectory: vi.fn(async () => ({ ok: true as const })),
      deleteDirectory: vi.fn(async () => ({ ok: true as const })),
      renameDirectory: vi.fn(async () => ({ ok: true as const })),
      trash: vi.fn(async () => ({ ok: true as const })),
    };
    const notes = new NoteService(workspaces, { native: native as unknown as FileAdapter, wslRequest: async () => null });
    const reg = workspaces.registerLocal("Notes", "/tmp/notes");

    await notes.createDirectory(reg.id, "docs");
    expect(native.createDirectory).toHaveBeenCalledWith("/tmp/notes", "windows-local", "docs");

    await notes.deleteDirectory(reg.id, "docs", false);
    expect(native.deleteDirectory).toHaveBeenCalledWith("/tmp/notes", "windows-local", "docs", false);

    await notes.renameDirectory(reg.id, "a", "b");
    expect(native.renameDirectory).toHaveBeenCalledWith("/tmp/notes", "windows-local", "a", "b");
  });

  it("routes WSL workspaces to the helper, not the native adapter", async () => {
    const registry = new WorkspaceRegistry();
    const workspaces = new WorkspaceService(registry);
    const native = {
      list: vi.fn(async () => ({ entries: [] })),
      read: vi.fn(async () => ({ result: null })),
      write: vi.fn(async () => ({ revision: null })),
      createFile: vi.fn(async () => ({ revision: null })),
      rename: vi.fn(async () => ({ ok: true as const })),
      createDirectory: vi.fn(async () => ({ ok: true as const })),
      deleteDirectory: vi.fn(async () => ({ ok: true as const })),
      renameDirectory: vi.fn(async () => ({ ok: true as const })),
      trash: vi.fn(async () => ({ ok: true as const })),
    };
    const wslRequest = vi.fn(async () => [{ name: "a" }]);
    const notes = new NoteService(workspaces, { native: native as unknown as FileAdapter, wslRequest });
    const reg = workspaces.registerWsl("Ubuntu:~/Notes", "/home/u/Notes", "Ubuntu");

    await notes.listTree(reg.id, "");
    // P1-04: every helper call carries distro+linuxUser identity (undefined
    // user here — this registration predates user selection).
    expect(wslRequest).toHaveBeenCalledWith("directory.list", { relativePath: "" }, { distro: "Ubuntu", linuxUser: undefined });
    expect(native.list).not.toHaveBeenCalled();
  });

  it("returns INVALID_REQUEST for unknown workspaces", async () => {
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    const notes = new NoteService(workspaces, {
      native: {
        list: async () => ({ entries: [] }),
        read: async () => ({ result: null }),
        write: async () => ({ revision: null }),
        createFile: async () => ({ revision: null }),
        rename: async () => ({ ok: true as const }),
        createDirectory: async () => ({ ok: true as const }),
        deleteDirectory: async () => ({ ok: true as const }),
        renameDirectory: async () => ({ ok: true as const }),
        trash: async () => ({ ok: true as const }),
      } as unknown as FileAdapter,
      wslRequest: async () => null,
    });
    const out = await notes.listTree("00000000-0000-0000-0000-000000000000", "");
    expect(out).toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });
});

describe("WorkspaceService user seam (P1-03)", () => {
  it("delegates user discovery to the injected source", async () => {
    const users = [{ username: "work", uid: 1001, home: "/home/work" }];
    const userSource = vi.fn(async (distro: string) => {
      expect(distro).toBe("Ubuntu");
      return users;
    });
    const workspaces = new WorkspaceService(new WorkspaceRegistry(), undefined, userSource);
    await expect(workspaces.listUsers("Ubuntu")).resolves.toEqual(users);
    expect(userSource).toHaveBeenCalledTimes(1);
  });

  it("carries linuxUser through registration", () => {
    const workspaces = new WorkspaceService(new WorkspaceRegistry());
    const reg = workspaces.registerWsl("Ubuntu:work:~/x", "/home/work/x", "Ubuntu", "work");
    expect(workspaces.get(reg.id)?.linuxUser).toBe("work");
  });
});
