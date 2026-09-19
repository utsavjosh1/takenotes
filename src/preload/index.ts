import { contextBridge, ipcRenderer } from "electron";
import type {
  DirectoryEntry,
  FileReadResult,
  FileRevision,
  IpcResult,
  PlatformReport,
  SearchMatch,
  UpdateCheckResult,
  UpdateProgress,
  WorkspaceInfo,
  WslDistribution,
} from "../shared/contracts/ipc.js";
import type { CommandId } from "../shared/platform/keymap.js";

/** Narrow typed preload bridge. No generic channel invocation is exposed. */
export type TakeNotesApi = {
  draft: {
    /** Persist a crash-recovery draft (debounced by the caller; recovery only, never `Saved`). */
    put(args: { workspaceId: string; relativePath: string; baseRevisionHash: string; content: string }): Promise<IpcResult<null>>;
    get(workspaceId: string, relativePath: string): Promise<IpcResult<DraftSummary | null>>;
    clear(workspaceId: string, relativePath: string): Promise<IpcResult<null>>;
  };
  workspace: {
    openLocal(): Promise<IpcResult<WorkspaceInfo | null>>;
    close(workspaceId: string): Promise<IpcResult<null>>;
    listWslDistributions(): Promise<IpcResult<WslDistribution[]>>;
    connectWsl(distro: string, linuxPath: string): Promise<IpcResult<WorkspaceInfo>>;
  };
  directory: {
    list(workspaceId: string, relativePath: string): Promise<IpcResult<DirectoryEntry[]>>;
    create(workspaceId: string, relativePath: string): Promise<IpcResult<null>>;
    rename(workspaceId: string, oldPath: string, newPath: string): Promise<IpcResult<null>>;
    delete(workspaceId: string, relativePath: string, recursive?: boolean): Promise<IpcResult<null>>;
  };
  file: {
    read(workspaceId: string, relativePath: string): Promise<IpcResult<FileReadResult>>;
    rename(workspaceId: string, oldPath: string, newPath: string): Promise<IpcResult<null>>;
    trash(workspaceId: string, relativePath: string): Promise<IpcResult<null>>;
    write(args: {
      workspaceId: string;
      relativePath: string;
      content: string;
      expectedHash: string;
      newlineStyle: "lf" | "crlf";
      hadBom: boolean;
    }): Promise<IpcResult<FileRevision>>;
    create(workspaceId: string, relativePath: string): Promise<IpcResult<FileRevision>>;
  };
  search: {
    files(workspaceId: string, query: string): Promise<IpcResult<SearchMatch[]>>;
    content(workspaceId: string, query: string): Promise<IpcResult<SearchMatch[]>>;
  };
  shell: {
    reveal(workspaceId: string, relativePath: string): Promise<IpcResult<null>>;
  };
  app: {
    version(): Promise<IpcResult<string>>;
    platform(): Promise<IpcResult<PlatformReport>>;
  };
  update: {
    /** Check for a newer stable release. `manual=true` always runs (shows
     *  errors); `false` is the silent startup path (cadence-gated). */
    check(manual: boolean): Promise<IpcResult<UpdateCheckResult>>;
    /** Download, checksum-verify, launch installer, quit. */
    download(): Promise<IpcResult<null>>;
  };
  events: {
    onWslState(callback: (state: string) => void): () => void;
    onUpdateProgress(callback: (progress: UpdateProgress) => void): () => void;
    onCommand(callback: (id: CommandId) => void): () => void;
  };
};

export type DraftSummary = {
  content: string;
  baseRevisionHash: string;
  updatedAt: number;
  stale: boolean;
};

const api: TakeNotesApi = {
  draft: {
    put: (args) => ipcRenderer.invoke("draft:put", args),
    get: (workspaceId, relativePath) => ipcRenderer.invoke("draft:get", workspaceId, relativePath),
    clear: (workspaceId, relativePath) => ipcRenderer.invoke("draft:clear", workspaceId, relativePath),
  },
  workspace: {
    openLocal: () => ipcRenderer.invoke("workspace:openLocal"),
    close: (workspaceId) => ipcRenderer.invoke("workspace:close", workspaceId),
    listWslDistributions: () => ipcRenderer.invoke("workspace:listWsl"),
    connectWsl: (distro, linuxPath) => ipcRenderer.invoke("wsl:connect", distro, linuxPath),
  },
  directory: {
    list: (workspaceId, relativePath) => ipcRenderer.invoke("directory:list", workspaceId, relativePath),
    create: (workspaceId, relativePath) => ipcRenderer.invoke("directory:create", workspaceId, relativePath),
    rename: (workspaceId, oldPath, newPath) => ipcRenderer.invoke("directory:rename", workspaceId, oldPath, newPath),
    delete: (workspaceId, relativePath, recursive) =>
      ipcRenderer.invoke("directory:delete", workspaceId, relativePath, recursive),
  },
  file: {
    read: (workspaceId, relativePath) => ipcRenderer.invoke("file:read", workspaceId, relativePath),
    rename: (workspaceId, oldPath, newPath) => ipcRenderer.invoke("file:rename", workspaceId, oldPath, newPath),
    trash: (workspaceId, relativePath) => ipcRenderer.invoke("file:trash", workspaceId, relativePath),
    write: (args) => ipcRenderer.invoke("file:write", args),
    create: (workspaceId, relativePath) => ipcRenderer.invoke("file:create", workspaceId, relativePath),
  },
  search: {
    files: (workspaceId, query) => ipcRenderer.invoke("search:files", workspaceId, query),
    content: (workspaceId, query) => ipcRenderer.invoke("search:content", workspaceId, query),
  },
  shell: {
    reveal: (workspaceId, relativePath) => ipcRenderer.invoke("shell:reveal", workspaceId, relativePath),
  },
  app: {
    version: () => ipcRenderer.invoke("app:version"),
    platform: () => ipcRenderer.invoke("app:platform"),
  },
  update: {
    check: (manual) => ipcRenderer.invoke("update:check", manual),
    download: () => ipcRenderer.invoke("update:download"),
  },
  events: {
    onWslState: (callback) => {
      const listener = (_event: unknown, state: string) => callback(state);
      ipcRenderer.on("takenotes:wsl-state", listener as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener("takenotes:wsl-state", listener as (...args: unknown[]) => void);
    },
    onUpdateProgress: (callback) => {
      const listener = (_event: unknown, progress: UpdateProgress) => callback(progress);
      ipcRenderer.on("takenotes:update-progress", listener as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener("takenotes:update-progress", listener as (...args: unknown[]) => void);
    },
    onCommand: (callback) => {
      const listener = (_event: unknown, id: CommandId) => callback(id);
      ipcRenderer.on("takenotes:command", listener as (...args: unknown[]) => void);
      return () => ipcRenderer.removeListener("takenotes:command", listener as (...args: unknown[]) => void);
    },
  },
};

contextBridge.exposeInMainWorld("takenotes", api);

declare global {
  interface Window {
    takenotes: TakeNotesApi;
  }
}
