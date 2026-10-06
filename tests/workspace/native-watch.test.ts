import { afterEach, describe, expect, it, vi } from "vitest";
import type { DirectoryEntry } from "@takenotes/contracts/ipc";
import { NativeWorkspaceWatcher } from "@takenotes/desktop/main/workspace/native-watch";
import type { FileAdapter } from "@takenotes/desktop/main/workspace/file-adapter";

function entry(relativePath: string, kind: "file" | "directory", mtimeMs = 1): DirectoryEntry {
  return {
    name: relativePath.split("/").pop() ?? relativePath,
    relativePath,
    kind,
    fileClass: kind === "file" ? "markdown" : "other",
    size: kind === "file" ? 1 : 0,
    mtimeMs,
  };
}

function makeAdapter(tree: { entries: DirectoryEntry[] }): FileAdapter {
  return {
    list: async (_root: string, _kind: "windows-local" | "windows-wsl" | "macos-local" | "linux-local", relativePath: string) => ({
      entries: tree.entries.filter((e) => {
        const parent = e.relativePath.includes("/") ? e.relativePath.slice(0, e.relativePath.lastIndexOf("/")) : "";
        return parent === relativePath;
      }),
    }),
    read: async () => { throw new Error("unused"); },
    write: async () => { throw new Error("unused"); },
    createFile: async () => { throw new Error("unused"); },
    rename: async () => { throw new Error("unused"); },
    createDirectory: async () => { throw new Error("unused"); },
    deleteDirectory: async () => { throw new Error("unused"); },
    renameDirectory: async () => { throw new Error("unused"); },
    trash: async () => { throw new Error("unused"); },
  } as unknown as FileAdapter;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("NativeWorkspaceWatcher", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits workspaceId + relativePath when an external edit changes the snapshot", async () => {
    vi.useFakeTimers();
    const tree = { entries: [entry("a.md", "file", 1)] };
    const events: unknown[] = [];
    const watcher = new NativeWorkspaceWatcher(makeAdapter(tree), (event) => events.push(event), 100);

    watcher.start({ workspaceId: "workspace-1", root: "/notes", kind: "linux-local" });
    await flush();
    tree.entries = [entry("a.md", "file", 2)];
    vi.advanceTimersByTime(100);
    await flush();

    expect(events).toEqual([{ workspaceId: "workspace-1", relativePath: "a.md", kind: "changed" }]);
    watcher.stop("workspace-1");
  });

  it("stops polling when the workspace closes", async () => {
    vi.useFakeTimers();
    const tree = { entries: [entry("a.md", "file", 1)] };
    const events: unknown[] = [];
    const watcher = new NativeWorkspaceWatcher(makeAdapter(tree), (event) => events.push(event), 100);

    watcher.start({ workspaceId: "workspace-1", root: "/notes", kind: "linux-local" });
    await flush();
    watcher.stop("workspace-1");
    tree.entries = [entry("a.md", "file", 2)];
    vi.advanceTimersByTime(100);
    await flush();

    expect(events).toEqual([]);
  });
});
